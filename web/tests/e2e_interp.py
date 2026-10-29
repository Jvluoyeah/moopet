#!/usr/bin/env python3
"""验渲染插值真的在插 —— 看位置序列是否连续，不是看代码接没接。

怎么判"插上了"：
  不插值的话，屏幕上的 x 每一步都等于**某个 tick 的整数值**，
  相邻帧的位移要么是 0（这一帧没推进）要么是一整跳（推进了 2~3 个 tick）。
  插值之后，相邻帧的位移应该**处处非零且大小接近**（真正的连续运动）。

所以这里采样舞台上的实际像素位置，算"相邻帧位移"的分布。
"""
import os
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

passed = 0
failures = []


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
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:160])
               if m.type == 'error' else None)

        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'interp_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '插值汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        pg.goto(BASE + '/#/dojo', wait_until='networkidle')
        pg.wait_for_selector('#dojo-stage canvas', timeout=25000)
        pg.wait_for_function(
            "() => window.__dojo && window.__dojo.st.match.phase === 'fight'",
            timeout=20000)

        # 让狗持续往右跑，同时逐帧记录舞台上的实际 x
        pg.evaluate("""() => {
            window.__samples = [];
            const g = window.__dojo;
            const orig = g.draw.bind(g);
            g.draw = (a) => {
                orig(a);
                const grp = g.view.actorRoot.children[0];
                if (grp) window.__samples.push(grp.position.x);
            };
        }""")
        pg.keyboard.down('d')
        pg.wait_for_timeout(900)
        pg.keyboard.up('d')
        pg.wait_for_timeout(300)

        samples = pg.evaluate("() => window.__samples")
        # 去掉没动的那部分（起手/收尾）
        xs = [x for x in samples if x > 0]
        print(f'  采了 {len(xs)} 帧')

        if len(xs) < 30:
            check('采到足够多的帧', False, f'只有 {len(xs)} 帧')
        else:
            # ⚠️ 只看**连续运动的区间**。
            #    采样里包含"按下 D 之前"和"松开 D 之后"——那两段狗本来就不动，
            #    拿它们算"有没有卡帧"是错的（第一版就是这么误报的）。
            runs = []
            run = []
            for i in range(len(xs) - 1):
                d = xs[i + 1] - xs[i]
                if d > 1e-6:
                    run.append(d)
                else:
                    if len(run) > len(runs):
                        runs = run
                    run = []
            if len(run) > len(runs):
                runs = run
            moving = runs
            check('采到一段连续运动（够长才好评）', len(moving) >= 20,
                  f'最长连续段 {len(moving)} 帧')

            if moving:
                avg = sum(moving) / len(moving)
                mx = max(moving)
                # 这里原来断言「最大位移 <= 平均的 1.8 倍」，**那个阈值是错的**。
                # 物理下限就在 2.0 附近：模拟 128Hz、浏览器 rAF 60Hz，
                # 每个渲染帧要消费 2.13 个 tick，所以每帧位移天然在 2~4 个 tick
                # 之间跳，max/avg 的理论上限就是 (3+1)/2 ~= 2.0。
                # 实测每次都恰好落在 2.00~2.01 —— 那不是抖动，是采样率的必然。
                # 卡在 1.8 上只会得到「随机失败」；而且**放宽阈值也抓不住真问题**
                # （完全没插值时比值反而更小，约 1.5）。
                #
                # 真正能分辨「有没有插值」的是**位移有没有被量化到整 tick**：
                #   · 不插值：渲染位置 = 某个 tick 的整数位置 -> 位移是 tick 步长的
                #             整数倍，去重之后只剩很少几个值（阶梯）
                #   · 有插值：位置是相邻两个 tick 之间的线性插值 -> 位移取连续值，
                #             去重之后是一大片
                distinct = len({round(d, 2) for d in moving})
                ratio = distinct / len(moving)
                # 阈值的依据（不是拍脑袋）：
                #   模拟 128Hz、rAF 60Hz -> 每帧消费 2.13 个 tick -> tick 数只有 2 或 3 两种。
                #   · **不插值**：渲染位置 = 整 tick 位置 -> 位移只有 2 个值（阶梯）
                #   · **有插值**：位移 = "tick 数 x alpha" 的组合 -> 2~3 个 tick
                #                 x 2~3 个 alpha，实测稳定是 **6 个**
                #   所以 >= 4 能干脆地把两者分开，而且离两边都有余量。
                check('位移的取值数多于"纯整 tick"的情形（说明真的在插值）',
                      distinct >= 4,
                      f'{len(moving)} 帧里有 {distinct} 个不同的位移值'
                      f'（不插值只会有 2 个）')
                # 夹一层上限：万一有严重卡顿（一次补 8 帧）也要能看出来
                check('单帧位移没有失控（不会一口气跳好几个 tick）',
                      mx <= avg * 2.4,
                      f'平均 {avg:.2f}，最大 {mx:.2f}，比值 {mx / avg:.2f}')

        # 插值不能把状态机也插了
        state_ok = pg.evaluate("""() => {
            const g = window.__dojo;
            const cur = g.interp.cur, prev = g.interp.prev;
            if (!cur) return { ok: false, why: '没有采样' };
            // 状态字段必须和当前 tick 完全一致（不被插值改动）
            const src = g.st.units.map((u, i) => u.id);
            return { ok: cur.every((u, i) => u.id === src[i]),
                     n: cur.length, prevN: prev ? prev.length : 0 };
        }""")
        check('插值缓冲里是当前 tick 的状态（id 对齐）', state_ok['ok'],
              str(state_ok))

        pg.screenshot(path=os.path.join(SHOTS, '_interp.png'), full_page=True)
        check('全程没有 console 报错', not errs, str(errs[:2]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('渲染插值验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
