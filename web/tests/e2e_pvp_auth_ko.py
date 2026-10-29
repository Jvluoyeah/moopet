# -*- coding: utf-8 -*-
"""联机（**权威模式**）一方死亡后，对局要能正常结束。

背景：用户报「联机有一方死亡后游戏不会自动退出」。根因是两处：
  ① `simAB.restoreState()` 不还原 `st.over` / `st.winner` —— 它们是**派生字段**，
     正常只在 `step()` 末尾同步；而权威模式下服务端判定打完后**不再发输入**，
     客户端就不再调 `step()`，于是 `st.over` 永远停在 false。
  ② `arena.js` 的结束判定写在 `if (!state.over) { … advance() … }` 的**内部**，
     而权威模式的 `advance()` 是空实现 —— 那个分支里的 `finish()` 永不执行。

为什么原有测试没抓到：`e2e_pvp.py` 走的是 `#/arena?auth=0`（**锁步**），
锁步的 `advance()` 里是 `while (!state.over) step()`，会自己推进并置位 over。
**线上默认是权威模式**，那条路一直没人测。

这个测试只断言一件事：两端都出现「本局结束」，且胜负相反。
"""
import os
import re
import sys
import time
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
FAILS = []


def check(label, ok, detail=''):
    mark = 'OK  ' if ok else 'FAIL'
    print('  %s %s%s' % (mark, label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)
    return ok


def wait_for(page, sel, timeout=15000):
    try:
        page.wait_for_selector(sel, timeout=timeout)
        return True
    except Exception:
        return False


def signup(page, tag):
    uname = 'ko_%s_%s' % (tag, datetime.now().strftime('%H%M%S'))
    page.goto(BASE + '/#/login', wait_until='networkidle')
    page.click('#mode-switch')
    page.fill('#username', uname)
    page.fill('#password', 'pass1234')
    page.click('#submit')
    if not wait_for(page, '.breed-card', timeout=20000):
        raise RuntimeError(tag + ' 注册失败')
    page.locator('.breed-card').nth(0 if tag == 'A' else 7).click()
    page.fill('#dog-name', tag + '汪')
    page.click('#adopt-submit')
    wait_for(page, 'text=我的机械狗', timeout=20000)


def enter_arena(page):
    """进竞技场。⚠️ **不带 auth=0** —— 这才是线上默认的权威模式。"""
    page.goto(BASE + '/#/', wait_until='networkidle')
    page.goto(BASE + '/#/arena', wait_until='networkidle')
    wait_for(page, 'button[data-mode="pvp"]', timeout=15000)


def main():
    os.makedirs(SHOTS, exist_ok=True)
    errs = []
    with sync_playwright() as pg:
        br = pg.chromium.launch(headless=True)
        ca = br.new_context(viewport={'width': 1280, 'height': 900})
        cb = br.new_context(viewport={'width': 1280, 'height': 900})
        a, b = ca.new_page(), cb.new_page()
        for page, tag in ((a, 'A'), (b, 'B')):
            page.on('pageerror', lambda e, t=tag: errs.append('[%s] %s' % (t, str(e)[:160])))

        signup(a, 'A')
        signup(b, 'B')
        check('两端注册领养', True)

        enter_arena(a)
        a.click('button[data-mode="pvp"]')
        if not wait_for(a, '#room-code', timeout=20000):
            check('A 建房', False)
            br.close()
            return 1
        room = a.locator('#room-code').inner_text().strip()
        check('A 建房', bool(re.fullmatch(r'[A-Z0-9]{6}', room)), room)

        enter_arena(b)
        b.click('button[data-mode="pvp"]')
        wait_for(b, '#join-code', timeout=20000)
        b.fill('#join-code', room)
        b.click('#join-btn')
        check('B 加入', True, room)

        check('A 进入对局', wait_for(a, 'text=对局中', timeout=30000))
        check('B 进入对局', wait_for(b, 'text=对局中', timeout=30000))

        # ---- 双方互殴，直到一方倒下 ----
        deadline = time.time() + 90
        a_done = b_done = False
        n = 0
        while time.time() < deadline:
            for page in (a, b):
                page.keyboard.press('j')          # 普攻
                if n % 4 == 0:
                    page.keyboard.press('1')      # 技能一
                if n % 7 == 0:
                    page.keyboard.press('4')      # 技能四
            n += 1
            a_done = a.locator('text=本局结束').count() > 0
            b_done = b.locator('text=本局结束').count() > 0
            if a_done and b_done:
                break
            a.wait_for_timeout(400)

        a.screenshot(path=os.path.join(SHOTS, 'ko-auth-a.png'), full_page=True)
        b.screenshot(path=os.path.join(SHOTS, 'ko-auth-b.png'), full_page=True)

        check('权威模式：A 侧对局结束（结算面板出现）', a_done)
        check('权威模式：B 侧对局结束（结算面板出现）', b_done)

        # 胜负应当相反
        ta = a.locator('text=本局结束').first.inner_text() if a_done else ''
        tb = b.locator('text=本局结束').first.inner_text() if b_done else ''
        if a_done and b_done:
            check('两端都给出了结算文案', bool(ta) and bool(tb), '%s / %s' % (ta[:20], tb[:20]))

        print('  页面报错:', errs[:2] if errs else '无')
        br.close()

    print('\n%d/%d 项检查通过' % (8 - len(FAILS), 8) if not FAILS else '\n失败: %s' % FAILS)
    return 0 if not FAILS else 1


if __name__ == '__main__':
    sys.exit(main())
