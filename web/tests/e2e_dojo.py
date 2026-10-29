#!/usr/bin/env python3
"""训练场 e2e（/#/dojo）—— **新引擎的实机验收**

这个页面试跑的是移植过来的新引擎（simAB = rules + match + aiAB），
不是旧的 sim.js。所以这个套件同时是"新引擎能不能真跑起来"的验收。

教训（第十四轮留下的）：锁步一致 + 渲染对齐测试通过，**还不够**。
那一轮实机一跑挖出三个 bug：
  · this.side 忘赋值 → 页面崩
  · 立牌没挂上 → 场上一只狗都没有，但页面不报错
  · 物理跑了两遍 → 锁步测试抓不到（两端都错得一样），只有"训练场复活没触发"暴露出来
所以这个套件**不只看状态，还看画面上真有没有东西**。

跑法：python tests/e2e_dojo.py [BASE]
"""
import os
import sys
import time
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5173').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

passed = 0
failures = []


def check(label, ok, detail=''):
    global passed
    if ok:
        passed += 1
        print(f'OK    {label}' + (f'  — {detail}' if detail else ''))
    else:
        failures.append(f'{label}: {detail}')
        print(f'FAIL  {label}  {detail}')


def hold(page, key, seconds):
    page.keyboard.down(key)
    page.wait_for_timeout(int(seconds * 1000))
    page.keyboard.up(key)


def snap(page):
    return page.evaluate('() => window.__dojo.snapshot()')


def main():
    stamp = datetime.now().strftime('%H%M%S')
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_context(viewport={'width': 1440, 'height': 950}).new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(f'{m.type}: {m.text}')
                if m.type == 'error' else None)

        # ---- 注册一只狗 ----
        page.goto(BASE + '/#/login', wait_until='networkidle')
        page.click('#mode-switch')
        page.fill('#username', 'dojo_' + stamp)
        page.fill('#password', 'pass1234')
        page.click('#submit')
        page.wait_for_selector('.breed-card', timeout=25000)
        page.locator('.breed-card').first.click()
        page.fill('#dog-name', '练习汪')
        page.click('#adopt-submit')
        page.wait_for_selector('text=我的机械狗', timeout=25000)

        # ---- 进训练场 ----
        page.goto(BASE + '/#/dojo', wait_until='networkidle')
        page.wait_for_selector('#dojo-stage canvas', timeout=25000)
        check('训练场画布起来了', page.locator('#dojo-stage canvas').count() == 1)
        check('训练场有 HUD', page.locator('#dojo-hud .bh-bar').count() >= 2)
        page.wait_for_timeout(2600)          # 等过 2.25 秒的开场演出

        s0 = snap(page)
        check('用的是训练模式（rules 层）', s0['training'] is True, str(s0['training']))
        check('已经开打（过了 intro）', s0['phase'] == 'fight', s0['phase'])

        # ---- 场上真的有两只狗（第十四轮就是栽在这） ----
        actors = page.evaluate("""() => {
            const v = window.__dojo.view;
            return {
                n: v.actorRoot.children.length,
                pos: v.actorRoot.children.map(g => [Math.round(g.position.x),
                                                    Math.round(g.position.y)]),
                hasMap: v.actorRoot.children.every(g =>
                    !!(g.userData.body && g.userData.body.material.map)),
            };
        }""")
        check('舞台上真的挂了两只狗（不是空白）', actors['n'] == 2, str(actors))
        check('两只狗都有贴图', actors['hasMap'], str(actors['hasMap']))
        check('两只狗的 x 坐标分开（不会叠在一起）',
              abs(actors['pos'][0][0] - actors['pos'][1][0]) > 100,
              f"{actors['pos'][0][0]} vs {actors['pos'][1][0]}")
        check('两只狗都站在地面上（y=0）',
              all(abs(py) < 2 for _, py in actors['pos']), str(actors['pos']))

        # ---- 训练场的三条硬性行为 ----
        t0 = s0['timeF']
        hold(page, 'd', 1.0)
        page.wait_for_timeout(300)
        s1 = snap(page)
        check('不倒计时（训练场没有时限）', s1['timeF'] == t0,
              f"{t0} → {s1['timeF']}")
        check('按 D 会走（输入真的驱动了）', s1['x'][0] > s0['x'][0] + 50,
              f"x {s0['x'][0]} → {s1['x'][0]}")

        # ---- 贴脸打，木桩要掉血 ----
        page.evaluate("""() => {
            const s = window.__dojo.st;
            s.units[0].x = s.units[1].x - 70 * 256;   // 挪到轻击射程内
        }""")
        page.wait_for_timeout(250)
        hp0 = snap(page)['hp'][1]
        # 用按住/松开，不要 press()：press 是"按下立刻抬起"，
        # 比一帧（128Hz = 7.8ms）还快，很容易整个落在两帧之间 ——
        # 引擎采样不到，表现是"一次都没打中"（这条断言因此时好时坏）。
        for _ in range(6):
            page.keyboard.down('j')
            page.wait_for_timeout(90)
            page.keyboard.up('j')
            page.wait_for_timeout(180)
        page.wait_for_timeout(400)
        hp1 = snap(page)['hp'][1]
        check('贴脸连按 J 能打到木桩', hp1 < hp0, f'木桩 {hp0} → {hp1}')
        page.screenshot(path=os.path.join(SHOTS, '96-dojo.png'), full_page=True)

        # ---- 新引擎的移动态（第十四轮补的映射） ----
        states = set()
        page.keyboard.down('d')
        for _ in range(12):
            page.wait_for_timeout(90)
            states.add(snap(page)['state'][0])
        page.keyboard.up('d')
        check('走起来时状态是 run/walk（否则狗会原地滑行）',
              bool(states & {'run', 'walk'}), f'出现过：{sorted(states)}')

        # ---- 打空血 → 立刻复活，且永远不结束 ----
        page.evaluate('() => { window.__dojo.st.units[1].hp = 0; }')
        page.wait_for_timeout(700)
        s2 = snap(page)
        check('木桩被打空会立刻满血复活（训练场行为）',
              s2['hp'][1] > 0, f"hp={s2['hp']}")
        check('训练场永远不会进 roundend', s2['phase'] == 'fight', s2['phase'])

        # ---- 全屏 ----
        try:
            page.click('#dojo-fullscreen')
            page.wait_for_timeout(900)
            fs = page.evaluate(
                "() => document.fullscreenElement && document.fullscreenElement.id")
            check('全屏的是整块 wrap（HUD 不会丢）', fs == 'dojo-wrap', str(fs))
            check('全屏后 HUD 还在视口里', page.locator('#dojo-hud .bh-bar').count() >= 2)
            page.keyboard.press('Escape')
            page.wait_for_timeout(500)
        except Exception as e:      # noqa: BLE001
            check('全屏可用', False, str(e))

        # ---- 技能键 ----
        page.keyboard.press('1')
        page.wait_for_timeout(400)
        cd = snap(page)
        check('技能键有反应（没崩就行，冷却在 HUD 上）', cd['tick'] > 0, str(cd['tick']))

        check('全程没有 console 报错', not errs, str(errs[:3]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('训练场验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
