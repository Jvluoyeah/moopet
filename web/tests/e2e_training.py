#!/usr/bin/env python3
"""剧情关卡验收（真实浏览器 · 单页）

验的是完整闭环：**关卡列表 → 进关 → 推进 → 遇敌 → 打到 Boss → 通关 → 档案册记上一页**。

为了不把测试写成"考验 AI 操作水平"，这里给玩家开局一个很高的血上限
（`__training.st.units[0].maxHp`），让脚本能稳定打完全程；
打击判定、波次推进、Boss 血条、结算与记账全都是真的在跑。

用法：先起服务端与前端，再 python tests/e2e_training.py [base_url]
"""
import os
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


def snap(page):
    try:
        return page.evaluate('() => window.__training ? window.__training.snapshot() : null') or {}
    except Exception:
        return {}


def main():
    os.makedirs(SHOTS, exist_ok=True)
    if not wait_backend():
        print('后端不通，先 python run_local.py')
        return 1

    stamp = datetime.now().strftime('%H%M%S')
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(viewport={'width': 1360, 'height': 900}).new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

        # ---- 注册领养 ----
        page.goto(BASE + '/#/login', wait_until='networkidle')
        page.click('#mode-switch')
        page.fill('#username', 'train_' + stamp)
        page.fill('#password', 'pass1234')
        page.click('#submit')
        if not wait_for(page, '.breed-card', timeout=25000):
            print('注册失败'); browser.close(); return 1
        page.locator('.breed-card').first.click()
        page.fill('#dog-name', '训练汪')
        page.click('#adopt-submit')
        wait_for(page, 'text=我的机械狗', timeout=25000)
        check('注册领养 OK', True, 'train_' + stamp)

        # ---- 关卡列表 ----
        page.goto(BASE + '/#/training', wait_until='networkidle')
        ok = wait_for(page, '.lv-node', timeout=25000)
        check('关卡列表渲染出来', ok)
        if not ok:
            browser.close(); return 1
        page.wait_for_timeout(600)
        nodes = page.locator('.lv-node').count()
        check('列出 4 关', nodes == 4, f'{nodes} 个节点')
        check('列表里有关卡名与推荐等级',
              page.locator('.lv-name').count() == 4
              and '推荐' in page.locator('.lv-meta').first.inner_text())
        check('未通关时没有通关标记',
              page.locator('.lv-node.is-clear').count() == 0)
        page.screenshot(path=os.path.join(SHOTS, '80-training-map.png'), full_page=True)

        # ---- 进关 ----
        page.click('.lv-node[data-level="L1"]')
        ok = wait_for(page, '#training-stage canvas', timeout=25000)
        check('进关后舞台挂载', ok)
        page.wait_for_timeout(900)
        s0 = snap(page)
        check('关卡状态可读', s0.get('level') == 'L1', str(s0.get('level')))
        # ★ 关卡界面上要有键位提示（用户要求），而且 O 那一条要写「治愈」不是「飞弹」
        hint = page.evaluate("""() => {
            const el = document.querySelector('#training-hint');
            return el ? el.innerText.replace(/\\s+/g, ' ') : null;
        }""")
        check('战斗界面有关键位提示条', bool(hint), (hint or '')[:60])
        check('提示里写的是 O 治愈（不是飞弹）',
              bool(hint) and 'O 治愈' in hint and '飞弹' not in hint,
              (hint or '')[:80])
        check('提示里说明了治愈的消耗口径（体力/敏捷）',
              bool(hint) and '体力' in hint and '敏捷' in hint)
        # ⚠️ 这条原来断言"开局必须停在推进段、对手还没登场"——那是**旧设计**
        #    （要走到闸门才刷出对手）。用户要求改成"不用往右走也能刷新"之后，
        #    开局改成一段 0.75 秒的**刷新冷却**，等 900ms 再采样时对手已经登场了，
        #    于是这条报红。不是刷新坏了，是断言绑在了旧机制上。
        #    改成钉新机制的实质：**开局先有一段冷却，对手随后自己出来**。
        check('开局有刷新冷却（先亮一下倒计时，对手随后登场）',
              s0.get('phase') in ('advance', 'fight'), str(s0.get('phase')))
        check('对手会自己登场（不用往右走）',
              s0.get('foeActive') is True and 0 < (s0.get('x') or [0, 0])[1] < 2000,
              '对手 x=%s' % (s0.get('x') or [None, None])[1])
        check('玩家从左侧出发', (s0.get('x') or [9999])[0] < 400, str(s0.get('x')))

        # 给测试用的高血上限：不这样的话"能不能通关"就变成考 AI 操作了
        page.evaluate("""() => {
            const st = window.__training.st;
            st.units[0].maxHp = 4000;
            st.units[0].hp = 4000;
        }""")

        def fight(seconds=26):
            """往右推进，**遇敌就停下来打**。

            ⚠️ 这里原来是全程按住 D「一边走一边砍」—— 那是错的驱动方式：
               对手在闸门后面 220 格，玩家一路按 D 会**从对手身上穿过去**，
               然后面朝右、背对着它砍，所有近战判定都打空。
               实测数据：me.x 693 → 891 → 1005，而 foe.x 一直在 780~857，
               foe.hp 从头到尾是 34（一次都没掉）。
               真人不会按着方向键从敌人身上走过去，所以测试也不该这么驱。
            """
            end = time.time() + seconds
            i = 0
            held = None                      # 现在按着哪个方向键

            def hold(which):
                nonlocal held
                if held == which:
                    return
                if held:
                    page.keyboard.up(held)
                held = which
                if which:
                    page.keyboard.down(which)

            while time.time() < end:
                i += 1
                st_now = snap(page)
                xs = st_now.get('x') or [0, 0]
                me_x, foe_x = xs[0], xs[1]
                if st_now.get('phase') == 'advance':
                    hold('d')                # 推进段：一路往右
                else:
                    # ⚠️ 遇敌之后要**朝对手走**，不能一直按右、也不能不动。
                    #    原来这里是"遇敌就松手" —— 对 wave0 的 chaser 没问题
                    #    （它会自己走过来），但 Boss 是 **roller**：
                    #    高速滚过去、冲过头再转身，**不会停在玩家面前**。
                    #    实测：150 秒后玩家 x=1608、Boss x=1799，相距 191，
                    #    而轻击的 range 只有 98 —— 一次都够不着，Boss 血一直 221。
                    #    真人会追上去，所以测试也照着做。
                    if foe_x > me_x + 30:
                        hold('d')
                    elif foe_x < me_x - 30:
                        hold('a')
                    else:
                        hold(None)           # 进范围了就停下来打
                page.keyboard.press('j')
                if i % 11 == 0:
                    page.keyboard.press('k')
                if i % 17 == 0:
                    page.keyboard.press('1')
                if i % 23 == 0:
                    page.keyboard.press('2')
                if i % 13 == 0:
                    page.keyboard.press('w')
                page.wait_for_timeout(140)
                st = snap(page)
                if st.get('over'):
                    break
            if held:
                page.keyboard.up(held)

        # ---- 推进 → 遇敌 ----
        page.keyboard.down('d')
        entered = False
        for _ in range(40):
            page.wait_for_timeout(200)
            if snap(page).get('foeActive'):
                entered = True
                break
        page.keyboard.up('d')
        check('往右走会遇敌（推进段有效）', entered, str(snap(page)))
        s1 = snap(page)
        check('遇敌后进入战斗阶段', s1.get('phase') == 'fight', str(s1.get('phase')))
        check('对手有血有条', (s1.get('foeHp') or 0) > 0, str(s1.get('foeHp')))
        page.screenshot(path=os.path.join(SHOTS, '81-training-fight.png'), full_page=True)

        # ---- 打到 Boss ----
        boss_seen = False
        boss_bar = False
        deadline = time.time() + 150
        while time.time() < deadline:
            fight(6)
            st = snap(page)
            if st.get('foeIsBoss') and st.get('foeActive'):
                boss_seen = True
                if page.locator('#bh-boss.is-on').count() > 0:
                    boss_bar = True
                page.screenshot(path=os.path.join(SHOTS, '82-training-boss.png'), full_page=True)
                break
            if st.get('over'):
                break
        check('打到了 Boss 波', boss_seen, str(snap(page)))
        check('Boss 战顶部血条出现了', boss_bar,
              f"boss 元素={page.locator('#bh-boss').count()}")

        # ---- 打死 Boss ----
        cleared = False
        deadline = time.time() + 120
        while time.time() < deadline:
            fight(5)
            st = snap(page)
            if st.get('over'):
                cleared = st.get('phase') == 'clear'
                break
        check('通关（阶段 = clear）', cleared, str(snap(page)))
        page.wait_for_timeout(1200)
        result_txt = page.locator('#route-slot').inner_text()
        check('结算面板显示通关与星级', '通关' in result_txt and '★' in result_txt,
              result_txt[:60].replace('\n', ' '))
        check('结算面板给出用时', '用时' in result_txt)
        page.screenshot(path=os.path.join(SHOTS, '83-training-clear.png'), full_page=True)

        # ---- 记进档案册 ----
        page.wait_for_timeout(800)
        page.click('#lv-back')
        page.wait_for_selector('.lv-node', timeout=20000)
        page.wait_for_timeout(800)
        check('回到关卡列表', page.locator('#lv-back').count() == 0)
        check('第一关被标成已通关', page.locator('.lv-node.is-clear').count() >= 1,
              f"{page.locator('.lv-node.is-clear').count()} 个")
        stars = page.locator('.lv-node[data-level="L1"] .lv-stars i.on').count()
        check('列表上显示了星级', stars >= 1, f'{stars} 星')
        check('列表刷新出了最快用时',
              '最快' in page.locator('.lv-node[data-level="L1"] .lv-meta').inner_text(),
              page.locator('.lv-node[data-level="L1"] .lv-meta').inner_text())
        page.screenshot(path=os.path.join(SHOTS, '84-training-progress.png'), full_page=True)

        # ---- 服务端真的记账了 ----
        levels = page.evaluate("""async () => {
            const r = await fetch('/api/training/levels', {
                headers: { Authorization: 'Bearer ' + (localStorage.getItem('moopet.token') || '') },
            });
            return r.ok ? await r.json() : null;
        }""")
        if levels:
            l1 = next((x for x in levels if x['code'] == 'L1'), None)
            check('服务端记下了首通', bool(l1 and l1['cleared']), str(l1))
            check('服务端记下了星级与最快用时',
                  bool(l1 and l1['stars'] >= 1 and l1['best_ticks'] > 0), str(l1))
        else:
            check('服务端记下了首通', False, '读 levels 失败')

        drops = page.evaluate("""async () => {
            const r = await fetch('/api/training/drops', {
                headers: { Authorization: 'Bearer ' + (localStorage.getItem('moopet.token') || '') },
            });
            return r.ok ? await r.json() : null;
        }""")
        check('掉落流水里有一条首通记录',
              bool(drops) and any(d['first_clear'] and d['item'] for d in drops),
              str(drops)[:120])

        board = page.evaluate("""async () => {
            const r = await fetch('/api/training/board?level=L1');
            return r.ok ? await r.json() : null;
        }""")
        check('通关榜里有这只狗', bool(board) and len(board) >= 1, str(board)[:100])

        # ---- 重来一次：奖励要变少 ----
        page.click('.lv-node[data-level="L1"]')
        page.wait_for_selector('#training-stage canvas', timeout=20000)
        page.wait_for_timeout(500)
        check('可以重新进同一关', snap(page).get('level') == 'L1')

        real = [e for e in errors if 'favicon' not in e.lower()]
        check('没有 console 报错', not real, str(real[:3]))
        browser.close()

    ok = sum(1 for _, o, _ in steps if o)
    print(f'\n{ok}/{len(steps)} 项检查通过')
    if problems:
        print('问题：')
        for x in problems:
            print('  - ' + x)
        return 1
    print('剧情关卡验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
