# -*- coding: utf-8 -*-
"""月塔端口的两条底线：失败不卡住 / 减少动效时仍然可用。

为什么单独测这两条：
  ① 目标里写着"抽签与盖章要有进行中/已完成/失败三态的明确反馈，按钮防连点，
     **失败不得卡住页面**" —— 失败分支我只写了代码，从没实测过（要制造失败，
     正常跑是没有的）。这里用 Playwright 拦掉请求来造。
  ② `prefers-reduced-motion: reduce` 时动画必须全关 —— 这是无障碍底线，
     同样只写了 CSS 没验过（而且关掉之后功能一点不能受影响）。

⚠️ 造失败用 page.route 把 /api/tower/* 直接 abort —— 这是**真的网络失败**，
   不是 mock 一个假返回值，所以能验到 catch 分支里真实的恢复行为。
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


def signup(p):
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'tf_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '失败汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)


with sync_playwright() as pw:
    br = pw.chromium.launch()

    # ---------------- ① 失败不卡住 ----------------
    print('\n[网络失败时不能卡住]')
    p = br.new_page(viewport={'width': 1280, 'height': 950})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    signup(p)
    p.goto(URL + '/#/tower', wait_until='networkidle')
    p.wait_for_timeout(1500)

    # 把所有 tower 写接口掐断（读接口留着，页面本身要能正常打开）
    p.route('**/api/tower/draw', lambda r: r.abort())
    p.route('**/api/tower/checkin', lambda r: r.abort())

    p.click('#tower-draw')
    p.wait_for_timeout(1500)
    txt = p.evaluate("() => document.body.innerText.replace(/\\s+/g, ' ')")
    check('抽签失败给了提示（不是静默不动）', '月塔没接上' in txt, txt[txt.find('月塔没接上'):][:20])
    check('抽签失败后按钮**重新可点**（没卡死）', not p.locator('#tower-draw').is_disabled())
    check('失败后没有留下半截演出', p.locator('#tower-draw-stage').count() == 0)

    p.click('#tower-checkin')
    p.wait_for_timeout(1500)
    txt2 = p.evaluate("() => document.body.innerText.replace(/\\s+/g, ' ')")
    check('盖章失败也给了提示', '月塔没接上' in txt2, txt2[txt2.find('月塔没接上'):][:20])
    check('盖章失败后按钮**重新可点**', not p.locator('#tower-checkin').is_disabled())
    check('失败之后页面还能继续用（按钮仍在 DOM 里）',
          p.locator('#tower-checkin').count() == 1 and p.locator('#tower-draw').count() == 1)
    p.screenshot(path=os.path.join(SHOTS, 'tower-fail.png'))
    check('全程没有页面报错', not errs, errs[:2])
    p.close()

    # ---------------- ② 减少动效 ----------------
    print('\n[prefers-reduced-motion: reduce 时]')
    ctx = br.new_context(viewport={'width': 1280, 'height': 950}, reduced_motion='reduce')
    p2 = ctx.new_page()
    errs2 = []
    p2.on('pageerror', lambda e: errs2.append(str(e)[:200]))
    signup(p2)
    p2.goto(URL + '/#/tower', wait_until='networkidle')
    p2.wait_for_timeout(1500)

    st = p2.evaluate("""() => {
        const el = document.querySelector('#tower-draw');
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { transition: cs.transitionDuration };
    }""")
    check('页面能正常打开', bool(st), st)

    # 关键：动画虽然被关掉，功能必须一点不受影响 —— 摸签照样出结果
    p2.click('#tower-draw')
    p2.wait_for_selector('#tower-prize', timeout=8000)
    names = ('尘埃齿轮', '磨牙绳结', '旧布片', '螺旋桨叶', '褪色的毛线')
    txt3 = p2.evaluate("() => (document.querySelector('#tower-prize') || {}).innerText || ''")
    check('关掉动效后抽签照样出结果', any(n in txt3 for n in names), txt3[:30])
    dur = p2.evaluate("""() => {
        const el = document.querySelector('.diary-row') || document.querySelector('#tower-prize');
        return el ? getComputedStyle(el).animationDuration : '(没有动画元素)';
    }""")
    check('动画时长被压到瞬时（.01ms 档）',
          dur in ('0.00001s', '1e-05s', '(没有动画元素)'), dur)

    p2.click('#tower-checkin')
    p2.wait_for_timeout(1500)
    txt4 = p2.evaluate("() => document.body.innerText.replace(/\\s+/g, ' ')")
    check('关掉动效后盖章照样生效', '按' in txt4 and '月塔没接上' not in txt4, txt4[:30])
    check('全程没有页面报错', not errs2, errs2[:2])
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
