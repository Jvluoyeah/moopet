# -*- coding: utf-8 -*-
"""移动端验收：触屏设备上要有虚拟摇杆和按钮，而且**真的能操控**。

用 Playwright 的触屏模拟（`has_touch` + 移动端 UA + 手机视口）打开世界页，
然后：
  ① 检查触控层挂上了没有、按钮齐不齐
  ② **按住"↑"**，看狗是不是真的往前走（只检查 DOM 是不够的 ——
     按钮画出来了但没接上逻辑，一样是坏的）
  ③ 关掉触屏模拟（桌面）再看一遍：桌面上不该出现触控层
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
FAILS = []
MOBILE_UA = ('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
             '(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36')


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


def signup(p, tag):
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'mb%s_%s' % (tag, s))
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '手机汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)


os.makedirs(SHOTS, exist_ok=True)
with sync_playwright() as pw:
    br = pw.chromium.launch()
    errs = []

    # ---------------- 移动端 ----------------
    ctx = br.new_context(viewport={'width': 412, 'height': 915}, has_touch=True,
                         is_mobile=True, user_agent=MOBILE_UA)
    p = ctx.new_page()
    p.on('pageerror', lambda e: errs.append(str(e)[:160]))
    signup(p, 'A')
    p.goto(URL + '/#/world', wait_until='networkidle')
    p.wait_for_timeout(2600)

    info = p.evaluate("""() => {
        const el = document.getElementById('world-touch');
        if (!el) return { mounted: false };
        return {
          mounted: true,
          on: el.classList.contains('is-on'),
          buttons: [...el.querySelectorAll('.tp-btn')].map((b) => b.textContent.trim()),
          visible: getComputedStyle(el).display,
        };
    }""")
    check('触屏设备上挂出了触控层', info.get('mounted'), info)
    check('触控层是显示状态', info.get('visible') == 'block', info.get('visible'))
    btn = info.get('buttons') or []
    check('有四个方向键', all(k in btn for k in ('↑', '←', '→', '↓')), btn)
    check('有 跳 / 跑 / 交互', all(k in btn for k in ('跳', '跑', '交互')), btn)

    # ---- 按住"↑"，狗要真的动 ----
    before = p.evaluate('() => ({ x: Math.round(window.__world.player.x), z: Math.round(window.__world.player.z) })')
    box = p.locator('#world-touch .tp-up').bounding_box()
    p.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    p.mouse.down()
    p.wait_for_timeout(1400)
    p.mouse.up()
    p.wait_for_timeout(300)
    after = p.evaluate('() => ({ x: Math.round(window.__world.player.x), z: Math.round(window.__world.player.z) })')
    moved = abs(after['x'] - before['x']) + abs(after['z'] - before['z'])
    check('按住「↑」狗真的往前走', moved > 80, '%s → %s（位移 %d）' % (before, after, moved))

    p.screenshot(path=os.path.join(SHOTS, 'mobile-world.png'))

    # ---- 对战页也要有（那边原来就有，别被改坏）----
    p.goto(URL + '/#/arena', wait_until='networkidle')
    p.wait_for_timeout(2000)
    n = p.evaluate("() => document.querySelectorAll('.tp .tp-btn').length")
    check('对战页也有触控按钮', n >= 6, '%d 个' % n)

    # ---------------- 桌面端不该有 ----------------
    ctx2 = br.new_context(viewport={'width': 1280, 'height': 900})
    p2 = ctx2.new_page()
    signup(p2, 'B')

    # ---- 顺手查一类通用毛病：页面上印出字面的 null / undefined / NaN ----
    # 起因是首页真的印了一个 "null"（原生 replaceChildren(null) 会把 null
    # 当文本插进去）。这条与机型无关，但既然在手机上先看见了，就长期盯着。
    junk = []
    for route in ('/', '/world', '/card', '/leaderboard', '/kennel'):
        p2.goto(URL + '/#/', wait_until='networkidle')
        p2.goto(URL + '#' + route, wait_until='networkidle')
        p2.wait_for_timeout(900)
        hits = p2.evaluate("""() => {
            const out = [];
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (w.nextNode()) {
                const t = (w.currentNode.nodeValue || '').trim();
                if (t === 'null' || t === 'undefined' || t === 'NaN'
                    || t === '[object Object]') {
                    const pe = w.currentNode.parentElement;
                    out.push(t + ' @ ' + (pe ? pe.tagName + '.' + String(pe.className || '') : '?'));
                }
            }
            return out;
        }""")
        junk += ['%s → %s' % (route, h) for h in hits]
    check('页面上没有字面的 null / undefined / NaN', not junk, junk[:4])

    p2.goto(URL + '/#/world', wait_until='networkidle')
    p2.wait_for_timeout(2200)
    d = p2.evaluate("""() => {
        const el = document.getElementById('world-touch');
        return el ? getComputedStyle(el).display : '(没挂)';
    }""")
    check('桌面端不显示触控层', d in ('none', '(没挂)'), d)

    print('  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
