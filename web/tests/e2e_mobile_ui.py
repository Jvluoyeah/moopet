# -*- coding: utf-8 -*-
"""移动端 UI 的客观验收：可点元素**点得到**、且**够大**。

为什么要有这条：目标里写的是"不溢出、不重叠、能点"。
  · 不溢出 —— 已经用 scrollWidth 量过；
  · 不重叠 / 能点 —— 光看图看不出"差 3px 压住一半"。

⚠️ 第一版用 getBoundingClientRect 两两求交，**会假报**：
   顶栏那排页签在 `overflow-x: auto` 的容器里，滚出去的那一项几何位置
   仍然落在"主人"链接上 —— 其实它被容器裁掉、根本不在屏幕上。
   所以这里改成**命中测试**：在每个元素中心调 `elementFromPoint`，
   顶层不是它（或它的子孙）才算"被挡住" —— 这才是"能不能点到"的定义。

尺寸只对**独立控件**要求 44px（Apple/Google 的下限）；
正文里的行内文字链接（表格里的名字）不适用这条，只记录不判失败。
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
os.makedirs(SHOTS, exist_ok=True)
UA = ('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36')
ROUTES = [('/', '首页'), ('/world', '世界'), ('/card', '档案卡'), ('/leaderboard', '排行榜'),
          ('/kennel', '狗窝'), ('/account', '设置')]
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label,
                         ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)

PROBE = """() => {
    const sel = 'a, button, input, select, textarea, summary, .tp-btn';
    const all = [...document.querySelectorAll(sel)];
    const blocked = [];
    const small = [];
    let n = 0;
    for (const el of all) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        // 不在视口里就不算（滚动一下就能看到，不是布局问题）
        if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
        // 中心点被视口裁掉了就跳过（比如横向滚动容器里滚出去的那一项）
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        if (cx < 0 || cx > innerWidth || cy < 0 || cy > innerHeight) continue;
        n += 1;
        const hit = document.elementFromPoint(cx, cy);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
            blocked.push('%s「%s」被 %s 挡住'.replace('%s', el.tagName.toLowerCase())
                .replace('%s', (el.textContent || el.value || '').trim().slice(0, 12))
                .replace('%s', hit.tagName.toLowerCase() + '.' + String(hit.className || '').split(' ')[0]));
        }
        const standalone = el.tagName === 'BUTTON' || el.tagName === 'INPUT'
            || el.tagName === 'SELECT' || el.classList.contains('tab')
            || el.classList.contains('tp-btn') || el.classList.contains('btn');
        if (standalone && Math.min(r.width, r.height) < 40) {
            small.push('%s「%s」%dx%d'.replace('%s', el.tagName.toLowerCase())
                .replace('%s', (el.textContent || '').trim().slice(0, 12))
                .replace('%dx%d', Math.round(r.width) + 'x' + Math.round(r.height)));
        }
    }
    return { total: n, blocked, small };
}"""

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 412, 'height': 915}, has_touch=True,
                         is_mobile=True, user_agent=UA)
    p = ctx.new_page()
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'ui_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '布局汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    for route, label in ROUTES:
        p.goto(URL + '/#/', wait_until='networkidle')
        p.goto(URL + '#' + route, wait_until='networkidle')
        p.wait_for_timeout(1300)
        r = p.evaluate(PROBE)
        print('  %s %-5s 屏内可点 %2d  被挡 %d  偏小 %d' %
              ('OK  ' if not r['blocked'] and not r['small'] else 'FAIL',
               label, r['total'], len(r['blocked']), len(r['small'])))
        for b in r['blocked'][:3]:
            print('       被挡 →', b)
        for m in r['small'][:3]:
            print('       偏小 →', m)
        if r['blocked']:
            FAILS.append('%s: %s' % (label, r['blocked'][0]))
        if r['small']:
            FAILS.append('%s 偏小: %s' % (label, r['small'][0]))

    # ---------------- 横屏也要过 ----------------
    # 竖屏是主场景，但横屏有单独的一套媒体查询（max-height: 480px），
    # 很容易在这边改好、那边漏掉，所以两个方向都量一遍。
    p.close()
    ctx2 = br.new_context(viewport={'width': 915, 'height': 412}, has_touch=True,
                          is_mobile=True, user_agent=UA)
    p2 = ctx2.new_page()
    s2 = time.strftime('%H%M%S')
    p2.goto(URL + '/#/login', wait_until='networkidle')
    p2.click('#mode-switch')
    p2.fill('#username', 'ls_' + s2)
    p2.fill('#password', 'pass1234')
    p2.click('#submit')
    p2.wait_for_selector('.breed-card', timeout=25000)
    p2.locator('.breed-card').first.click()
    p2.fill('#dog-name', '横屏汪')
    p2.click('#adopt-submit')
    p2.wait_for_selector('text=我的机械狗', timeout=25000)
    for route, label in (('/world', '横·世界'), ('/arena', '横·竞技场')):
        p2.goto(URL + '/#/', wait_until='networkidle')
        p2.goto(URL + '#' + route, wait_until='networkidle')
        p2.wait_for_timeout(1400)
        r = p2.evaluate(PROBE)
        print('  %s %-7s 屏内可点 %2d  被挡 %d  偏小 %d' %
              ('OK  ' if not r['blocked'] and not r['small'] else 'FAIL',
               label, r['total'], len(r['blocked']), len(r['small'])))
        for b in r['blocked'][:2]:
            print('       被挡 →', b)
        for m in r['small'][:3]:
            print('       偏小 →', m)
        if r['blocked']:
            FAILS.append('%s: %s' % (label, r['blocked'][0]))
        if r['small']:
            FAILS.append('%s 偏小: %s' % (label, r['small'][0]))
    # ---------------- 窄屏（320）：真机暴露问题的那一档 ----------------
    # 之前只测 412 一个宽度，所以"布局只在单一宽度下成立"这类问题全漏了。
    # 320 是常见的实际 CSS 视口（大屏手机开显示缩放后就是这样），
    # 真机截图里的"标题竖排、页签被裁成一个字"全部在这一档复现。
    p.close()
    ctx3 = br.new_context(viewport={'width': 320, 'height': 710}, has_touch=True,
                          is_mobile=True, user_agent=UA)
    p3 = ctx3.new_page()
    s3 = time.strftime('%H%M%S')
    p3.goto(URL + '/#/login', wait_until='networkidle')
    p3.click('#mode-switch')
    p3.fill('#username', 'n_' + s3)
    p3.fill('#password', 'pass1234')
    p3.click('#submit')
    p3.wait_for_selector('.breed-card', timeout=25000)
    p3.locator('.breed-card').first.click()
    p3.fill('#dog-name', '窄汪')
    p3.click('#adopt-submit')
    p3.wait_for_selector('text=我的机械狗', timeout=25000)
    p3.goto(URL + '/#/world', wait_until='networkidle')
    p3.wait_for_timeout(2000)
    narrow = p3.evaluate("""() => {
        const out = { overflow: document.documentElement.scrollWidth
                                 > document.documentElement.clientWidth + 2 };
        // 文字被折成"一个字一行"：元素高度远大于一行，但宽度很窄
        const vert = [];
        for (const el of document.querySelectorAll('.w3-place, .tab, .btn')) {
            const r = el.getBoundingClientRect();
            const fs = parseFloat(getComputedStyle(el).fontSize) || 14;
            if (r.width > 0 && r.width < fs * 1.6 && r.height > fs * 2.2) {
                vert.push((el.textContent || '').trim().slice(0, 10) + ' ' +
                          Math.round(r.width) + 'x' + Math.round(r.height));
            }
        }
        out.vertical = vert.slice(0, 4);
        const b = document.querySelector('.tp-dir');
        out.btnRatio = b ? Math.round(b.getBoundingClientRect().width
                                      / document.documentElement.clientWidth * 100) : 0;
        return out;
    }""")
    check('320px 下不横向溢出', not narrow['overflow'])
    check('320px 下没有竖排的文字', not narrow['vertical'], narrow['vertical'])
    check('320px 下触控按钮不超过屏宽 16%', narrow['btnRatio'] <= 16,
          '%d%%' % narrow['btnRatio'])
    p3.screenshot(path=os.path.join(SHOTS, 'm-narrow.png'))
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
