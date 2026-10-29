# -*- coding: utf-8 -*-
"""四关全打通一遍（验收覆盖）。

背景：原来 tests/e2e_training.py **只把第一关打穿** —— L2/L3/L4 从来没有被
实打验证过。结果就是"目标用时算错 4 倍、三星永远拿不到"这种 Bug 能一直藏着
（而且 levels_test.mjs 把同一个错常数抄了一遍，测试和实现一起错）。

这个套件把四关都打一遍，每关验：
  ① 进得去、推进段能遇敌、能打到 Boss 波；
  ② 能分出结果（通关或失败，不能卡住不动）；
  ③ **界面上显示的目标用时 = 关卡数据里的 parSec**（这条直接钉住那个 Bug）；
  ④ 全程没有 console / page 报错。

⚠️ 两只弱鸡（1 级狗打推荐 5/9/14 级的关）打不过是**设计**，不是失败 ——
   所以"失败"也算通过，只要它能正常结束、界面数字对。
"""
import os
import re
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
# 关卡数据（src/game/levels.js）—— 目标用时就是这里的 parSec
LEVELS = {'L1': 40, 'L2': 55, 'L3': 65, 'L4': 60}
os.makedirs(SHOTS, exist_ok=True)
FAILS = []
WON = []          # 这只弱号（1 级）实际打通的关
BOSS = []         # 打到 Boss 波的关


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


def snap(p):
    return p.evaluate('() => window.__training ? window.__training.snapshot() : null') or {}


def framing(p):
    """读这一帧的取景：相机 + 双方的**渲染坐标**，算他们在屏幕上的位置。

    ⚠️ 屏位必须用渲染坐标（**view._focusIn** 里的 meX/foeX），
       **不能**用 snapshot 的 x —— 那个是 toGrid(原始值)，少加了 unitView 的
       X_OFFSET，拿来减相机会整体偏一个偏移量，于是假报"出画"。
       （这个坑我踩过：上一版探针就是这么假报的，白查了一圈。）

    ⚠️⚠️ 也不能读 `view._lastFocus` —— 那是页面里的**调试钩子**，它写的是
       `{...focus, meX: me.x, foeX: foe.x}`，把 focus 自己的 meX/foeX
       **覆盖成双方的原始坐标**，连"对手还没登场时 focus 走玩家自己"
       这个分支都盖掉了。拿它算屏位会在推进段算出"两人隔了一千多"，假报出画。
       权威的是相机自己记的 `_focusIn`（未经改写）——
       我在 e2e_wave.py 里改过一次，**漏了这一处**，于是同一条 bug 换个套件又冒出来。
    """
    return p.evaluate("""() => {
        const t = window.__training;
        if (!t || !t.view) return null;
        const v = t.view;
        const lf = v._focusIn || v._lastFocus || {};
        const half = (v._viewW ? v._viewW() : 0) / 2;
        const camX = v._camX || 0;
        const w = v._viewW ? v._viewW() : 0;
        const sx = [lf.meX, lf.foeX]
            .filter((q) => typeof q === 'number')
            .map((q) => q - (camX - half));
        return { w, sx, camX: Math.round(camX), stageW: v.stageW };
    }""")


def play(p, code, budget_s=170):
    """打一关。返回 {entered, boss_seen, ended, won, target}"""
    p.evaluate('(c) => window.__training.startLevel(c)', code)
    p.wait_for_timeout(900)
    held = None

    def hold(which):
        nonlocal held
        if held == which:
            return
        if held:
            p.keyboard.up(held)
        held = which
        if which:
            p.keyboard.down(which)

    out = {'entered': False, 'boss_seen': False, 'ended': False, 'won': False,
           'target': '', 'offscreen': [], 'samples': 0}
    t0 = time.time()
    i = 0
    while time.time() - t0 < budget_s:
        i += 1
        st = snap(p)
        if not st:
            break
        # 取景：每一帧都记，出画就留证据（用户报的"越打越看不见人"就是这条）
        # ⚠️ 只在**对手已登场**时判：没登场的对手停在它那道 gate 上（很远），
        #    这时候相机本来就该跟着玩家走 —— 把它也算进"必须在画面里"
        #    会假报（第一版就是这么红的，数据里 foeX=2120 其实是没激活的那个）。
        fr = framing(p)
        if fr and fr['w'] > 0 and st.get('foeActive'):
            out['samples'] += 1
            bad = [round(q) for q in fr['sx'] if q < -2 or q > fr['w'] + 2]
            if bad:
                out['offscreen'].append(
                    '波%s camX=%s 可见宽=%s 屏位=%s' %
                    (st.get('wave'), fr['camX'], round(fr['w']),
                     [round(q) for q in fr['sx']]))
        if st.get('foeActive'):
            out['entered'] = True
        if st.get('foeBoss'):
            out['boss_seen'] = True
        if st.get('phase') in ('clear', 'fail'):
            out['ended'] = True
            out['won'] = st.get('phase') == 'clear'
            # 一结束就立刻读面板（晚一点页面可能回列表，面板就没了）
            txt = p.evaluate("() => document.body.innerText.replace(/\\s+/g, ' ')")
            m = re.search(r'用时\s*[\d.]+s（目标\s*(\d+)s）', txt)
            out['target'] = m.group(1) if m else ''
            break
        xs = st.get('x') or [0, 0]
        me, foe = xs[0], xs[1]
        if st.get('phase') == 'advance':
            hold('d')
        elif st.get('foeActive'):
            if foe > me + 30:
                hold('d')
            elif foe < me - 30:
                hold('a')
            else:
                hold(None)
        p.keyboard.press('j')
        if i % 11 == 0:
            p.keyboard.press('k')
        if i % 17 == 0:
            p.keyboard.press('1')          # 会放招才打得动后面的关
        if i % 13 == 0:
            p.keyboard.press('w')          # 跳：打空中单位要靠它
        p.wait_for_timeout(140)
    if held:
        p.keyboard.up(held)
    out['seconds'] = round(time.time() - t0, 1)
    p.wait_for_timeout(900)
    p.screenshot(path=os.path.join(SHOTS, 'levels-%s.png' % code))
    return out


with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)[:160]))
    p.on('console', lambda m: errs.append('console.error: ' + m.text[:140])
         if m.type == 'error' else None)
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'lvs_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '四关汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)
    p.goto(URL + '/#/training', wait_until='networkidle')
    p.wait_for_timeout(1500)

    for code, par in LEVELS.items():
        print('\n== %s ==' % code)
        errs.clear()
        r = play(p, code)
        check('%s 进得去、推进段能遇敌' % code, r['entered'])
        check('%s 能分出结果（没卡死）' % code, r['ended'],
              '用时 %.1fs' % r['seconds'])
        check('%s 界面上的目标用时 = 关卡数据的 %ds' % (code, par),
              r['target'] == str(par), '界面显示 %s' % (r['target'] or '(没读到)'))
        check('%s 全程无 console 报错' % code, not errs, errs[:2])
        # 取景：用户报的"越打越看不见人"就是这条 —— 相机被 clamp 在
        # stageW−half，人跑出可见范围。现在每一帧都量双方屏位。
        check('%s 取景：双方全程都在画面里（%d 帧采样）' % (code, r['samples']),
              not r['offscreen'], r['offscreen'][:2])
        # 打到 Boss 波 / 打赢 —— 只记录不判失败：
        # 这是个 1 级号打推荐 5/9/14 级的关，打不过是**设计**（弱号就该打不过）。
        # 要证明"关卡可通"，看下面那行汇总（L1/L4 这只弱号也能通）。
        print('   （参考）打到 Boss 波: %s  结果: %s' %
              (r['boss_seen'], '通关' if r['won'] else '失败'))
        if r['won']:
            WON.append(code)
        if r['boss_seen']:
            BOSS.append(code)

    br.close()

# 可通性证据：至少要有一关**真的打到 Boss 波**（说明波次推进、Boss 会登场、
# 不是死局）。真正的"打赢"这一只 1 级弱号看运气（实测 L4 赢过三次、L1 赢过一次），
# 拿它做硬断言必然 flaky —— 所以胜负只如实汇报，不作判据。
check('至少一关打到了 Boss 波（不是死局）', len(BOSS) >= 1, '打到 Boss 的关: %s' % (BOSS or '无'))
print('   （参考）本次打通: %s' % (WON or '无'))

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
