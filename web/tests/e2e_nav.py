# -*- coding: utf-8 -*-
"""左侧目录（01~07）能不能点着走 —— 实测七个入口。

用户指着截图里的目录说"把这些功能性的地方做好"，
所以不能只看代码里写了 `<a href>`，要真的点一遍看 hash 变没变。
"""
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
CASES = [
    ('总览', '/#/'),
    ('开放世界', '/#/world'),
    ('竞技场', '/#/arena'),
    ('训练记录', '/#/training'),
    ('训练场', '/#/dojo'),
    ('狗狗档案', '/#/card'),
    ('排行榜', '/#/leaderboard'),
]
FAILS = []

with sync_playwright() as pg:
    b = pg.chromium.launch()
    p = b.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:160]))
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'nav_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '导航汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    for label, want in CASES:
        # 每次都从首页出发，避免"已经在目标页"导致点不出变化
        p.goto(URL + '/#/', wait_until='networkidle')
        p.wait_for_timeout(600)
        try:
            p.locator('a.tab', has_text=label).first.click(timeout=6000)
            p.wait_for_timeout(1000)
            got = p.evaluate('() => location.hash')
        except Exception as e:
            got = '点击失败: ' + str(e)[:40]
        # ⚠️ `location.hash` 返回 `#/world`，而这里的期望值写的是 `/#/world`
        #    （页面 URL 里的写法）。两者只差最前面那个斜杠 —— 直接切掉它比
        #    拼字符串可靠（我前两版一次写 '/#/'、一次写 '#' + lstrip，全错）。
        ok = got == want[1:] or got == want
        print('  %s 目录「%s」→ %s（期望 %s）' % ('OK  ' if ok else 'FAIL', label, got, want))
        if not ok:
            FAILS.append(label)

    # 3D 竞技场里的登记员能不能带你去对战页
    p.goto(URL + '/#/', wait_until='networkidle')
    p.goto(URL + '/#/world', wait_until='networkidle')
    p.wait_for_timeout(2500)
    p.click('button[data-scene="arena"]')
    p.wait_for_timeout(2200)
    p.screenshot(path='tests/shots/arena-fixed.png', full_page=True)
    print('  拍了 tests/shots/arena-fixed.png')
    print('  页面报错:', errs[:2] if errs else '无')
    b.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
