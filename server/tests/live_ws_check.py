#!/usr/bin/env python3
"""对真实运行中的服务做一次"真 socket"联机验证（不属于单元测试）。

单元测试用的是 TestClient（进程内），这里走真正的 TCP WebSocket，
确认锁步转发在真实网络栈上也成立。

用法：
    1) 先起服务   python run_local.py
    2) 再跑本脚本 python tests/live_ws_check.py [http://127.0.0.1:8080]
"""
import asyncio
import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
WS_BASE = BASE.replace('http://', 'ws://').replace('https://', 'wss://')


def post(path, body, token=None):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode('utf-8'), method='POST',
        headers={'Content-Type': 'application/json',
                 **({'Authorization': f'Bearer {token}'} if token else {})})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode('utf-8'))


def get(path, token=None):
    req = urllib.request.Request(
        BASE + path, headers={'Authorization': f'Bearer {token}'} if token else {})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode('utf-8'))


def make_player(name):
    uname = f'live_{name}'
    try:
        reg = post('/api/auth/register', {'username': uname, 'password': 'pass1234'})
    except Exception:      # 已存在就登录
        reg = post('/api/auth/login', {'username': uname, 'password': 'pass1234'})
    token = reg['access_token']
    dogs = get('/api/dogs/mine', token)
    if not dogs:
        post('/api/dogs/adopt', {'name': f'{name}的狗', 'breed_code': 'samoyed'}, token)
        dogs = get('/api/dogs/mine', token)
    return token, dogs[0]


async def main():
    import websockets
    t1, dog1 = make_player('alpha')
    t2, dog2 = make_player('beta')
    print(f'玩家1 {dog1["name"]} / 玩家2 {dog2["name"]}')

    room = post('/api/match', {'mode': 'pvp'}, t1)['room_code']
    print(f'房间 {room}')

    url1 = f'{WS_BASE}/ws/match/{room}?token={t1}'
    url2 = f'{WS_BASE}/ws/match/{room}?token={t2}'
    async with websockets.connect(url1) as ws1:
        w1 = json.loads(await ws1.recv())
        print(f'  ws1 welcome: side={w1["side"]} seed={w1["seed"]}')
        async with websockets.connect(url2) as ws2:
            w2 = json.loads(await ws2.recv())
            print(f'  ws2 welcome: side={w2["side"]}')
            print(f'  ws1 peer_joined: {json.loads(await ws1.recv())["type"]}')

            await ws1.send(json.dumps({'type': 'ready'}))
            print(f'  ws2 收到: {json.loads(await ws2.recv())["type"]}')
            await ws2.send(json.dumps({'type': 'ready'}))
            print(f'  ws1 收到: {json.loads(await ws1.recv())["type"]}')
            print(f'  ws1 start: {json.loads(await ws1.recv())["type"]}')
            print(f'  ws2 start: {json.loads(await ws2.recv())["type"]}')

            # 双方各发 30 帧输入，核对全部原样到达（锁步的关键）
            frames = 30
            async def pump(ws, side):
                for i in range(1, frames + 1):
                    await ws.send(json.dumps({'type': 'input', 'frame': i,
                                              'keys': [side, i % 3, 0]}))
                    await asyncio.sleep(0)
            recv1, recv2 = [], []
            async def collect(ws, bucket, expect_side):
                while len(bucket) < frames:
                    m = json.loads(await ws.recv())
                    if m.get('type') == 'input':
                        assert m['side'] == expect_side, m
                        bucket.append((m['frame'], tuple(m['keys'])))
            await asyncio.gather(pump(ws1, 0), pump(ws2, 1),
                                 collect(ws1, recv1, 1), collect(ws2, recv2, 0))

            ok1 = [f for f, _ in recv1] == list(range(1, frames + 1))
            ok2 = [f for f, _ in recv2] == list(range(1, frames + 1))
            print(f'  ws1 收到对手 {len(recv1)} 帧，序号连续={ok1}')
            print(f'  ws2 收到对手 {len(recv2)} 帧，序号连续={ok2}')
            assert ok1 and ok2, '锁步转发丢帧或乱序'

            await ws1.send(json.dumps({'type': 'ping', 't': 7}))
            pong = json.loads(await ws1.recv())
            print(f'  ping/pong: {pong}')

    # 回放日志应已落库
    rep = get(f'/api/match/{room}/replay')
    print(f'  回放：输入帧 {len(rep["inputs"])} 条，seed={rep["seed"]}')
    assert len(rep['inputs']) >= frames * 2 - 2, '回放日志不完整'
    print('\n真 socket 联机验证通过 ✅')


if __name__ == '__main__':
    asyncio.run(main())
