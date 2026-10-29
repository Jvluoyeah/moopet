# -*- coding: utf-8 -*-
"""验「口头禅」真的会从狗嘴里说出来。

小说里的设定：登记员给你一张【口头禅】卡纸 ——
"你写什么，它这辈子说得最多的，就是这一句。"
所以世界里按空格的冒泡**应该以它为主**（每三句插一句通用动作台词）。
这里领养一只填了口头的狗，按几下空格，把冒泡内容读出来。
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
MOTTO = '我们回家'
os.makedirs(SHOTS, exist_ok=True)
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 900})
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'mt_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '阿六')
    # 领养表单里的「两张卡纸」应该都在
    check('领养页有「名字」输入框', p.locator('#dog-name').count() == 1)
    check('领养页有「口头禅」输入框', p.locator('#dog-motto').count() == 1)
    p.fill('#dog-motto', MOTTO)
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    # 档案卡与首页都要显示这句
    p.goto(URL + '/#/card', wait_until='networkidle')
    p.wait_for_timeout(1500)
    check('档案卡上显示了口头禅', MOTTO in p.content())

    p.goto(URL + '/#/world', wait_until='networkidle')
    p.wait_for_timeout(2600)
    check('世界拿到了这句口头禅',
          p.evaluate('() => (window.__world && window.__world.opts.motto) || ""') == MOTTO,
          p.evaluate('() => (window.__world && window.__world.opts.motto) || "(空)"'))

    # 连按空格，收集冒泡内容
    lines = []
    for _ in range(9):
        p.keyboard.press('Space')
        p.wait_for_timeout(260)
        t = p.evaluate('() => (window.__world && window.__world._bubbleText) || ""')
        if t and (not lines or lines[-1] != t):
            lines.append(t)
        p.wait_for_timeout(600)          # 等跳完，才能再按
    n_motto = sum(1 for x in lines if x == MOTTO)
    check('冒泡里口头禅占多数', n_motto >= max(2, len(lines) // 2),
          '共 %d 句，其中口头禅 %d 句：%s' % (len(lines), n_motto, lines[:6]))
    check('也不是每句都一样（还剩点活气）', len(set(lines)) > 1, lines[:6])

    p.screenshot(path=os.path.join(SHOTS, 'motto-world.png'))
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
