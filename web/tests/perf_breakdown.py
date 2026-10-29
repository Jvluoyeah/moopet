#!/usr/bin/env python3
"""性能拆解：世界场景里 draw call 与帧率分别被什么吃掉了。

headless Chromium 走的是软件光栅（SwiftShader），绝对 fps 没有参考价值，
但**相对变化**（开/关阴影、加/不加远端、合不合并线框）是可信的，
优化就按这个来定。
"""
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173').rstrip('/')


def measure(page, label, setup=''):
    if setup:
        page.evaluate(setup)
        page.wait_for_timeout(500)
    r = page.evaluate("""async () => {
        const w = window.__world;
        const t0 = performance.now();
        let frames = 0;
        await new Promise((res) => {
            const tick = () => {
                frames += 1;
                if (performance.now() - t0 > 1600) res();
                else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
        const fps = frames / ((performance.now() - t0) / 1000);
        const i = w.renderer.info;
        return { fps: Math.round(fps), calls: i.render.calls,
                 tris: i.render.triangles, geo: i.memory.geometries,
                 tex: i.memory.textures, shadows: w.renderer.shadowMap.enabled,
                 remotes: w.remotes.size };
    }""")
    print(f'{label:28s} fps={r["fps"]:3d}  calls={r["calls"]:4d}  tris={r["tris"]:6d}  '
          f'geo={r["geo"]:4d}  tex={r["tex"]:3d}  remotes={r["remotes"]}')
    return r


def main():
    stamp = datetime.now().strftime('%H%M%S')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width': 1440, 'height': 950}).new_page()
        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'perf_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '测速汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)
        pg.goto(BASE + '/#/world', wait_until='networkidle')
        pg.wait_for_selector('#world3d canvas', timeout=25000)
        pg.wait_for_timeout(2500)

        measure(pg, '基准（广场）')
        measure(pg, '关阴影', "() => { window.__world.renderer.shadowMap.enabled = false; }")
        measure(pg, '开阴影 + 40 远端', """() => {
            const w = window.__world;
            w.renderer.shadowMap.enabled = true;
            for (let i = 0; i < 40; i += 1) {
                w.session.receive({ type: 'peer_join', peer: {
                    dog_id: 9000 + i, name: 'P' + i, breed_code: 'corgi', level: 10,
                    x: w.player.x + (i % 8) * 70 - 280, z: w.player.z + Math.floor(i / 8) * 80 - 240,
                    facing: 1, status: 'walk' } });
            }
        }""")
        hi = pg.evaluate("() => window.__world.renderer.getPixelRatio()")
        print('pixelRatio =', hi)
        b.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
