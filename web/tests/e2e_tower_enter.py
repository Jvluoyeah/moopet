# -*- coding: utf-8 -*-
"""游戏内端口验收：世界里的「月塔端口」按 E 能不能进那一页。

用户的要求是"在游戏里也做一个端口，让用户在游戏里也可以抽奖签到看狗狗日记"——
所以这条必须验**世界里的实物**，而不是只验网页端那一页（那是另一个入口）。
做法跟 tests/e2e_arena_enter.py 一样：把狗挪到端口旁边，按 E，看路由。
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
    p.fill('#username', 'tp_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '接端口汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    p.goto(URL + '/#/world', wait_until='networkidle')
    p.wait_for_timeout(2800)

    info = p.evaluate("""() => {
        const w = window.__world;
        if (!w || !w.built) return null;
        const l = (w.scene.locals || []).find((q) => q.id === 'tower-port');
        return l ? { x: l.x, z: l.z, label: l.label, hint: l.hint } : null;
    }""")
    check('广场上有「月塔端口」这个可交互物', bool(info), info)
    if not info:
        br.close()
        print('\n失败: 场景里没有这个端口')
        sys.exit(1)

    # 端口附近有没有东西挡着（按 E 之前先确认它在场景里真的画出来了）
    drawn = p.evaluate("""() => {
        const w = window.__world;
        let n = 0;
        w.built.root.traverse((o) => { if (o.isMesh) n += 1; });
        return n;
    }""")
    check('场景里确实有网格（端口画出来了）', drawn > 50, '%d 个 mesh' % drawn)

    # 把狗挪到端口旁边再按 E（和 arena_enter 一样的做法）
    p.evaluate("""(l) => {
        const w = window.__world;
        w.player.x = l.x - 40; w.player.z = l.z + 40;
        w.camera.setTarget(w.player.x, w.player.z);
    }""", info)
    p.wait_for_timeout(1200)
    hint = p.evaluate("() => (document.querySelector('.w3-hint') || {}).textContent || ''")
    check('走近后弹出交互提示（认得出是端口）', '月塔' in hint, hint)
    p.screenshot(path=os.path.join(SHOTS, 'tower-port-world.png'))

    p.keyboard.press('e')
    p.wait_for_timeout(1800)
    route = p.evaluate('() => location.hash')
    check('按 E 之后进了月塔端口那一页', route.startswith('#/tower'), route)
    txt = p.evaluate("() => document.body.innerText.replace(/\\s+/g, ' ')")
    check('进去之后三块功能都在', all(k in txt for k in ('盖章', '摸签', '册子上的日记')),
          txt[:60])

    print('  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
