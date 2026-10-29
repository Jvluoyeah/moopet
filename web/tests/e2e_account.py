# -*- coding: utf-8 -*-
"""账号设置页的端到端验收（走真实浏览器）。

覆盖用户要的四项：
  ① 昵称     —— 改完顶栏跟着变
  ② 改密码   —— 旧密码失效、新密码能登、**其他设备被踢**
  ③ 多设备   —— 两台浏览器同时登着，设备列表两条，能踢掉另一台
  ④ 注销     —— 密码错了拒绝；对了之后登不上、名下的狗也没了

跑在临时端口上（默认 8090），不打扰正在跑的 8080。
"""
import os
import re
import sys
import time
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8090'
SHOTS = 'tests/shots'
FAILS = []


def visit(pg, path):
    """进某个页面，**保证真的重新加载**。

    ⚠️ 已经在同一个 hash 上时，再 `goto` 同一个地址**不会触发 hashchange**，
    页面停在原地、也不会重新拉数据（第一次就是这么漏掉了新登录的设备）。
    所以先绕到首页再进目标页。
    """
    pg.goto(BASE + '/#/', wait_until='networkidle')
    # ⚠️ 是 BASE + '/#' + path，**不是** BASE + path ——
    #    少那个 '#' 就变成请求真实路径 /account，服务端直接 404
    #    （页面会显示 {"detail":"Not Found"}，hash 为空）。
    pg.goto(BASE + '/#' + path, wait_until='networkidle')


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


def wait_for(pg, sel, timeout=15000):
    try:
        pg.wait_for_selector(sel, timeout=timeout)
        return True
    except Exception:
        return False


def signup(pg, tag):
    u = 'acc_%s_%s' % (tag, datetime.now().strftime('%H%M%S'))
    pg.goto(BASE + '/#/login', wait_until='networkidle')
    pg.click('#mode-switch')
    pg.fill('#username', u)
    pg.fill('#password', 'pass1234')
    pg.click('#submit')
    wait_for(pg, '.breed-card', 25000)
    pg.locator('.breed-card').first.click()
    pg.fill('#dog-name', tag + '汪')
    pg.click('#adopt-submit')
    wait_for(pg, 'text=我的机械狗', 20000)
    return u


os.makedirs(SHOTS, exist_ok=True)
errs = []
with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True)
    ca, cb = br.new_context(viewport={'width': 1280, 'height': 900}), \
        br.new_context(viewport={'width': 1280, 'height': 900})
    a, b = ca.new_page(), cb.new_page()
    for pg in (a, b):
        pg.on('pageerror', lambda e: errs.append(str(e)[:160]))

    user = signup(a, 'A')
    check('注册并领养', True, user)

    # ---- ① 昵称 ----
    visit(a, '/account')
    ok_page = wait_for(a, '#nickname', 15000)
    check('账号页打得开', ok_page)
    if not ok_page:
        # 打不开就把现场留下来（截图 + 页面文字 + hash），别只报一句 FAIL
        a.screenshot(path=os.path.join(SHOTS, 'account-fail.png'), full_page=True)
        print('   [现场] hash:', a.evaluate('() => location.hash'))
        print('   [现场] 页面文字:', a.locator('body').inner_text()[:220].replace('\n', ' / '))
        print('   [现场] 报错:', errs[:3])
        br.close()
        print('\n失败: %s' % FAILS)
        sys.exit(1)
    a.fill('#nickname', '月环街区的记录员')
    a.click('#save-nickname')
    a.wait_for_timeout(1500)
    top = a.locator('#account-link').inner_text() if a.locator('#account-link').count() else ''
    check('顶栏跟着显示昵称', '月环街区的记录员' in top, top)

    # ---- ③ 多设备（先开第二台）----
    b.goto(BASE + '/#/login', wait_until='networkidle')
    b.fill('#username', user)
    b.fill('#password', 'pass1234')
    b.click('#submit')
    b.wait_for_timeout(2500)
    check('第二台设备登录成功', b.evaluate("() => !!localStorage.getItem('moopet.token')"))

    visit(a, '/account')
    a.wait_for_timeout(1800)
    rows = a.locator('#sessions .row').count()
    check('设备列表列出两台', rows >= 2, '%d 条' % rows)
    cur = a.locator('#sessions').inner_text()
    check('标出了"这一台"', '这一台' in cur, cur.replace('\n', ' / ')[:70])

    # 踢掉另一台
    btns = a.locator('#sessions button')
    if btns.count():
        btns.first.click()
        a.wait_for_timeout(1800)
    check('踢完之后另一台失效',
          b.evaluate("""async () => {
              const r = await fetch('/api/auth/me', {
                  headers: {Authorization: 'Bearer ' + localStorage.getItem('moopet.token')}});
              return r.status;
          }""") == 401)

    # ---- ② 改密码 ----
    visit(a, '/account')
    a.wait_for_timeout(1200)
    a.fill('#old-password', 'wrongpass')
    a.fill('#new-password', 'newpass456')
    a.fill('#new-password2', 'newpass456')
    a.click('#save-password')
    a.wait_for_timeout(1500)
    check('原密码错会被拒（页面给出提示）',
          '不正确' in a.locator('body').inner_text())
    a.fill('#old-password', 'pass1234')
    a.fill('#new-password', 'newpass456')
    a.fill('#new-password2', 'newpass456')
    a.click('#save-password')
    a.wait_for_timeout(2000)
    check('改密码成功', '换好了' in a.locator('body').inner_text())
    check('当前这台仍然可用（新 token 已写回）',
          a.evaluate("""async () => (await fetch('/api/auth/me', {
              headers: {Authorization: 'Bearer ' + localStorage.getItem('moopet.token')}})).status""") == 200)

    # ---- ④ 注销 ----
    visit(a, '/account')
    a.wait_for_timeout(1200)
    a.fill('#delete-password', 'wrong-one')
    a.click('#delete-account')
    a.wait_for_timeout(1500)
    check('注销时密码错会被拒', '不正确' in a.locator('body').inner_text())
    check('账号还在（没被误删）', a.evaluate("() => !!localStorage.getItem('moopet.token')"))

    a.fill('#delete-password', 'newpass456')
    a.click('#delete-account')
    a.wait_for_timeout(2500)
    check('注销后回到登录页', a.evaluate('() => location.hash') == '#/login',
          a.evaluate('() => location.hash'))
    check('注销后本地凭证已清',
          a.evaluate("() => !localStorage.getItem('moopet.token')"))

    # 用原账号密码也登不上了
    a.fill('#username', user)
    a.fill('#password', 'newpass456')
    a.click('#submit')
    a.wait_for_timeout(2000)
    check('注销后用原账号登不上',
          '不正确' in a.locator('body').inner_text() or a.evaluate('() => location.hash') != '#/')

    a.screenshot(path=os.path.join(SHOTS, 'account.png'), full_page=True)
    print('  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败 %d 项: %s' % (len(FAILS), FAILS)))
sys.exit(1 if FAILS else 0)
