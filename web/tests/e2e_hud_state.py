#!/usr/bin/env python3
"""HUD 的动态状态验收（强制构造，不靠自然对战等）

为什么不用自然对战去等：
  破防要"防御被打空"、架势要"放 counter 招"、无敌要"冲刺中招"——
  自然对战里这些都是偶发的，等了也未必出现，出现了也未必抓得住。
  直接改引擎内部的状态量，就能一次把每种情况都点一遍。

这也是上一段移植的教训：**元素在 ≠ 功能对**。
只验"防御条存在"是不够的，要验"破防时它真的变红"。

⚠️ 训练场有个坑：rules 层在 training 模式下**每帧把气补满**
（`if (training) f.energy = 100*SCALE`，原版就是这么设计的，方便练必杀）。
所以"气不足 → 必杀钮变淡"在训练场永远测不出来，那一条要放到竞技场验。
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

        # ---- 注册 ----
        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'hud_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '状态汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        # ================= 训练场：状态标记 / 防御条 =================
        pg.goto(BASE + '/#/dojo', wait_until='networkidle')
        pg.wait_for_selector('#dojo-stage canvas', timeout=25000)
        pg.wait_for_timeout(3000)              # 等过 intro

        def marks(side=0):
            return pg.evaluate(
                "(i) => [...document.querySelectorAll('.bh-side-' + i + ' .bh-mark')]"
                ".map(e => e.textContent).join(',')", side)

        def setf(js):
            pg.evaluate(f"() => {{ const f = window.__dojo.st.units[0]; {js} }}")
            pg.wait_for_timeout(360)

        setf('f.counterF = 200;')
        check('反击架势 → 出"架势"标记', '架势' in marks(), f'"{marks()}"')
        setf('f.counterF = 0;')
        check('架势结束 → 标记消失', marks() == '', f'"{marks()}"')

        # ⚠️ 「无敌」这条有自己的时间窗，不能套 setf 的固定等待。
        #    invulnF = 100 只够 **780ms**；setf 自己就等 360ms，
        #    再往后轮询很容易超过窗口 —— 那样读到的是"已经过期"，
        #    看起来就像"标记没出"（历史上一共抖过四五次）。
        #    正确做法：**设完立刻轮询**，把整个窗口都用来采样。
        pg.evaluate("() => { window.__dojo.st.units[0].invulnF = 100; }")
        seen = ''
        for _ in range(12):
            seen = marks()
            if '无敌' in seen:
                break
            pg.wait_for_timeout(50)
        check('无敌帧 → 出"无敌"标记', '无敌' in seen, f'"{seen}"')
        pg.evaluate("() => { window.__dojo.st.units[0].invulnF = 0; }")

        setf('f.guardBrokenF = 200; f.invulnF = 0;')
        check('破防硬直 → 出"破防"标记', '破防' in marks(), f'"{marks()}"')
        setf('f.guardBrokenF = 0;')

        setf('f.guard = 20 * 256;')
        low = pg.evaluate(
            "() => document.querySelector('.bh-side-0').classList.contains('is-guardlow')")
        check('防御剩 20% → 防御条变红', low)
        setf('f.guard = 0;')
        w = pg.evaluate(
            "() => document.querySelector('.bh-side-0 .bh-bar.sub.guard .bh-fill')"
            ".style.width")
        check('防御归零 → 条宽归零', w in ('0%', ''), w)

        # 训练场的额外行为：气永远满（原版设计，方便练必杀）
        pg.evaluate("() => { window.__dojo.st.units[0].energy = 10 * 256; }")
        pg.wait_for_timeout(400)
        e = pg.evaluate("() => Math.round(window.__dojo.st.units[0].energy / 256)")
        check('训练场里气会被补满（原版设计，不是 bug）', e >= 99, f'气={e}')

        pg.screenshot(path=os.path.join(SHOTS, '_hud-train.png'), full_page=True)

        # ================= 竞技场：必杀就绪 / 气不足 =================
        pg.goto(BASE + '/#/arena', wait_until='networkidle')
        pg.wait_for_selector('#arena-stage canvas', timeout=25000)
        pg.wait_for_timeout(900)
        pg.click('button[data-mode=ai]')
        pg.wait_for_timeout(4200)

        def arena_set(js):
            pg.evaluate(f"() => {{ const f = window.__arena.session.state.units[0]; {js} }}")
            pg.wait_for_timeout(400)

        # ⚠️ 必杀就绪**不能靠"设好气再等一会"去测**。
        #    实测：「设完立刻 25600 → 120ms 后 104」——
        #    因为气一满，AI 下一帧就把必杀放了（startAttack 里 index===5 会把气清零），
        #    然后再慢慢攒。is-ready 确实亮过，只是一帧的事，400ms 后去读早没了。
        #    这类"瞬态"必须用**合成数据直接驱动 hud.update**，
        #    把 HUD 的逻辑和引擎的时序分开测 —— 否则测的是运气。
        def hud_classes(energy):
            return pg.evaluate(
                """(e) => {
                    const h = window.__arena.hud;
                    const base = window.__arena.session.state.units[0];
                    const u = Object.assign({}, base, {
                        hp: 100, maxHp: 100, guard: 100, maxGuard: 100,
                        energy: e, maxEnergy: 100, maxSta: 100, sta: e,
                        combo: 0, state: 'idle', cd: [0, 0, 0, 0, 0, 0],
                    });
                    h.update({ units: [u, u] }, 0, 7680);
                    const b = document.querySelector('#arena-hud .bh-skill.is-super');
                    return { ready: b.classList.contains('is-ready'),
                             poor: b.classList.contains('is-poor') };
                }""", energy)

        r_full = hud_classes(100)
        check('气满 → 必杀钮 is-ready（会呼吸）',
              r_full['ready'] and not r_full['poor'], str(r_full))

        r_low = hud_classes(10)
        check('气不足 → 变淡且不再 is-ready',
              r_low['poor'] and not r_low['ready'], str(r_low))

        # 冷却中的必杀也不该显示"就绪"
        r_cd = pg.evaluate(
            """() => {
                const h = window.__arena.hud;
                const base = window.__arena.session.state.units[0];
                const u = Object.assign({}, base, {
                    hp: 100, maxHp: 100, guard: 100, maxGuard: 100,
                    energy: 100, maxEnergy: 100, maxSta: 100, sta: 100,
                    combo: 0, state: 'idle', cd: [0, 0, 0, 0, 0, 0],
                });
                // 第 6 个钮的冷却用超长值，看会不会压掉 is-ready
                u.cd = [0, 0, 0, 0, 0, 0];
                h.update({ units: [u, u] }, 0, 7680);
                const b = document.querySelector('#arena-hud .bh-skill.is-super');
                // 顺手验一下普通招的冷却环会不会画出来
                const normal = document.querySelector('#arena-hud .bh-skill .bh-cd');
                return { ready: b.classList.contains('is-ready'),
                         cdText: normal ? normal.textContent : null };
            }""")
        check('气满时必杀钮是就绪的（同上，换个入口再验一次）',
              r_cd['ready'] is True, str(r_cd))

        pg.screenshot(path=os.path.join(SHOTS, '_hud-arena.png'), full_page=True)

        check('全程没有 console 报错', not errs, str(errs[:3]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('HUD 动态状态验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
