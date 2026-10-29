#!/usr/bin/env python3
"""AI 对手的回归测试

为什么单独开一个：`controller` 的约定我踩了**两次**同一个坑 ——
    controller === null  → 机器控制（stepAI 会驱动）
    controller !== null  → 人类控制（stepAI 跳过）

第二次的表现是"AI 站着不动、一招不出"，而且**所有既有测试都是绿的** ——
因为那些测试验的是玩家侧、联机对账、HUD，没有一条验"AI 到底动没动"。

所以这里只验三件事，都是**运行时观测量**：
  ① AI 会移动（走过多少格）
  ② AI 会出招（用过哪几种）
  ③ 玩家什么都不按的时候**不会自己出招**（"技能自动放"的回归）
"""
import os
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

passed = 0
failures = []


def check(label, ok, detail=''):
    global passed
    if ok:
        passed += 1
        print(f'OK    {label}' + (f'  — {detail}' if detail else ''))
    else:
        failures.append(label)
        print(f'FAIL  {label}  {detail}')


def main():
    stamp = datetime.now().strftime('%H%M%S')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width': 1440, 'height': 950}).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))

        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'ai_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '陪练汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        pg.goto(BASE + '/#/arena', wait_until='networkidle')
        pg.wait_for_selector('#arena-stage canvas', timeout=25000)
        pg.wait_for_timeout(800)
        pg.click('button[data-mode=ai]')
        pg.wait_for_timeout(3200)

        # controller 约定：对手必须是"机器座位"（null）
        ctrl = pg.evaluate(
            "() => window.__arena.session.state.units.map((u) => u.controller)")
        check('对手坐在"机器座位"上（controller 必须是 null）',
              ctrl[1] is None, f'controller = {ctrl}')

        # 采样 4 秒
        pg.evaluate("""() => {
            const g = window.__arena;
            window.__ai = { xs: [], kinds: new Set(), mine: 0 };
            const orig = g.consumeEvents.bind(g);
            g.consumeEvents = (st) => {
                const f = st.match.fighters[1];
                window.__ai.xs.push(Math.round(f.x / 256));
                if (f.attack) window.__ai.kinds.add(f.attack.skill.type);
                orig(st);
            };
            const origRead = g.readInput.bind(g);
            g.readInput = () => {
                const r = origRead();
                if (r.skill >= 0) window.__ai.mine += 1;
                return r;
            };
        }""")
        pg.wait_for_timeout(4000)
        r = pg.evaluate("""() => {
            const a = window.__ai;
            return {
                span: a.xs.length ? Math.max(...a.xs) - Math.min(...a.xs) : 0,
                kinds: [...a.kinds],
                mine: a.mine,
            };
        }""")
        print('  AI:', r)

        check('AI 会移动（不是站着不动的木桩）', r['span'] > 30,
              f"4 秒走了 {r['span']} 格")
        check('AI 会出招（用过不止一种招式）', len(r['kinds']) >= 2,
              f"用过：{','.join(r['kinds']) or '（无）'}")
        check('玩家不按键时不会自己出招', r['mine'] == 0,
              f"自发出招 {r['mine']} 次")

        pg.screenshot(path=os.path.join(SHOTS, '_ai.png'), full_page=True)
        check('全程没有 console 报错', not errs, str(errs[:2]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('AI 对手验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
