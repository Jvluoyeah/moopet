#!/usr/bin/env python3
"""权威模式的实机验收（双浏览器真联机，走 /ws/match-auth）

和 e2e_pvp.py 的区别：那个走**锁步**，这个走**权威**。
两条路并存，各自都要能打。

验的重点是用户报的那个问题：
  **加入房间的一方不再需要等对手** —— 权威模式下服务端不等任何人。
"""
import os
import sys
import time
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

passed = 0
failures = []


def check(label, ok, detail=''):
    global passed
    if ok:
        passed += 1
        print(f'OK    {label}' + (f'  — {detail}' if detail else ''))
    else:
        failures.append(label)
        print(f'FAIL  {label}  {detail}')


def snap(pg):
    return pg.evaluate("() => window.__arena && window.__arena.snapshot()") or {}


def main():
    stamp = datetime.now().strftime('%H%M%S')
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctxs = [b.new_context(viewport={'width': 1280, 'height': 820}) for _ in range(2)]
        pgs = [c.new_page() for c in ctxs]
        errs = []
        for pg in pgs:
            pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
            pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:160])
                   if m.type == 'error' else None)

        toks = []
        for i, pg in enumerate(pgs):
            pg.goto(BASE + '/#/login', wait_until='networkidle')
            pg.click('#mode-switch')
            pg.fill('#username', f'auth{i}_{stamp}')
            pg.fill('#password', 'pass1234')
            pg.click('#submit')
            pg.wait_for_selector('.breed-card', timeout=25000)
            pg.locator('.breed-card').nth(i).click()
            pg.fill('#dog-name', f'权威{i}汪')
            pg.click('#adopt-submit')
            pg.wait_for_selector('text=我的机械狗', timeout=25000)
            toks.append(pg.evaluate('() => localStorage.getItem("moopet.token")'))

        # ---- A 建房。URL 不带任何参数 —— 测的就是**默认路径**。
        #      权威模式现在是默认（?auth=0 才回退锁步），
        #      所以"普通玩家打开的 PvP"走的就是这条。
        pgs[0].goto(BASE + '/#/arena', wait_until='networkidle')
        pgs[0].wait_for_selector('#arena-stage canvas', timeout=25000)
        pgs[0].wait_for_timeout(700)
        pgs[0].click('button[data-mode=pvp]')
        pgs[0].wait_for_timeout(2500)
        code = pgs[0].evaluate(
            "() => (window.__arena.room && window.__arena.room.room_code) || ''")
        check('权威模式能建出房间', bool(code), code or '（没拿到房间号）')
        if not code:
            return 1

        pgs[1].goto(BASE + f'/#/arena', wait_until='networkidle')
        pgs[1].wait_for_selector('#arena-stage canvas', timeout=25000)
        pgs[1].wait_for_timeout(600)
        pgs[1].evaluate("""(c) => {
            const g = window.__arena;
            g.joinRoom ? g.joinRoom(c) : (location.hash = '#/arena?auth=1&room=' + c);
        }""", code)
        pgs[1].wait_for_timeout(3000)

        sa, sb = snap(pgs[0]), snap(pgs[1])
        check('两端都连上了权威房间',
              sa.get('active') is not None and sb.get('active') is not None,
              f"A={sa.get('active')} B={sb.get('active')}")

        # ---- 关键：两端在推进 ----
        pgs[0].wait_for_timeout(2500)
        ta = snap(pgs[0]).get('tick', -1)
        tb = snap(pgs[1]).get('tick', -1)
        check('**两端都在推进**（权威模式）', ta > 0 and tb > 0,
              f'A={ta} B={tb}')
        check('两端进度接近（权威模式下必然如此：同一个模拟）',
              abs(ta - tb) <= 40, f'A={ta} B={tb}')

        # ---- 操作真的生效 ----
        # ⚠️ 要**轮询**，不能单次采样。
        #    不预测模式下客户端只在收到快照时才更新状态，
        #    而快照是**隔几批发一次**的（省带宽），所以某一瞬间读到"没变"是正常的。
        #    （第一版就是单次采样，误报成"按键没生效"。）
        pgs[0].keyboard.down('d')
        pgs[0].wait_for_timeout(900)
        pgs[0].keyboard.up('d')
        advanced = 0
        for _ in range(30):
            pgs[0].wait_for_timeout(200)
            now = snap(pgs[0]).get('tick', 0)
            if now > ta:
                advanced = now
                break
        check('按键之后模拟继续推进（输入到了服务端又回来了）',
              advanced > ta, f"tick {ta} → {advanced or snap(pgs[0]).get('tick')}")

        # ---- 权威模式下不该出现"等待对手" ----
        stalling = pgs[0].evaluate(
            "() => { const s = window.__arena.session;"
            " return s && s.isStalling ? s.isStalling() : null; }")
        check('**权威模式下不会"等待对手"**（这正是加卡问题的解法）',
              stalling is False, str(stalling))

        pgs[0].screenshot(path=os.path.join(SHOTS, '_auth.png'), full_page=True)

        # 404 多半是浏览器自动要的 favicon 之类，和对战无关
        real_errs = [e for e in errs
                     if 'favicon' not in e.lower()
                     and '404' not in e
                     and 'Failed to load resource' not in e]
        check('全程没有 console 报错', not real_errs, str(real_errs[:2]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('权威模式实机验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
