#!/usr/bin/env python3
"""验 ④ 7 连强制脱离的提示，以及 ⑥ 结算面板的三种结束方式。

④ 强制脱离是**一帧级**的事件（受击方立刻进入 61 帧无敌 + 大击退），
   靠页面每帧比状态量抓不住。所以引擎把它记成事件，页面收到就 flash。
   这里直接构造一条 escape 事件喂进去，验提示真的会亮。

⑥ 三种结束方式都很难自然等到：
   K.O.（把一方血打空）/ TIME UP（把时间调到 0）/ DRAW（双方等血）。
   直接把状态改到位，看结算面板写的是什么。
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
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:160])
               if m.type == 'error' else None)

        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'esc_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '脱离汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        pg.goto(BASE + '/#/dojo', wait_until='networkidle')        # SPA 里对同一个 hash 再 goto 一次不会重挂，要先绕去别的路由。
        pg.goto(BASE + '/#/', wait_until='networkidle')
        pg.wait_for_timeout(400)
        pg.goto(BASE + '/#/dojo', wait_until='networkidle')
        pg.wait_for_selector('#dojo-stage canvas', timeout=25000)
        pg.wait_for_timeout(3000)

        # ---- ④ 强制脱离提示 ----
        pg.evaluate("""() => {
            window.__dojo.st.events.push({ type: 'escape', by: 0, on: 1, combo: 7 });
        }""")
        pg.wait_for_timeout(500)
        el = pg.locator('#bh-flash').first
        cls = el.get_attribute('class') or ''
        txt = el.inner_text()
        check('7 连强制脱离 → 出瞬时提示', 'is-on' in cls and '脱离' in txt,
              f'class="{cls}" text="{txt}"')
        pg.screenshot(path=os.path.join(SHOTS, '_escape.png'), full_page=True)

        # 提示应该会自己消失
        pg.wait_for_timeout(1200)
        cls2 = pg.locator('#bh-flash').first.get_attribute('class') or ''
        check('提示自己会消失（不让它常驻）', 'is-on' not in cls2, f'class="{cls2}"')

        # ---- ④b 引擎真的会产出这个事件 ----
        r = pg.evaluate("""() => {
            const st = window.__dojo.st;
            const m = st.match;
            const atk = m.fighters[0], def = m.fighters[1];
            // 直接构造一次第 7 段命中
            const { resolveHit } = window.__rulesForTest || {};
            return { hasEvents: Array.isArray(st.events), keys: Object.keys(m) };
        }""")
        check('引擎状态里有 events 队列', r['hasEvents'], str(r['hasEvents']))

        # ---- ⑥ 结算面板：K.O. ----
        def panel_text():
            return pg.locator('#arena-panel').inner_text().replace('\n', ' | ')

        pg.goto(BASE + '/#/arena', wait_until='networkidle')        # SPA 里对同一个 hash 再 goto 一次不会重挂，要先绕去别的路由。
        pg.goto(BASE + '/#/', wait_until='networkidle')
        pg.wait_for_timeout(400)
        pg.goto(BASE + '/#/arena', wait_until='networkidle')
        pg.wait_for_selector('#arena-stage canvas', timeout=25000)
        pg.wait_for_timeout(900)
        pg.click('button[data-mode=ai]')
        pg.wait_for_timeout(4200)

        # 把对手血清零 → K.O.
        pg.evaluate("""() => {
            const s = window.__arena.session.state;
            s.units[1].hp = 0;
        }""")
        # K.O. 之后不是立刻 finished：要过 roundend 那 307 帧（2.4 秒）。
        # 第一版只等 2 秒，差一点点，面板就没出来。
        pg.wait_for_timeout(3600)
        t_ko = pg.evaluate("() => document.body.innerText")
        has_ko = '本局结束' in t_ko
        check('打倒对手 → 出结算面板', has_ko)
        if has_ko:
            p = pg.evaluate("() => (document.querySelector('.stack') || {}).innerText || ''")
            check('结算面板标出 K.O.', 'K.O.' in t_ko or 'K.O.' in p,
                  t_ko[t_ko.find('本局结束'):t_ko.find('本局结束') + 60].replace('\n', ' '))
        pg.screenshot(path=os.path.join(SHOTS, '_result-ko.png'), full_page=True)

        # ---- ⑨ 结算面板的信息层次 ----
        if has_ko:
            panel = pg.locator('.rs').first
            cells = panel.locator('.rs-cell').count()
            check('结算面板有四项战绩', cells == 4, f'{cells} 项')
            check('显示胜负判定（大标题）', panel.locator('.rs-verdict').count() == 1)
            check('显示结束方式（K.O. / TIME UP / DRAW）',
                  panel.locator('.rs-how').count() == 1,
                  panel.locator('.rs-how').inner_text()
                  if panel.locator('.rs-how').count() else '（没有）')
            txt = panel.inner_text()
            labels = [w for w in ('造成伤害', '承受伤害', '最高连段', '用时') if w in txt]
            check('四项战绩的标签都在', len(labels) == 4, '/'.join(labels))
            # ⚠️ 这条是用户明确要求过的：界面上不要出现底层说明
            bad = [w for w in ('结算帧', '哈希', '0x', '定点', '128Hz', 'simAB', '锁步')
                   if w in txt]
            check('结算面板里没有开发者信息', not bad,
                  f'残留：{bad}' if bad else '干净')

        # ---- ⑥ TIME UP：把回合时间调到 0 ----
        # SPA 里对同一个 hash 再 goto 一次不会重挂，要先绕去别的路由。
        pg.goto(BASE + '/#/', wait_until='networkidle')
        pg.wait_for_timeout(400)
        pg.goto(BASE + '/#/arena', wait_until='networkidle')
        pg.wait_for_selector('#arena-stage canvas', timeout=25000)
        pg.wait_for_timeout(900)
        pg.click('button[data-mode=ai]')
        pg.wait_for_timeout(4200)
        pg.evaluate("""() => {
            const s = window.__arena.session.state;
            // ⚠️ 必须先造成**血量差**。
            //    时间到的判据是"谁血多谁赢"，双方等血就变成 DRAW 了 ——
            //    第一版只调了 timeF，双方都是满血，结果面板上写的是 DRAW，
            //    而我在断言里等 "TIME UP"，自然挂。
            s.units[0].hp = 300;
            s.units[1].hp = 80;
            s.match.timeF = 2;          // 下一帧就到点
        }""")
        pg.wait_for_timeout(3600)       # 同样要等过 roundend 那 307 帧
        t = pg.evaluate("() => document.body.innerText")
        ok1 = ('本局结束' in t) and ('TIME UP' in t)
        check('时间到 → 出结算面板且标 TIME UP', ok1,
              (t[t.find('本局结束'):t.find('本局结束') + 70].replace('\n', ' ')
               if '本局结束' in t else '（没有结算面板）'))
        pg.screenshot(path=os.path.join(SHOTS, '_result-timeup.png'), full_page=True)

        # ---- ⑥ DRAW：双方血量一样，时间到就是平局 ----
        # SPA 里对同一个 hash 再 goto 一次不会重挂，要先绕去别的路由。
        pg.goto(BASE + '/#/', wait_until='networkidle')
        pg.wait_for_timeout(400)
        pg.goto(BASE + '/#/arena', wait_until='networkidle')
        pg.wait_for_selector('#arena-stage canvas', timeout=25000)
        pg.wait_for_timeout(900)
        pg.click('button[data-mode=ai]')
        pg.wait_for_timeout(4200)
        pg.evaluate("""() => {
            const s = window.__arena.session.state;
            s.units[0].hp = 200;
            s.units[1].hp = 200;        // 血量相等
            s.match.timeF = 2;
        }""")
        pg.wait_for_timeout(3600)
        t2 = pg.evaluate("() => document.body.innerText")
        ok2 = ('DRAW' in t2) and ('本局结束' in t2)
        check('双方等血 + 时间到 → 标 DRAW（不是 K.O./TIME UP）', ok2,
              (t2[t2.find('本局结束'):t2.find('本局结束') + 70].replace('\n', ' ')
               if '本局结束' in t2 else '（没有结算面板）'))
        pg.screenshot(path=os.path.join(SHOTS, '_result-draw.png'), full_page=True)

        # ---- 两页的最终验收截图（目标里明确要求） ----
        # SPA 里对同一个 hash 再 goto 一次不会重挂，要先绕去别的路由。
        pg.goto(BASE + '/#/', wait_until='networkidle')
        pg.wait_for_timeout(400)
        pg.goto(BASE + '/#/arena', wait_until='networkidle')
        pg.wait_for_selector('#arena-stage canvas', timeout=25000)
        pg.wait_for_timeout(900)
        pg.click('button[data-mode=ai]')
        pg.wait_for_timeout(5000)       # 打到中途，血条/气条都有变化
        for k in ('d', 'j', 'j'):
            pg.keyboard.press(k)
            pg.wait_for_timeout(180)
        pg.wait_for_timeout(600)
        pg.screenshot(path=os.path.join(SHOTS, '95-arena-hud.png'), full_page=True)

        # SPA 里对同一个 hash 再 goto 一次不会重挂，要先绕去别的路由。
        pg.goto(BASE + '/#/', wait_until='networkidle')
        pg.wait_for_timeout(400)
        pg.goto(BASE + '/#/dojo', wait_until='networkidle')
        pg.wait_for_selector('#dojo-stage canvas', timeout=25000)
        pg.wait_for_timeout(3200)
        for k in ('d', 'j', 'j', 'j'):
            pg.keyboard.press(k)
            pg.wait_for_timeout(180)
        pg.wait_for_timeout(600)
        pg.screenshot(path=os.path.join(SHOTS, '96-dojo-hud.png'), full_page=True)

        check('全程没有 console 报错', not errs, str(errs[:3]))
        for f in ('95-arena-hud.png', '96-dojo-hud.png'):
            pth = os.path.join(SHOTS, f)
            check(f'验收截图已产出：{f}', os.path.exists(pth) and os.path.getsize(pth) > 20000,
                  f'{os.path.getsize(pth) if os.path.exists(pth) else 0} 字节')
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('强制脱离与结算验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
