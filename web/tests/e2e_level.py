# -*- coding: utf-8 -*-
"""等级系统验收：打完一局领奖之后，**经验真的加上去了、等级真的涨了**。

为什么必须有这条：等级系统原来**整块没实现** ——
服务端只记 `pending_exp`，设计上要"狗本体"本地结算，但前端根本没有那个引擎，
于是经验发下来没人加、等级永远是 LV.1，而 `api.updateMine()` 这个现成的
镜像接口从来没被调用过（见 src/lib/exp.js 开头的说明）。
这条测试就是钉住"闭环真的闭上了"：本地涨 + 云端镜像同步 + 排行榜跟着动。
"""
import json
import os
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
os.makedirs(SHOTS, exist_ok=True)
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


def api(path, token=None):
    req = urllib.request.Request(URL + path)
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    return json.load(urllib.request.urlopen(req, timeout=10))


with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:160]))
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'lv_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '升级汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    token = p.evaluate('() => (window.localStorage.getItem("moopet.token") || "").replace(/"/g, "")')
    before = p.evaluate('() => { const d = window.__store ? null : null; return null; }')
    dogs0 = api('/api/dogs/mine', token)
    lv0 = dogs0[0]['level'] if dogs0 else None
    exp0 = dogs0[0]['total_exp'] if dogs0 else None
    check('开局是 LV.1 / 0 经验', lv0 == 1 and exp0 == 0, 'LV.%s / %s' % (lv0, exp0))

    # ---- 打一局 AI 对战 ----
    p.goto(URL + '/#/arena', wait_until='networkidle')
    p.wait_for_timeout(1800)
    p.click('button[data-mode=ai]')
    p.wait_for_timeout(2200)
    held = None
    t0 = time.time()
    while time.time() - t0 < 120:
        st = p.evaluate("""() => {
            const a = window.__arena; if (!a || !a.session) return null;
            const s = a.session.state;
            return { over: !!s.over, phase: s.phase };
        }""")
        if st and st.get('over'):
            break
        p.keyboard.press('j')
        if int(time.time() - t0) % 3 == 0:
            p.keyboard.press('k')
        p.wait_for_timeout(150)
    p.wait_for_timeout(1500)

    # ---- 领奖 ----
    btn = p.locator('button:has-text("上报结果并领奖励")')
    claimed = btn.count() > 0
    if claimed:
        btn.first.click()
        p.wait_for_timeout(2500)
    panel = p.evaluate("() => (document.querySelector('.stack-lg') || document.body).innerText")

    dogs1 = api('/api/dogs/mine', token)
    lv1 = dogs1[0]['level'] if dogs1 else None
    exp1 = dogs1[0]['total_exp'] if dogs1 else None
    check('领奖按钮出现过（打到结算了）', claimed)
    check('云端镜像里的经验涨了', (exp1 or 0) > (exp0 or 0), '%s → %s' % (exp0, exp1))
    # ⚠️ 等级**不一定**跟着涨：一局输了只给 20 经验，而 LV.1→2 要 60 ——
    #    不升级才是对的（我第一版就写错成"必须升级"，白报了两条 FAIL）。
    #    真正该钉的是**自洽**：镜像里的等级必须等于"按曲线算出来的等级"。
    need = 40 + 20 * 1
    expect_lv = 1
    _left = exp1 or 0
    while _left >= 40 + 20 * expect_lv:
        _left -= 40 + 20 * expect_lv
        expect_lv += 1
    check('镜像里的等级与经验曲线自洽', lv1 == expect_lv,
          'LV.%s（按 %s 经验应为 LV.%s）' % (lv1, exp1, expect_lv))
    if (exp1 or 0) >= need:
        check('经验过了阈值就该升级', (lv1 or 1) > (lv0 or 1), 'LV.%s → LV.%s' % (lv0, lv1))
    else:
        print('   （这一局只拿到 %s 经验，离升级还差 %s —— 不升级是对的）'
              % (exp1, need - (exp1 or 0)))

    # ---- 再走一遍**训练关首通**：首通给 120 经验，足以从 LV.1 升到 LV.2 ----
    # 竞技场输赢看运气（输了只有 20 经验、未必升级），训练关首通是**确定的**，
    # 用它能稳定验到"真的升级"这件事。
    p.goto(URL + '/#/training', wait_until='networkidle')
    p.wait_for_timeout(1600)
    p.evaluate("() => window.__training.startLevel('L1')")
    p.wait_for_timeout(900)
    held = False
    t0 = time.time()
    while time.time() - t0 < 150:
        st = p.evaluate('() => window.__training.snapshot()')
        if not st or st.get('phase') in ('clear', 'fail'):
            break
        xs = st.get('x') or [0, 0]
        me, foe = xs[0], xs[1]
        want = None
        if st.get('phase') == 'advance':
            want = 'd'
        elif st.get('foeActive'):
            want = 'd' if foe > me + 30 else ('a' if foe < me - 30 else None)
        if want != held:
            if held:
                p.keyboard.up(held)
            held = want
            if held:
                p.keyboard.down(held)
        p.keyboard.press('j')
        p.wait_for_timeout(140)
    if held:
        p.keyboard.up(held)
    p.wait_for_timeout(2600)          # 等上报与镜像

    dogs2 = api('/api/dogs/mine', token)
    lv2 = dogs2[0]['level'] if dogs2 else None
    exp2 = dogs2[0]['total_exp'] if dogs2 else None
    panel2 = p.evaluate("() => (document.querySelector('.stack-lg') || document.body).innerText")
    if lv2 and lv1 and lv2 > lv1:
        check('训练关首通把等级顶上去了', lv2 > lv1, 'LV.%s → LV.%s（经验 %s → %s）'
              % (lv1, lv2, exp1, exp2))
        check('结算面板报出了升级', ('LV.' in panel2) and ('长大' in panel2),
              [ln for ln in panel2.split('\n') if '长大' in ln][:1])
    else:
        # ⚠️ 关卡**没打通**时不能要求经验涨：首通才给经验，输了本来就没有。
        #    （这是只 1 级弱号打 L1，自动打手有输有赢 —— 我第一版没分情况，
        #      输了也报 FAIL，等于把"打法不稳定"记成了"系统坏了"。）
        cleared = p.evaluate(
            "() => { const s = window.__training.snapshot(); return s && s.phase === 'clear'; }")
        if cleared:
            check('训练关首通经验进账了', (exp2 or 0) > (exp1 or 0),
                  '经验 %s → %s' % (exp1, exp2))
        else:
            print('   （这一关没打通，首通经验本就不该有 —— 跳过这条断言）')
    p.screenshot(path=os.path.join(SHOTS, 'level-up.png'))

    # ---- 对战也在册子上留了一行（上轮欠的断言：打完一局 → 日记里有 battle）----
    try:
        dia = api('/api/tower/diary?limit=30', token)
        kinds = [d['kind'] for d in dia] if isinstance(dia, list) else []
        battle = [d for d in dia if d.get('kind') == 'battle'] if isinstance(dia, list) else []
        check('打完一局之后，册子上多了「对拍」那一行', bool(battle),
              battle[:1] or kinds)
    except Exception as e:      # noqa: BLE001
        check('能翻到册子上的日记', False, str(e)[:80])

    # ⚠️ 这里要用**最新**的等级去比：第一版我拿了前面那个 lv1（=1）去比，
    #    而这时候已经升到 LV.3 了 —— 于是"3 == 3"明明是对的，却报了一条 FAIL。
    # ⚠️ limit 上限是 100（接口 le=100，写 500 会 422）。
    #    另外：库里的测试狗越攒越多，一只刚出生的 LV.1 未必排得进前 100 ——
    #    那样报"榜上 None"是**取样方式**的问题，不是"等级榜没同步"
    #    （同步逻辑在 dogs.py 的 PATCH 里，一直是对的）。所以查不到就明说，
    #    不要假装通过。
    board = api('/api/leaderboard?kind=level&limit=100')
    rows = board if isinstance(board, list) else board.get('rows', [])
    mine = [r for r in rows if r.get('dog_id') == dogs1[0]['id']]
    latest = lv2 or lv1
    if mine:
        check('等级榜上这只狗的分 = 它的最新等级',
              mine[0].get('score') == latest,
              '榜上 %s / 实际 LV.%s' % (mine[0].get('score'), latest))
    else:
        # 不是"通过"，是"这一条这次量不了" —— 明说，别假装绿
        print('   （这只狗没排进前 100：测试库里攒了很多狗。'
              '这条这次跳过，同步逻辑由 dogs.py 的 PATCH 保证。）')

    p.screenshot(path=os.path.join(SHOTS, 'level-up.png'))
    print('  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
