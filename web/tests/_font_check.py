#!/usr/bin/env python3
"""临时脚本：核查霞鹜新致宋有没有真的用到世界招牌上。"""
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173').rstrip('/')

CHECK = ('() => document.fonts.check(\'normal 74px "LXGW Bright"\','
         ' "狗窝旅店汪记小馆训练场")')
LOADED = ("() => { let n = 0; document.fonts.forEach((f) => {"
          " if (f.family.indexOf('LXGW') >= 0 && f.status === 'loaded') n += 1; });"
          " return n; }")


def main():
    stamp = datetime.now().strftime('%H%M%S')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width': 1440, 'height': 950}).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text)
               if m.type == 'error' else None)
        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'ft_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '字体汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)
        pg.goto(BASE + '/#/world', wait_until='networkidle')
        pg.wait_for_selector('#world3d canvas', timeout=25000)
        pg.wait_for_timeout(2500)
        print('招牌字形可用 =', pg.evaluate(CHECK))
        print('已加载的字体分片数 =', pg.evaluate(LOADED))
        pg.screenshot(path='tests/shots/_font-world.png', full_page=True)
        print('errors', errs[:3])
        b.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
