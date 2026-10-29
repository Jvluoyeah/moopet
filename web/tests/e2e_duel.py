# -*- coding: utf-8 -*-
"""同问（好友对战）的浏览器验收 —— 两个页面、两个账号，真打一局。

为什么非要开**两个浏览器上下文**：这次的需求本身就是"两个人"的事，
一个页面里点来点去验不了下面这几条：

  ① 房间码：A 开房拿到码，B 拿码进来，两边坐成 side 0 / 1；
  ② **两边拿到的是同一道题**（页面上显示的文字要一模一样）；
  ③ **谁先答对，这一回合归谁** —— A 抢答，B 不动，A 拿分；
  ④ 提示：冷却没到按钮是锁着的，到点才解锁，点了才展开
     （A 是边牧 95 → 4.7 秒；B 是柴犬 70 → 5.9 秒，两边不一样长）；
  ⑤ 打完之后两边的结算：A 那边"你赢了"，B 那边"它赢了"。

外加问询页的难度基准：五档都在、写着真实题量、切换之后出的题跟着变。

⚠️ 测试要"抢答"就必须知道正确答案 —— 服务端**不会**把答案发给页面
   （那正是防作弊的设计），所以这里像玩家一样从题库里查：拿页面上显示的题干
   去 data/questions*.json 里对，再点对应的选项。

用法：cd w6/web && python tests/e2e_duel.py [http://127.0.0.1:8080]
"""
import io
import json
import os
import re
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


def bank_by_text():
    """题干 → 正确答案下标。页面上的题干是唯一的键。"""
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data')
    out = {}
    dup = set()
    for name in sorted(os.listdir(d)):
        if name.startswith('questions') and name.endswith('.json'):
            with io.open(os.path.join(d, name), encoding='utf-8') as f:
                for q in json.load(f).get('questions', []):
                    key = ''.join(q['q'].split())
                    if key in out and out[key] != q['answer']:
                        dup.add(key)
                    out[key] = q['answer']
    for k in dup:
        out.pop(k, None)
    return out


BANK = bank_by_text()


def login_adopt(br, tag, breed='边境牧羊犬'):
    """开一个新上下文：注册 → 选品种 → 领养。返回 (ctx, page)。
    ⚠️ 上下文从 **browser** 出（`br.new_context()`），不是从 `pw.chromium` 出 ——
       两个页面必须是两个上下文，各自有各自的登录凭证，才是"两个人"。"""
    ctx = br.new_context(viewport={'width': 1280, 'height': 950})
    p = ctx.new_page()
    p.on('pageerror', lambda e: ERRS.append('%s: %s' % (tag, str(e)[:160])))
    s = time.strftime('%H%M%S') + tag
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'du_%s' % s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    card = p.locator('.breed-card').filter(has_text=breed)
    (card.first if card.count() else p.locator('.breed-card').first).click()
    p.fill('#dog-name', '同问汪' + tag)
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)
    return ctx, p


def qtext_of(page):
    return ''.join(page.inner_text('#duel-question .hand').split())


def answer_on(page, idx):
    """按题干从题库里查出答案再点 —— 页面自己不给答案（防作弊）。"""
    t = qtext_of(page)
    if t not in BANK:
        return None
    right = BANK[t]
    page.click('#duel-opt-%d' % right)
    return right


ERRS = []

with sync_playwright() as pw:
    br = pw.chromium.launch()

    print('\n[问询页：难度基准]')
    ctxA, A = login_adopt(br, 'A')
    A.goto(URL + '/#/quiz', wait_until='networkidle')
    A.wait_for_selector('#quiz-ask', timeout=25000)
    check('问询页上有模式切换', A.locator('#quiz-modes').count() == 1)
    check('能切到同问（抢答）', A.locator('#mode-duel[href="#/duel"]').count() == 1)
    chips = A.locator('#quiz-baselines .base-chip')
    check('五档都在', chips.count() == 5, chips.count())
    counts = {c.get_attribute('id'): c.inner_text().replace('\n', ' ')
              for c in chips.all()}
    check('启蒙档写着 53 题（和题库对得上）', '53' in counts.get('quiz-base-primary', ''),
          counts.get('quiz-base-primary'))
    check('杂问档写着 31 题（常识 13 + 专门 18）', '31' in counts.get('quiz-base-mixed', ''),
          counts.get('quiz-base-mixed'))
    check('"随它"档写着 210 题（全部）', '210' in counts.get('quiz-base-auto', ''),
          counts.get('quiz-base-auto'))
    check('当前档位写在旁边', '现在是' in A.inner_text('#quiz-base-now'),
          A.inner_text('#quiz-base-now'))

    # ★ 换档 → 出的题跟着换。换档之后**刷新页面**再看徽章：
    #   直接看一次可能撞上同一档的旧题，多刷几次才说明问题。
    A.click('#quiz-base-primary')
    A.wait_for_timeout(1500)
    check('点了启蒙 → 当前档位跟着变', '启蒙' in A.inner_text('#quiz-base-now'),
          A.inner_text('#quiz-base-now'))
    check('并且写着这一档是给谁的', len(A.inner_text('#quiz-base-who')) > 2,
          A.inner_text('#quiz-base-who'))
    badges = set()
    for _ in range(4):
        A.reload(wait_until='networkidle')
        A.wait_for_selector('#quiz-ask', timeout=20000)
        badges.add(A.inner_text('#quiz-ask .badge').strip())
    check('定了启蒙档，问出来的**全是启蒙那一档**', badges == {'启蒙'}, badges)
    A.click('#quiz-base-senior')
    A.wait_for_timeout(1500)
    badges2 = set()
    for _ in range(3):
        A.reload(wait_until='networkidle')
        A.wait_for_selector('#quiz-ask', timeout=20000)
        badges2.add(A.inner_text('#quiz-ask .badge').strip())
    check('换成深水档 → 问的全是深水那一档', badges2 == {'深水'}, badges2)
    A.screenshot(path=os.path.join(SHOTS, 'quiz-baseline.png'), full_page=True)

    print('\n[同问：选择那一屏]')
    A.goto(URL + '/#/duel', wait_until='networkidle')
    A.wait_for_selector('#duel-lobby', timeout=25000)
    check('有"找一只模拟体"那一栏', A.locator('#duel-npcs .npc-card').count() >= 3,
          A.locator('#duel-npcs .npc-card').count())
    check('每一只都写着智力与提示时间',
          '智力' in A.inner_text('#duel-npcs') and '提示' in A.inner_text('#duel-npcs'),
          A.inner_text('#duel-npcs .npc-card').replace('\n', ' '))
    check('写着**我的**提示解锁时间（智力 95 → 4.7 秒）',
          '4.7 秒' in A.inner_text('#duel-lobby'), A.inner_text('#duel-lobby')[:120])
    check('有开房等好友的入口', A.locator('#duel-open-btn').count() == 1)
    check('有输房间码进来的入口',
          A.locator('#duel-join-input').count() == 1 and A.locator('#duel-join-btn').count() == 1)
    check('有战绩那一块', A.locator('#duel-record').count() == 1)
    A.screenshot(path=os.path.join(SHOTS, 'duel-lobby.png'), full_page=True)

    print('\n[同问：两个页面真打一局]')
    ctxB, B = login_adopt(br, 'B', breed='柴犬')
    A.click('#duel-open-btn')
    A.wait_for_selector('#duel-room-code', timeout=15000)
    code = A.inner_text('#duel-room-code').strip()
    check('A 开好房，拿到 5 位房间码', len(code) == 5 and code.isalnum(), code)
    A.wait_for_function(
        "() => (document.querySelector('#duel-status') || {}).innerText "
        "&& document.querySelector('#duel-status').innerText.includes('念给对面')",
        timeout=15000)
    check('房间里写着"把这串码念给对面"', '念给对面' in A.inner_text('#duel-status'),
          A.inner_text('#duel-status'))

    B.goto(URL + '/#/duel', wait_until='networkidle')
    B.wait_for_selector('#duel-join-input', timeout=25000)
    B.fill('#duel-join-input', code)
    B.click('#duel-join-btn')
    # ⚠️ 必须确认 B **真的进房了**：进房失败时它会静静留在选择那一屏上，
    #    然后 A 那边一直等不到题（我第一版就是这么卡的 —— 服务端把
    #    "开房的人连上 WS"当成了"已经开局"，于是 B 拿码进来被拒 409）。
    B.wait_for_selector('#duel-match', timeout=15000)
    check('B 进房成功（不是留在选择那一屏上打转）',
          B.locator('#duel-lobby').count() == 0, B.inner_text('#duel-status'))
    # 两边都该拿到第一回合的题
    A.wait_for_selector('#duel-opt-0', timeout=25000)
    B.wait_for_selector('#duel-opt-0', timeout=25000)
    check('B 拿码进来之后，两边同时拿到题', True)
    check('**两边是同一道题**', qtext_of(A) == qtext_of(B),
          '%s | %s' % (qtext_of(A)[:24], qtext_of(B)[:24]))
    check('两边的选项也一样',
          [A.inner_text('#duel-opt-%d' % i) for i in range(4)]
          == [B.inner_text('#duel-opt-%d' % i) for i in range(4)])
    check('比分牌上两边都在（A 是 0，B 是 0）',
          A.inner_text('#duel-my-score') == '0' and A.inner_text('#duel-foe-score') == '0',
          '%s / %s' % (A.inner_text('#duel-my-score'), A.inner_text('#duel-foe-score')))
    # ⚠️ 不写死"5.9 秒"：5850ms 显示成 5.8 还是 5.9 取决于 toFixed 的舍入方向
    #    （5.85 在二进制里是 5.8499…，toFixed(1) 给 5.8）。这里按**数值**比，
    #    而且要把两块牌子上的数都收到 —— 只 search 第一个会取到我自己的 4.7 秒。
    board = A.inner_text('.duel-board')
    vals = [float(x) for x in re.findall(r'提示 (\d+\.\d) 秒', board)]
    check('两边狗的智力与提示时间都摆出来了（边牧 95→4.7s / 柴犬 70→5.85s）',
          '智力 70' in board and '智力 95' in board
          and any(abs(v - 4.725) <= 0.06 for v in vals)
          and any(abs(v - 5.85) <= 0.06 for v in vals),
          '%s | %s' % (vals, board.replace('\n', ' ')))

    print('\n[提示：冷却没到不给，到点才解锁]')
    check('刚开局提示按钮是锁着的', A.locator('#duel-hint-btn').is_disabled())
    early = A.evaluate("() => document.querySelector('#duel-hint').classList.contains('is-on')")
    check('提示没有自动展开', not early)
    A.wait_for_timeout(5300)          # 边牧 95 → 4.7 秒解锁
    check('等过冷却之后按钮解锁了', not A.locator('#duel-hint-btn').is_disabled())
    still = A.evaluate("() => document.querySelector('#duel-hint').classList.contains('is-on')")
    check('解锁了也不自动展开（要自己点）', not still)
    A.click('#duel-hint-btn')
    A.wait_for_timeout(600)
    hint_txt = A.inner_text('#duel-hint')
    check('点了才展开提示，而且有内容', len(hint_txt.strip()) > 2, hint_txt[:30])

    print('\n[抢答：谁先答对归谁]')
    # 第 1 回合：A 抢答（上面等提示已经耗掉几秒），B 一直不动
    r = answer_on(A, 0)
    check('A 点中了正确答案（题干在题库里对得上）', r is not None, qtext_of(A)[:24])
    A.wait_for_selector('#duel-round-end', timeout=15000)
    check('第 1 回合归 A', '归你' in A.inner_text('#duel-round-end'),
          A.inner_text('#duel-round-end').replace('\n', ' ')[:60])
    check('回合结算里写了双方各自的用时',
          '答对了' in A.inner_text('#duel-round-end') and '秒' in A.inner_text('#duel-round-end'),
          A.inner_text('#duel-round-end').replace('\n', ' ')[:70])
    B.wait_for_selector('#duel-round-end', timeout=15000)
    check('B 那边看到的是"这一回合归对面"', '归对面' in B.inner_text('#duel-round-end'),
          B.inner_text('#duel-round-end').replace('\n', ' ')[:60])
    # ⚠️ B 一直没作答，所以它那栏必须是"**没赶上**"，不能画成"答错了 · 0.0 秒"
    #    （空对象在 JS 里是真值，这个坑我踩过一次）
    check('B 没作答 → 写"没赶上"，不是编一个"答错了 0.0 秒"出来',
          '没赶上' in B.inner_text('#duel-round-end'),
          B.inner_text('#duel-round-end').replace('\n', ' ')[:80])

    won = 1
    for i in range(1, 5):
        A.wait_for_selector('#duel-opt-0', timeout=20000)
        B.wait_for_selector('#duel-opt-0', timeout=20000)
        if i == 1:
            check('第 2 回合两边还是同一道题', qtext_of(A) == qtext_of(B))
            check('比分已经变成 1 : 0',
                  A.inner_text('#duel-my-score') == '1', A.inner_text('#duel-my-score'))
        if answer_on(A, i) is None:
            check('第 %d 回合的题干在题库里' % (i + 1), False, qtext_of(A)[:30])
            break
        A.wait_for_selector('#duel-round-end', timeout=15000)
        if '归你' in A.inner_text('#duel-round-end'):
            won += 1

    print('\n[打完之后两边的结算]')
    A.wait_for_selector('#duel-result', timeout=30000)
    B.wait_for_selector('#duel-result', timeout=30000)
    txtA, txtB = A.inner_text('#duel-result'), B.inner_text('#duel-result')
    check('A 那边写着"这一局你赢了"', '你赢了' in txtA, txtA.replace('\n', ' ')[:70])
    check('B 那边写着"这一局它赢了"', '它赢了' in txtB, txtB.replace('\n', ' ')[:70])
    check('比分是 5 : 0（A 每回合都抢到了）', '5 : 0' in txtA, txtA.replace('\n', ' ')[:40])
    check('结算里列了每个回合的过程', txtA.count('回合：') == 5, txtA.count('回合：'))
    check('答对记了经验', '点经验' in txtA or '经验' in txtA, txtA.replace('\n', ' ')[:120])
    A.screenshot(path=os.path.join(SHOTS, 'duel-result.png'), full_page=True)

    print('\n[经验真的接到养成的账上了吗]')
    # ⚠️ 这几条必须在**结算卡还在屏幕上**的时候查：点了"回到选择"之后
    #    #duel-result 就被拿掉了（我第一版写在后面，直接超时）。
    # 一局 200 多点经验，而 LV.1→2 只要 60（见 lib/exp.js），所以这一局必然升级 ——
    # 升级那一下必须**说出来**（训练/竞技场/问询三处都报，这里不能吞掉）。
    local_exp = A.evaluate("() => (window.__moopet.state().dog || {}).total_exp")
    srv_exp = A.evaluate(
        "async () => ((await window.__moopet.api.myDogs()) || [{}])[0].total_exp")
    check('本地结算的经验和服务端镜像**对得上**（两边的账不能各记各的）',
          local_exp is not None and int(local_exp) == int(srv_exp or 0),
          '本地 %s / 服务端 %s' % (local_exp, srv_exp))
    lv = A.evaluate("() => (window.__moopet.state().dog || {}).level")
    check('等级也确实长上去了（不是只加经验不改等级）', int(lv or 1) >= 2, lv)
    check('升级那一下有话说（和训练/竞技场/问询同一句）',
          A.locator('#duel-levelup').count() == 1
          and '长大了一点' in A.inner_text('#duel-levelup'),
          (A.inner_text('#duel-levelup') if A.locator('#duel-levelup').count()
           else '（页面上没有升级那一行）'))

    A.click('#duel-back')
    A.wait_for_selector('#duel-record', timeout=20000)
    rec = A.inner_text('#duel-record')
    check('回到选择那一屏，战绩里多了一胜', '1 胜' in rec, rec.replace('\n', ' ')[:80])

    print('\n[留给某只狗：不用念房间码那条路]')
    bid = B.evaluate("() => (window.__moopet.state().dog || {}).id")
    check('名册上有别的狗可以找', A.locator('#duel-friends .npc-card').count() >= 1,
          A.locator('#duel-friends .npc-card').count())
    chip = A.locator('#duel-friend-%d' % bid)
    check('刚登记的那只狗就在名册里', chip.count() == 1, 'dog_id=%s' % bid)
    chip.first.click()
    A.wait_for_selector('#duel-room-code', timeout=15000)
    check('点它就是开了一间留给它的房', A.locator('#duel-room-code').count() == 1,
          A.inner_text('#duel-status'))
    # B 回到选择那一屏：应该看到"有人在等你"
    B.goto(URL + '/#/', wait_until='networkidle')
    B.goto(URL + '/#/duel', wait_until='networkidle')
    B.wait_for_selector('#duel-invites', timeout=25000)
    check('B 那一屏看得到"有人在等你"', '等你' in B.inner_text('#duel-invites'),
          B.inner_text('#duel-invites').replace('\n', ' ')[:70])
    B.click('#duel-invites button')
    A.wait_for_selector('#duel-opt-0', timeout=25000)
    B.wait_for_selector('#duel-opt-0', timeout=25000)
    check('点一下就进房了，两边拿到同一道题', qtext_of(A) == qtext_of(B),
          '%s | %s' % (qtext_of(A)[:22], qtext_of(B)[:22]))

    print('\n  页面报错:', ERRS[:2] if ERRS else '无')
    check('两个页面都没有 JS 报错', not ERRS, ERRS[:2])
    ctxA.close()
    ctxB.close()
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败 %d 项: %s' % (len(FAILS), FAILS)))
sys.exit(1 if FAILS else 0)
