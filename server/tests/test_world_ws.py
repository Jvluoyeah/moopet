#!/usr/bin/env python3
"""开放世界联机用例：/ws/world/{scene} 的房间、位置校验、广播、落库。

这里测的是"服务端有没有守住那三条线"（边界 / 速度 / 限频）以及
"别人动不动得起来"——纯服务端逻辑，不需要浏览器。
浏览器两端互见的端到端在 web/tests/e2e_world_pvp.py。

⚠️ 写法上有个坑：TestClient 的 `receive_json()` 在队列空时是**阻塞**的，
   不会抛异常。所以不能写"把排队的消息都读出来"这种循环（会卡死整个测试进程），
   一律用 `_barrier()`：发一个 ping、一路读到 pong，
   途中收到的就是"这之前该到的消息"，顺序也一并验证了。
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

from helpers import full_user, make_client   # noqa: E402


def _user(c, name='alice'):
    """注册 + 领养，返回 (token, dog_id)。"""
    token, card = full_user(c, name)
    return token, card['dog']['id']


def _barrier(ws, t=1):
    """发 ping 读到 pong，返回途中收到的消息列表。非阻塞（pong 一定会来）。"""
    ws.send_json({'type': 'ping', 't': t})
    seen = []
    while True:
        msg = ws.receive_json()
        if msg.get('type') == 'pong':
            return seen
        seen.append(msg)


def _welcome(ws):
    w = ws.receive_json()
    assert w['type'] == 'welcome', w
    return w


# ---------------- 基本进出 ----------------

def test_world_ws_welcome_and_bounds():
    c, _ = make_client()
    t, dog_id = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/plaza?token={t}') as ws:
        w = _welcome(ws)
        assert w['scene'] == 'plaza'
        assert w['dog_id'] == dog_id
        assert w['bounds'] == {'w': 2200, 'd': 1700}, w['bounds']
        assert w['report_hz'] == 10
        assert isinstance(w['peers'], list) and w['peers'] == []


def test_world_ws_rejects_unknown_scene():
    c, _ = make_client()
    t, _ = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/moon?token={t}') as ws:
        msg = ws.receive_json()
        assert msg['type'] == 'error' and '没有这个场景' in msg['detail'], msg


def test_world_ws_rejects_bad_token():
    c, _ = make_client()
    with c.websocket_connect('/ws/world/plaza?token=nope') as ws:
        msg = ws.receive_json()
        assert msg['type'] == 'error', msg


def test_world_ws_requires_adopted_dog():
    c, _ = make_client()
    # 只注册、不领养：世界接口要明确说"先去领养"，而不是丢个 500
    r = c.post('/api/auth/register',
               json={'username': 'nodog', 'password': 'pass1234', 'email': ''})
    assert r.status_code == 201, r.text
    raw = r.json()['access_token']
    with c.websocket_connect(f'/ws/world/plaza?token={raw}') as ws:
        msg = ws.receive_json()
        assert msg['type'] == 'error' and '领养' in msg['detail'], msg


def test_world_ws_ping_pong():
    c, _ = make_client()
    t, _ = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/plaza?token={t}') as ws:
        _welcome(ws)
        ws.send_json({'type': 'ping', 't': 7})
        got = ws.receive_json()
        assert got['type'] == 'pong' and got['t'] == 7


# ---------------- 两个人互相看得见 ----------------

def test_world_ws_two_peers_see_each_other_move():
    c, _ = make_client()
    t1, id1 = _user(c, 'alice')
    t2, id2 = _user(c, 'bob')
    with c.websocket_connect(f'/ws/world/plaza?token={t1}') as ws1:
        me1 = _welcome(ws1)
        with c.websocket_connect(f'/ws/world/plaza?token={t2}') as ws2:
            me2 = _welcome(ws2)
            # 后进来的人应该在快照里看到先来的
            assert any(p['dog_id'] == id1 for p in me2['peers']), me2['peers']
            # 先来的收到"有人进来了"（连着 peer_join 一起，在 barrier 里断言）
            trail = _barrier(ws1)
            joins = [m for m in trail if m['type'] == 'peer_join']
            assert joins and joins[0]['peer']['dog_id'] == id2, trail

            # 2 号移动到 1 号附近，1 号应该收到 peer_move
            ws2.send_json({'type': 'move', 'x': me1['me']['x'] + 40,
                           'z': me1['me']['z'] + 40, 'facing': 1, 'status': 'run'})
            trail = _barrier(ws1)
            moves = [m for m in trail if m['type'] == 'peer_move']
            assert moves, f'先来的没收到移动广播：{trail}'
            m = moves[0]
            assert m['dog_id'] == id2 and m['status'] == 'run' and m['facing'] == 1
            assert abs(m['x'] - (me1['me']['x'] + 40)) < 1.5

            # 自己不该收到自己的移动（否则客户端会把自己当远端画两遍）：
            # barrier 里如果混进了自己的 peer_move，这里就会炸
            trail = _barrier(ws2)
            mine = [x for x in trail if x.get('dog_id') == id2]
            assert not mine, mine


def test_world_ws_leave_notifies_peers():
    c, _ = make_client()
    t1, _ = _user(c, 'alice')
    t2, id2 = _user(c, 'bob')
    with c.websocket_connect(f'/ws/world/plaza?token={t1}') as ws1:
        _welcome(ws1)
        with c.websocket_connect(f'/ws/world/plaza?token={t2}') as ws2:
            _welcome(ws2)
            _barrier(ws1)                     # 消化掉 peer_join
        trail = _barrier(ws1)
        left = [m for m in trail if m['type'] == 'peer_leave']
        assert left and left[0]['dog_id'] == id2, trail


def test_world_ws_scenes_are_isolated():
    c, _ = make_client()
    t1, id1 = _user(c, 'alice')
    t2, _ = _user(c, 'bob')
    with c.websocket_connect(f'/ws/world/plaza?token={t1}') as ws1:
        _welcome(ws1)
        with c.websocket_connect(f'/ws/world/kennel?token={t2}') as ws2:
            me2 = _welcome(ws2)
            assert me2['scene'] == 'kennel'
            assert all(p['dog_id'] != id1 for p in me2['peers'])
            # 广场那边不该收到任何 peer_join（barrier 里出现就说明串场景了）
            trail = _barrier(ws1)
            assert not [m for m in trail if m['type'] == 'peer_join'], trail


# ---------------- 位置校验三条线 ----------------

def test_world_ws_rejects_out_of_bounds():
    c, _ = make_client()
    t, _ = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/plaza?token={t}') as ws:
        w = _welcome(ws)
        ws.send_json({'type': 'move', 'x': 99999, 'z': 10})
        got = ws.receive_json()
        assert got['type'] == 'reject' and got['detail'] == 'out_of_bounds', got
        assert got['x'] == w['me']['x']   # 被拒之后位置没动


def test_world_ws_rejects_teleport():
    c, _ = make_client()
    t, _ = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/plaza?token={t}') as ws:
        w = _welcome(ws)
        x, z = w['me']['x'], w['me']['z']
        # 一瞬间跳 800 格（远超 520 格/秒 + 40 格宽限）
        ws.send_json({'type': 'move', 'x': x + 800, 'z': z})
        got = ws.receive_json()
        assert got['type'] == 'reject' and got['detail'] == 'too_fast', got


def test_world_ws_accepts_normal_run_speed():
    c, _ = make_client()
    t, _ = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/plaza?token={t}') as ws:
        w = _welcome(ws)
        x, z = w['me']['x'], w['me']['z']
        # 10Hz 上报、430 格/秒的跑速 → 每帧 43 格，远在宽限内
        for i in range(1, 6):
            ws.send_json({'type': 'move', 'x': x - 43 * i, 'z': z,
                          'facing': -1, 'status': 'run'})
        trail = _barrier(ws)
        assert not [m for m in trail if m['type'] == 'reject'], trail


def test_world_ws_rejects_bad_numbers():
    c, _ = make_client()
    t, _ = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/plaza?token={t}') as ws:
        _welcome(ws)
        ws.send_json({'type': 'move', 'x': 'abc', 'z': 1})
        got = ws.receive_json()
        assert got['type'] == 'reject' and got['detail'] == 'bad_number', got


def test_world_hub_speed_check_is_time_based():
    """validate_move 的直接单测：同样 200 格，时间够就放行、时间不够就拒。"""
    from app.ws.world_hub import Peer, WorldHub
    hub = WorldHub()
    room = hub.room('plaza')
    p = Peer(1, 't', None)
    p.x, p.z = 100.0, 100.0
    now = time.monotonic()

    p.last_at = now
    ok, why = hub.validate_move(room, p, 300.0, 100.0, now=now + 0.01)
    assert not ok and why == 'too_fast', (ok, why)   # 10ms 走 200 格 = 20000 格/秒

    p.last_at = now
    ok, why = hub.validate_move(room, p, 300.0, 100.0, now=now + 1.0)
    assert ok, why                                    # 1 秒走 200 格 = 200 格/秒


def test_world_hub_grace_allows_small_jitter():
    from app.ws.world_hub import MOTION, Peer, WorldHub
    hub = WorldHub()
    room = hub.room('plaza')
    p = Peer(1, 't', None)
    p.x, p.z = 100.0, 100.0
    now = time.monotonic()
    p.last_at = now
    # 时间几乎没走，但只挪了 grace 以内的距离 → 放行（网络抖动）
    ok, why = hub.validate_move(room, p, 100.0 + MOTION['grace'] - 5, 100.0,
                                now=now + 0.001)
    assert ok, why


def test_world_hub_bounds_are_per_scene():
    from app.ws.world_hub import Peer, WorldHub
    hub = WorldHub()
    p = Peer(1, 't', None)
    now = time.monotonic()
    # 狗窝只有 1500×1150：1600 在广场合法，在狗窝就越界
    p.x, p.z = 900.0, 600.0
    p.last_at = now
    ok, why = hub.validate_move(hub.room('plaza'), p, 1600.0, 600.0, now=now + 5)
    assert ok, why
    p.x, p.z = 900.0, 600.0
    p.last_at = now
    ok, why = hub.validate_move(hub.room('kennel'), p, 1600.0, 600.0, now=now + 5)
    assert not ok and why == 'out_of_bounds', (ok, why)


def test_world_hub_rate_limit():
    from app.ws.world_hub import MOTION, Peer, WorldHub
    hub = WorldHub()
    p = Peer(1, 't', None)
    now = time.monotonic()
    p.msg_window = now
    p.msg_count = 0
    ok_all = [hub.check_rate(p, now=now + 0.001)
              for _ in range(MOTION['max_msg_per_sec'])]
    assert all(ok_all)
    assert hub.check_rate(p, now=now + 0.001) is False      # 超了
    assert hub.stats['rejected_rate'] == 1
    assert hub.check_rate(p, now=now + 2.0) is True         # 新的一秒，重新计数


# ---------------- 动作 / 说话 ----------------

def test_world_ws_action_and_chat_broadcast():
    c, _ = make_client()
    t1, _ = _user(c, 'alice')
    t2, _ = _user(c, 'bob')
    with c.websocket_connect(f'/ws/world/plaza?token={t1}') as ws1:
        _welcome(ws1)
        with c.websocket_connect(f'/ws/world/plaza?token={t2}') as ws2:
            _welcome(ws2)
            _barrier(ws1)                     # 消化 peer_join

            ws2.send_json({'type': 'action', 'action': 'bark', 'bubble': '汪！'})
            trail = _barrier(ws1)
            acts = [m for m in trail if m['type'] == 'peer_action']
            assert acts and acts[0]['action'] == 'bark', trail
            assert acts[0]['bubble'] == '汪！'

            ws2.send_json({'type': 'chat', 'text': '一起去公园吗'})
            trail = _barrier(ws1)
            chats = [m for m in trail if m['type'] == 'peer_chat']
            assert chats and chats[0]['text'] == '一起去公园吗', trail
            assert chats[0]['name'] == 'bob的狗'


def test_world_ws_ignores_empty_chat():
    c, _ = make_client()
    t1, _ = _user(c, 'alice')
    t2, _ = _user(c, 'bob')
    with c.websocket_connect(f'/ws/world/plaza?token={t1}') as ws1:
        _welcome(ws1)
        with c.websocket_connect(f'/ws/world/plaza?token={t2}') as ws2:
            _welcome(ws2)
            _barrier(ws1)
            ws2.send_json({'type': 'chat', 'text': '   '})
            trail = _barrier(ws1)
            assert not [m for m in trail if m['type'] == 'peer_chat'], trail


def test_world_ws_unknown_type_gets_error():
    c, _ = make_client()
    t, _ = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/plaza?token={t}') as ws:
        _welcome(ws)
        ws.send_json({'type': 'fly', 'x': 1})
        got = ws.receive_json()
        assert got['type'] == 'error' and '未知消息类型' in got['detail'], got


# ---------------- 落库 ----------------

def test_world_ws_writes_presence_on_leave():
    c, app = make_client()
    t, dog_id = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/park?token={t}') as ws:
        me = _welcome(ws)['me']
        nx, nz = me['x'] + 40, me['z'] + 30
        ws.send_json({'type': 'move', 'x': nx, 'z': nz, 'status': 'walk'})
        _barrier(ws)
    from app.models import Presence
    db = app.state.session_factory()
    try:
        row = db.get(Presence, dog_id)
        assert row is not None, '断开后应该留下最后位置'
        assert row.scene == 'park'
        assert abs(row.x - nx) < 1.5 and abs(row.y - nz) < 1.5
        assert row.status == 'offline'
    finally:
        db.close()


def test_world_ws_resumes_last_position():
    c, _ = make_client()
    t, _ = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/park?token={t}') as ws:
        me = _welcome(ws)['me']
        mx, mz = me['x'] + 30, me['z'] - 20
        ws.send_json({'type': 'move', 'x': mx, 'z': mz, 'status': 'idle'})
        _barrier(ws)
    with c.websocket_connect(f'/ws/world/park?token={t}') as ws:
        w = _welcome(ws)
        assert abs(w['me']['x'] - mx) < 2 and abs(w['me']['z'] - mz) < 2, w['me']


# ---------------- 与共享场景表一致 ----------------

def test_shared_scene_table_is_used():
    from app.ws.world_hub import MOTION, SCENES
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.normpath(os.path.join(here, '..', 'shared', 'world_scenes.json'))
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    assert set(SCENES) == set(data['scenes']), '服务端没有用共用场景表'
    for code, meta in data['scenes'].items():
        assert SCENES[code]['w'] == meta['w'] and SCENES[code]['d'] == meta['d']
        assert SCENES[code]['spawn'] == meta['spawn']
    assert MOTION['max_speed'] == data['motion']['max_speed']


def test_hub_snapshot_counts_peers():
    c, app = make_client()
    t, _ = _user(c, 'alice')
    with c.websocket_connect(f'/ws/world/plaza?token={t}') as ws:
        _welcome(ws)
        snap = app.state.world_hub.snapshot()
        assert snap['scenes']['plaza']['peers'] == 1
        assert snap['stats']['joins'] >= 1
    snap = app.state.world_hub.snapshot()
    assert snap['scenes']['plaza']['peers'] == 0
    assert snap['stats']['leaves'] >= 1
