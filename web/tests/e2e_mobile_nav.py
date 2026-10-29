# -*- coding: utf-8 -*-
"""移动端导航验收：顶栏那排必须**八个页面一个不少、且都点得动**。

起因（真机截图）：手机顶栏只有 首页/世界/竞技场/训练记录 四项 —— 而站点有八个页面，
目录（左侧那栏）在手机上又是隐藏的，于是**训练场 / 狗狗档案 / 月塔端口 / 排行榜
在手机上一个都进不去**。根因是顶栏导航写死了四个链接（现在改成从 PAGES 生成）。

这条测试钉三件事：
  ① 顶栏项数 = PAGES 的项数（不是写死的四个）；
  ② 每一个都点得动（横向滚动出来也算 —— 用 scroll_into_view 再点）；
  ③ 桌面上也一样（同一套渲染，别只顾手机）。
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
UA = ('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36')
# 站点全部页面（和 src/components/layout.js 的 PAGES 一一对应）
# ⚠️ 加页面时这里**必须一起加** —— 少一个就会报"顶栏项数不等于页面数"，
#    那条断言是对的（它逼着顶栏别漏项）。加了「月塔问询」之后是九个，
#    再加「好友同问」是十个。
PATHS = ['/', '/world', '/arena', '/training', '/dojo', '/card', '/tower', '/quiz',
         '/duel', '/leaderboard']
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


def signup(p):
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'mn_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '导航汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)


with sync_playwright() as pw:
    br = pw.chromium.launch()

    for tag, ctx in (('手机', br.new_context(viewport={'width': 412, 'height': 915},
                                            has_touch=True, is_mobile=True, user_agent=UA)),
                     ('桌面', br.new_context(viewport={'width': 1280, 'height': 900}))):
        print('\n[%s]' % tag)
        p = ctx.new_page()
        errs = []
        p.on('pageerror', lambda e: errs.append(str(e)[:200]))
        signup(p)
        p.goto(URL + '/#/world', wait_until='networkidle')
        p.wait_for_timeout(1500)

        links = p.evaluate("""() => [...document.querySelectorAll('#top-nav a')]
            .map((a) => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim() }))""")
        hrefs = [l['href'] for l in links]
        # ⚠️ 顶栏 = PAGES（10 个站内页）+ **剧情模式**（1 个站外应用）。
        #    加页面时这里要一起加：少一个就会报"项数对不上"，
        #    那条断言是对的（它逼着顶栏别漏项）。
        GAL = '/gal/web/index.html'
        check('顶栏项数 = 十个站内页 + 一个剧情模式', len(links) == len(PATHS) + 1,
              '%d 项：%s' % (len(links), [l['text'] for l in links]))
        missing = [h for h in PATHS if '#' + h not in hrefs]
        check('十个站内页一个不少', not missing, missing)
        check('剧情模式在顶栏有一席（指向反代路径，不是 hash 路由）',
              any(l['href'] == GAL for l in links),
              [l['href'] for l in links if l['href'] and not l['href'].startswith('#')])

        # 逐个点进去（横向滚动出来的也算）。
        # ⚠️ 只点站内页：剧情模式是**整页跳转**，点了会离开这个应用，
        #    测试里单独验它的 href 就够了（上面那条）。
        bad = []
        for path in PATHS:
            sel = '#top-nav a[href="#%s"]' % path
            el = p.locator(sel)
            if el.count() == 0:
                bad.append(path + '(不在顶栏)')
                continue
            try:
                el.first.scroll_into_view_if_needed(timeout=3000)
                el.first.click(timeout=3000)
                p.wait_for_timeout(700)
                if p.evaluate('() => location.hash') != '#' + path:
                    bad.append('%s(点了没跳)' % path)
            except Exception as e:                      # noqa: BLE001
                bad.append('%s(%s)' % (path, str(e)[:26]))
        check('每一项都点得动（八页全通）', not bad, bad)
        check('全程没有页面报错', not errs, errs[:2])
        ctx.close()
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
