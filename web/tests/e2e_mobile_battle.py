# -*- coding: utf-8 -*-
"""竖屏对战验收：手机上必须**真的能打**（不只是按钮画出来）。

原来竖屏只显示"把手机横过来"，战斗界面被 CSS 藏掉 —— 手机用户根本打不了。
这个脚本开一局 AI 对战（竖屏），然后：
  ① 舞台 canvas 在不在、有没有高度（被藏掉时高度是 0）
  ② 点触控招式键，冷却有没有转（证明按钮真的接到了战斗逻辑）
  ③ 截一张竖屏对战的图
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
UA = ('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36')
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


os.makedirs(SHOTS, exist_ok=True)
with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': 412, 'height': 915}, has_touch=True,
                         is_mobile=True, user_agent=UA)
    p = ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:160]))
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'bt_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '竖屏汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    p.goto(URL + '/#/arena', wait_until='networkidle')
    p.wait_for_timeout(1800)
    # ⚠️ 提示是"元素在但不可见"，所以要看 **is_visible**，
    #    数元素个数会得到假的 FAIL（我第一版就是这么错的）。
    check('竖屏下没有"把手机横过来"挡着',
          not p.locator('text=把手机横过来').is_visible(),
          p.locator('text=把手机横过来').count())
    try:
        p.click('button[data-mode=ai]', timeout=6000)
    except Exception as e:
        check('能开局', False, str(e)[:60])
    p.wait_for_timeout(2600)

    size = p.evaluate("""() => {
        const c = document.querySelector('#arena-stage canvas') || document.querySelector('canvas');
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
    }""")
    check('舞台上真的有画面（高度 > 40px）',
          bool(size) and size['h'] > 40, size)

    # 点一招，看角色是不是真的出招了 —— 这是"按钮接到了战斗逻辑"最直接的证据。
    # 读法和 tests/e2e_arena_skills.py 一致：看 units[0].attack.skill.type。
    fired = None
    for i in range(20):
        p.locator('.tp-skill').first.click(force=True)
        p.wait_for_timeout(90)
        fired = p.evaluate("""() => {
            const s = window.__arena && window.__arena.session;
            if (!s) return null;
            const f = s.state.units[0];
            return f.attack ? f.attack.skill.type : null;
        }""")
        if fired:
            break
    check('点触控招式键 → 角色真的出招了', bool(fired), 'skill=%s' % fired)

    p.screenshot(path=os.path.join(SHOTS, 'm-battle.png'))
    # 移动端的招式标签来自 skillKeys（= HUD_SKILLS.map(k => k.name)），
    # 所以 O 从「飞弹」改成「治愈」之后，**触控按钮也该跟着变** ——
    # 用户特意提了"包括移动端"，那就把它钉住。
    body = p.evaluate("() => document.body.innerText")
    check('移动端按钮里出现「治愈」', '治愈' in body, body[-70:].replace('\n', ' '))
    check('移动端不再出现「飞弹」（那是改之前那一招）', '飞弹' not in body)
    print('  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
