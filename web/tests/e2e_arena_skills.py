#!/usr/bin/env python3
"""竞技场的六招（**这个覆盖缺口之前一直存在**）

⚠️ 为什么需要这个文件：
   原来验技能的两个套件（e2e_skill_cd、e2e_user_bugs 的"六招全对"）
   **全部打在训练场（dojo）**—— 那里是直接调 step。
   而竞技场走的是 `LockstepSession`（输入要过 pumpLocal/advance 两道），
   这条路**从来没被技能测试覆盖过**。
   用户就是在竞技场里发现"U/I/O/L 按不出来"的，而我的测试全绿。

所以这里专门打竞技场，而且**等到真的能出招再按**：
  硬直中 / 出招中 / 冷却没好的时候，`canAttack` 会（正确地）拒绝，
  那不是 bug —— 但会让测试误报。先等干净状态，再按。
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
        pg.fill('#username', 'ask_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '竞技汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)
        pg.goto(BASE + '/#/arena', wait_until='networkidle')
        pg.wait_for_selector('#arena-stage canvas', timeout=25000)
        pg.wait_for_timeout(700)
        pg.click('button[data-mode=ai]')
        pg.wait_for_timeout(3000)

        st = pg.evaluate("""() => {
            const g = window.__arena, s = g.session;
            return { mode: g.mode, 是外壳: !!(s && s.byAuthority),
                     相位: s.state.match.phase,
                     走的是锁步: typeof s.advance === 'function' };
        }""")
        check('竞技场里跑的是锁步会话（没被权威模式串到）',
              st['mode'] == 'ai' and st['是外壳'] is False, str(st))
        check('对局已经开始', st['相位'] == 'fight', str(st['相位']))

        # 把 AI 冻住：给它一个非 null 的 controller，stepAI 就跳过它。
        # 不冻的话它会一直打我们，硬直里 canAttack 为假 —— 那是**正确行为**，
        # 但会让"按键没反应"变成随机事件，测不出真问题。
        pg.evaluate("""() => {
            const s = window.__arena.session;
            s.state.units[1].controller = 99;
            s.state.units[1].hp = 1000;
            window.__arena.state = s.state;
        }""")
        pg.wait_for_timeout(400)

        def ready():
            """等到"确实能出招"的干净状态"""
            return pg.evaluate("""() => {
                const f = window.__arena.session.state.units[0];
                f.stunF = 0; f.knockedF = 0; f.blocking = false;
                f.cooldowns = [0,0,0,0,0,0];
                f.energy = 100 * 256;
                return { attack: !!f.attack, stun: f.stunF,
                         相位: window.__arena.session.state.match.phase };
            }""")

        # 逐招验：等收招 → 清状态 → 按 → 读
        # ⚠️ O 那一招从「飞弹」改成了「治愈」（用户要求；飞弹那条远程链路本来就
        #    不造成伤害，见 simAB.js 的注释）。所以期望值从 projectile 改成 heal ——
        #    这是**跟着设计变更走**，不是为了让测试变绿而放水：
        #    下面额外验了"这一招真的回了血、真的扣了气"。
        results = {}
        heal_info = {}
        for key, want in (('j', 'light'), ('k', 'heavy'), ('u', 'dash'),
                          ('i', 'upper'), ('o', 'heal'), ('l', 'beam')):
            pg.wait_for_function(
                "() => !window.__arena.session.state.units[0].attack",
                timeout=4000)
            ready()
            pg.wait_for_timeout(60)
            # ★ 轮到 O（治愈）之前先让玩家**掉一半血** ——
            #   不然满血时治愈加不上去（`clamp(hp+回血, 0, 上限)`），
            #   测出来"回血 0"，看着像功能坏了，其实是没地方可回。
            #   （满了就不该凭空超过上限，那是**对**的行为。）
            if key == 'o':
                pg.evaluate("""() => {
                    const f = window.__arena.session.state.units[0];
                    f.hp = Math.round(f.data.hp * 0.5);
                    f.energy = f.maxEnergy || 100 * 256;
                }""")
                pg.wait_for_timeout(80)
            pg.keyboard.down(key)
            # ⚠️ 要**轮询**，不能只读一次。
            #    出招可能比按键晚几帧（要等 pumpLocal 采到、advance 消费），
            #    单次采样会偶发读到"还没起手"→ 误报成"放不出来"
            #    （前面几轮在别的测试里反复踩过这个坑）。
            got = None
            before = None
            for _ in range(12):
                pg.wait_for_timeout(60)
                st = pg.evaluate("""() => {
                    const s = window.__arena.session;
                    const f = s.state.units[0];
                    return { type: f.attack ? f.attack.skill.type : null,
                             hp: f.hp, energy: f.energy };
                }""")
                if before is None:
                    before = st
                got = st['type']
                if got:
                    break
            pg.keyboard.up(key)
            pg.wait_for_timeout(700)
            results[key] = got
            # ★ O 这一招要验的不只是"放出来了"，还有**真的回血、真的扣气**
            if key == 'o':
                after = pg.evaluate("""() => {
                    const f = window.__arena.session.state.units[0];
                    return { hp: f.hp, energy: f.energy };
                }""")
                heal_info['hpUp'] = (after['hp'] - before['hp']) if before else 0
                heal_info['energyDown'] = (before['energy'] - after['energy']) if before else 0

        bad = [f'{k.upper()}→{results.get(k) or "没放不出来"}（应 {w}）'
               for k, w in (('j', 'light'), ('k', 'heavy'), ('u', 'dash'),
                            ('i', 'upper'), ('o', 'heal'), ('l', 'beam'))
               if results.get(k) != w]
        check('**竞技场里六招都放得出来**（这是之前没覆盖到的路）',
              not bad, '；'.join(bad) if bad else '六招全对')
        # ★ O 不只是"放出来了"，还要**真的回血 + 真的扣气**（用户要的治愈）
        check('O（治愈）真的回了血', heal_info.get('hpUp', 0) > 0,
              f"回血 {heal_info.get('hpUp')}（体力决定，上限 80）")
        check('O（治愈）真的扣了气', heal_info.get('energyDown', 0) > 0,
              f"耗气 {heal_info.get('energyDown')}" + '（敏捷决定，越高越省）')

        # ---------------- AI 活着的时候，玩家到底能不能动 ----------------
        # 用户报的是"一点都动不了"。上面的六招是**冻住 AI** 测的，
        # 只证明"链路通"；真正要验的是"对打中按得出招"。
        # 之前的难度是档位 2（每 0.12 秒出招、94% 命中）——
        # 玩家被连续打中、长期硬直，硬直里 canAttack **正确地**拒绝出招，
        # 于是体感就是"按什么都没反应"。那是难度问题，不是 bug。
        # ⚠️ 同一个 hash 再 goto **不会重载**，页面还停在上一局里，
        #    所以"对战 AI"那个按钮根本不在 DOM 上。必须硬刷。
        pg.goto(BASE + '/#/arena', wait_until='networkidle')
        pg.reload(wait_until='networkidle')
        pg.wait_for_selector('#arena-stage canvas', timeout=25000)
        pg.wait_for_timeout(800)
        pg.click('button[data-mode=ai]')
        pg.wait_for_timeout(2500)

        # 盯 8 秒：每帧记一次"我能不能出招"，并模拟玩家不停按键
        pg.evaluate("""() => {
            const s = window.__arena.session;
            window.__probe = { 可出招帧: 0, 总帧: 0, 硬直帧: 0, 冷却帧: 0,
                               出过的招: new Set(), 掉血: 0 };
            const f0 = s.state.units[0];
            window.__probe.起始血量 = f0.hp;
            const orig = s.engine.step;
            // 用 rAF 采样（step 可能被内部引用持着，拦不到就退化成采样）
            const tick = () => {
                const f = s.state.units[0];
                window.__probe.总帧 += 1;
                if (f.stunF > 0) window.__probe.硬直帧 += 1;
                else if (f.attack) window.__probe.冷却帧 += 1;
                else window.__probe.可出招帧 += 1;
                if (f.attack) window.__probe.出过的招.add(f.attack.skill.type);
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }""")

        # 玩家一直按技能键（就像真人那样）
        import time as _t
        t0 = _t.time()
        keys = ['j', 'k', 'u', 'i', 'o', 'l']
        idx = 0
        while _t.time() - t0 < 8:
            pg.keyboard.down(keys[idx % len(keys)])
            pg.wait_for_timeout(90)
            pg.keyboard.up(keys[idx % len(keys)])
            idx += 1
            pg.wait_for_timeout(120)

        pr = pg.evaluate("""() => {
            const p = window.__probe;
            return { 总帧: p.总帧, 可出招帧: p.可出招帧, 硬直帧: p.硬直帧,
                     出过的招: [...p.出过的招],
                     掉血: p.起始血量
                       - window.__arena.session.state.units[0].hp };
        }""")
        can = pr['可出招帧'] / max(1, pr['总帧'])
        stun = pr['硬直帧'] / max(1, pr['总帧'])
        print(f"  对打 8 秒：总采样 {pr['总帧']}，可出招 {pr['可出招帧']}"
              f"（{can:.0%}），硬直 {pr['硬直帧']}（{stun:.0%}）")
        print(f"  实际放出：{pr['出过的招']}   掉血：{pr['掉血']}")

        check('**AI 活着的时候玩家也能出招**（不是一直被硬直锁死）',
              len(pr['出过的招']) >= 2, f"实际放出 {pr['出过的招']}")
        check('被硬直锁住的时间是少数（< 60%）', stun < 0.6,
              f'{stun:.0%}')

        pg.screenshot(path=os.path.join(SHOTS, '_arena_skills.png'),
                      full_page=True)
        real = [e for e in errs if '404' not in e and 'Failed to load' not in e]
        check('全程没有 console 报错', not real, str(real[:2]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('竞技场六招通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
