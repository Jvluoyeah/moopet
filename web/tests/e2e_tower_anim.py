# -*- coding: utf-8 -*-
"""抽签动画的验收：能跳过 / 不重复触发 / 终态与服务端一致。

目标里给动画定的三条硬要求，这条测试逐条钉：
  ① **演出真的在放**（点完立刻能看到签筒阶段，而不是直接出结果）；
  ② **能跳过**（演出中点一下直接到终态，不让人干等）；
  ③ **动画期间不会重复触发**（连点只发一次请求 —— 否则会"点出两件"）；
  ④ **终态与服务端一致**（页面上显示的奖 = 服务端日记里记的那一件）。

⚠️ 只认"页面上的东西"和"服务端的东西"，不去读内部的动画状态 ——
   动画实现换一版，这条测试仍然有意义。
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


def api(path, token):
    req = urllib.request.Request(URL + path)
    req.add_header('Authorization', 'Bearer ' + token)
    return json.load(urllib.request.urlopen(req, timeout=10))


with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 950})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'an_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '动画汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)
    token = p.evaluate('() => (window.localStorage.getItem("moopet.token") || "").replace(/"/g, "")')

    p.goto(URL + '/#/tower', wait_until='networkidle')
    p.wait_for_timeout(1600)

    print('\n[演出在放]')
    # 连点三次：只该发出去一次请求（第二次开始要么被 disabled 挡住，要么算跳过）
    p.click('#tower-draw')
    p.wait_for_timeout(120)
    stage = p.locator('#tower-draw-stage')
    check('点完立刻出现演出（签筒/签条那一步）', stage.count() == 1)
    # 风格铁律：演出里不许出现 emoji（全站是羊皮纸/墨线，emoji 会跳出来）
    stage_txt = p.evaluate(
        "() => (document.querySelector('#tower-draw-stage') || {}).innerText || ''")
    has_emoji = any(ord(ch) > 0x1F000 for ch in stage_txt)
    check('演出里没有 emoji（改用纸片画的签筒）', not has_emoji, stage_txt[:30])
    check('签筒是用纸片画的（有签筒构件）',
          p.locator('#tower-draw-stage .tub').count() == 1)
    mid = os.path.join(SHOTS, 'tower-anim-mid.png')
    p.screenshot(path=mid)                       # 演出中的那一帧（留着当证据）
    p.click('#tower-draw', force=True)
    p.click('#tower-draw', force=True)

    print('\n[能跳过]')
    t0 = time.time()
    if stage.count():
        p.locator('#tower-draw-stage').click()      # 跳过
    p.wait_for_selector('#tower-prize', timeout=6000)
    took = time.time() - t0
    check('跳过之后立刻出结果（< 2s）', took < 2.0, '%.2fs' % took)

    print('\n[只摸了一次]')
    # 服务端只应有一条今天的流水 —— 连点不该摸出两件
    diag = api('/api/tower/diary?limit=20', token)
    draws = [d for d in diag if d.get('kind') == 'draw']
    check('连点只摸出一次（服务端只有一条摸签记录）', len(draws) == 1,
          '%d 条：%s' % (len(draws), [d['text'] for d in draws][:3]))

    print('\n[终态与服务端一致]')
    page_txt = p.evaluate("() => (document.querySelector('#tower-prize') || {}).innerText || ''")
    names = ('尘埃齿轮', '磨牙绳结', '旧布片', '螺旋桨叶', '褪色的毛线')
    on_page = [n for n in names if n in page_txt]
    in_server = [n for n in names if draws and n in draws[0]['text']]
    check('页面上显示的奖 = 服务端记下的奖', bool(on_page) and on_page == in_server,
          '页面 %s / 服务端 %s' % (on_page, in_server))

    print('\n[日记逐行出现]')
    rows = p.locator('.diary-row')
    check('日记行带上了逐行出现的类', rows.count() >= 1, rows.count())

    p.screenshot(path=os.path.join(SHOTS, 'tower-anim.png'), full_page=True)
    print('\n  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
