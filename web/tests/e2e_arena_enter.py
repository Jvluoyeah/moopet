# -*- coding: utf-8 -*-
"""在 3D 竞技场里按 E 能不能**真的进到对战页**。

用户原话："在竞技场内可以通向真正的竞技场这一页"。
改之前这里只弹一句"去竞技场页面开一局"，**不会真的带你去** —— 所以必须
端到端验一次：传送到登记员旁边 → 按 E → 看 location.hash 变没变。
"""
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


with sync_playwright() as pg:
    b = pg.chromium.launch()
    p = b.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'into_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '进场汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    # 进世界 → 切到竞技场场景
    p.goto(URL + '/#/', wait_until='networkidle')
    p.goto(URL + '/#/world', wait_until='networkidle')
    p.wait_for_timeout(2500)
    p.click('button[data-scene="arena"]')
    p.wait_for_timeout(2500)
    check('切到 3D 竞技场', p.evaluate('() => window.__world.sceneCode') == 'arena',
          p.evaluate('() => window.__world.sceneCode'))

    # 传送登记员旁边，等交互提示出现
    info = p.evaluate("""() => {
        const w = window.__world;
        const n = (w.scene.locals || []).find((q) => q.id === 'arena-desk');
        if (!n) return null;
        w.player.x = n.x + 90; w.player.z = n.z + 60;
        w.player.vx = 0; w.player.vz = 0;
        return { label: n.label, hint: n.hint, x: n.x, z: n.z };
    }""")
    check('场景里有对战登记员', bool(info), info)
    p.wait_for_timeout(900)

    # 提示的 class 是 .w3-hint（不是 .w3-prompt —— 我第一版就是写错这个）
    prompt = p.locator('.w3-hint').inner_text() if p.locator('.w3-hint').count() else ''
    check('走到旁边弹出交互提示', bool(prompt.strip()), prompt.replace('\n', ' ')[:60])

    p.keyboard.press('e')
    p.wait_for_timeout(2200)
    got = p.evaluate('() => location.hash')
    check('按 E 之后进了对战页', got == '#/arena', got)
    check('对战页真的渲染出来了',
          p.locator('button[data-mode="ai"]').count() > 0,
          p.locator('button[data-mode="ai"]').count())
    print('  页面报错:', errs[:2] if errs else '无')
    b.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
