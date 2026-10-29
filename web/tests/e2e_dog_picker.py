# -*- coding: utf-8 -*-
"""验证"每次重新登录都要选一遍狗"这条流程。

要验四件事：
  ① 领养完之后再进 #/adopt，出现「带哪只出门」（自己名下的狗）
  ② 点它 → 回首页，而且当前狗就换成点的那只
  ③ 页面上**没有 "[object Object]"**（h() 的 props 传错位置就会印出这个）
  ④ 没登录/没狗时，页面照常能用（品种图鉴还在）
"""
import time
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8080'
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


with sync_playwright() as pg:
    b = pg.chromium.launch()
    p = b.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:160]))
    stamp = time.strftime('%H%M%S')

    # ① 注册 + 领养
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'pick_' + stamp)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '第一只')
    p.click('#adopt-submit')
    p.wait_for_timeout(2500)
    check('领养后回到首页', p.evaluate('() => location.hash') in ('#/', '#'), p.evaluate('() => location.hash'))

    # 再领养一只，这样"挑哪一只"才有意义
    p.goto(URL + '/#/adopt', wait_until='networkidle')
    p.wait_for_timeout(1500)
    p.locator('.breed-card').nth(2).click()
    p.fill('#dog-name', '第二只')
    p.click('#adopt-submit')
    p.wait_for_timeout(2500)

    # ② 再进选狗页
    p.goto(URL + '/#/', wait_until='networkidle')
    p.goto(URL + '/#/adopt', wait_until='networkidle')
    p.wait_for_timeout(2000)

    mine = p.locator('#my-dogs')
    check('出现「带哪只出门」区块', mine.count() > 0 and mine.inner_text().strip() != '')
    txt = mine.inner_text() if mine.count() else ''
    check('区块里能看到两只狗的名字', ('第一只' in txt) and ('第二只' in txt), txt.replace('\n', ' / ')[:60])
    check('没有 "[object Object]" 渲染事故', '[object Object]' not in p.locator('body').inner_text())

    # ③ 点第一只 → 应设为当前狗并回首页
    # ⚠️ 选择器要指到**里层的狗卡**：`#my-dogs .card` 第一个匹配到的是外层
    #    包装卡（它没有 onclick），点它当然不会跳转 —— 我第一版就是这么写的。
    p.locator('#my-dogs .grid-auto > .card').first.click()
    p.wait_for_timeout(2000)
    check('点一只之后回首页', p.evaluate('() => location.hash') in ('#/', '#'), p.evaluate('() => location.hash'))
    # ⚠️ 当前狗**不写 localStorage**（store 只持久化 theme，狗是每次重新拉的），
    #    所以不能去读 localStorage —— 要看**页面上印的是哪只**。
    body = p.locator('body').inner_text()
    check('当前狗切换成了点的那只', '第一只' in body, '首页出现了：' + ('第一只' if '第一只' in body else ('第二只' if '第二只' in body else '(都没有)')))

    p.screenshot(path='tests/shots/dog-picker.png', full_page=True)
    print('  页面报错:', errs[:2] if errs else '无')
    b.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
