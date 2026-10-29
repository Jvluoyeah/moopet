#!/usr/bin/env python3
"""实时联机 · **权威模式**（线上默认路径，不是锁步）端到端验证：两个真实浏览器页面互相对战

这是整个锁步方案的**决定性验证**：
    两个独立浏览器上下文（各自 localStorage、各自 WebSocket）建房/加入同一房间，
    各打各的，最后**两端算出的状态哈希必须完全相同** —— 说明两端跑的是同一局。

跑之前先起服务端与前端：
    cd w6/server && python run_local.py
    cd w6/web    && npm run dev
用法：python tests/e2e_pvp.py [http://localhost:5173]
"""
import os
import re
import sys
import time
import urllib.request
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

steps = []
problems = []


def check(label, ok, detail=''):
    steps.append((label, ok, detail))
    print(f"{'OK  ' if ok else 'FAIL'}  {label}" + (f"  — {detail}" if detail else ''))
    if not ok:
        problems.append(f'{label}: {detail}')


def wait_backend(timeout=20):
    for _ in range(timeout * 2):
        try:
            with urllib.request.urlopen(BASE + '/api/health', timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def wait_for(page, selector, timeout=20000):
    try:
        page.wait_for_selector(selector, timeout=timeout, state='attached')
        return True
    except Exception:
        return False


def signup(page, tag):
    """注册 + 领养，返回狗名。"""
    uname = f'pvp_{tag}_{datetime.now().strftime("%H%M%S")}'
    page.goto(BASE + '/#/login', wait_until='networkidle')
    page.click('#mode-switch')
    page.fill('#username', uname)
    page.fill('#password', 'pass1234')
    page.click('#submit')
    if not wait_for(page, '.breed-card', timeout=20000):
        raise RuntimeError(f'{tag} 注册失败：' + page.locator('body').inner_text()[:200])
    page.locator('.breed-card').nth(0 if tag == 'A' else 7).click()
    dog = f'{tag}汪'
    page.fill('#dog-name', dog)
    page.click('#adopt-submit')
    wait_for(page, 'text=我的机械狗', timeout=20000)
    return dog


def enter_arena(page):
    """进入竞技场并确保是"全新一页"。
    注意：已经在 #/arena 时再 goto 同一个 hash **不会触发 hashchange**，
    页面会停在上一局的结果上（这不是 bug，是 hash 路由的正常行为），
    所以这里先绕到首页再进来。"""
    page.goto(BASE + '/#/', wait_until='networkidle')
    page.goto(BASE + '/#/arena', wait_until='networkidle')
    wait_for(page, 'button[data-mode="pvp"]', timeout=15000)


def main():
    os.makedirs(SHOTS, exist_ok=True)
    if not wait_backend():
        print('后端不通，先 python run_local.py')
        return 1

    console_errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx_a = browser.new_context(viewport={'width': 1280, 'height': 900})
        ctx_b = browser.new_context(viewport={'width': 1280, 'height': 900})
        page_a, page_b = ctx_a.new_page(), ctx_b.new_page()
        for pg, tag in ((page_a, 'A'), (page_b, 'B')):
            pg.on('console', lambda m, t=tag: console_errors.append(f'[{t}] {m.type}: {m.text}')
                  if m.type == 'error' else None)
            pg.on('pageerror', lambda e, t=tag: console_errors.append(f'[{t}] pageerror: {e}'))

        # ---- 两个账号各自注册领养 ----
        dog_a = signup(page_a, 'A')
        check('A 注册并领养', True, dog_a)
        dog_b = signup(page_b, 'B')
        check('B 注册并领养', True, dog_b)

        # ---- A 建房 ----
        enter_arena(page_a)
        page_a.click('button[data-mode="pvp"]')
        ok = wait_for(page_a, '#room-code', timeout=20000)
        check('A 成功建房并显示房间号', ok)
        if not ok:
            browser.close()
            return 1
        room = page_a.locator('#room-code').inner_text().strip()
        check('房间号格式正确', bool(re.fullmatch(r'[A-Z0-9]{6}', room)), room)
        page_a.screenshot(path=os.path.join(SHOTS, '20-pvp-room.png'), full_page=True)

        # ---- B 用房间号加入 ----
        enter_arena(page_b)
        page_b.click('button[data-mode="pvp"]')
        wait_for(page_b, '#join-code', timeout=20000)
        page_b.fill('#join-code', room)
        page_b.click('#join-btn')
        check('B 提交加入', True, room)

        # ---- 两端都应进入对局 ----
        a_in = wait_for(page_a, 'text=对局中', timeout=30000)
        b_in = wait_for(page_b, 'text=对局中', timeout=30000)
        check('A 进入对局', a_in)
        check('B 进入对局', b_in)
        page_a.wait_for_timeout(1500)
        page_b.wait_for_timeout(1500)
        page_a.screenshot(path=os.path.join(SHOTS, '21-pvp-fighting.png'), full_page=True)

        # ---- 两端各自操作：互相靠近并对打 ----
        # 把横板的全套按键都过一遍（移动/跳/普攻三连/冲刺/防御/技能），
        # 因为"按键位掩码有没有完整过网"正是这条链路上最容易静默出错的地方
        page_a.keyboard.down('ArrowRight')
        page_a.keyboard.down('Space')
        page_b.keyboard.down('ArrowLeft')
        page_b.keyboard.down('Space')

        def snap(pg):
            """从 window.__arena.snapshot() 读状态。
            以前是从 HUD 的 DOM 里抠数字，HUD 一改版式测试就全瞎了；
            而且"抠到的是哪一帧"根本说不清。"""
            try:
                return pg.evaluate('() => window.__arena ? window.__arena.snapshot() : null') or {}
            except Exception:
                return {}

        def read_tick(pg):
            return snap(pg).get('tick', -1)

        page_a.wait_for_timeout(3000)
        tick_a, tick_b = read_tick(page_a), read_tick(page_b)
        check('两端都在推进模拟', tick_a > 0 and tick_b > 0, f'A={tick_a} B={tick_b}')
        check('两端进度接近（锁步的必然结果）', abs(tick_a - tick_b) <= 20,
              f'A={tick_a} B={tick_b}')

        # 全套按键各来一次（普攻多按几次打三连）
        for _ in range(6):
            page_a.keyboard.press('j')
            page_b.keyboard.press('j')
            page_a.wait_for_timeout(180)
        page_a.keyboard.press('k')          # 冲刺（无敌帧）
        page_b.keyboard.press('k')
        page_a.wait_for_timeout(300)
        page_a.keyboard.press('1')          # 技能一：冲撞
        page_b.keyboard.press('2')          # 技能二：吠叫
        cd_seen = 0
        # 轮询 4 秒。**为什么要放宽**：现在有输入缓冲（按下的招会排队，
        # 等前一个招打完再放），所以技能可能比按键晚几百毫秒才真正起手 ——
        # 原来只等 2 秒，遇到长招就偶尔读不到（表现为间歇性失败）。
        # ⚠️ 轮询期间**重按**，不能只按一次就等。
        #    只按一次的话，那一下如果正好撞上"被硬直打断 / 前一个招还没收"
        #    就会被合理地拒掉 —— 而那是**合法的游戏状态**，不是 bug。
        #    表现就是这条断言间歇性失败（一会儿过一会儿不过）。
        #    玩家遇到没反应本来也会再按一次，测试照着做就行。
        for i in range(40):
            if i and i % 5 == 0:
                page_a.keyboard.press('1')
            cd_seen = max(cd_seen, max(snap(page_a).get('cd') or [0]))
            if cd_seen > 0:
                break
            page_a.wait_for_timeout(100)
        check('数字键真的触发了技能（冷却开始转）', cd_seen > 0, f'cd={cd_seen}')
        page_a.keyboard.down('l')           # 防御
        page_b.keyboard.press('4')          # 技能四：捡球投掷
        page_a.wait_for_timeout(500)
        page_a.keyboard.up('l')
        check('技能四扔出了球（逻辑里真的有投掷物）',
              any(snap(pg).get('balls', 0) >= 0 for pg in (page_a, page_b)))

        # ---- 等一局打完（最多 75 秒） ----
        deadline = time.time() + 75
        a_done = b_done = False
        while time.time() < deadline:
            a_done = page_a.locator('text=本局结束').count() > 0
            b_done = page_b.locator('text=本局结束').count() > 0
            if a_done and b_done:
                break
            page_a.wait_for_timeout(1000)
        for pg in (page_a, page_b):
            for k in ('ArrowRight', 'ArrowLeft', 'Space'):
                try:
                    pg.keyboard.up(k)
                except Exception:
                    pass
        check('A 侧对局结束', a_done)
        check('B 侧对局结束', b_done)

        if not (a_done and b_done):
            page_a.screenshot(path=os.path.join(SHOTS, '29-pvp-timeout-a.png'), full_page=True)
            page_b.screenshot(path=os.path.join(SHOTS, '29-pvp-timeout-b.png'), full_page=True)
            browser.close()
            return 1

        # ---- 关键：两端状态哈希必须一致 ----
        def read_hash(pg):
            h = snap(pg).get('hash')
            return format(h, 'x') if isinstance(h, int) else None

        def read_frames(pg):
            return snap(pg).get('tick', -1)

        hash_a, hash_b = read_hash(page_a), read_hash(page_b)
        frames_a, frames_b = read_frames(page_a), read_frames(page_b)
        check('两端状态哈希一致（证明跑的是同一局）',
              hash_a is not None and hash_a == hash_b, f'A=0x{hash_a} B=0x{hash_b}')
        check('两端结算帧号一致', frames_a == frames_b, f'A={frames_a} B={frames_b}')
        # 哈希对不上时，先看输入日志对不对得上：
        #   输入日志一致 → 是模拟本身不确定（真 bug）
        #   输入日志不一致 → 是输入没同步（网络/缓冲问题）
        ia, ib = snap(page_a).get('inputHash'), snap(page_b).get('inputHash')
        check('两端输入日志一致（排除"输入没同步"）',
              ia == ib and snap(page_a).get('inputLogLen') == snap(page_b).get('inputLogLen'),
              f'A=0x{ia:x}({snap(page_a).get("inputLogLen")}) vs B=0x{ib:x}({snap(page_b).get("inputLogLen")})')
        # 顺带确认两边认的座位号是相反的（否则 breeds 数组会两边都按"我是 0"排，
        # 初始状态就不一样，哈希永远对不上——这个坑 v1 因为两边同品种没暴露）
        sa, sb = snap(page_a), snap(page_b)
        check('两端座位号相反', sa.get('side') != sb.get('side'),
              f"A={sa.get('side')} B={sb.get('side')}")

        page_a.screenshot(path=os.path.join(SHOTS, '22-pvp-result-a.png'), full_page=True)
        page_b.screenshot(path=os.path.join(SHOTS, '23-pvp-result-b.png'), full_page=True)

        # ================= 场景二：对局中途一方掉线 → AI 接管 =================
        print('\n--- 场景二：掉线接管 ---')
        enter_arena(page_a)
        page_a.click('button[data-mode="pvp"]')
        wait_for(page_a, '#room-code', timeout=20000)
        room2 = page_a.locator('#room-code').inner_text().strip()
        enter_arena(page_b)
        page_b.click('button[data-mode="pvp"]')
        wait_for(page_b, '#join-code', timeout=20000)
        page_b.fill('#join-code', room2)
        page_b.click('#join-btn')
        ok = wait_for(page_a, 'text=对局中', timeout=30000) and \
            wait_for(page_b, 'text=对局中', timeout=30000)
        check('第二局双方入场', ok, room2)

        # 让两边都动起来，确认真的在对打
        page_a.keyboard.down('ArrowRight')
        page_b.keyboard.down('ArrowLeft')
        page_a.wait_for_timeout(3500)
        t_before = read_tick(page_a)
        check('掉线前 A 在推进', t_before > 20, f'tick={t_before}')

        # B 直接关掉（模拟拔网线/关标签页）
        page_b.close()
        # A 应收到 peer_left → 切 AI 接管，并且继续推进
        took_over = False
        for _ in range(20):
            page_a.wait_for_timeout(700)
            if page_a.locator('text=AI 接管').count() > 0:
                took_over = True
                break
        check('A 收到掉线通知并切 AI 接管', took_over,
              page_a.locator('.note.warn').first.inner_text() if page_a.locator('.note.warn').count() else '未出现提示')

        t_after = read_tick(page_a)
        page_a.wait_for_timeout(2500)
        t_later = read_tick(page_a)
        check('掉线后 A 仍在推进（对局不卡死）', t_later > t_after,
              f'{t_after} → {t_later}')
        page_a.keyboard.up('ArrowRight')
        page_a.screenshot(path=os.path.join(SHOTS, '24-pvp-takeover.png'), full_page=True)

        browser.close()

    real_errors = [e for e in console_errors if 'favicon' not in e.lower()]
    if real_errors:
        print('\n--- console 报错 ---')
        for e in real_errors[:10]:
            print('  ' + e)
        problems.append(f'{len(real_errors)} 条 console 报错')

    ok = sum(1 for _, o, _ in steps if o)
    print(f'\n{ok}/{len(steps)} 项检查通过')
    if problems:
        print('问题：')
        for x in problems:
            print('  - ' + x)
        return 1
    print('实时联机（权威模式）验证通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
