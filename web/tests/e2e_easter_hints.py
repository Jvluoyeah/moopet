# -*- coding: utf-8 -*-
"""彩蛋提示的验收：三层都要写明白，而且读起来还像册子。

⚠️ 判据在用户说"再明显一点"之后**反过来了**：
   原来是"前两层不许出现数字"（三层递进，数字只给翻公告板的人）；
   现在要求**每层都写清数字和结果** —— 玩家只翻到一个地方也能找到。
   所以这里改成：三处都要有「七」+ 都要说明"有东西"，而且都不许出现系统词
   （"彩蛋 / 隐藏 / 功能 / 按钮 / 点击"）。

另外钉一条行为：**关掉之后再连点，还得能开**（这条曾经是坏的：
   开完没清 lastClick，下一次连点的第一下被算成上次的延续，计数从中间接着走）。
"""
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
FAILS = []
BAD_WORDS = ['彩蛋', '隐藏', '功能', '按钮', '点击']


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
    p.fill('#username', 'hint_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '提示汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    print('\n[① 印上的悬停提示]')
    tip = p.evaluate("() => { const e = document.querySelector('#brand-mark');"
                     " return e ? (e.getAttribute('title') || '') : null; }")
    check('那一枚印有 title', bool(tip), tip)
    check('title 里写明了「七」', bool(tip) and '七' in tip, tip)
    check('title 说明了里面有东西', bool(tip) and ('录像' in tip or '东西' in tip), tip)
    check('title 里没有系统词', bool(tip) and not any(w in tip for w in BAD_WORDS), tip)
    check('那枚印在动（时不时的那一下，让人知道它能按）',
          p.evaluate("() => getComputedStyle(document.querySelector('#brand-mark'))"
                     ".animationName") not in ('none', ''),
          p.evaluate("() => getComputedStyle(document.querySelector('#brand-mark')).animationName"))
    # ★ "时不时"才是重点：**周期要长**（一轮好几秒），而不是一直在闪。
    #   周期短于 3 秒就变成了背景噪音 —— 那和用户要的"时不时"是反的。
    dur = p.evaluate("() => getComputedStyle(document.querySelector('#brand-mark'))"
                     ".animationDuration")
    secs = float(dur.replace('s', '')) if dur.endswith('s') else 0.0
    check('周期够长（"时不时"，不是一直在动）', secs >= 3.0, '%s 秒一轮' % secs)

    print('\n[② 目录便签上的字]')
    p.goto(URL + '/#/world', wait_until='networkidle')
    p.wait_for_timeout(1500)
    note = p.evaluate("() => document.body.innerText")
    line = [ln for ln in note.split('\n') if '七下' in ln]
    check('便签里写明了「连按七下」', bool(line), line[:2])
    check('便签也说了"有人留了东西"',
          bool(line) and ('东西' in line[0] or '留' in line[0]), line[:1])
    check('便签里没有系统词', bool(line) and not any(w in line[0] for w in BAD_WORDS),
          line[:1])

    print('\n[③ 公告板背面]')
    info = p.evaluate("""() => {
        const w = window.__world;
        const l = (w.scene.locals || []).find((q) => q.id === 'board');
        if (!l) return null;
        w.player.x = l.x - 40; w.player.z = l.z + 40;
        if (w.camera && w.camera.setTarget) w.camera.setTarget(w.player.x, w.player.z);
        return { x: l.x, z: l.z };
    }""")
    check('广场上找得到公告板', bool(info), info)
    if info:
        p.wait_for_timeout(1000)
        p.keyboard.press('e')
        p.wait_for_timeout(1200)
        txt = p.evaluate("() => document.body.innerText")
        row = [ln for ln in txt.split('\n') if '七下' in ln]
        check('公告板背面也写着「连按七下」', bool(row), row[:1])

    print('\n[④ 关掉之后再连点，还得能开]')
    p.goto(URL + '/#/world', wait_until='networkidle')
    p.wait_for_timeout(1500)
    for _ in range(7):
        p.click('#brand-mark')
        p.wait_for_timeout(110)
    p.wait_for_timeout(700)
    check('第一次连点开出来了', p.locator('#easter-egg').count() == 1)
    p.keyboard.press('Escape')
    p.wait_for_timeout(400)
    check('Esc 关掉了', p.locator('#easter-egg').count() == 0)
    # ⚠️ 紧接着再连点（不给它超过 RESET_MS 的间隔）—— 这里曾经点不开
    for _ in range(7):
        p.click('#brand-mark')
        p.wait_for_timeout(110)
    p.wait_for_timeout(700)
    check('紧跟着再连点 7 下，还能开（这是修过的那条）',
          p.locator('#easter-egg').count() == 1)

    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
