#!/usr/bin/env python3
"""移动端触控验收

验三件事：
  ① 触屏设备上真的出现虚拟按键（桌面上不该出现）
  ② 点按钮真的能驱动角色（走位、出招）
  ③ **快速点按不会丢输入** —— 这是做触控层最重要的理由：
     模拟一帧 7.8ms，手指点一下如果短于一帧，引擎采样不到就"没反应"。
     所以触摸层给了最小闩锁（90ms）。这条要专门验。
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

        # ---------------- 用手机尺寸 + 触摸开一局 ----------------
        # 手机**竖屏**。第六轮这里本来要写横屏的 —— 因为竖屏下注册页
        # 的桌面布局会挤在一起、元素互相遮挡点不到。响应式补上之后，
        # 竖屏应该能走完全程，所以这里**故意用竖屏**，等于顺便验收响应式。
        ctx = b.new_context(viewport={'width': 390, 'height': 844},
                            has_touch=True, is_mobile=True,
                            device_scale_factor=2)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:160])
               if m.type == 'error' else None)

        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'touch_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '触屏汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        # ---- 竖屏：**能打**，不再只显示"请横过来" ----
        # ⚠️ 这两条断言在 2026-09 被用户要求改过：
        #    原来的设计是"竖屏摆不开 → 只显示《把手机横过来》，藏掉战斗画面"，
        #    用户明确要求「无论大世界还是作战」都要能在手机上玩，
        #    所以现在改成单列布局（舞台占满宽度、信息栏落下面）。
        #    测试跟着改成断言**新行为** —— 别再改回去。
        pg.goto(BASE + '/#/dojo', wait_until='networkidle')
        pg.wait_for_timeout(1800)
        hint = pg.locator('.rotate-hint')
        check('竖屏下不再用"把手机横过来"挡路',
              not (hint.count() > 0 and hint.first.is_visible()),
              '提示仍然可见' if hint.count() and hint.first.is_visible() else '已隐藏')
        check('竖屏下战斗画面**真的能玩**（不再被藏起来）',
              pg.locator('.battle-layout').first.is_visible())

        # ---- 转到横屏：应该立刻可用 ----
        pg.set_viewport_size({'width': 844, 'height': 390})
        pg.wait_for_timeout(800)
        check('转成横屏后提示消失', not hint.first.is_visible())
        check('转成横屏后战斗画面出现',
              pg.locator('.battle-layout').first.is_visible())
        pg.wait_for_selector('#dojo-stage canvas', timeout=25000)
        pg.wait_for_function(
            "() => window.__dojo && window.__dojo.st.match.phase === 'fight'",
            timeout=20000)

        n = pg.locator('#touch-pad .tp-btn').count()
        check('触屏设备上出现了虚拟按键', n >= 8, f'{n} 个按钮')
        check('触控层真的显示了（不是 display:none）',
              pg.locator('#touch-pad').is_visible())
        check('触屏上把 HUD 那排招式钮藏了（功能重复会叠在一起）',
              not pg.locator('#dojo-hud .bh-skill').first.is_visible())

        # 按钮够大（手机上 <44px 基本按不准）
        box = pg.locator('#touch-pad .tp-move').first.bounding_box()
        check('按钮够大（≥44px 的可点区域）',
              box and box['width'] >= 44 and box['height'] >= 44,
              f"{box['width']:.0f}×{box['height']:.0f}")

        # ---------------- ② 点按钮真的能驱动 ----------------
        x0 = pg.evaluate("() => Math.round(window.__dojo.st.units[0].x)")
        btn = pg.locator('#touch-pad .tp-move').nth(1)      # ▶
        btn.dispatch_event('pointerdown')
        pg.wait_for_timeout(600)
        btn.dispatch_event('pointerup')
        pg.wait_for_timeout(200)
        x1 = pg.evaluate("() => Math.round(window.__dojo.st.units[0].x)")
        check('点"▶"角色真的往右走了', x1 > x0 + 20, f'x {x0} → {x1}')

        # ---------------- ③ 快速点按不丢输入 ----------------
        pg.evaluate("() => { const s = window.__dojo.st;"
                    " s.units[0].x = s.units[1].x - 62 * 256; }")
        pg.wait_for_timeout(200)
        hp0 = pg.evaluate("() => window.__dojo.st.units[1].hp")
        atk = pg.locator('#touch-pad .tp-right .tp-btn').first   # J
        # 模拟"手指飞快地点"：pointerdown 之后**立刻** pointerup
        # （不加最小闩锁的话，这比一帧还快，引擎采不到 → 一点伤害都没有）
        for _ in range(5):
            atk.dispatch_event('pointerdown')
            pg.wait_for_timeout(8)
            atk.dispatch_event('pointerup')
            pg.wait_for_timeout(240)
        pg.wait_for_timeout(400)
        hp1 = pg.evaluate("() => window.__dojo.st.units[1].hp")
        check('极快的点按也能打到（最小闩锁生效）', hp1 < hp0,
              f'木桩 {hp0} → {hp1}')

        pg.screenshot(path=os.path.join(SHOTS, '99-mobile.png'), full_page=True)

        # ---------------- 桌面上不该出现 ----------------
        ctx2 = b.new_context(viewport={'width': 1440, 'height': 950})
        pg2 = ctx2.new_page()
        pg2.goto(BASE + '/#/login', wait_until='networkidle')
        pg2.click('#mode-switch', force=True)
        pg2.fill('#username', 'desk_' + stamp)
        pg2.fill('#password', 'pass1234')
        pg2.click('#submit', force=True)
        pg2.wait_for_selector('.breed-card', timeout=25000)
        pg2.locator('.breed-card').first.click(force=True)
        pg2.fill('#dog-name', '桌面团')
        pg2.click('#adopt-submit', force=True)
        pg2.wait_for_selector('text=我的机械狗', timeout=25000)
        pg2.goto(BASE + '/#/dojo', wait_until='networkidle')
        pg2.wait_for_selector('#dojo-stage canvas', timeout=25000)
        pg2.wait_for_timeout(1500)
        desk_n = pg2.locator('#touch-pad .tp-btn').count()
        check('桌面上不出现虚拟按键', desk_n == 0, f'{desk_n} 个')
        check('桌面上 HUD 招式钮还在',
              pg2.locator('#dojo-hud .bh-skill').first.is_visible())

        # ---- 响应式：窄屏（<820px）下两栏收成一栏 ----
        pg.set_viewport_size({'width': 700, 'height': 500})
        pg.wait_for_timeout(500)
        cols = pg.evaluate("""() => {
            const el = document.querySelector('.battle-layout');
            if (!el) return null;
            return getComputedStyle(el).gridTemplateColumns.split(' ').length;
        }""")
        check('窄屏（700px）下战斗页收成一栏', cols == 1, f'{cols} 栏')
        pg.set_viewport_size({'width': 844, 'height': 390})
        pg.wait_for_timeout(400)

        check('全程没有 console 报错', not errs, str(errs[:2]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('移动端触控验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
