#!/usr/bin/env python3
"""临时脚本：拉远相机俯视图，用于排查场景里的模型/尺度/地面问题。"""
import os
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
CODE = sys.argv[2] if len(sys.argv) > 2 else 'plaza'
DIST = int(sys.argv[3]) if len(sys.argv) > 3 else 2600


def main():
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        page = b.new_context(viewport={'width': 1440, 'height': 950}).new_page()
        page.on('pageerror', lambda e: print('pageerror', e))
        uname = 'probe_' + datetime.now().strftime('%H%M%S')
        page.goto(BASE + '/#/login', wait_until='networkidle')
        page.click('#mode-switch')
        page.fill('#username', uname)
        page.fill('#password', 'pass1234')
        page.click('#submit')
        page.wait_for_selector('.breed-card', timeout=20000)
        page.locator('.breed-card').first.click()
        page.fill('#dog-name', '探针汪')
        page.click('#adopt-submit')
        page.wait_for_selector('text=我的机械狗', timeout=20000)
        page.goto(BASE + '/#/world', wait_until='networkidle')
        page.wait_for_selector('#world3d canvas', timeout=20000)
        page.wait_for_timeout(2000)
        info = page.evaluate("""(a) => {
            const w = window.__world;
            w.setScene(a.code);
            w.camera.pitch = 1.16;
            w.camera.dist = a.dist;
            w.camera.update(1);
            const out = [];
            w.sceneRoot.traverse(o => {
                if (!o.isMesh) return;
                const wp = new (o.position.constructor)();
                o.getWorldPosition(wp);
                const col = o.material && o.material.color ? '#' + o.material.color.getHexString() : '-';
                out.push({ n: o.name || o.type, c: col, x: Math.round(wp.x), y: Math.round(wp.y), z: Math.round(wp.z),
                           geo: o.geometry.type });
            });
            return { meshes: out.length, sample: out };
        }""", {'code': CODE, 'dist': DIST})
        print('meshes', info['meshes'])
        for m in info['sample']:
            print(f"  {m['geo']:18s} {m['c']:8s} ({m['x']},{m['y']},{m['z']}) {m['n'][:24]}")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SHOTS, f'41-top-{CODE}.png'))
        b.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
