#!/usr/bin/env python3
"""回归用户报的四个问题（逐条对着现象验）

  ① 狗挨打后**不能永远红着**（hitFlashF 漏减）
  ② 按 K 不能放出 I 的招（键位和 HUD 标签必须一致）
  ③ U / O / L 必须按得出来
  ④ 往左走时朝向要翻（不能倒着走）
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
        pg.fill('#username', 'reg_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '回归汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        pg.goto(BASE + '/#/dojo', wait_until='networkidle')
        pg.wait_for_selector('#dojo-stage canvas', timeout=25000)
        pg.wait_for_function(
            "() => window.__dojo && window.__dojo.st.match.phase === 'fight'",
            timeout=20000)
        # 摆到木桩旁边
        pg.evaluate("() => { const s = window.__dojo.st;"
                    " s.units[0].x = s.units[1].x - 70 * 256; }")
        pg.wait_for_timeout(250)

        # ---------------- ②③ 键位和 HUD 标签一致 ----------------
        def waitIdle(ms=1400):
            # 等玩家收招。现在有**输入缓冲**（按下的招会排队，
            # 等前一个打完再放）——这是特性，不是 bug，
            # 但测试必须等收招，否则读到的是上一个招（会误报成"按键错位"）。
            pg.wait_for_function(
                "() => !window.__dojo.st.units[0].attack", timeout=ms)

        def fire(key, hold=90):
            waitIdle()
            pg.evaluate("() => { const f = window.__dojo.st.units[0];"
                        " f.cooldowns = [0,0,0,0,0,0]; f.energy = 100*256; }")
            pg.wait_for_timeout(60)
            pg.keyboard.down(key)
            pg.wait_for_timeout(hold)
            got = pg.evaluate(
                "() => { const f = window.__dojo.st.units[0];"
                " return f.attack ? f.attack.skill.type : null; }")
            pg.keyboard.up(key)
            return got

        # O 那一招从「飞弹」改成「治愈」了（用户要求；飞弹那条远程链路本来就不造成伤害）。
        # 这是**跟着设计变更走**，不是为了让测试变绿而放水：
        # 这条检查的本意是"**按钮标签不许骗人**"，所以下面再加一条
        # 把"钮上的字 = 实际放出来的招式"直接对上（标签变了期望值就要跟着变，
        # 而不是把这条删掉）。
        want = [('j', 'light'), ('k', 'heavy'), ('u', 'dash'),
                ('i', 'upper'), ('o', 'heal'), ('l', 'beam')]
        bad = []
        for key, expect in want:
            got = fire(key)
            if got != expect:
                bad.append(f'{key.upper()}→{got or "没放出来"}（应该 {expect}）')
        check('按 J/K/U/I/O/L 放的就是钮上标的那一招', not bad,
              '；'.join(bad) if bad else '六招全对')

        # ★ 钮上的字也必须跟着改：O 现在写「治愈」，整排不许再出现「飞弹」
        body = pg.evaluate('() => document.body.innerText')
        check('页面上出现「治愈」（钮/说明书都行）', '治愈' in body)
        check('页面上不再出现「飞弹」这个旧标签', '飞弹' not in body,
              [ln for ln in body.split('\n') if '飞弹' in ln][:1])

        # ---------------- ① 挨打后不会永远红着 ----------------
        # 同理：hitFlashF=12 只够 12 帧（94ms），等一下就读到 0 了。
        # 直接设长一点，并且**立刻**读。
        during = pg.evaluate("""() => {
            window.__dojo.st.units[0].hitFlashF = 40;
            return window.__dojo.st.units[0].hitFlashF;
        }""")
        pg.wait_for_timeout(60)
        tinted = pg.evaluate("""() => window.__dojo.view.actorRoot.children
            .some((c) => c.userData.mat && c.userData.mat.color.getHex() !== 0xffffff)""")
        pg.wait_for_timeout(600)
        after = pg.evaluate("() => window.__dojo.st.units[0].hitFlashF")
        clear = pg.evaluate("""() => window.__dojo.view.actorRoot.children
            .every((c) => !c.userData.mat || c.userData.mat.color.getHex() === 0xffffff)""")
        check('受击闪白期间狗会被提亮', tinted, f'hitFlashF {during} → {after}')
        check('闪白结束后**恢复原色**（不会永远红着）', clear and after == 0,
              f'hitFlashF={after}')

        # ---------------- ④ 朝向 ----------------
        pg.evaluate("() => { window.__dojo.st.units[0].facing = 1; }")
        pg.keyboard.down('a')
        pg.wait_for_timeout(400)
        pg.keyboard.up('a')
        faceL = pg.evaluate("() => window.__dojo.st.units[0].facing")
        pg.keyboard.down('d')
        pg.wait_for_timeout(400)
        pg.keyboard.up('d')
        faceR = pg.evaluate("() => window.__dojo.st.units[0].facing")
        check('往左走时朝向翻到 -1（不会倒着走）', faceL == -1, str(faceL))
        check('往右走时朝向翻回 +1', faceR == 1, str(faceR))

        # 立牌的 scale.x 也要跟着翻（贴图才会镜像）
        pg.keyboard.down('a')
        pg.wait_for_timeout(350)
        sx = pg.evaluate("() => window.__dojo.view.actorRoot.children[0].scale.x")
        pg.keyboard.up('a')
        check('立牌真的镜像了（scale.x 为负）', sx < 0, f'scale.x={sx}')

        # ---------------- ⑤ 多键同时按 ----------------
        # 用户报的原话："D和K,I一起按可能就触发不了"。
        # 根因有两个，都修了：
        #   1) 技能闩锁是**单槽**的，后按的覆盖先按的 → 改成队列
        #   2) ackSkill 拿 this.side 当数组下标，而 dojo 的 side 是个 DOM 节点
        #      → 确认起手后从不弹出队列 → 按键滞后一拍
        pg.evaluate("""() => {
            const g = window.__dojo;
            g._skillQueue = [];
            const f = g.st.units[0];
            f.attack = null; f.cooldowns = [0,0,0,0,0,0]; f.energy = 100*256;
            f.stunF = 0;
            window.__fired = new Set();
            if (!g.__probeOn) {
              g.__probeOn = true;
              const orig = g.consumeEvents.bind(g);
              g.consumeEvents = (st) => {
                const m = st.units[0];
                if (m && m.attack) window.__fired.add(m.attack.skill.type);
                orig(st);
              };
            }
        }""")
        pg.wait_for_timeout(200)
        # 按住 D（往右走），同时把 K 和 I 一起拍下去
        pg.keyboard.down('d')
        pg.keyboard.down('k')
        pg.keyboard.down('i')
        pg.wait_for_timeout(110)
        pg.keyboard.up('k')
        pg.keyboard.up('i')
        pg.wait_for_timeout(1800)          # 等两个招依次放完
        pg.keyboard.up('d')
        pg.wait_for_timeout(300)
        fired = pg.evaluate("() => [...window.__fired]")
        # ⚠️ 断言跟着缓冲窗口的语义走：
        #    缓冲 = 700ms 时"两个都放得出来"（第二个会等第一个收招）；
        #    缓冲 = 120ms 时只放先按的那个（第二个在第一个收招前就过期了）。
        #    700ms 被砍掉是因为它会"替玩家记账"—— 按键 0.7 秒后自己出招，
        #    玩家的感受是"我没按啊"（用户报的"不知道怎么按出来的"）。
        #
        #    现在的语义：**同时按多个技能键，至少有一个要放出来**（不能全丢）。
        #    这是格斗游戏的常规行为 —— 同时按两个钮不该变成"什么也没发生"。
        check('同时按 D + K + I → 至少放出一个招（不会全丢）',
              ('heavy' in fired) or ('upper' in fired), f'实际：{fired}')

        pg.screenshot(path=os.path.join(SHOTS, '_regress.png'), full_page=True)
        check('全程没有 console 报错', not errs, str(errs[:2]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('用户报的问题已修复 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
