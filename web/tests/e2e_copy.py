#!/usr/bin/env python3
"""文案审查：**渲染出来的页面上**不该出现开发者语言

为什么扫渲染结果而不是源码：
  源码里的注释、变量名、console 日志里出现技术词是**正常且必要**的
  （那是我给下一个人看的）。真正要管的是"用户眼睛看到的字"。
  所以这里打开每个页面、抓 body 的可见文本，再找禁忌词。

用户的要求原话：
  「检查全部前端文字，不能出现我之前说的那种技术方面的叙述，
    你要做的是让用户端知道怎么用，做好引导」
"""
import os
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

passed = 0
failures = []

# 用户不该看到的词。分成两类，理由不同：
BANNED_TECH = [
    # 实现细节：玩家不需要知道我们怎么算的
    '定点', '锁步', '确定性', '哈希', '128Hz', '30Hz', 'simAB', 'sim.js',
    '引擎', '渲染', '插值', '对账', '回放', '纯整数', '无随机', '无浮点',
    # 部署/运维：玩家不该被要求关心服务器
    '服务端', '数据库', 'SQLite', 'PostgreSQL', 'API', 'WebSocket',
    'argon2', 'run_local', 'python', 'token', 'JWT',
    # 命令行/文件路径
    '.js', '.py', '.json', 'http://', 'https://', 'ws://', 'localhost',
]
# 这些词在**游戏语境**里是玩家语言，不算技术叙述
ALLOWED_IN_GAME = ['无敌帧', '掉帧']

# 开发面板的固定标题。用户明确要求："有一些技术性的东西不要给用户看，
# 应该补充剧情" —— 这两块原来是**版本改动清单**和**未完成清单**，
# 现在换成了剧本原文（见 src/lib/lore.js）。
# 单列一张表是为了防止以后有人"顺手"把开发面板加回来。
BANNED_DEV_PANELS = ['这一版做了什么', '还没做完', '下一步', '10Hz',
                     'Boss 战', '待接入', '镜像值', '权威数据',
                     # 档案卡页删掉的三块（用户 2026-09-13 圈出来要求删的）：
                     # "做过的事"（成就，撞禁令 4）、"档案说明"（镜像值/权威数据）、
                     # "形象包"（品种资源路径 + SVG 占位形象说明）—— 全是实现细节。
                     '形象包', '资源路径', '占位形象', '做过的事', '档案说明']


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

        # ---- 登录页（还没登录时的文案）----
        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.wait_for_timeout(600)
        login_txt = pg.locator('body').inner_text()
        bad = [w for w in BANNED_TECH if w in login_txt]
        check('登录页没有开发者语言', not bad, f'残留：{bad}' if bad else '干净')
        check('登录页说明了怎么用（有引导）',
              any(w in login_txt for w in ('昵称', '注册', '密码', '进', '开始')),
              login_txt[:60].replace('\n', ' / '))

        # ---- 注册一只狗，进各个页面 ----
        pg.click('#mode-switch')
        pg.fill('#username', 'copy_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        breed_txt = pg.locator('body').inner_text()
        bad = [w for w in BANNED_TECH if w in breed_txt]
        check('选狗页没有开发者语言', not bad, f'残留：{bad}' if bad else '干净')
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '文案汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        pages = [
            ('总览', '/#/', 1200),
            ('开放世界', '/#/world', 2600),
            ('竞技场', '/#/arena', 1600),
            ('训练场', '/#/dojo', 3200),
            ('训练记录', '/#/training', 2200),
            ('档案卡', '/#/dogs', 1600),
            ('排行榜', '/#/board', 1600),
        ]
        for name, route, wait in pages:
            errs.clear()
            pg.goto(BASE + route, wait_until='networkidle')
            pg.wait_for_timeout(wait)
            txt = pg.locator('body').inner_text()
            hits = [w for w in BANNED_TECH if w in txt]
            check(f'{name}页没有开发者语言', not hits,
                  f'残留：{hits}' if hits else '干净')
            if errs:
                check(f'{name}页没有报错', False, str(errs[:1]))

        # ---- 形象：不该再出现程序生成的假狗 ----
        # 用户明确要求删掉 SVG 兜底：真图只是慢一步的时候，
        # 画面上会先闪出一只假卡通狗（原话"莫名其妙就会跳出来"）。
        for name, route in (('档案卡', '/#/dogs'), ('图鉴', '/#/adopt')):
            pg.goto(BASE + route, wait_until='networkidle')
            pg.wait_for_timeout(1400)
            fake = pg.evaluate(
                "() => document.querySelectorAll("
                "'.dog-portrait svg, .breed-card svg, .portrait svg').length")
            check(f'{name}页没有程序生成的假狗（已删 SVG 兜底）', fake == 0,
                  f'{fake} 个')

        # ---- 世界页：开发面板不许回来 + 剧情句每次刷新不同 ----
        # 用户的两条明确要求都固化在这里：
        #   ① "有一些技术性的东西不要给用户看"
        #   ② "应该补充剧情，每次刷新都是不同的句子"
        # ⚠️ 先从首页绕一下：同 hash 的 goto 不触发重载。
        pg.goto(BASE + '/#/', wait_until='networkidle')
        pg.goto(BASE + '/#/world', wait_until='networkidle')
        pg.wait_for_timeout(2600)
        w1 = pg.locator('body').inner_text()
        dev = [w for w in BANNED_DEV_PANELS if w in w1]
        check('世界页没有开发面板（版本清单/未完成清单）', not dev,
              f'残留：{dev}' if dev else '干净')

        # 档案卡页：也扫一遍（那页原来有三块实现说明）
        pg.goto(BASE + '/#/', wait_until='networkidle')
        pg.goto(BASE + '/#/card', wait_until='networkidle')
        pg.wait_for_timeout(1600)
        c1 = pg.locator('body').inner_text()
        cdev = [w for w in BANNED_DEV_PANELS if w in c1]
        check('档案卡页没有开发面板（形象包/资源路径/镜像值）', not cdev,
              f'残留：{cdev}' if cdev else '干净')

        # ⚠️ 上面绕去了档案卡页，下面的"剧情卡片"检查是在**世界页**做的，
        #    所以要绕回来 —— 顺序错了会得到"世界页没有剧情卡片"的假失败。
        pg.goto(BASE + '/#/', wait_until='networkidle')
        pg.goto(BASE + '/#/world', wait_until='networkidle')
        pg.wait_for_timeout(2600)
        w1 = pg.locator('body').inner_text()

        def lore_cards():
            # ⚠️ 两张卡的标题用的不是同一个 class：一张是 .card-title .kicker，
            #    另一张是 .note-paper .hand。只查 .kicker 会漏掉第二张。
            return pg.evaluate("""() => {
                const out = {};
                const wanted = ['长夜月', '册子上的一行'];
                [...document.querySelectorAll('.kicker, .hand')].forEach((k) => {
                    const name = k.textContent.trim();
                    if (!wanted.includes(name)) return;
                    const card = k.closest('.card, .note-paper');
                    if (card) out[name] = card.innerText.replace(name, '').trim();
                });
                return out;
            }""")

        a = lore_cards()
        check('世界页有剧情卡片（长夜月 / 册子上的一行）',
              ('长夜月' in a) and ('册子上的一行' in a), list(a.keys()))
        check('剧情卡片不是空的',
              all(a.get(k, '').strip() for k in ('长夜月', '册子上的一行')), a)

        # 刷新几次，至少要有一次和第一次不同（随机抽样，给足次数避免偶发）
        changed = False
        for _ in range(4):
            pg.goto(BASE + '/#/', wait_until='networkidle')
            pg.goto(BASE + '/#/world', wait_until='networkidle')
            pg.wait_for_timeout(2000)
            if lore_cards() != a:
                changed = True
                break
        check('剧情句每次刷新会变', changed, '四次刷新里有过变化' if changed else '四次都一样')

        pg.screenshot(path=os.path.join(SHOTS, '_copy.png'), full_page=True)
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('文案审查通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
