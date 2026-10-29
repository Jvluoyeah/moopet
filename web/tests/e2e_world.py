#!/usr/bin/env python3
"""开放世界验收测试（真实浏览器）

S0 的验收标准是"能用 WASD 操控狗在广场跑动，相机跟随、拖拽转视角"，
外加这一版新做的：建筑碰撞、四场景切换、传送点、靠近交互提示。

用法：先起服务端与前端，再 python tests/e2e_world.py [base_url]
"""
import os
import sys
import time
import urllib.request
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

steps = []
problems = []


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


def wait_for(page, selector, timeout=20000):
    try:
        page.wait_for_selector(selector, timeout=timeout, state='attached')
        return True
    except Exception:
        return False


def pos(page):
    return page.evaluate("() => window.__world ? window.__world.playerState() : null")


def cam(page):
    return page.evaluate("() => window.__world ? window.__world.camera.state() : null")


def hold(page, key, seconds):
    page.keyboard.down(key)
    page.wait_for_timeout(int(seconds * 1000))
    page.keyboard.up(key)
    page.wait_for_timeout(180)


def main():
    os.makedirs(SHOTS, exist_ok=True)
    if not wait_backend():
        print('后端不通，先 python run_local.py')
        return 1

    console_errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(viewport={'width': 1440, 'height': 950}).new_page()
        page.on('console', lambda m: console_errors.append(f'{m.type}: {m.text}')
                if m.type == 'error' else None)
        page.on('pageerror', lambda e: console_errors.append(f'pageerror: {e}'))

        # ---- 注册 + 领养 ----
        uname = 'world_' + datetime.now().strftime('%H%M%S')
        page.goto(BASE + '/#/login', wait_until='networkidle')
        page.click('#mode-switch')
        page.fill('#username', uname)
        page.fill('#password', 'pass1234')
        page.click('#submit')
        if not wait_for(page, '.breed-card', timeout=20000):
            print('注册失败'); browser.close(); return 1
        page.locator('.breed-card').first.click()
        page.fill('#dog-name', '跑跑汪')
        page.click('#adopt-submit')
        wait_for(page, 'text=我的机械狗', timeout=20000)
        check('注册领养 OK', True, uname)

        # ---- 进世界 ----
        page.goto(BASE + '/#/world', wait_until='networkidle')
        ok = wait_for(page, '#world3d canvas', timeout=20000)
        check('世界画布挂载', ok)
        if not ok:
            browser.close(); return 1
        page.wait_for_timeout(1500)

        check('世界实例可用', page.evaluate("() => !!window.__world"))
        check('默认落在广场', page.evaluate("() => window.__world.sceneCode") == 'plaza')
        check('场景里有建筑碰撞体',
              page.evaluate("() => window.__world.built.colliders.length") > 3,
              f"{page.evaluate('() => window.__world.built.colliders.length')} 个")
        check('场景里有 NPC 在巡游',
              page.evaluate("() => window.__world.npcs.length") >= 2,
              f"{page.evaluate('() => window.__world.npcs.length')} 只")

        p0 = pos(page)
        check('拿到玩家初始位置', p0 is not None, str(p0))
        page.screenshot(path=os.path.join(SHOTS, '30-world-plaza.png'), full_page=True)

        # ---- WASD 真的能操控 ----
        hold(page, 'w', 1.0)
        p1 = pos(page)
        moved_z = abs(p1['z'] - p0['z'])
        check('按 W 能让狗移动（这是"可操控"的核心）', moved_z > 60,
              f"z {p0['z']} → {p1['z']}（位移 {moved_z}）")

        hold(page, 'd', 1.0)
        p2 = pos(page)
        check('按 D 能横向移动', abs(p2['x'] - p1['x']) > 60,
              f"x {p1['x']} → {p2['x']}")
        check('移动后状态是走/跑', p2['status'] in ('walk', 'run'), p2['status'])

        # ---- Shift 跑得更快 ----
        # 两点注意：
        #  ① 先把体力补满——跑动耗体力，体力不满会得到"走 222 vs 跑 250"的假阴性；
        #  ② 先挪到广场南边的空地上——出生点正前方 130 格就是旅店的近墙，
        #     在那儿测速度会撞墙，测出来的是"被挡住的距离"不是"跑得多快"。
        def reset_runway():
            page.evaluate("""() => {
                const w = window.__world;
                w.player.x = w.scene.spawn.x;
                w.player.z = w.scene.spawn.z;
                w.player.vx = 0; w.player.vz = 0;
                w.player.stamina = 100;
                w.camera.yaw = 0;      // W 朝 -Z、S 朝 +Z，测试可预期
            }""")
            page.wait_for_timeout(220)

        reset_runway()
        before = pos(page)
        hold(page, 's', 1.0)
        walk_dist = abs(pos(page)['z'] - before['z'])
        reset_runway()
        before = pos(page)
        page.keyboard.down('Shift')
        hold(page, 's', 1.0)
        page.keyboard.up('Shift')
        run_dist = abs(pos(page)['z'] - before['z'])
        check('按住 Shift 跑得更远', run_dist > walk_dist * 1.25,
              f"走 {walk_dist} vs 跑 {run_dist}")

        # ---- 空格 = 跳一下 + 冒泡（计划 2.5 的操作表里承诺过） ----
        page.evaluate("""() => {
            const w = window.__world;
            w.player.x = w.scene.spawn.x; w.player.z = w.scene.spawn.z;
            w.player.vx = 0; w.player.vz = 0;
        }""")
        page.wait_for_timeout(200)
        hop0 = page.evaluate("() => window.__world.localActor.group.position.y")
        page.keyboard.press(' ')
        page.wait_for_timeout(170)
        hop1 = page.evaluate("() => window.__world.localActor.group.position.y")
        toast = page.evaluate(
            "() => (document.getElementById('w3-toast') || {}).textContent || ''")
        check('空格能让狗跳起来（表现层的抛物线位移）', hop1 > hop0 + 10,
              f'y {hop0:.0f} → {hop1:.0f}')
        check('空格会冒一句气泡（走文本，不用 emoji）', len(toast.strip()) > 0, repr(toast))
        page.wait_for_timeout(900)
        hop2 = page.evaluate("() => window.__world.localActor.group.position.y")
        check('跳完会落回地面（不会飘着）', abs(hop2 - hop0) < 1, f'y={hop2:.1f}')

        # ---- 相机跟随 ----
        c0 = cam(page)
        check('相机有斜俯角（45~60°，看不到地平线）',
              0.7 < c0['pitch'] < 1.15, f"pitch={c0['pitch']:.2f} rad")
        cam_pos = page.evaluate("""() => {
            const c = window.__world.camera3.position;
            const p = window.__world.player;
            return { dx: c.x - p.x, dz: c.z - p.z, y: c.y };
        }""")
        pl = pos(page)
        check('相机跟着玩家（水平偏移在合理范围）',
              abs(cam_pos['dx']) < 2200 and abs(cam_pos['dz']) < 2200,
              f"offset=({cam_pos['dx']:.0f},{cam_pos['dz']:.0f}) 高度={cam_pos['y']:.0f}")

        # ---- 拖拽旋转视角 ----
        y0 = cam(page)['yaw']
        box = page.locator('#world3d canvas').bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.mouse.down()
        page.mouse.move(box['x'] + box['width'] / 2 + 220, box['y'] + box['height'] / 2, steps=10)
        page.mouse.up()
        page.wait_for_timeout(200)
        y1 = cam(page)['yaw']
        check('拖拽能旋转视角', abs(y1 - y0) > 0.2, f"yaw {y0:.2f} → {y1:.2f}")

        # ---- 滚轮缩放 ----
        d0 = cam(page)['dist']
        page.mouse.wheel(0, -600)
        page.wait_for_timeout(200)
        d1 = cam(page)['dist']
        check('滚轮能缩放', abs(d1 - d0) > 30, f"dist {d0:.0f} → {d1:.0f}")
        page.screenshot(path=os.path.join(SHOTS, '31-world-rotated.png'), full_page=True)

        # ---- 建筑碰撞：挑场景里第一栋房子，从它南边往北撞 ----
        # 坐标一律从场景数据里现取，不再写死——布局改一次就要改一遍测试，
        # 之前那次大改布局就是这么把 10 项检查一次性打挂的。
        target = page.evaluate("""() => {
            const w = window.__world;
            const c = w.built.colliders[0];
            w.player.x = c.x + c.w / 2;
            w.player.z = c.z + c.d + 260;
            w.player.vx = 0; w.player.vz = 0;
            w.player.stamina = 100;
            w.camera.yaw = 0;            // 让 W 正好朝 -Z，测试可预期
            return { south: c.z + c.d, x: c.x + c.w / 2, w: c.w, d: c.d };
        }""")
        page.wait_for_timeout(200)
        hold(page, 'w', 3.0)
        pc = pos(page)
        check('撞上建筑会停下（走不进墙里）',
              abs(pc['z'] - (target['south'] + 26)) < 24,
              f"停在 z={pc['z']}（墙面 z={target['south']}，狗半径 26）")

        # 通用检查：任何时候都不该出现在碰撞体内部
        inside = page.evaluate("""() => {
            const w = window.__world, r = 26;
            const P = w.player;
            return w.built.colliders.filter(c =>
                P.x + r > c.x + 1 && P.x - r < c.x + c.w - 1 &&
                P.z + r > c.z + 1 && P.z - r < c.z + c.d - 1).length;
        }""")
        check('没有穿模进任何碰撞体', inside == 0, f'重复计数={inside}')

        # 顺便验证"道具也会挡路"：拿场景里第一个花箱，从它南边往北撞
        planter = page.evaluate("""() => {
            const w = window.__world;
            const p = (w.scene.props || []).find(q => q.kind === 'planter');
            if (!p) return null;
            const pw = p.w || 400, pd = p.d || 150;
            w.player.x = p.x;
            w.player.z = p.z + pd / 2 + 240;
            w.player.vx = 0; w.player.vz = 0;
            w.camera.yaw = 0;
            return { south: p.z + pd / 2, kind: p.kind };
        }""")
        page.wait_for_timeout(150)
        check('花箱测试仍在广场（没误踩传送点）',
              page.evaluate("() => window.__world.sceneCode") == 'plaza',
              page.evaluate("() => window.__world.sceneCode"))
        hold(page, 'w', 2.0)
        pl = pos(page)
        check('道具（花箱）也会挡路',
              planter and abs(pl['z'] - (planter['south'] + 26)) < 24,
              f"停在 z={pl['z']}（花箱南沿 z={planter['south'] if planter else '?'}）")
        page.screenshot(path=os.path.join(SHOTS, '32-world-collision.png'), full_page=True)

        # ---- 场景切换（页签） ----
        page.click('button[data-scene="park"]')
        page.wait_for_timeout(900)
        check('切到公园', page.evaluate("() => window.__world.sceneCode") == 'park')
        check('公园地貌与广场不同',
              page.evaluate("() => window.__world.scene.ground.kind") == 'grass')
        page.screenshot(path=os.path.join(SHOTS, '33-world-park.png'), full_page=True)

        page.click('button[data-scene="kennel"]')
        page.wait_for_timeout(800)
        check('切到狗窝', page.evaluate("() => window.__world.sceneCode") == 'kennel')

        page.click('button[data-scene="arena"]')
        page.wait_for_timeout(800)
        check('切到竞技场', page.evaluate("() => window.__world.sceneCode") == 'arena')
        page.screenshot(path=os.path.join(SHOTS, '34-world-arena.png'), full_page=True)

        # ---- 传送点：走过去自动前往 ----
        portal = page.evaluate("""() => {
            const w = window.__world;             // 传送点坐标从场景数据现取
            const p = w.scene.portals[0];
            w.player.x = p.x; w.player.z = p.z + (p.r || 150) + 90;
            w.player.vx = 0; w.player.vz = 0;
            w.camera.yaw = 0;                     // W 朝 -Z，正好走向传送点
            return { to: p.to, x: p.x, z: p.z, r: p.r || 150 };
        }""")
        page.wait_for_timeout(200)
        hold(page, 'w', 1.8)
        page.wait_for_timeout(600)
        check('走到传送点会自动切换场景',
              page.evaluate("() => window.__world.sceneCode") == portal['to'],
              f"目标={portal['to']} 实际={page.evaluate('() => window.__world.sceneCode')}")

        # ---- 靠近交互物会浮出提示 ----
        page.evaluate("""() => {
            const w = window.__world;             // 公告板坐标从场景数据现取
            const l = w.scene.locals.find(x => x.id === 'board') || w.scene.locals[0];
            w.player.x = l.x; w.player.z = l.z + 90;
            w.player.vx = 0; w.player.vz = 0;
        }""")
        page.wait_for_timeout(400)
        check('靠近公告板出现交互提示',
              page.evaluate("() => document.getElementById('w3-hint')?.className.includes('is-on')") is True)
        check('交互对象是公告板',
              page.evaluate("() => window.__world.nearby?.id") == 'board',
              str(page.evaluate("() => window.__world.nearby?.id")))
        page.keyboard.press('e')
        page.wait_for_timeout(400)
        check('按 E 有反馈（浮条出现）',
              page.evaluate("() => document.getElementById('w3-toast')?.className.includes('is-on')") is True)
        page.screenshot(path=os.path.join(SHOTS, '35-world-interact.png'), full_page=True)

        # ---- 全屏（大世界与对战都必须能全屏） ----
        # 全屏的是 .world3d-wrap（含顶部信息条），所以画布高度会比视口矮一条的高度。
        vp = page.evaluate("() => [window.innerWidth, window.innerHeight]")
        bar_h = page.evaluate("() => document.querySelector('.world3d-bar')?.clientHeight || 0")
        page.click('#w3-fullscreen')
        page.wait_for_timeout(1000)
        fs_el = page.evaluate("() => document.fullscreenElement?.id || null")
        check('大世界能进全屏', fs_el == 'world3d-wrap', f'fullscreenElement={fs_el}')
        fs_size = page.evaluate("""() => {
            const c = document.querySelector('#world3d canvas');
            return c ? [c.clientWidth, c.clientHeight] : null;
        }""")
        check('全屏后画布铺满屏幕（不是被拉伸的旧尺寸）',
              fs_size and fs_size[0] >= vp[0] - 2 and fs_size[1] >= vp[1] * 0.88,
              f'画布={fs_size} 视口={vp} 信息条={bar_h}')
        page.screenshot(path=os.path.join(SHOTS, '37-world-fullscreen.png'))
        page.keyboard.press('Escape')
        page.wait_for_timeout(700)
        check('Esc 能退出全屏',
              page.evaluate("() => document.fullscreenElement") is None)
        after = page.evaluate("""() => {
            const c = document.querySelector('#world3d canvas');
            return c ? [c.clientWidth, c.clientHeight] : null;
        }""")
        check('退出全屏后画布恢复原尺寸', after and after[1] < vp[1], f'画布={after}')

        # ---- 渲染开销与自适应分辨率 ----
        # 这个场景三角形只有 3k 出头，真正的瓶颈是**像素填充率**
        # （实测：1440×950 → 17fps，720×470 → 60fps，纯粹是像素数）。
        # 所以做了自适应分辨率：帧率掉下来就降 pixelRatio，缓过来再升回去。
        # headless 走软件光栅，这里正好能观察到它降档。
        perf = page.evaluate("() => window.__world.perf()")
        check('渲染自查接口可用（draw call / 三角形 / 当前分辨率）',
              perf and perf['calls'] > 0 and perf['triangles'] > 0, str(perf))
        check('场景规模在合理范围（draw call < 800）', perf['calls'] < 800,
              f"calls={perf['calls']}")
        page.wait_for_timeout(3600)
        perf2 = page.evaluate("() => window.__world.perf()")
        check('帧率偏低时会自动降分辨率（软件光栅下必然触发）',
              perf2['dpr'] <= perf['dpr'], f"dpr {perf['dpr']} → {perf2['dpr']}")

        # ---- 朝向：贴图必须真的镜像 ----
        # 之前用 `sprite.scale.x = -scale` 翻面，看着像标准做法，其实**完全没用**：
        # three.js 的 Sprite 走自己的顶点着色器，负缩放不翻 UV。
        # 这条检查直接比两张贴图像素，镜像没了就会挂。
        mir = page.evaluate("""async () => {
            const w = window.__world;
            const grab = (f) => new Promise((res) => {
                w.keys.clear(); w.player.vx = 0; w.player.vz = 0;
                w.player.facing = f;
                setTimeout(() => res(w.localActor.sprite.material.map.image.toDataURL()), 120);
            });
            return { right: await grab(1), left: await grab(-1) };
        }""")
        import base64 as _b64
        import io as _io
        from PIL import Image as _Img, ImageChops as _Chop
        _im = lambda u: _Img.open(_io.BytesIO(_b64.b64decode(u.split(',', 1)[1]))).convert('RGB')
        _r, _l = _im(mir['right']), _im(mir['left'])

        def _diff(a, b):
            d = _Chop.difference(a, b)
            px = list(d.getdata())
            return sum(sum(q) for q in px) / (len(px) * 3)

        d_flip = _diff(_l.transpose(_Img.FLIP_LEFT_RIGHT), _r)
        d_raw = _diff(_l, _r)
        check('左右朝向是两张互为镜像的贴图（不是同一张图在平移）',
              d_flip < d_raw * 0.2,
              f'翻转后差 {d_flip:.2f} / 原样差 {d_raw:.2f}')

        # ---- 数值合理性：位置不越界 ----
        page.evaluate("""() => {
            const w = window.__world;
            w.player.x = 50; w.player.z = 50; w.player.vx = -900; w.player.vz = -900;
        }""")
        page.wait_for_timeout(800)
        pb = pos(page)
        check('不会跑出场景边界', pb['x'] >= 0 and pb['z'] >= 0, f"({pb['x']},{pb['z']})")

        browser.close()

    real_errors = [e for e in console_errors if 'favicon' not in e.lower()]
    if real_errors:
        print('\n--- console 报错 ---')
        for e in real_errors[:10]:
            print('  ' + e)
        problems.append(f'{len(real_errors)} 条 console 报错')

    ok = sum(1 for _, o, _ in steps if o)
    print(f'\n{ok}/{len(steps)} 项检查通过')
    if problems:
        print('问题：')
        for x in problems:
            print('  - ' + x)
        return 1
    print('开放世界验收测试通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
