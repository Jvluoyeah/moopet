#!/usr/bin/env python3
"""剧情关卡的会话句柄叫什么"""
import json
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080').rstrip('/')


def main():
    stamp = datetime.now().strftime('%H%M%S')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width': 1380, 'height': 900}).new_page()
        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'pve_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '剧情汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        pg.goto(BASE + '/#/training', wait_until='networkidle')
        pg.wait_for_timeout(1500)
        print('节点数:', pg.evaluate(
            "() => document.querySelectorAll('.lv-node, .lv-link').length"))
        clicked = pg.evaluate("""() => {
            const n = document.querySelector('.lv-node, .lv-link');
            if (!n) return null;
            n.click();
            return (n.textContent || '').trim().slice(0, 40);
        }""")
        print('点了:', clicked)
        pg.wait_for_timeout(4000)
        print('舞台存在:', pg.evaluate(
            "() => !!document.getElementById('training-stage')"))
        print('__training 的键:', pg.evaluate(
            "() => window.__training ? Object.keys(window.__training).slice(0, 25) : null"))
        print('有 st 吗:', pg.evaluate(
            "() => !!(window.__training && window.__training.st)"))
        b.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
