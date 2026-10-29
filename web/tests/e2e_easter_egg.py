# -*- coding: utf-8 -*-
"""彩蛋验收：连点页头「犬」字标 7 下 → 弹出录像；Esc / 点叉能关；单击照常回首页。

要钉的四件事：
  ① 单击**不会**弹彩蛋（也不能把回首页弄坏 —— 它是 <a href="#/">）；
  ② 连点 7 下弹出，且 <video> 的 src 就是那个外链；
  ③ **不预加载**：没点之前页面上不该有那个 src（不然每次进站都去握一次手）；
  ④ Esc 能关掉（键盘用户不用去够右上角那个叉）。
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
os.makedirs(SHOTS, exist_ok=True)
FAILS = []
VIDEO_HOST = 'arrowmc.top'


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:160]))
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'egg_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '彩蛋汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    p.goto(URL + '/#/world', wait_until='networkidle')
    p.wait_for_timeout(1600)

    print('\n[③ 没点之前不许预加载]')
    pre = p.evaluate("() => document.querySelectorAll('video').length")
    check('页面上没有 video 元素（不预加载）', pre == 0, pre)

    print('\n[① 单击不触发，而且照常回首页]')
    p.goto(URL + '/#/leaderboard', wait_until='networkidle')
    p.wait_for_timeout(1200)
    p.click('#brand-mark')
    p.wait_for_timeout(700)
    check('单击后没有彩蛋', p.locator('#easter-egg').count() == 0)
    check('单击照常回首页（href 没被弄坏）', p.evaluate('() => location.hash') in ('#/', ''))
    p.goto(URL + '/#/world', wait_until='networkidle')
    p.wait_for_timeout(1400)

    print('\n[② 连点 7 下弹出来]')
    for _ in range(7):
        p.click('#brand-mark')
        p.wait_for_timeout(120)
    p.wait_for_timeout(900)
    egg = p.locator('#easter-egg')
    check('彩蛋弹出来了', egg.count() == 1)
    src = p.evaluate("() => { const v = document.querySelector('#easter-egg video');"
                     " return v ? v.getAttribute('src') : null; }")
    check('video 的 src 就是那个外链', bool(src) and VIDEO_HOST in (src or ''),
          (src or '')[:70])
    check('带控制条（能自己拖进度）',
          p.evaluate("() => { const v = document.querySelector('#easter-egg video');"
                     " return !!(v && v.controls); }"))
    p.screenshot(path=os.path.join(SHOTS, 'easter-egg.png'))

    print('\n[④ Esc 能关]')
    p.keyboard.press('Escape')
    p.wait_for_timeout(500)
    check('Esc 之后关掉了', p.locator('#easter-egg').count() == 0)
    check('关掉之后滚动恢复了',
          p.evaluate("() => document.documentElement.style.overflow === ''"))

    print('\n[再点 7 下还能开（不是一次性的）]')
    for _ in range(7):
        p.click('#brand-mark')
        p.wait_for_timeout(120)
    p.wait_for_timeout(700)
    check('第二次也能开', p.locator('#easter-egg').count() == 1)
    p.click("#easter-egg button[aria-label='关掉']")
    p.wait_for_timeout(400)
    check('点右上角的叉也能关', p.locator('#easter-egg').count() == 0)

    print('\n  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
