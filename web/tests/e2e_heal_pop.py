# -*- coding: utf-8 -*-
"""验"治愈飘字是绿的"。

不看源码、也不靠肉眼：进竞技场 → 让玩家掉一半血 → 按 O →
把页面上那个 `.fx-text.is-heal` 的**计算样式**读出来，并截图。
（"绿的"这件事要能被机器判定：色相在绿色区间 + 蓝色分量明显低于绿色分量。）
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
os.makedirs(SHOTS, exist_ok=True)
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'heal_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '治愈汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    p.goto(URL + '/#/arena', wait_until='networkidle')
    p.wait_for_timeout(1800)
    p.click('button[data-mode=ai]')
    p.wait_for_timeout(2500)
    # 等真正开打（开场有倒计时，倒计时期间出不了招）
    p.wait_for_function(
        "() => window.__arena && window.__arena.session"
        " && window.__arena.session.state.match.phase === 'fight'", timeout=15000)

    # 掉一半血 + 气给满，然后按 O
    p.evaluate("""() => {
        const f = window.__arena.session.state.units[0];
        f.hp = Math.round(f.data.hp * 0.5);
        f.energy = f.maxEnergy || 100 * 256;
        f.cooldowns = [0, 0, 0, 0, 0, 0];
    }""")
    p.wait_for_timeout(120)
    p.keyboard.press('o')

    # 飘字只活 0.95 秒，所以边打边找
    found = None
    for _ in range(20):
        p.wait_for_timeout(80)
        found = p.evaluate("""() => {
            const el = document.querySelector('.fx-text.is-heal');
            if (!el) return null;
            const cs = getComputedStyle(el);
            return { text: el.textContent, color: cs.color,
                     shadow: cs.textShadow.slice(0, 60) };
        }""")
        if found:
            break
    check('治愈飘字出现了', bool(found), found)
    if found:
        nums = [int(x) for x in found['color']
                .replace('rgb(', '').replace(')', '').split(',')[:3]]
        r, g, b = nums
        check('飘字写的是 HP +N', found['text'].startswith('HP +'), found['text'])
        check('颜色是绿的（绿色分量最高、蓝色最低）', g > r and g > b,
              f'rgb({r},{g},{b})')
        check('绿色分量明显高于蓝/红（不是泛白的浅绿）',
              g - b >= 60 and g - r >= 40, f'g-b={g - b} g-r={g - r}')
    p.screenshot(path=os.path.join(SHOTS, 'heal-pop.png'))
    print('  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
