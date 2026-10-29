#!/usr/bin/env python3
"""逐键拆开：e2e 的驱动里是哪个键让玩家打不中对手"""
import json
import sys
import time
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080').rstrip('/')


def run_case(pg, label, keys, seconds=10):
    """keys: [(名字, 每几次按一次)]  第一个永远是 j"""
    pg.goto(BASE + '/#/training', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.evaluate("() => { const n = document.querySelector('.lv-node'); if (n) n.click(); }")
    pg.wait_for_timeout(3500)
    pg.evaluate("""() => { const st = window.__training.st;
        st.units[0].maxHp = 4000; st.units[0].hp = 4000;
        st.units[1].hp = 400; }""")     # 血拉厚，避免一次就打死看不清
    # 推进到遇敌
    pg.keyboard.down('d')
    for _ in range(40):
        pg.wait_for_timeout(150)
        if pg.evaluate("() => window.__training.st.pve.phase") == 'fight':
            break
    pg.keyboard.up('d')

    hp0 = pg.evaluate("() => window.__training.st.units[1].hp")
    end = time.time() + seconds
    i = 0
    while time.time() < end:
        i += 1
        pg.keyboard.press('j')
        for name, every in keys[1:]:
            if i % every == 0:
                pg.keyboard.press(name)
        pg.wait_for_timeout(140)
    hp1 = pg.evaluate("() => window.__training.st.units[1].hp")
    st = pg.evaluate("""() => { const s = window.__training.st;
        return { 相位: s.pve.phase, 波: s.pve.wave, 已清: s.pve.cleared,
                 玩家血: s.units[0].hp,
                 玩家x: Math.round(s.units[0].x/256), 朝向: s.units[0].facing,
                 对手x: Math.round(s.units[1].x/256), 对手血: s.units[1].hp }; }""")
    print(f'{label}: 按了 {i} 次  对手血 {hp0} → {hp1}（掉 {hp0 - hp1}）')
    print(f'     {json.dumps(st, ensure_ascii=False)}')


def main():
    stamp = datetime.now().strftime('%H%M%S')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width': 1380, 'height': 900}).new_page()
        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'k_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '拆键汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        run_case(pg, '只按 J        ', [('j', 1)])
        run_case(pg, 'J + K         ', [('j', 1), ('k', 11)])
        run_case(pg, 'J + 数字1     ', [('j', 1), ('1', 17)])
        run_case(pg, 'J + W(跳)     ', [('j', 1), ('w', 13)])
        run_case(pg, 'e2e 全套      ', [('j', 1), ('k', 11), ('1', 17), ('2', 23), ('w', 13)])
        b.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
