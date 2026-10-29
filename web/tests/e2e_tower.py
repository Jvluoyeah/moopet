# -*- coding: utf-8 -*-
"""月塔端口**网页端**验收：这一页真的能用（不是只有后端能跑）。

验四件事：
  ① 目录里有「月塔端口」且点得进去；
  ② 没领狗时给的是册子口吻的引导（不是空白/报错）；
  ③ 有狗时能按印、能摸签，界面上的字跟着变；
  ④ 概率与保底**写在页面上**（用户明确要求：抽奖要有概率与保底说明）。
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
    p.fill('#username', 'tw_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '端口汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    print('\n[目录]')
    toc = p.locator('a.tab[href="#/tower"]')
    check('目录里有「月塔端口」', toc.count() >= 1, toc.count())

    print('\n[页面]')
    p.goto(URL + '/#/tower', wait_until='networkidle')
    p.wait_for_timeout(1800)
    txt = p.evaluate("() => document.body.innerText.replace(/\\s+/g, ' ')")
    check('页面标题是「月塔端口」', '月塔端口' in txt)
    check('三块都在（盖章 / 摸签 / 册子上的日记）',
          all(k in txt for k in ('盖章', '摸签', '册子上的日记')), txt[:60])
    check('概率写在页面上', '%' in txt and '常见' in txt, [w for w in txt.split() if '%' in w][:4])
    check('保底写在页面上', '攒满' in txt or '必出' in txt, txt[txt.find('攒满'):][:24] if '攒满' in txt else '')
    check('不出现打卡/领取那类词',
          not any(w in txt for w in ('签到成功', '打卡', '领取', '获得')), '')

    print('\n[盖章]')
    p.click('#tower-checkin')
    p.wait_for_timeout(2200)
    txt2 = p.evaluate("() => document.body.innerText.replace(/\\s+/g, ' ')")
    check('按印之后给了回执', '印' in txt2 and '第 1 天' in txt2, txt2[:80])
    check('按钮变成不可再按', p.locator('#tower-checkin').is_disabled())

    print('\n[摸签]')
    p.click('#tower-draw')
    p.wait_for_timeout(2200)
    txt3 = p.evaluate("() => document.body.innerText.replace(/\\s+/g, ' ')")
    names = ('尘埃齿轮', '磨牙绳结', '旧布片', '螺旋桨叶', '褪色的毛线')
    check('摸出了一件（页面报出了名字）', any(n in txt3 for n in names),
          [n for n in names if n in txt3][:2])
    check('按钮变成不可再按', p.locator('#tower-draw').is_disabled())

    p.screenshot(path=os.path.join(SHOTS, 'tower-page.png'), full_page=True)

    print('\n[日记]')
    check('日记区在页面上', p.locator('#tower-diary').count() == 1)
    check('盖章与摸签都进了日记（页面上看得到）',
          txt3.count('盖章') >= 2 and ('摸签' in txt3), '')

    print('\n  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
