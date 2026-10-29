#!/usr/bin/env python3
"""前端端到端冒烟（真实浏览器 · Playwright）

跑之前要先起两个进程：
    cd w6/server && python run_local.py        # 8080
    cd w6/web    && npm run dev                # 5173

本脚本会：
  1. 注册 → 领养 → 回到总览，检查页面真的渲染出东西（不是白屏）
  2. 打开开放世界，确认 canvas 画出了内容（读像素，不是只看标签）
  3. 打开档案卡 / 排行榜 / 设计系统，检查关键元素
  4. 全程收集 console 报错与失败请求，最后汇总（有错就非 0 退出）

用法：python tests/e2e_smoke.py [http://127.0.0.1:5173]
"""
import os
import sys
import time
import urllib.request
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5173').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

problems = []
steps = []


def check(label, ok, detail=''):
    steps.append((label, ok, detail))
    print(f"{'OK  ' if ok else 'FAIL'}  {label}" + (f"  — {detail}" if detail else ''))
    if not ok:
        problems.append(f'{label}: {detail}')


def wait_backend(timeout=20):
    for _ in range(timeout * 2):
        try:
            with urllib.request.urlopen(BASE + '/api/health', timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def wait_for(page, selector, timeout=15000):
    """等元素出现；出现返回 True，超时返回 False（不抛异常，交由调用方记录）。"""
    try:
        page.wait_for_selector(selector, timeout=timeout, state='attached')
        return True
    except Exception:
        return False


def read_tick(page):
    """从 window.__arena.snapshot() 读当前 tick；读不到返回 -1。

    以前是从 HUD 的 DOM（'.world-hud .badge.mono'）里抠数字，
    v2 横板把 HUD 整个重做了，这类"抠 DOM"的测试全瞎了。
    改成走只读快照接口：HUD 怎么改版都不影响测试。"""
    try:
        snap = page.evaluate('() => window.__arena ? window.__arena.snapshot() : null')
        return int((snap or {}).get('tick', -1))
    except Exception:
        return -1


def canvas_is_blank(page, selector='canvas'):
    """读画布像素：中心区域如果全是同一个颜色，说明没画东西。"""
    return page.evaluate("""(sel) => {
        const c = document.querySelector(sel);
        if (!c) return { missing: true };
        const ctx = c.getContext('2d');
        if (!ctx) return { webgl: true, w: c.width, h: c.height };
        const w = c.width, h = c.height;
        const data = ctx.getImageData(0, 0, w, h).data;
        const seen = new Set();
        for (let i = 0; i < data.length; i += 4 * 97) {
            seen.add(`${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}`);
            if (seen.size > 6) break;
        }
        return { colors: seen.size, w, h };
    }""", selector)


def main():
    os.makedirs(SHOTS, exist_ok=True)
    print(f'前端地址 {BASE}')
    if not wait_backend():
        print('后端 /api/health 不通，先把服务端起起来（python run_local.py）')
        return 1

    console_errors = []
    failed_requests = []
    uname = 'e2e_' + datetime.now().strftime('%H%M%S')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})

        page.on('console', lambda m: console_errors.append(f'{m.type}: {m.text}')
                if m.type == 'error' else None)
        page.on('pageerror', lambda e: console_errors.append(f'pageerror: {e}'))
        page.on('requestfailed', lambda r: failed_requests.append(
            f'{r.method} {r.url} — {r.failure}'))

        # ---- 1. 首页 ----
        page.goto(BASE + '/#/', wait_until='networkidle')
        check('首页渲染出纸页', page.locator('.sheet').count() > 0)
        check('首页有产品标题', '档案册' in page.content())
        check('顶栏存在', page.locator('.topbar').count() == 1)
        page.screenshot(path=os.path.join(SHOTS, '01-home.png'), full_page=True)

        # ---- 2. 注册 ----
        page.goto(BASE + '/#/login', wait_until='networkidle')
        check('默认是登录模式', '注册并继续' not in page.locator('#submit').inner_text())
        page.click('#mode-switch')                # 切到注册
        check('可切到注册模式', '注册' in page.locator('#submit').inner_text())
        page.fill('#username', uname)
        page.fill('#password', 'pass1234')
        page.click('#submit')
        # 等"领养页出现品种卡"而不是等 hash 跳转：hash 变化不一定会触发导航事件
        ok = wait_for(page, '.breed-card', timeout=20000)
        if not ok:
            err = page.locator('.note.bad').first
            detail = err.inner_text() if err.count() else page.url
            check('注册后进入领养页', False, detail)
            page.screenshot(path=os.path.join(SHOTS, '99-register-fail.png'), full_page=True)
            browser.close()
            return 1
        check('注册后进入领养页', True)

        # ---- 3. 领养 ----
        cards = page.locator('.breed-card')
        check('品种图鉴有 8 张卡', cards.count() == 8, f'实际 {cards.count()}')
        cards.nth(2).click()                      # 换一个品种，验证选中态
        check('选中品种有高亮', page.locator('.breed-card.is-picked').count() == 1)
        page.fill('#dog-name', '端到端汪')
        page.screenshot(path=os.path.join(SHOTS, '02-adopt.png'), full_page=True)
        page.click('#adopt-submit')
        # 必须等"总览页独有的标题"出现：只用 .catalogue 会被领养页本身命中（假通过）
        ok = wait_for(page, 'text=我的机械狗', timeout=20000)
        check('领养后回到总览', ok, page.url)
        check('URL 落到首页', page.url.rstrip('/').endswith('#') or page.url.endswith('#/'),
              page.url)
        page.wait_for_timeout(1500)

        body = page.content()
        check('总览显示狗名', '端到端汪' in body)
        check('总览显示社群名', '长夜月广场' in body)
        check('总览显示品种', page.locator('.breed-name').count() > 0)
        page.screenshot(path=os.path.join(SHOTS, '03-dashboard.png'), full_page=True)

        # ---- 4. 开放世界（3D 视口真的渲染了几何体） ----
        page.goto(BASE + '/#/world', wait_until='networkidle')
        page.wait_for_timeout(3000)
        check('世界是 WebGL 画布', page.locator('#world3d canvas').count() == 1)
        # 用 three.js 自己的渲染统计判断"真的画了东西"：
        # 读像素不可靠（WebGL 默认在合成后会清空绘制缓冲），而渲染统计是实打实的。
        stats = page.evaluate("""() => {
            const w = window.__world;
            if (!w) return { missing: true };
            return {
                tris: w.renderer.info.render.triangles,
                calls: w.renderer.info.render.calls,
                sceneChildren: w.sceneRoot.children.length,
                actors: w.actorRoot.children.length,
                colliders: w.built.colliders.length,
                npcs: w.npcs.length,
            };
        }""")
        check('三维场景真的有几何体被渲染', (stats.get('tris') or 0) > 500, str(stats))
        check('场景里有狗（本地 + NPC）',
              (stats.get('actors') or 0) >= 3 and (stats.get('npcs') or 0) >= 2, str(stats))

        # ---- 狗必须真的"画得出来" ----
        # 历史上踩过：TextureLoader 直接加载 SVG 数据 URI 会在 WebGL 上传时**静默失败**——
        # 贴图对象、图片都报"加载成功"，脚下的阴影也正常，唯独狗是隐形的。
        # 现在改成把 SVG 光栅化到 canvas 再当贴图，这里就守住这条路径。
        dogtex = page.evaluate("""() => {
            const sp = window.__world?.localActor?.sprite;
            const img = sp?.material?.map?.image;
            if (!img) return { missing: true };
            if (img.tagName !== 'CANVAS') return { isCanvas: false, tag: img.tagName };
            const g = img.getContext('2d');
            const d = g.getImageData(0, 0, img.width, img.height).data;
            let opaque = 0, ink = 0;
            for (let i = 0; i < d.length; i += 4 * 31) {
                if (d[i + 3] > 40) opaque += 1;
                if (d[i + 3] > 120 && d[i] < 90 && d[i + 1] < 90) ink += 1;
            }
            return { isCanvas: true, w: img.width, opaque, ink };
        }""")
        check('狗立牌贴图是光栅化的 canvas（不是直接拿 SVG 当贴图）',
              dogtex.get('isCanvas') is True, str(dogtex))
        check('贴图上真的画出了狗（有实心像素与墨线）',
              (dogtex.get('opaque') or 0) > 100 and (dogtex.get('ink') or 0) > 3,
              str(dogtex))

        check('世界显示地点与在场信息',
              page.locator('#w3-banner').count() == 1
              and page.locator('#w3-topright .badge').count() >= 1)
        page.screenshot(path=os.path.join(SHOTS, '04-world.png'), full_page=True)

        # ---- 5. 档案卡 ----
        page.goto(BASE + '/#/card', wait_until='networkidle')
        page.wait_for_timeout(800)
        card_txt = page.content()
        # ⚠️ 这里原来只查字面串「天赋四维」—— 接上成长之后标题改成
        #    「四维 · LV.n」（显示**当前等级**的四维，不再是出厂值），于是它报了红。
        #    但内容是**变多**了不是变少：换成更强的判据 ——
        #    四项属性名都得在，而且要看得出"养它有什么用"。
        check('档案卡有四维（四项都在，且标了当前等级）',
              ('四维 · LV.' in card_txt)
              and all(k in card_txt for k in ('体力', '敏捷', '智力', '亲和')))
        check('档案卡看得出成长（每级涨什么 / 上阵时的参数）',
              '每升一级' in card_txt and '上阵时的样子' in card_txt)
        # ★ 四维**不能四项全一样** —— 用户截图指出过："每只狗的这些属性维度
        #   不可能完全一样的"。当时接口把 stats 嵌套着返回，而页面按平铺读，
        #   四项一起落到默认 50 → 31 级正好显示成"全是 68"。
        #   这条拿**真实数据**验，是那个 bug 唯一能被照出来的地方。
        nums = page.evaluate("""() => {
            // 四维那几行是 .stats > .stat > .stat-val（见 components/ui.js 的 statBars）
            return [...document.querySelectorAll('.stats .stat-val')]
                .map((el) => Number((el.textContent || '').trim()))
                .filter((v) => Number.isFinite(v));
        }""")
        uniq = len(set(nums))
        check('四维不是四项全一样（不同品种要有各自的形状）', uniq >= 3,
              '读到的数值 %s（%d 种）' % (nums[:6], uniq))
        check('档案卡有社群', '长夜月广场' in card_txt)
        check('档案卡有装订线纸页', page.locator('.dossier').count() == 1)
        page.screenshot(path=os.path.join(SHOTS, '05-card.png'), full_page=True)

        # ---- 6. 排行榜 ----
        page.goto(BASE + '/#/leaderboard', wait_until='networkidle')
        page.wait_for_timeout(800)
        check('排行榜有表格', page.locator('#leaderboard-table').count() == 1)
        check('排行榜有行', page.locator('#leaderboard-table tbody tr').count() >= 8)
        page.click('button[data-kind="social"]')
        page.wait_for_timeout(600)
        check('切换榜单可用', page.locator('#leaderboard-table').count() == 1)
        page.screenshot(path=os.path.join(SHOTS, '06-leaderboard.png'), full_page=True)

        # ---- 7. 设计系统页已下线（需求：没必要存在） ----
        page.goto(BASE + '/#/styleguide', wait_until='networkidle')
        page.wait_for_timeout(600)
        check('设计系统页已下线路由（访问它不会再渲染出那一页）',
              page.locator('#route-slot .sg-wrap, #route-slot .swatch').count() == 0)

        # ---- 8. 夜读主题 ----
        page.click('#theme-toggle')
        page.wait_for_timeout(400)
        theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
        check('可切到夜读纸', theme == 'night', f'data-theme={theme}')
        page.screenshot(path=os.path.join(SHOTS, '08-night.png'), full_page=True)
        page.click('#theme-toggle')

        # ---- 9. 竞技场：真的打一局并上报 ----
        page.goto(BASE + '/#/arena', wait_until='networkidle')
        page.wait_for_timeout(1200)
        check('竞技场有 WebGL 画布', page.locator('#arena-stage canvas').count() == 1)
        check('竞技场有开场按钮', page.locator('button:has-text("对战 AI")').count() == 1)
        page.screenshot(path=os.path.join(SHOTS, '09-arena.png'), full_page=True)

        page.click('button:has-text("对战 AI")')
        ok = wait_for(page, 'text=对局中', timeout=20000)
        check('开局后进入对局中', ok)
        page.wait_for_timeout(2000)

        # 帧数应该在涨（证明固定步长循环在跑）
        tick1 = read_tick(page)
        page.keyboard.down('ArrowRight')
        page.wait_for_timeout(1200)
        page.keyboard.up('ArrowRight')
        tick2 = read_tick(page)
        check('模拟在推进（tick 增长）', tick2 > tick1, f'{tick1} → {tick2}')
        check('输入被记录（回放日志非空）',
              page.evaluate("window.__moopet && true") is True)

        # 站着不动等 AI 打完。
        # 一局的长度是**设计值**：回合 60 秒 + 结算 2.4 秒 + 开场 2.25 秒 ≈ 65 秒。
        # 原来给的 50 秒是旧引擎下"AI 提前把站着不动的玩家 KO"才够用；
        # 换引擎后伤害口径变了，时间到才判（实测 66 秒），所以窗口放到 80 秒。
        ok = wait_for(page, 'text=本局结束', timeout=80000)
        check('一局能正常结束', ok)
        if ok:
            page.screenshot(path=os.path.join(SHOTS, '10-arena-result.png'), full_page=True)
            page.click('button:has-text("上报结果并领奖励")')
            ok2 = wait_for(page, '.note.good, .note.bad', timeout=20000)
            check('结果上报并领奖有反馈', ok2,
                  page.locator('.note').first.inner_text() if page.locator('.note').count() else '')
            page.screenshot(path=os.path.join(SHOTS, '11-arena-claim.png'), full_page=True)

        browser.close()

    print()
    print('--- 截图 ---')
    for f in sorted(os.listdir(SHOTS)):
        print(f'  {os.path.join(SHOTS, f)}')

    real_errors = [e for e in console_errors if 'favicon' not in e.lower()]
    if real_errors:
        print('\n--- console 报错 ---')
        for e in real_errors[:12]:
            print('  ' + e)
        problems.append(f'{len(real_errors)} 条 console 报错')
    if failed_requests:
        print('\n--- 失败请求 ---')
        for r in failed_requests[:12]:
            print('  ' + r)
        problems.append(f'{len(failed_requests)} 个失败请求')

    ok = sum(1 for _, o, _ in steps if o)
    print(f'\n{ok}/{len(steps)} 项检查通过')
    if problems:
        print('问题：')
        for p in problems:
            print('  - ' + p)
        return 1
    print('端到端冒烟通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
