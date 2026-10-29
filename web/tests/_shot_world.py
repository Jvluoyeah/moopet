#!/usr/bin/env python3
"""临时脚本：为四个场景各截一张图，供美术评估用。"""
import os
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
SCENES = ['plaza', 'park', 'arena', 'kennel']


def main():
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        page = b.new_context(viewport={'width': 1440, 'height': 950}).new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        uname = 'shot_' + datetime.now().strftime('%H%M%S')
        page.goto(BASE + '/#/login', wait_until='networkidle')
        page.click('#mode-switch')
        page.fill('#username', uname)
        page.fill('#password', 'pass1234')
        page.click('#submit')
        page.wait_for_selector('.breed-card', timeout=20000)
        page.locator('.breed-card').first.click()
        page.fill('#dog-name', '画模汪')
        page.click('#adopt-submit')
        page.wait_for_selector('text=我的机械狗', timeout=20000)

        page.goto(BASE + '/#/world', wait_until='networkidle')
        page.wait_for_selector('#world3d canvas', timeout=20000)
        page.wait_for_timeout(2500)
        for code in SCENES:
            page.evaluate("(c) => window.__world.setScene(c)", code)
            page.wait_for_timeout(1400)
            page.screenshot(path=os.path.join(SHOTS, f'40-scene-{code}.png'))
            print('shot', code, page.evaluate("() => window.__world.sceneCode"),
                  page.evaluate("() => window.__world.built.colliders.length"), 'colliders')
        if errs:
            print('errors:', errs[:5])
        b.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
