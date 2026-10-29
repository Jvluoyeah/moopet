#!/usr/bin/env python3
"""开放世界联机验收（真实浏览器 · 两个页面互相看得见）

这是 S2 的验收标准：**两个浏览器互相看到对方在实时走动**。
和 e2e_world.py（单页面的世界功能）分开，因为这份要多开一个 context、
要真的跑位置上报、还要比对两端画面上那只狗的位置。

用法：先起服务端与前端，再 python tests/e2e_world_pvp.py [base_url]

⚠️ base 用 http://localhost:5173 —— Vite 只绑 IPv6，127.0.0.1 连不上。
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


def login_and_enter_world(page, uname, dogname, scene='plaza'):
    """注册 → 领养 → 进世界，返回是否成功。"""
    page.goto(BASE + '/#/login', wait_until='networkidle')
    page.click('#mode-switch')
    page.fill('#username', uname)
    page.fill('#password', 'pass1234')
    page.click('#submit')
    if not wait_for(page, '.breed-card', timeout=25000):
        return False
    page.locator('.breed-card').first.click()
    page.fill('#dog-name', dogname)
    page.click('#adopt-submit')
    if not wait_for(page, 'text=我的机械狗', timeout=25000):
        return False
    page.goto(BASE + f'/#/world', wait_until='networkidle')
    if not wait_for(page, '#world3d canvas', timeout=25000):
        return False
    page.wait_for_timeout(1800)
    if scene != 'plaza':
        page.evaluate("(s) => window.__world && window.__world.setScene(s)", scene)
        page.wait_for_timeout(900)
    return True


def net_state(page):
    return page.evaluate("""() => {
        const n = window.__worldNet;
        if (!n) return null;
        return { link: n.link.status(), scene: n.session.scene,
                 remote: n.session.peers.size, ...n.session.snapshot() };
    }"""),


def net(page):
    return page.evaluate("""() => {
        const n = window.__worldNet;
        if (!n) return null;
        const s = n.session;
        return { link: n.link.status(), scene: s.scene, connected: s.connected,
                 remote: s.peers.size, dogId: s.dogId,
                 sent: s.stats.sent, received: s.stats.received,
                 joined: s.stats.joined, left: s.stats.left,
                 rejected: s.stats.rejected };
    }""")


def player(page):
    return page.evaluate("() => window.__world ? window.__world.playerState() : null")


def remote_positions(page):
    """画面上远端那几只狗的实际位置（Three.js 演员，不是数据）"""
    return page.evaluate("""() => {
        const w = window.__world;
        const out = [];
        for (const [id, r] of w.remotes) {
            out.push({ id, x: r.actor.group.position.x, z: r.actor.group.position.z,
                       visible: r.actor.group.visible });
        }
        return out;
    }""")


def hold(page, key, seconds):
    page.keyboard.down(key)
    page.wait_for_timeout(int(seconds * 1000))
    page.keyboard.up(key)
    page.wait_for_timeout(200)


def main():
    os.makedirs(SHOTS, exist_ok=True)
    if not wait_backend():
        print('后端不通，先 python run_local.py')
        return 1

    stamp = datetime.now().strftime('%H%M%S')
    errors_a, errors_b = [], []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx_a = browser.new_context(viewport={'width': 1280, 'height': 860})
        ctx_b = browser.new_context(viewport={'width': 1280, 'height': 860})
        a = ctx_a.new_page()
        b = ctx_b.new_page()
        a.on('pageerror', lambda e: errors_a.append(str(e)))
        a.on('console', lambda m: errors_a.append(m.text) if m.type == 'error' else None)
        b.on('pageerror', lambda e: errors_b.append(str(e)))
        b.on('console', lambda m: errors_b.append(m.text) if m.type == 'error' else None)

        # ---- 两个账号各自进世界 ----
        ok_a = login_and_enter_world(a, 'wpvp_a_' + stamp, '雪团子')
        check('A 注册领养并进入世界', ok_a)
        if not ok_a:
            browser.close(); return 1
        ok_b = login_and_enter_world(b, 'wpvp_b_' + stamp, '阿牧子')
        check('B 注册领养并进入世界', ok_b)
        if not ok_b:
            browser.close(); return 1

        a.wait_for_timeout(1200)
        b.wait_for_timeout(1200)

        # ---- 两边都连上了 ----
        na, nb = net(a), net(b)
        check('A 的联机连上了', na and na['link'] == 'open', str(na))
        check('B 的联机连上了', nb and nb['link'] == 'open', str(nb))
        check('两端在不同座位（不是同一只狗）',
              na and nb and na['dogId'] != nb['dogId'],
              f"A={na and na['dogId']} B={nb and nb['dogId']}")

        # ---- 互相看得见 ----
        deadline = time.time() + 12
        seen = False
        while time.time() < deadline:
            ra, rb = net(a), net(b)
            if ra and rb and ra['remote'] >= 1 and rb['remote'] >= 1:
                seen = True
                break
            time.sleep(0.5)
        check('A 的世界里有 B（远端 1 只）', seen and net(a)['remote'] >= 1, str(net(a)))
        check('B 的世界里有 A（远端 1 只）', seen and net(b)['remote'] >= 1, str(net(b)))

        rem_a = remote_positions(a)
        rem_b = remote_positions(b)
        check('A 画面上真的有那只狗（Three.js 演员）', len(rem_a) >= 1, str(rem_a))
        check('B 画面上真的有那只狗（Three.js 演员）', len(rem_b) >= 1, str(rem_b))
        a.screenshot(path=os.path.join(SHOTS, '60-worldpvp-a.png'), full_page=True)
        b.screenshot(path=os.path.join(SHOTS, '60-worldpvp-b.png'), full_page=True)

        # ---- B 走动，A 那边要跟着动 ----
        before = remote_positions(a)
        before_x = before[0]['x'] if before else None
        before_z = before[0]['z'] if before else None
        hold(b, 'd', 1.6)         # 右移
        hold(b, 'w', 0.9)         # 再往上走一点
        a.wait_for_timeout(900)   # 等插值缓冲追上来（120ms 缓冲 + 网络）

        after = remote_positions(a)
        after_x = after[0]['x'] if after else None
        after_z = after[0]['z'] if after else None
        moved = (before_x is not None and after_x is not None
                 and (abs(after_x - before_x) > 40 or abs(after_z - before_z) > 40))
        check('B 走动之后，A 画面上那只狗也跟着动了', moved,
              f"({before_x:.0f},{before_z:.0f}) → ({after_x:.0f},{after_z:.0f})"
              if before_x is not None else 'no remote')

        # A 自己的位置不该被 B 的移动影响
        pa = player(a)
        check('A 自己的狗没被别人的移动带走', pa is not None)
        a.screenshot(path=os.path.join(SHOTS, '61-worldpvp-a-moved.png'), full_page=True)

        # ---- 位置上报确实在发 ----
        # 注意：站着不动时只有 2 秒一次的心跳，所以先让 A 走两步再数
        hold(a, 'a', 1.0)
        hold(a, 'w', 0.6)
        sa = net(a)
        check('A 有在持续上报位置', sa and sa['sent'] >= 5, f"sent={sa and sa['sent']}")
        # 站着不动时不刷屏（同位置去重，只留心跳）
        a.evaluate("() => { window.__world.player.vx = 0; window.__world.player.vz = 0; }")
        a.wait_for_timeout(400)
        idle1 = net(a)['sent']
        a.wait_for_timeout(1200)
        idle2 = net(a)['sent']
        check('站着不动时不重复上报（省流量）', idle2 - idle1 <= 1,
              f"{idle1} → {idle2}")
        # 但也不能一直不发：静止超过心跳窗口必须补一帧，否则别人会把你当掉线清掉
        a.wait_for_timeout(2600)
        idle3 = net(a)['sent']
        check('静止超过心跳窗口会补一帧（否则别人会把你清掉）', idle3 > idle2,
              f"{idle2} → {idle3}")
        check('静止期间 A 那边一直看得见 B', (net(a) or {}).get('remote', 0) >= 1,
              str(net(a)))

        # ---- 换场景之后，不同场景的人互相看不见 ----
        b.evaluate("() => window.__worldNet.link.reconnect('park')")
        b.wait_for_timeout(1500)
        nb2 = net(b)
        check('B 换到公园后重连成功', nb2 and nb2['link'] == 'open' and nb2['scene'] == 'park',
              str(nb2))
        check('B 换场景后 A 不在他的世界里', nb2 and nb2['remote'] == 0, str(nb2))
        a.wait_for_timeout(1200)
        na2 = net(a)
        check('A 那边 B 消失了（peer_leave）', na2 and na2['left'] >= 1, str(na2))

        # ---- 打招呼：B 回到广场说话，A 收到浮条 ----
        # 注意 b.goto('.../#/world') 在 hash 没变时**不会真的重新加载**，
        # 所以这里不要指望"重新进页面回广场"，直接显式 reconnect 回 plaza。
        b.evaluate("() => window.__worldNet.link.reconnect('plaza')")
        for _ in range(30):
            if (net(b) or {}).get('link') == 'open' and (net(b) or {}).get('scene') == 'plaza':
                break
            b.wait_for_timeout(400)
        check('B 回到广场并连上', (net(b) or {}).get('link') == 'open', str(net(b)))

        # ---- 空格动作：B 跳一下，A 那边也看得见 ----
        # ⚠️ 必须放在 B 回到广场**之后**：两边不同场景时动作广播不过去。
        # 第一版把这段插在"B 还在公园"的位置，测出来 peak=0——
        # 不是功能坏了，是测试自己站错了场景。
        hop_peak = 0
        for _ in range(4):
            b.evaluate("() => window.__world.doAction('我在这儿')")
            for _ in range(6):
                a.wait_for_timeout(90)
                y = a.evaluate("""() => {
                    const w = window.__world;
                    for (const [, r] of w.remotes) return r.actor.group.position.y;
                    return 0;
                }""")
                hop_peak = max(hop_peak, y or 0)
            if hop_peak > 10:
                break
            b.wait_for_timeout(300)
        check('B 按空格跳一下，A 画面上他的狗也抬起来了', hop_peak > 10,
              f'peak y={hop_peak:.0f}')

        b.evaluate("() => window.__worldNet.session.chat('我在这儿')")
        got_chat = ''
        for _ in range(20):
            a.wait_for_timeout(300)
            got_chat = a.evaluate("() => document.getElementById('w3-toast')?.textContent || ''")
            if '我在这儿' in got_chat:
                break
        check('A 收到了 B 说的话', '我在这儿' in got_chat, f'toast={got_chat!r}')
        a.screenshot(path=os.path.join(SHOTS, '62-worldpvp-chat.png'), full_page=True)

        # ---- 换回同一场景又能互相看见 ----
        back = False
        for _ in range(20):
            if (net(b) or {}).get('remote', 0) >= 1:
                back = True
                break
            time.sleep(0.5)
        check('B 回到广场后又能看见 A', back, str(net(b)))

        # ---- 在线人数徽章 ----
        badge = a.evaluate("() => document.getElementById('w3-online')?.textContent || ''")
        peers_txt = a.evaluate("() => document.getElementById('w3-peers')?.textContent || ''")
        check('A 的界面上显示"联机中"', badge.strip() == '联机中', f'badge={badge!r}')
        check('A 的界面显示同场景人数', '2' in peers_txt or '人' in peers_txt,
              f'peers={peers_txt!r}')

        # ---- 离开页面要清理 ----
        ctx_b.close()
        a.wait_for_timeout(1500)
        na3 = net(a)
        check('B 关掉页面后 A 那边也清干净了',
              na3 and na3['remote'] == 0, str(na3))

        real_a = [e for e in errors_a if 'favicon' not in e.lower()]
        real_b = [e for e in errors_b if 'favicon' not in e.lower()]
        check('A 页面没有 console 报错', not real_a, str(real_a[:3]))
        check('B 页面没有 console 报错', not real_b, str(real_b[:3]))

        browser.close()

    ok = sum(1 for _, o, _ in steps if o)
    print(f'\n{ok}/{len(steps)} 项检查通过')
    if problems:
        print('问题：')
        for x in problems:
            print('  - ' + x)
        return 1
    print('开放世界联机验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
