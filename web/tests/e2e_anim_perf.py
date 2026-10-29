# -*- coding: utf-8 -*-
"""抽签动画的性能验收：移动端视口 + CPU 降速下不许掉帧。

为什么要有这条：目标里写着"移动端不因动画掉帧"，而在此之前只有**间接证据**
（动画只用 transform/opacity、移动端 UI 测试通过）—— 那不算实测。
这里用 rAF 采样量帧间隔，并且用 CDP 把 CPU 降到 1/4 模拟较慢的手机。

阈值故意放宽（每帧 <200ms、中位 ≤40ms）：这条要抓的是"加了会触发布局的属性
（width/height/top/left/filter）导致整段动画卡成 PPT"，不是几帧抖动。
实测参考值（本机、412×915、含 4× 降速）：中位 16.7ms、最差 16.8ms、零掉帧。
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
UA = ('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36')
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


SAMPLER = """() => {
    window.__fr = [];
    let last = performance.now();
    const tick = (t) => {
        window.__fr.push(t - last); last = t;
        if (window.__fr.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}"""

STATS = """() => {
    const a = (window.__fr || []).slice(1).filter((x) => x > 0);
    if (!a.length) return null;
    const b = [...a].sort((x, y) => x - y);
    return {
        n: a.length,
        med: b[Math.floor(b.length / 2)],
        worst: b[b.length - 1],
        over200: a.filter((x) => x > 200).length,
    };
}"""


def signup(p, tag):
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', '%s_%s' % (tag, s))
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '帧率汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)


with sync_playwright() as pw:
    br = pw.chromium.launch()
    for tag, rate in (('正常 CPU', 1), ('CPU 降速 4×', 4)):
        ctx = br.new_context(viewport={'width': 412, 'height': 915}, has_touch=True,
                             is_mobile=True, user_agent=UA)
        p = ctx.new_page()
        signup(p, 'fps%d' % rate)
        p.goto(URL + '/#/tower', wait_until='networkidle')
        p.wait_for_timeout(1500)

        cdp = ctx.new_cdp_session(p)
        if rate != 1:
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': rate})
        p.evaluate(SAMPLER)
        p.wait_for_timeout(600)
        p.click('#tower-draw')                 # 演出开始
        p.wait_for_timeout(1700)               # 覆盖整个演出 + 重建
        st = p.evaluate(STATS)
        if rate != 1:
            cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})

        print('\n[%s]' % tag)
        check('采到帧数据', bool(st), st)
        if st:
            print('   帧数 %d  中位 %.1fms  最差 %.1fms  >200ms %d 帧'
                  % (st['n'], st['med'], st['worst'], st['over200']))
            check('没有长卡顿（无 >200ms 的单帧）', st['over200'] == 0, st['over200'])
            check('中位帧间隔正常（≤40ms，即 ≥25fps）', st['med'] <= 40, '%.1fms' % st['med'])
        ctx.close()
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
