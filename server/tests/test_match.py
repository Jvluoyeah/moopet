#!/usr/bin/env python3
"""对战用例：撮合 / 结算 / 领奖 / 排行榜 / 锁步 WebSocket 转发 / 掉线接管。"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from helpers import (adopt, auth_header, cleanup_all, full_user,  # noqa: E402
                     make_client, register)


def two_users(c):
    t1, card1 = full_user(c, 'alice')
    t2, card2 = full_user(c, 'bob')
    return (t1, card1['dog']['id']), (t2, card2['dog']['id'])


# ---------------- 撮合与结算 ----------------
def test_create_ai_match_has_two_seats():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    r = c.post('/api/match', json={'mode': 'ai'}, headers=auth_header(token))
    assert r.status_code == 201
    body = r.json()
    assert body['mode'] == 'ai' and body['status'] == 'playing'
    assert len(body['players']) == 2
    assert body['players'][1]['is_ai'] is True
    assert body['seed'] > 0


def test_create_pvp_match_waits_and_then_joins_by_ws():
    c, _ = make_client()
    (t1, _), (t2, _) = two_users(c)
    room = c.post('/api/match', json={'mode': 'pvp'},
                  headers=auth_header(t1)).json()
    assert room['status'] == 'waiting'
    code = room['room_code']
    with c.websocket_connect(f'/ws/match/{code}?token={t1}') as ws1:
        assert ws1.receive_json()['type'] == 'welcome'
        with c.websocket_connect(f'/ws/match/{code}?token={t2}') as ws2:
            assert ws2.receive_json()['type'] == 'welcome'
            got = ws1.receive_json()
            assert got['type'] == 'peer_joined' and got['side'] == 1
    # 对局状态被推进到 playing
    assert c.get(f'/api/match/{code}').json()['status'] in ('playing', 'done')


def test_shadow_match_picks_opponent():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    r = c.post('/api/match', json={'mode': 'shadow'}, headers=auth_header(token))
    assert r.status_code == 201
    body = r.json()
    assert body['result'].get('shadow_of'), '影子对战要记下对手是谁'
    assert body['players'][1]['display_name'] != 'AI 陪练'


def test_shadow_match_with_explicit_opponent():
    c, _ = make_client()
    (t1, _), (t2, dog2) = two_users(c)
    r = c.post('/api/match', json={'mode': 'shadow', 'opponent_dog_id': dog2},
               headers=auth_header(t1))
    assert r.status_code == 201
    assert r.json()['players'][1]['dog_id'] == dog2


def test_match_requires_dog_and_login():
    c, _ = make_client()
    assert c.post('/api/match', json={'mode': 'ai'}).status_code == 401
    token = register(c, username='alice')['access_token']
    assert c.post('/api/match', json={'mode': 'ai'},
                  headers=auth_header(token)).status_code == 409   # 没领养


def test_unknown_room_404():
    c, _ = make_client()
    assert c.get('/api/match/ZZZZZZ').status_code == 404
    assert c.post('/api/match/ZZZZZZ/result', json={'frames': 1}).status_code == 401


def test_result_settlement_win_draw_lose():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')

    def play(scores, winner):
        room = c.post('/api/match', json={'mode': 'ai'},
                      headers=auth_header(token)).json()['room_code']
        r = c.post(f'/api/match/{room}/result',
                   json={'frames': 900, 'scores': scores, 'winner_side': winner},
                   headers=auth_header(token))
        assert r.status_code == 200, r.text
        return r.json()

    win = play([3, 1], 0)
    assert win['result']['verdict'] == 'win' and win['pending_exp'] == 60
    lose = play([1, 3], 1)
    assert lose['result']['verdict'] == 'lose' and lose['pending_exp'] == 20
    draw = play([2, 2], None)
    assert draw['result']['verdict'] == 'draw' and draw['pending_exp'] == 35


def test_result_infers_winner_from_scores():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    room = c.post('/api/match', json={'mode': 'ai'},
                  headers=auth_header(token)).json()['room_code']
    r = c.post(f'/api/match/{room}/result', json={'frames': 100, 'scores': [5, 2]},
               headers=auth_header(token))
    assert r.json()['result']['winner_side'] == 0


def test_result_is_idempotent():
    """重复上报不能重复发奖（防作弊的基本要求）。"""
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    room = c.post('/api/match', json={'mode': 'ai'},
                  headers=auth_header(token)).json()['room_code']
    first = c.post(f'/api/match/{room}/result',
                   json={'frames': 10, 'scores': [3, 0], 'winner_side': 0},
                   headers=auth_header(token)).json()
    second = c.post(f'/api/match/{room}/result',
                    json={'frames': 999, 'scores': [9, 9], 'winner_side': 1},
                    headers=auth_header(token)).json()
    assert first['pending_exp'] == second['pending_exp'] == 60
    assert second['frames'] == 10            # 第二次上报不改已结算的数据


def test_claim_once_only():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    room = c.post('/api/match', json={'mode': 'ai'},
                  headers=auth_header(token)).json()['room_code']
    c.post(f'/api/match/{room}/result',
           json={'frames': 10, 'scores': [3, 0], 'winner_side': 0},
           headers=auth_header(token))
    first = c.post(f'/api/match/{room}/claim', headers=auth_header(token)).json()
    assert first['exp'] == 60 and first['already_claimed'] is False
    again = c.post(f'/api/match/{room}/claim', headers=auth_header(token)).json()
    assert again['exp'] == 0 and again['already_claimed'] is True


def test_claim_before_finish_rejected():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    room = c.post('/api/match', json={'mode': 'ai'},
                  headers=auth_header(token)).json()['room_code']
    r = c.post(f'/api/match/{room}/claim', headers=auth_header(token))
    assert r.status_code == 409


def test_claim_by_outsider_forbidden():
    c, _ = make_client()
    (t1, _), (t2, _) = two_users(c)
    room = c.post('/api/match', json={'mode': 'ai'},
                  headers=auth_header(t1)).json()['room_code']
    c.post(f'/api/match/{room}/result', json={'frames': 5, 'scores': [3, 0],
                                              'winner_side': 0},
           headers=auth_header(t1))
    assert c.post(f'/api/match/{room}/claim',
                  headers=auth_header(t2)).status_code == 403


def test_match_leaderboard_counts_win():
    c, _ = make_client()
    token, card = full_user(c, 'alice')
    room = c.post('/api/match', json={'mode': 'ai'},
                  headers=auth_header(token)).json()['room_code']
    c.post(f'/api/match/{room}/result', json={'frames': 5, 'scores': [3, 0],
                                              'winner_side': 0},
           headers=auth_header(token))
    board = c.get('/api/leaderboard?kind=match', headers=auth_header(token)).json()
    mine = [r for r in board['rows'] if r['dog_id'] == card['dog']['id']][0]
    assert mine['score'] == 3 and mine['wins'] == 1 and mine['is_me'] is True


def test_replay_returns_input_log_after_ws_play():
    c, _ = make_client()
    (t1, _), (t2, _) = two_users(c)
    code = c.post('/api/match', json={'mode': 'pvp'},
                  headers=auth_header(t1)).json()['room_code']
    with c.websocket_connect(f'/ws/match/{code}?token={t1}') as ws1:
        ws1.receive_json()
        with c.websocket_connect(f'/ws/match/{code}?token={t2}') as ws2:
            ws2.receive_json()
            ws1.receive_json()                      # peer_joined
            ws1.send_json({'type': 'input', 'frame': 1, 'keys': [1, 0, 0]})
            ws2.receive_json()
            ws1.send_json({'type': 'input', 'frame': 2, 'keys': [0, 1, 0]})
            ws2.receive_json()
    r = c.get(f'/api/match/{code}/replay')
    assert r.status_code == 200
    body = r.json()
    assert body['seed'] > 0
    assert [i['frame'] for i in body['inputs']] == [1, 2]
    assert body['inputs'][0]['side'] == 0


# ---------------- 锁步 WebSocket ----------------
def test_ws_lockstep_relays_inputs_both_ways():
    c, _ = make_client()
    (t1, _), (t2, _) = two_users(c)
    code = c.post('/api/match', json={'mode': 'pvp'},
                  headers=auth_header(t1)).json()['room_code']
    with c.websocket_connect(f'/ws/match/{code}?token={t1}') as ws1:
        w1 = ws1.receive_json()
        assert w1['type'] == 'welcome' and w1['side'] == 0
        assert w1['seed'] > 0 and w1['room'] == code
        with c.websocket_connect(f'/ws/match/{code}?token={t2}') as ws2:
            w2 = ws2.receive_json()
            assert w2['type'] == 'welcome' and w2['side'] == 1
            assert ws1.receive_json()['type'] == 'peer_joined'

            # 双方就绪 → 广播 start
            ws1.send_json({'type': 'ready'})
            assert ws2.receive_json()['type'] == 'ready'
            ws2.send_json({'type': 'ready'})
            assert ws1.receive_json()['type'] == 'ready'
            assert ws1.receive_json()['type'] == 'start'
            assert ws2.receive_json()['type'] == 'start'

            # 输入帧双向转发（锁步的核心）
            ws1.send_json({'type': 'input', 'frame': 1, 'keys': [1, 0, 2]})
            got = ws2.receive_json()
            assert got['type'] == 'input' and got['side'] == 0
            assert got['frame'] == 1 and got['keys'] == [1, 0, 2]

            ws2.send_json({'type': 'input', 'frame': 1, 'keys': [0, 1, 0]})
            got = ws1.receive_json()
            assert got['type'] == 'input' and got['side'] == 1
            assert got['keys'] == [0, 1, 0]


def test_ws_ping_pong():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    code = c.post('/api/match', json={'mode': 'pvp'},
                  headers=auth_header(token)).json()['room_code']
    with c.websocket_connect(f'/ws/match/{code}?token={token}') as ws:
        ws.receive_json()
        ws.send_json({'type': 'ping', 't': 42})
        got = ws.receive_json()
        assert got['type'] == 'pong' and got['t'] == 42


def test_ws_rejects_bad_token():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    code = c.post('/api/match', json={'mode': 'pvp'},
                  headers=auth_header(token)).json()['room_code']
    with c.websocket_connect(f'/ws/match/{code}?token=nonsense') as ws:
        got = ws.receive_json()
        assert got['type'] == 'error'


def test_ws_unknown_room_error():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    with c.websocket_connect(f'/ws/match/NOPE99?token={token}') as ws:
        assert ws.receive_json()['type'] == 'error'


def test_ws_unknown_message_type_errors():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    code = c.post('/api/match', json={'mode': 'pvp'},
                  headers=auth_header(token)).json()['room_code']
    with c.websocket_connect(f'/ws/match/{code}?token={token}') as ws:
        ws.receive_json()
        ws.send_json({'type': 'dance'})
        got = ws.receive_json()
        assert got['type'] == 'error' and 'dance' in got['detail']


def test_ws_disconnect_triggers_ai_takeover_notice():
    """对手掉线 → 剩下的一方必须收到通知去切 AI 接管，否则对局会卡死。"""
    c, _ = make_client()
    (t1, _), (t2, _) = two_users(c)
    code = c.post('/api/match', json={'mode': 'pvp'},
                  headers=auth_header(t1)).json()['room_code']
    with c.websocket_connect(f'/ws/match/{code}?token={t1}') as ws1:
        ws1.receive_json()
        with c.websocket_connect(f'/ws/match/{code}?token={t2}') as ws2:
            ws2.receive_json()
            ws1.receive_json()                   # peer_joined
        got = ws1.receive_json()                 # ws2 已断开
        assert got['type'] == 'peer_left'
        assert got['side'] == 1
        assert got['takeover'] == 'ai'


def test_leaderboard_kinds_and_unknown_kind_falls_back():
    c, _ = make_client()
    kinds = c.get('/api/leaderboard/kinds').json()
    assert {k['kind'] for k in kinds} == {'level', 'match', 'social'}
    body = c.get('/api/leaderboard?kind=whatever').json()
    assert body['kind'] == 'level'


def test_leaderboard_me_outside_top_n():
    c, _ = make_client()
    token, card = full_user(c, 'alice')
    # 用很小的 limit，让自己的狗排不进榜，但仍要能拿到自己的名次
    body = c.get('/api/leaderboard?kind=level&limit=1',
                 headers=auth_header(token)).json()
    assert body['me'] is not None
    assert body['me']['dog_id'] == card['dog']['id']


if __name__ == '__main__':
    fns = [(k, v) for k, v in sorted(globals().items())
           if k.startswith('test_') and callable(v)]
    failed = 0
    for name, fn in fns:
        try:
            fn()
            print(f'  [PASS] {name}')
        except Exception as e:      # noqa: BLE001
            failed += 1
            print(f'  [FAIL] {name}: {type(e).__name__}: {e}')
    print(f'{len(fns) - failed}/{len(fns)} passed')
    cleanup_all()
    sys.exit(1 if failed else 0)
