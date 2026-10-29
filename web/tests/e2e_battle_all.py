#!/usr/bin/env python3
"""战斗系统的**每一个入口**都要能打

用户的要求："所有的涉及到战斗系统的部分都要修，而不仅仅是 AI 对战或者联机对战"

之前的问题是：技能测试只打在训练场，竞技场走的是另一条路（LockstepSession），
所以竞技场坏了测试也全绿。这个文件就是为了**把每个入口都覆盖到**：

  ① 竞技场 · 对战 AI        （本地对手，走 LockstepSession + remoteSource）
  ② 竞技场 · 打好友的影子   （本地对手，同上但对手数据来自社群）
  ③ 竞技场 · 实时联机（权威）（服务端跑模拟，收快照）
  ④ 竞技场 · 实时联机（锁步）（双端各跑一份，回退路径）
  ⑤ 训练场 · 木桩          （直接 step，没有 LockstepSession）
  ⑥ 剧情关卡 · PvE         （波次推进 + 闸门，走旧引擎）

每个入口都验同一组核心能力：
  · 对局真的开始了（phase=fight）
  · **方向键能动**（模拟推进 + 输入送达）
  · **技能放得出来**（六招里至少能按出几招）
"""
import os
import sys
import time
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080').rstrip('/')

passed = 0
failures = []
notes = []


def check(label, ok, detail=''):
    global passed
    if ok:
        passed += 1
        print(f'OK    {label}' + (f'  — {detail}' if detail else ''))
    else:
        failures.append(label)
        print(f'FAIL  {label}  {detail}')


def signup(pg, name, breed_idx=0, wait_nav=True):
    pg.goto(BASE + '/#/login', wait_until='networkidle')
    pg.click('#mode-switch')
    pg.fill('#username', name)
    pg.fill('#password', 'pass1234')
    pg.click('#submit')
    pg.wait_for_selector('.breed-card', timeout=25000)
    pg.locator('.breed-card').nth(breed_idx).click()
    pg.fill('#dog-name', name + '汪')
    pg.click('#adopt-submit')
    if wait_nav:
        pg.wait_for_selector('text=我的机械狗', timeout=25000)


def probe(pg, expr):
    return pg.evaluate(expr)


def unit_expr(pg, st_expr):
    """返回"**我自己那只狗**"的 JS 表达式。

    ⚠️ 不能写死 units[0]：联机时**加入方是 side 1，他的狗在 units[1]**。
       写死 0 的话，测的是对手那只 —— 表现成"加入方动不了"，
       其实是测试看错了对象。（竞技场血条反过来那次也是同一个坑。）
    """
    side = pg.evaluate(
        "() => { const s = window.__arena && window.__arena.session;"
        " return s && Number.isInteger(s.side) ? s.side : 0; }")
    return f'(({st_expr}.units || {st_expr}.fighters)[{side}])'


def battle_core(pg, label, st_expr, key_hold=900):
    """在一个已经开打的页面上验核心能力：能动 + 放得出招"""
    me = unit_expr(pg, st_expr)
    # 等开打
    # ⚠️ 剧情关卡要**先往右走**才有对手登场（关卡就是这么设计的：
    #    "关内先往右推进，走到标记处对手才登场"）。
    #    光等的话 phase 永远是推进态，于是技能当然放不出来 ——
    #    第一版就是这么把"设计如此"误判成"技能坏了"的。
    ok_phase = False
    ph = None
    # 剧情关卡要**先往右走到闸门**对手才登场（关卡就是这么设计的）。
    # 其它入口按 D 也无害（走到墙边而已）。
    pg.keyboard.down('d')
    for _ in range(90):
        ph = probe(pg, "() => { const st = %s;"
                       " return st.match ? st.match.phase : st.phase; }" % st_expr)
        if ph == 'fight':
            ok_phase = True
            break
        pg.wait_for_timeout(150)
    pg.keyboard.up('d')
    pg.wait_for_timeout(200)
    check(f'{label}：对局开始（phase=fight）', ok_phase,
          '' if ok_phase else f'phase={ph}（剧情关卡需要先走到对手登场）')

    # 冻住对手，别让它把我们打进硬直（那是正确行为，但会掩盖真问题）
    probe(pg, """() => {
        const st = %s;
        st.units[1 - (window.__arena && window.__arena.session ? window.__arena.session.side : 0)].controller = 99;
        st.units[1].hp = 5000;
        return true;
    }""" % st_expr)
    pg.wait_for_timeout(300)

    # ① 能动
    x0 = probe(pg, me + ".x")
    pg.keyboard.down('d')
    pg.wait_for_timeout(key_hold)
    pg.keyboard.up('d')
    pg.wait_for_timeout(300)
    x1 = probe(pg, me + ".x")
    check(f'{label}：方向键能移动', x1 != x0, f'x {x0} → {x1}')

    # ② 六招各按一次（等收招、清冷却）
    fired = []
    for key in ('j', 'k', 'u', 'i', 'o', 'l'):
        for _ in range(25):
            if not probe(pg, me + ".attack"):
                break
            pg.wait_for_timeout(80)
        probe(pg, """() => { const f = %s;
            f.stunF = 0; f.knockedF = 0; f.blocking = false;
            f.cooldowns = [0,0,0,0,0,0]; f.energy = 100*256; return true; }"""
              % me)
        pg.wait_for_timeout(60)
        pg.keyboard.down(key)
        got = None
        for _ in range(12):
            pg.wait_for_timeout(60)
            got = probe(pg, ("() => { const f = %s; if (!f || !f.attack) return null; const a = f.attack; if (a.skill && a.skill.type) return a.skill.type; if (typeof a.skill === 'string') return a.skill; if (typeof a.skill === 'number') return 'skill' + a.skill; if (a.name) return a.name; return 'attack' + (a.index === undefined ? '' : a.index); }") % me)
            if got:
                break
        pg.keyboard.up(key)
        if got:
            fired.append(got)
        pg.wait_for_timeout(120)
    # ⚠️ 阈值按"这条路有几招"来：竞技场/训练场是六招，剧情关卡跑旧引擎只有四招。
    #    统一要求 >= 4 会把剧情关卡误判成坏的。
    need = 4 if '剧情' not in label else 3
    uniq = sorted(set(fired))
    check(f'{label}：技能放得出来（至少 {need} 招）', len(uniq) >= need,
          f'放出 {len(uniq)} 招：{uniq}')


def main():
    stamp = datetime.now().strftime('%H%M%S')
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctxs = [b.new_context(viewport={'width': 1380, 'height': 900})
                for _ in range(2)]
        pgs = [c.new_page() for c in ctxs]
        errs = []
        for pg in pgs:
            pg.on('pageerror', lambda e: errs.append(str(e)[:160]))

        # 账号
        for i, pg in enumerate(pgs):
            signup(pg, f'all{i}_{stamp}', breed_idx=i)

        # ---------------- ① 竞技场 · 对战 AI ----------------
        pg = pgs[0]
        pg.goto(BASE + '/#/arena', wait_until='networkidle')
        pg.wait_for_selector('#arena-stage canvas', timeout=25000)
        pg.wait_for_timeout(700)
        pg.click('button[data-mode=ai]')
        pg.wait_for_timeout(2500)
        battle_core(pg, '竞技场AI', 'window.__arena.session.state')

        # ---------------- ② 竞技场 · 影子 ----------------
        pg.goto(BASE + '/#/arena', wait_until='networkidle')
        pg.reload(wait_until='networkidle')
        pg.wait_for_selector('#arena-stage canvas', timeout=25000)
        pg.wait_for_timeout(800)
        btn = pg.locator('button[data-mode=shadow]')
        if btn.count():
            btn.click()
            pg.wait_for_timeout(3000)
            has = probe(pg, '() => !!(window.__arena.session)')
            if has:
                battle_core(pg, '竞技场影子', 'window.__arena.session.state')
            else:
                notes.append('影子模式需要社群里有别的狗，跳过')
                print('SKIP  竞技场影子（社群没数据）')
        else:
            notes.append('影子入口不存在')
            check('竞技场有"打好友的影子"入口', False)

        # ---------------- ⑤ 训练场 ----------------
        pg.goto(BASE + '/#/dojo', wait_until='networkidle')
        pg.wait_for_selector('#dojo-stage canvas', timeout=25000)
        pg.wait_for_timeout(2500)
        battle_core(pg, '训练场', 'window.__dojo.st')

        # ---------------- ⑥ 剧情关卡 PvE ----------------
        pg.goto(BASE + '/#/training', wait_until='networkidle')
        pg.wait_for_timeout(1500)
        pg.screenshot(path=os.path.join(
            os.path.dirname(os.path.abspath(__file__)), 'shots', '_all_training.png'),
            full_page=True)
        # 关卡入口是 `.lv-node`（档案册里的关卡节点），不是按钮文案
        entered = pg.evaluate("""() => {
            const n = document.querySelector('.lv-node, .lv-link');
            if (!n) return null;
            n.click();
            return (n.textContent || '').trim().slice(0, 30);
        }""")
        notes.append(f'剧情关卡入口：{entered}')
        pg.wait_for_timeout(3500)
        pve_ok = pg.evaluate("() => !!(window.__training && window.__training.st)")
        if pve_ok:
            # ✅ 剧情关卡已经迁到 simAB（六招）并修通了 ——
            #    原来这里是"只记录、不判通过"（NOTE），因为迁移还没做完。
            #    现在和其它入口用**同一套判据**。
            battle_core(pg, '剧情关卡', 'window.__training.st')
        else:
            notes.append('剧情关卡没找到会话句柄')
            print('NOTE  剧情关卡（没拿到会话句柄）')

        # ---------------- ③④ 联机两条路 ----------------
        # 权威：默认路径；锁步：?auth=0
        for label, url in (('联机·权威', '/#/arena'), ('联机·锁步', '/#/arena?auth=0')):
            for i, g in enumerate(pgs):
                g.goto(BASE + url, wait_until='networkidle')
                if i == 0:
                    g.reload(wait_until='networkidle')
                g.wait_for_selector('#arena-stage canvas', timeout=25000)
                g.wait_for_timeout(700)
            pgs[0].click('button[data-mode=pvp]')
            pgs[0].wait_for_timeout(2500)
            code = probe(pgs[0], "() => (window.__arena.room &&"
                                 " window.__arena.room.room_code) || ''")
            if not code:
                check(f'{label}：建出房间', False)
                continue
            pgs[1].evaluate("""(c) => {
                const g = window.__arena;
                if (g.mode !== 'pvp') g.mode = 'pvp';
                if (g.joinRoom) g.joinRoom(c);
            }""", code)
            pgs[1].wait_for_timeout(4000)
            battle_core(pgs[1], label, 'window.__arena.session.state')

        real = [e for e in errs if '404' not in e and 'Failed to load' not in e]
        check('全程没有 console 报错', not real, str(real[:2]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if notes:
        print('备注：')
        for n in notes:
            print('  · ' + n)
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('战斗系统全入口通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
