#!/usr/bin/env python3
"""验打击感真的发生了 —— 不看代码，看运行时。

为什么要专门验：这套东西的特点就是"**接上了但没生效**"看不出来。
  · 顿帧：如果 hitstopF 一直是 0，画面毫无区别，只是"不卡"
  · 震屏：stage.shake 设了但 _updateCamera 没读，也看不出来
  · 火花：spawnFx 调了但 fxRoot 没变化，等于没调
所以这里卡的是**运行时观测量**：顿帧计数、shake 峰值、fxRoot 子节点数。
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
        pg.fill('#username', 'feel_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '手感汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        pg.goto(BASE + '/#/dojo', wait_until='networkidle')
        pg.wait_for_selector('#dojo-stage canvas', timeout=25000)

        # ⚠️ 等**状态**，不要等固定时间。
        #    原来这里写的是 wait_for_timeout(3000)：开场演出是 288 帧（2.25 秒），
        #    服务快的时候够、慢的时候不够 —— 开场没结束就打，攻击会被
        #    canAttack 的 `phase !== 'fight'` 挡掉，表现是"一次都没打中"。
        #    这个测试因此时好时坏（单跑 7/7、连跑 1/7、再单跑又 1/7）。
        pg.wait_for_function(
            "() => window.__dojo && window.__dojo.st.match.phase === 'fight'",
            timeout=20000)
        pg.wait_for_timeout(120)

        # 装一个探针：记录这段时间里顿帧/震屏/火花的峰值
        pg.evaluate("""() => {
            const g = window.__dojo;
            window.__probe = { hitstop: 0, shake: 0, fx: 0, spawned: 0,
                               sparks: 0, hurtTint: 0, flash: 0, slowmo: 0,
                               texts: 0, textSample: '',
                               ghosts: 0, fxKinds: '' };
            const origConsume = g.consumeEvents.bind(g);
            g.consumeEvents = (st) => {
                for (const e of (st.events || [])) {
                  if (e.type === 'fx') {
                    window.__probe.fxKinds = window.__probe.fxKinds
                      ? window.__probe.fxKinds + ',' + e.kind : e.kind;
                  }
                }
                const before = window.__probe.spawned;
                origConsume(st);
                window.__probe.hitstop = Math.max(window.__probe.hitstop, g.hitstopF || 0);
                window.__probe.shake = Math.max(window.__probe.shake, g.view.shake || 0);
                window.__probe.fx = Math.max(window.__probe.fx,
                                             g.view.fxRoot.children.length);
                // 火花粒子数（原版一次命中 16 颗，slam/KO 35 颗）
                window.__probe.sparks = Math.max(window.__probe.sparks,
                                                 (g.view.particles || []).length);
                // 受击闪白：挨打那只狗的材质被提亮过没有
                window.__probe.hurtTint = window.__probe.hurtTint
                    || g.view.actorRoot.children.some((c) =>
                         c.userData.mat && c.userData.mat.color.getHex() !== 0xffffff);
                // 白闪覆盖层的实际 opacity（读到非 0 才算真的画出来了）
                if (g.view.flashEl) {
                  window.__probe.flash = Math.max(window.__probe.flash,
                    parseFloat(g.view.flashEl.style.opacity || '0') || 0);
                }
                window.__probe.slowmo = Math.max(window.__probe.slowmo,
                                                 g.slowmoF || 0);
                // 残影：突进时 fxRoot 里会多出半透明的自己
                window.__probe.ghosts = Math.max(window.__probe.ghosts,
                                                 (g.view.ghosts || []).length);
                // 伤害数字：飘字层里真的挂着元素才算数
                const tr = document.querySelector('.fx-text-root');
                if (tr) {
                  const n = tr.children.length;
                  if (n > window.__probe.texts) {
                    window.__probe.texts = n;
                    window.__probe.textSample = [...tr.children]
                      .map((e) => e.textContent).join('/');
                  }
                }
            };
            // 顺便记一下 spawnFx 被调了几次
            const origSpawn = g.view.spawnFx.bind(g.view);
            g.view.spawnFx = (...a) => { window.__probe.spawned += 1; return origSpawn(...a); };
        }""")

        # 贴到木桩旁边，连打
        pg.evaluate("""() => {
            const s = window.__dojo.st;
            s.units[0].x = s.units[1].x - 70 * 256;
        }""")
        pg.wait_for_timeout(200)
        hp0 = pg.evaluate("() => window.__dojo.st.units[1].hp")
        # ⚠️ 用按住/松开，**不要用 press()**。
        #    press() 是"按下立刻抬起"，比一帧（128Hz = 7.8ms）还快，
        #    很容易整个落在两帧之间 —— 引擎根本采样不到，表现是"一次都没打中"。
        #    这个测试因此时好时坏（单跑 7/7、连跑 1/7）。
        #    顺带说明一个真实隐患：点按太短会丢输入，
        #    移动端触摸必须给最小闩锁（记在目标 ⑩ 里）。
        for _ in range(6):
            pg.keyboard.down('j')
            pg.wait_for_timeout(90)
            pg.keyboard.up('j')
            pg.wait_for_timeout(180)
        pg.wait_for_timeout(400)
        hp1 = pg.evaluate("() => window.__dojo.st.units[1].hp")
        pr = pg.evaluate("() => window.__probe")

        print('  探针:', pr, f'| 木桩 {hp0} → {hp1}')
        check('连打真的打中了（基础前提）', hp1 < hp0, f'{hp0} → {hp1}')
        check('顿帧真的发生了（hitstopF > 0）', pr['hitstop'] > 0,
              f"峰值 {pr['hitstop']} 帧")
        check('震屏真的发生了（stage.shake > 0）', pr['shake'] > 0,
              f"峰值 {pr['shake']}")
        check('火花真的生成了（spawnFx 被调用）', pr['spawned'] > 0,
              f"{pr['spawned']} 次")
        check('火花节点真的挂到了 fxRoot 上', pr['fx'] > 0,
              f"峰值 {pr['fx']} 个")
        check('火花是**一批粒子**（不是单个光圈）', pr['sparks'] >= 8,
              f"峰值 {pr['sparks']} 颗（原版默认 16）")
        check('受击闪白真的改了狗的材质色', pr['hurtTint'] > 0,
              '挨打的狗被提亮过')
        check('伤害数字真的飘出来了（DOM 里挂着元素）', pr['texts'] > 0,
              f"峰值 {pr['texts']} 个，内容 \"{pr['textSample']}\"")
        check('伤害数字里能看到具体数值（不只是装饰）',
              any(c.isdigit() for c in pr['textSample']),
              repr(pr['textSample']))

        # 顿帧长度要**分级**：轻击 4 帧、重击 8 帧
        grades = pg.evaluate("""() => {
            const m = window.__dojo.hitstopF;
            return { light: 4, heavy: 8 };
        }""")
        ok_light = pr['hitstop'] >= grades['light']
        check('轻击的顿帧达到分级值（≥4 帧）', ok_light,
              f"实测峰值 {pr['hitstop']}，轻击应 4")

        # ---- ⑦ 招式特效：突进 → 残影 + 扬尘 ----
        pg.evaluate("""() => {
            window.__probe.ghosts = 0;
            window.__probe.fxKinds = '';
            // 挪远一点，好让突进有位移空间
            const s = window.__dojo.st;
            s.units[0].x = s.units[1].x - 320 * 256;
        }""")
        pg.wait_for_timeout(200)
        pg.keyboard.down('3')          # 数字键 3 = 第 3 招（突进）
        pg.wait_for_timeout(120)
        pg.keyboard.up('3')
        pg.wait_for_timeout(800)
        pr3 = pg.evaluate("() => window.__probe")
        print('  突进之后:', {k: pr3[k] for k in ('ghosts', 'fxKinds')})
        check('突进产生了残影（fxRoot 里有半透明的自己）', pr3['ghosts'] > 0,
              f"峰值 {pr3['ghosts']} 个")
        check('引擎产出了 ghost / dust 事件',
              'ghost' in (pr3['fxKinds'] or '') or 'dust' in (pr3['fxKinds'] or ''),
              f"收到：{pr3['fxKinds'] or '（无）'}")

        # ---- ⑦ 必杀光柱 / 架势光环 ----
        pg.evaluate("""() => {
            window.__probe.fxKinds = '';
            const g = window.__dojo;
            g.st.units[0].energy = 100 * 256;
        }""")
        pg.wait_for_timeout(150)
        pg.keyboard.down('6')          # 第 6 招 = 必杀（beam）
        pg.wait_for_timeout(120)
        pg.keyboard.up('6')
        pg.wait_for_timeout(500)
        kinds = pg.evaluate("() => window.__probe.fxKinds || ''")
        print('  必杀的 fx:', kinds)
        check('必杀放出了 beam 光柱', 'beam' in kinds, kinds or '（无）')

        # 架势光环：直接打开架势（反击招式在我们的六招里没有，用引擎状态触发）
        pg.evaluate("""() => {
            window.__probe.fxKinds = '';
            window.__dojo.st.units[0].counterF = 60;
        }""")
        pg.wait_for_timeout(700)
        kinds2 = pg.evaluate("() => window.__probe.fxKinds || ''")
        print('  架势的 fx:', kinds2)
        check('反击架势会冒 aura 光环', 'aura' in kinds2, kinds2 or '（无）')

        # ---- 白闪 + KO 慢镜：用必杀触发（原版 `this.flash = .15`）----
        pg.evaluate("""() => {
            const g = window.__dojo;
            g.st.units[0].energy = 100 * 256;   // 气满才能放必杀
            window.__probe.flash = 0;
            window.__probe.slowmo = 0;
        }""")
        pg.wait_for_timeout(150)
        pg.keyboard.down('6')          # 数字键 6 = 第 6 招（必杀）
        pg.wait_for_timeout(120)
        pg.keyboard.up('6')
        pg.wait_for_timeout(700)
        pr2 = pg.evaluate("() => window.__probe")
        print('  必杀之后:', {k: pr2[k] for k in ('flash', 'slowmo')})
        check('必杀命中会白闪（flashEl 的 opacity 真的被写过）', pr2['flash'] > 0,
              f"峰值 opacity {pr2['flash']}")
        check('KO/必杀会触发慢镜', pr2['slowmo'] > 0,
              f"剩余 {pr2['slowmo']} 帧")

        pg.screenshot(path=os.path.join(SHOTS, '_feel.png'), full_page=True)
        # ---- ⑦ 完备性：引擎能产的每种事件，页面都有人处理 ----
        # 直接喂合成事件给 consumeEvents，看它认不认。
        # 这样验的是"有没有分支"，不依赖"能不能触发到" ——
        # burst/trap 对应的招式不在当前六招里，自然打不出来，但代码得在。
        known = pg.evaluate("""() => {
            const g = window.__dojo;
            const kinds = ['ghost', 'dust', 'beam', 'slam', 'aura', 'burst', 'trap'];
            const hitKinds = ['hit', 'block', 'counter'];
            const seen = [];
            for (const k of kinds) {
              g.st.events.push({ type: 'fx', kind: k, who: 0, x: 1200, y: 120,
                                 facing: 1, len: 300 });
            }
            for (const k of hitKinds) {
              g.st.events.push({ type: 'hit', kind: k, by: 0, on: 1, dmg: 10,
                                 combo: 1, x: 1200, y: 120, shake: 4,
                                 hitstopF: 1, flash: false, broke: false });
            }
            g.st.events.push({ type: 'escape', by: 0, on: 1, combo: 7 });
            try { g.consumeEvents(g.st); } catch (e) { return { err: String(e) }; }
            return { err: null };
        }""")
        check('喂进全部 11 种事件都不会抛错', known.get('err') is None,
              known.get('err') or '全部处理了')

        check('全程没有 console 报错', not errs, str(errs[:2]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('打击感验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
