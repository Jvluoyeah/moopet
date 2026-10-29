# -*- coding: utf-8 -*-
"""验"在大世界里走进狗窝、翻开册子就进剧情模式"。

用户要求："在大世界内我的狗窝就用来开启剧情模式"。
做法同 e2e_tower_enter：进世界 → 切到狗窝场景 → 把人挪到册子旁边 → 按 E → 看落点。

⚠️ 这里要跳的是**真实路径**（/gal/web/index.html），不是 hash 路由 ——
   剧情模式是挂在 /gal/ 下的独立应用（服务端反代，见 factory.py）。
   所以判据是 p.url 落在 /gal/ 上，不是 location.hash。
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


with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:160]))
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'galw_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '狗窝汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    p.goto(URL + '/#/world', wait_until='networkidle')
    p.wait_for_timeout(2600)
    # 切到狗窝
    sw = p.evaluate("""() => {
        const w = window.__world;
        if (!w) return 'no-world';
        const btn = [...document.querySelectorAll('button, a')]
            .find((b) => (b.textContent || '').includes('我的狗窝'));
        if (btn) { btn.click(); return 'clicked'; }
        if (w.goScene) { w.goScene('kennel'); return 'goScene'; }
        return 'no-way';
    }""")
    check('找到切进狗窝的办法', sw in ('clicked', 'goScene'), sw)
    p.wait_for_timeout(2200)

    info = p.evaluate("""() => {
        const w = window.__world;
        if (!w || !w.scene) return null;
        const l = (w.scene.locals || []).find((q) => q.id === 'gal');
        return l ? { x: l.x, z: l.z, label: l.label, hint: l.hint, scene: w.scene.code } : null;
    }""")
    check('狗窝里有那本「摊开的档案册」', bool(info), info)
    if info:
        p.evaluate("""(l) => {
            const w = window.__world;
            w.player.x = l.x - 40; w.player.z = l.z + 40;
            if (w.camera && w.camera.setTarget) w.camera.setTarget(w.player.x, w.player.z);
        }""", info)
        p.wait_for_timeout(1200)
        hint = p.evaluate("() => (document.querySelector('.w3-hint') || {}).textContent || ''")
        check('走近后认得出是剧情入口', '档案册' in hint or '翻开' in hint, hint)
        p.keyboard.press('e')
        p.wait_for_timeout(2600)
        check('按 E 之后落在剧情模式上（/gal/ …）', '/gal/' in p.url, p.url)
        # ⚠️ 不能只等固定时间：剧情模式是个 284 MB 的 WebGL 应用，
        #    冷启动要好几秒（我单独探它时等了 7 秒才出 canvas）。
        #    等固定 2.6 秒会偶发"canvas=0"，看着像坏了，其实是没加载完。
        try:
            p.wait_for_selector('canvas', timeout=30000)
            booted = True
        except Exception:                            # noqa: BLE001
            booted = False
        title = p.title()
        ncanvas = p.evaluate("() => document.querySelectorAll('canvas').length")
        check('剧情模式确实起来了（标题 + 画布）',
              booted and '档案册' in title and ncanvas > 0,
              '%s / canvas=%s' % (title, ncanvas))
    print('  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
