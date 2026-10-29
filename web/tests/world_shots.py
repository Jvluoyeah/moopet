#!/usr/bin/env python3
"""开放世界多机位截图

用途：**先看再改**。把广场从各个角度拍下来，用图说话。
     改完之后再拍一遍同一组机位，前后对比。

跑法：python tests/world_shots.py [url] [前缀] [场景]
     机位固定，所以两次运行拍出来的图可以直接对照。
     场景默认 plaza，也可以 park / kennel / arena —— 相机 dist 是按场景各自
     调的，换过 dist 之后必须每个场景都看一眼（相机地面点如果落到地面板块
     外面，画面底部会露出"地板边缘"）。
"""
import json
import math
import os
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080').rstrip('/')
PREFIX = sys.argv[2] if len(sys.argv) > 2 else 'world'
SCENE = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else 'plaza'
# 标签页上的中文名（切场景要点它，URL 传参无效）
SCENE_NAMES = {'plaza': '长夜月广场', 'park': '长夜月公园',
               'kennel': '我的狗窝', 'arena': '月光竞技场'}
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

# `--at=x,z`：只拍这个位置上的东西，正反两个机位各一张。
# 看单个道具（告示牌、长椅）的穿模时用这个，比在整场截图里放大裁图靠谱。
AT = None
for _a in sys.argv[1:]:
    if _a.startswith('--at='):
        _x, _z = _a[5:].split(',')
        AT = (float(_x), float(_z))

# 机位表：(名字, 偏航角(度), 俯角(度), 距离, 玩家要站到哪儿)
# 角度覆盖：东南西北四个方向 + 俯视 + 平视 + 贴近
CAMS = [
    ('01-default',   None, None, None, None),        # 游戏默认机位
    ('02-topdown',   0,    74,   1600, None),        # 几乎垂直俯视（看排布）
    ('03-eye',       0,    32,    900, None),        # 接近平视（看建筑体量）
    ('04-front',     0,    57,   1400, None),        # 正南
    ('05-east',      90,   57,   1400, None),        # 正东
    ('06-north',     180,  57,   1400, None),        # 正北
    ('07-west',      270,  57,   1400, None),        # 正西
    ('08-close',     30,   45,    900, None),        # 贴近（看穿模/接缝）
    ('09-far',       0,    60,   2600, None),        # 拉远（看整体边界）
    ('10-prop',      0,    30,    900, None),        # 贴近单个道具（低俯角、近距离）
]

# --at 模式下只跑这两个机位：正面看一次、背面看一次（穿模经常只在一侧露出来）
# --at 模式下只跑这一个机位：把相机对准 x,z 那个目标，低俯角贴近看。
# `--at=x,z` 给的是**要看的目标**位置（不移动狗，见循环里的说明）。
CAM_LIST = [('10-prop', None, 24, 900, AT)] if AT else CAMS


def main():
    stamp = datetime.now().strftime('%H%M%S')
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--enable-unsafe-swiftshader'])
        pg = b.new_context(viewport={'width': 1280, 'height': 760}).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))

        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'shot_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '取景汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        pg.goto(BASE + '/#/world', wait_until='networkidle')
        # 场景不是 URL 参数，是应用状态（pages/world.js 的 st.scene），所以只能
        # 点顶部那个场景标签页切。`#/world?scene=park` 是无效的 —— 我照着它
        # 拍了一轮，拍到的其实还是广场。
        if SCENE != 'plaza':
            # 必须先等标签页渲染出来：networkidle 时它还没挂上，点了等于没点
            # （我第一次就是立刻点，结果拍的还是广场，而且没有任何报错）。
            pg.wait_for_timeout(1800)
            ok = pg.evaluate("""(name) => {
                const b = [...document.querySelectorAll('button, a')]
                    .find((x) => (x.textContent || '').includes(name));
                if (!b) return false;
                b.click();
                return true;
            }""", SCENE_NAMES[SCENE])
            if not ok:
                raise SystemExit(f'找不到场景标签「{SCENE_NAMES[SCENE]}」，没有切过去')
            pg.wait_for_timeout(1500)
        pg.wait_for_timeout(3500)                 # 等 3D 场景建好

        keys = pg.evaluate(
            "() => window.__world ? Object.keys(window.__world) : null")
        print('window.__world 的字段:', keys)
        if not keys:
            print('拿不到 window.__world —— 世界页没挂句柄')
            return 1

        # 俯视时把雾关掉，否则远处看不清（只影响截图，不影响游戏）
        pg.evaluate("""() => {
            const w = window.__world;
            window.__savedFog = null;
            if (w.scene && w.scene.fog) {
                window.__savedFog = w.scene.fog;
                w.scene.fog = null;
            }
        }""")

        for name, yaw, pitch, dist, _pos in (CAM_LIST if AT else CAMS):            # _pos = (x, z)：把**相机**转过去对准这个世界点。
            # ⚠️ 不要改成"把狗传送过去"：直接写 player.x/z 会被服务端的
            #    "位置同步异常，已忽略这一步"拒掉（狗原地不动，拍出来是别的东西）。
            #    相机本来就绕狗转，转 yaw 就能看任意方向，不需要动狗。
            if _pos:
                aim = pg.evaluate("""(t) => {
                    const p = window.__world.player;
                    // forward = (-sin yaw, -cos yaw)  =>  yaw = atan2(-dx, -dz)
                    return Math.atan2(-(t[0] - p.x), -(t[1] - p.z));
                }""", list(_pos))
                yaw = aim * 180 / 3.141592653589793
            # ⚠️ 直接改 world.camera.yaw 不生效（那个对象不是真正被读的那个，
            #    或者每帧被重置）。**改用鼠标拖拽** —— 这是玩家实际走的那条路，
            #    而且角度能通过拖动量算出来。
            #    拖拽系数在 camera.js 里：yaw -= dx*0.006，pitch += dy*0.004
            if yaw is not None or pitch is not None:
                cur = pg.evaluate("""() => {
                    const w = window.__world;
                    return { yaw: w.camera.yaw, pitch: w.camera.pitch, dist: w.camera.dist };
                }""")
                want_yaw = (yaw if yaw is not None else cur['yaw'] * 180 / 3.141592653589793)
                want_pitch = (pitch if pitch is not None else cur['pitch'] * 180 / 3.141592653589793)
                # 归一化到 [-180,180]
                def norm(a):
                    while a > 180:
                        a -= 360
                    while a < -180:
                        a += 360
                    return a
                dyaw = norm(want_yaw - cur['yaw'] * 180 / 3.141592653589793)
                dpitch = want_pitch - cur['pitch'] * 180 / 3.141592653589793
                dx = -dyaw * 3.141592653589793 / 180 / 0.006
                dy = dpitch * 3.141592653589793 / 180 / 0.004
                # 分几次拖，模拟真实拖动
                steps = 6
                pg.mouse.move(640, 400)
                pg.mouse.down()
                for k in range(1, steps + 1):
                    pg.mouse.move(640 + dx * k / steps, 400 + dy * k / steps)
                    pg.wait_for_timeout(30)
                pg.mouse.up()
            if dist is not None:
                # ⚠️ 缩放是**指数**的：camera.js 的 zoom() 每格滚轮乘一次
                #    exp(120*0.0012)=1.155。所以步数要用对数算，不能拿
                #    (当前-目标)/120 线性估 —— 那样距离一拉大就偏（想要 1600
                #    会得到 912）。方向也别搞反：拉近要**负** delta。
                #    每格滚轮的实际步进不是精确的 120，所以再迭代两轮收敛。
                # 滚轮是发给"光标下面那个元素"的，拖拽之后光标可能已经不在画布上，
                # 那样滚轮会被丢掉（表现为 dist 一点都不动）。先挪回画布中央。
                pg.mouse.move(700, 500)
                for _ in range(3):
                    cur_d = pg.evaluate("() => window.__world.camera.dist")
                    if abs(cur_d - dist) <= dist * 0.04:
                        break
                    total = math.log(dist / cur_d) / 0.0012
                    n = int(abs(total) / 120)
                    if n == 0:
                        n = 1
                    step = 120 if total > 0 else -120
                    for _ in range(n):
                        pg.mouse.wheel(0, step)
                        pg.wait_for_timeout(20)
                    pg.wait_for_timeout(150)
                cur_d = pg.evaluate("() => window.__world.camera.dist")
                if abs(cur_d - dist) > dist * 0.12:
                    print(f'    （缩放没收敛：想要 {dist}，实际 {round(cur_d)}）')
            pg.wait_for_timeout(700)              # 让相机平滑过去
            got = pg.evaluate("""() => {
                const c = window.__world.camera;
                return [Math.round(c.yaw * 57.2958), Math.round(c.pitch * 57.2958),
                        Math.round(c.dist)];
            }""")
            path = os.path.join(SHOTS, f'{PREFIX}-{name}.png')
            pg.screenshot(path=path)
            # 再单独存一张**只含画布**的裁切图：判断"屋顶有没有被上边缘锯掉"
            # 需要精确知道哪一行是画布顶行。之前靠颜色猜边界，把页面白底
            # 当成"物体"假报过一次；裁切图里第 0 行就是画布顶，不用猜。
            box = pg.evaluate("""() => {
                const cv = document.querySelector('canvas');
                const r = cv.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height };
            }""")
            pg.screenshot(path=os.path.join(SHOTS, f'{PREFIX}-{name}-canvas.png'),
                          clip=box)
            print(f'  拍了 {os.path.basename(path)}  实际机位 yaw={got[0]}° '
                  f'pitch={got[1]}° dist={got[2]}  画布 {int(box["width"])}x{int(box["height"])}')

        # 顺便把世界的尺寸数据打出来（排布要靠数据看）
        info = pg.evaluate("""() => {
            const w = window.__world;
            const out = {};
            for (const k of Object.keys(w)) {
                const v = w[k];
                out[k] = (v && typeof v === 'object')
                  ? (Array.isArray(v) ? `array(${v.length})`
                     : (v.children ? `object(children=${v.children.length})` : 'object'))
                  : typeof v;
            }
            return out;
        }""")
        print('世界信息:', json.dumps(info, ensure_ascii=False))
        print('errors:', errs[:2])
        b.close()
    print(f'\n截图在 {SHOTS}\\{PREFIX}-*.png')
    return 0


if __name__ == '__main__':
    sys.exit(main())
