# -*- coding: utf-8 -*-
"""月塔问询的网页端验收。

重点验三件**只有在浏览器里才看得出来**的事：
  ① 题目渲染出来了（题干 + 四个选项 + 剩余次数）；
  ② **提示会在倒计时结束后自动浮出来** —— 这是"智力 → 提示冷却"在界面上的落点，
     延迟由服务端按狗的智力给（用边牧，智力 95 → 4.8 秒，等 6 秒足够）；
  ③ 答完给解析、选项锁住不能重复点。

"答对给经验 / 答错不惩罚 / 一天上限"这三条属于服务端口径，
由 _refs/_quiz_api_test.py 逐条验（那边能直接看到 exp）。
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


with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 950})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'qz_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    # 用边牧：智力 95 → 提示冷却 4.8 秒（等 6 秒就能看到它浮出来）
    card = p.locator('.breed-card').filter(has_text='边境牧羊犬')
    (card.first if card.count() else p.locator('.breed-card').first).click()
    p.fill('#dog-name', '问询汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    print('\n[目录与入口]')
    toc = p.locator('a.tab[href="#/quiz"]')
    check('目录里有「月塔问询」', toc.count() >= 1, toc.count())

    print('\n[出题]')
    p.goto(URL + '/#/quiz', wait_until='networkidle')
    p.wait_for_timeout(1800)
    check('题目卡片渲染出来了', p.locator('#quiz-ask').count() == 1)
    n_opt = p.locator('.quiz-opt').count()
    check('四个选项都在', n_opt == 4, n_opt)
    txt = p.evaluate("() => document.body.innerText.replace(/\\s+/g, ' ')")
    check('显示了剩余次数', '今天的问询还剩' in txt, txt[txt.find('还剩'):][:16] if '还剩' in txt else '')
    check('有倒计时条与提示位', p.locator('#quiz-meter').count() == 1
          and p.locator('#quiz-hint').count() == 1)

    print('\n[提示：冷却到了才解锁（不自动弹）]')
    hint = p.locator('#quiz-hint')
    early = p.evaluate("() => document.querySelector('#quiz-hint').classList.contains('is-on')")
    check('刚进来时提示没展开', not early)
    check('提示按钮一开始是锁着的（得等冷却）',
          p.locator('#quiz-hint-btn').is_disabled())
    check('按钮文案提示"先想一想"',
          '想' in p.evaluate("() => document.querySelector('#quiz-hint-btn').innerText"))
    # 边牧（智力 95）→ 冷却 13.4 秒；等 16 秒足够（用户要求把冷却设长，所以这里要等得住）
    p.wait_for_timeout(16000)
    check('冷却走完后按钮解锁', not p.locator('#quiz-hint-btn').is_disabled())
    still_closed = p.evaluate(
        "() => document.querySelector('#quiz-hint').classList.contains('is-on')")
    check('**解锁了也不自动展开**（要自己点）', not still_closed)
    p.click('#quiz-hint-btn')
    p.wait_for_timeout(600)
    opened = p.evaluate(
        "() => document.querySelector('#quiz-hint').classList.contains('is-on')")
    check('点了才展开提示', opened)
    hint_txt = p.evaluate("() => (document.querySelector('#quiz-hint') || {}).innerText || ''")
    check('提示里有内容', len(hint_txt.strip()) > 2, hint_txt[:30])
    check('看过之后按钮再次锁上（不能反复点）',
          p.locator('#quiz-hint-btn').is_disabled())
    p.screenshot(path=os.path.join(SHOTS, 'quiz-hint.png'), full_page=True)

    print('\n[答题]')
    p.click('#quiz-opt-0')
    p.wait_for_timeout(2200)
    # ★ 用户报的 bug：答完之后**提示冷却还在跑**（进度条继续走）。
    #   这里在答题后再等一会儿，看进度条宽度有没有继续变化。
    w1 = p.evaluate("() => document.querySelector('#quiz-meter').style.width")
    p.wait_for_timeout(1500)
    w2 = p.evaluate("() => document.querySelector('#quiz-meter').style.width")
    check('答完题之后倒计时**停住**了（不再继续跑）', w1 == w2, '%s → %s' % (w1, w2))
    txt2 = p.evaluate("() => document.body.innerText.replace(/\\s+/g, ' ')")
    check('答完给了结果与解析', ('答上来了' in txt2) or ('这回没答上来' in txt2), txt2[:40])
    check('选项被锁住（不能重复点）',
          p.evaluate("() => [...document.querySelectorAll('.quiz-opt')].every((b) => b.disabled)"))
    check('标出了正确答案', p.locator('.quiz-opt.is-right').count() == 1)
    check('有下一题按钮', p.locator('button:has-text("下一题")').count() == 1
          or p.locator('button:has-text("今天的问询用完了")').count() == 1)
    # 答对时界面要报出经验（答错只提示"不扣什么"）—— 两种都合法，只查有反馈
    check('界面给出了经验/无惩罚的说明',
          ('点经验' in txt2) or ('不扣什么' in txt2) or ('不再记经验' in txt2),
          txt2[txt2.find('记下'):][:24] if '记下' in txt2 else txt2[-60:])

    print('\n[端口互通]')
    p.goto(URL + '/#/tower', wait_until='networkidle')
    p.wait_for_timeout(1400)
    check('月塔端口那一页能拐到问询（世界里那台终端就落在这里）',
          p.locator('a[href="#/quiz"]').count() >= 1)

    print('\n  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
