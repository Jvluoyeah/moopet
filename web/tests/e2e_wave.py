# -*- coding: utf-8 -*-
"""波次刷新的浏览器验收：不按右键也能推进 / 冷却示意可见 / Boss 不贴边。

为什么单独写一条：node 侧（tests/wave_spawn_test.mjs）验的是模拟里的数与位置，
但用户看到的是**界面**。这条在真浏览器里验三件只有界面才有的东西：
  ① **一次方向键都不按**，波数自己往前走（旧实现里必须一直往右走）；
  ② 冷却期间那条细线（`.bh-wave-fill`）**真的在长**，走完对手登场；
  ③ 对手（尤其 Boss）登场时**不在边缘** —— 用户原话"一刷新就卡在边缘"。
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
os.makedirs(SHOTS, exist_ok=True)
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


def snap(p):
    return p.evaluate('() => window.__training ? window.__training.snapshot() : null') or {}


def wavefill(p):
    return p.evaluate("""() => {
        const el = document.querySelector('.bh-wave-fill');
        if (!el) return null;
        return { w: el.style.width, on: !!document.querySelector('.bh-wave.has-gap') };
    }""")


with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'wv_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '波次汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    p.goto(URL + '/#/training', wait_until='networkidle')
    p.wait_for_timeout(1400)
    p.evaluate("() => window.__training.startLevel('L1')")
    p.wait_for_timeout(120)

    print('\n[冷却示意]')
    # 开局就是冷却段：细线应该在，而且宽度从小往大走
    f1 = wavefill(p)
    check('开局出现冷却示意（.bh-wave.has-gap）', bool(f1 and f1['on']), f1)
    p.wait_for_timeout(260)
    f2 = wavefill(p)
    check('细线在长（宽度变大）',
          bool(f1 and f2 and f1['w'] and f2['w'] and f2['w'] != f1['w']),
          '%s → %s' % (f1['w'] if f1 else '?', f2['w'] if f2 else '?'))
    txt = p.evaluate("() => (document.querySelector('#bh-wave') || {}).innerText || ''")
    check('文案不再写"往右走"（那是旧设计的指令）', '往右走' not in txt, txt[:30])
    check('文案说的是"下一波在路上了"', '下一波' in txt, txt[:30])
    p.screenshot(path=os.path.join(SHOTS, 'wave-gap.png'))

    print('\n[不按方向键也能推进]')
    moved = None
    start = snap(p)
    t0 = time.time()
    seen = {start.get('wave')}
    while time.time() - t0 < 90:
        st = snap(p)
        if st.get('phase') in ('clear', 'fail'):
            break
        seen.add(st.get('wave'))
        if len(seen) >= 2 and st.get('wave', 0) >= 1:
            break
        # ⚠️ 只按攻击键，**一次方向键都不按**（这是本条的核心）
        p.keyboard.press('j')
        p.wait_for_timeout(140)
    end = snap(p)
    moved = abs((end.get('x') or [0])[0] - (start.get('x') or [0])[0])
    check('一次方向键都不按，波数往前走了（第二波出现）',
          max(seen) >= 1, '见过的波次 %s，玩家位移 %.0f 格' % (sorted(seen), moved))

    print('\n[登场位置不贴边]')
    st = snap(p)
    xs = st.get('x') or [0, 0]
    stage_w = st.get('stageW') or 2000
    foe_x = xs[1] if len(xs) > 1 else 0
    check('对手在场地内、且离两端有距离（不贴边）',
          320 <= foe_x <= stage_w - 320, '对手 x=%.0f / 场地宽 %.0f' % (foe_x, stage_w))
    # 屏幕上也要看得见（不是在画外）。
    # ⚠️ 必须**等对手真的登场之后**再判 —— 上一版在这里采到的是推进段
    #    （对手还没激活，focus 只有玩家一个人），于是"双方都在画面里"
    #    是**空过的**：只有一个人，当然在画面里。等 foeActive 为真再量。
    for _ in range(60):
        st2 = p.evaluate("""() => {
            const v = window.__training.view;
            const f = v._focusIn || {};
            return { active: f.foeActive };
        }""")
        if st2 and st2.get('active'):
            break
        p.keyboard.press('j')
        p.wait_for_timeout(120)
    vis = p.evaluate("""() => {
        const v = window.__training.view;
        const f = v._focusIn || {};
        const w = v._viewW ? v._viewW() : 0;
        const half = w / 2;
        const camX = v._camX || 0;
        return {
            w: Math.round(w),
            foeActive: f.foeActive,
            sx: [f.meX, f.foeX].filter((q) => typeof q === 'number')
                .map((q) => Math.round(q - (camX - half))),
        };
    }""")
    check('对手已登场（这条才有意义）', vis['foeActive'] is True, vis['foeActive'])
    check('登场后双方都在画面里（0 ~ 可见宽）',
          len(vis['sx']) == 2 and all(-2 <= q <= vis['w'] + 2 for q in vis['sx']),
          '屏位 %s / 可见宽 %s' % (vis['sx'], vis['w']))
    p.screenshot(path=os.path.join(SHOTS, 'wave-second.png'))

    print('\n  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
