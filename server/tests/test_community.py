#!/usr/bin/env python3
"""社群与开放世界用例：公开社群 / 成员 / 场景 / 在场 / 串门。"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from helpers import (auth_header, cleanup_all, full_user,  # noqa: E402
                     make_client, register)


def test_public_community_seeded():
    c, _ = make_client()
    r = c.get('/api/community/public')
    assert r.status_code == 200
    body = r.json()
    assert body['code'] == 'plaza'
    assert body['name'] == '长夜月广场'
    assert body['member_count'] >= 8            # 演示 NPC 已在里面


def test_members_sorted_and_marked_online():
    c, _ = make_client()
    rows = c.get('/api/community/members').json()
    assert len(rows) >= 8
    sl = [m['social_level'] for m in rows]
    assert sl == sorted(sl, reverse=True)
    assert any(m['online'] for m in rows)       # NPC 一直在线，广场才是活的


def test_scenes_list():
    c, _ = make_client()
    rows = c.get('/api/community/scenes').json()
    codes = {s['code'] for s in rows}
    assert codes == {'plaza', 'park', 'kennel', 'arena'}
    assert all(s['name'] for s in rows)


def test_world_plaza_has_npc_dogs():
    c, _ = make_client()
    rows = c.get('/api/world?scene=plaza').json()
    assert len(rows) >= 8
    # 边界跟着共用场景表走（广场 v2 起是 2200×1700，不再写死 1000）
    from app import world as world_mod
    w, d = world_mod.scene_size('plaza')
    for p in rows:
        assert 0 <= p['x'] <= w and 0 <= p['y'] <= d, p
        assert p['breed_code'] and p['dog_name']
        assert p['status'] in ('idle', 'walk', 'play', 'battle', 'rest', 'offline')


def test_world_unknown_scene_404():
    c, _ = make_client()
    assert c.get('/api/world?scene=moon').status_code == 404


def test_adopted_dog_appears_in_world():
    """领养后自己的狗要出现在广场上（需求：注册后进入开放世界）。"""
    c, _ = make_client()
    token, card = full_user(c, 'alice')
    rows = c.get('/api/world?scene=plaza').json()
    mine = [p for p in rows if p['dog_id'] == card['dog']['id']]
    assert mine, '领养后应在广场看到自己的狗'
    assert mine[0]['dog_name'] == card['dog']['name']


def test_move_updates_position_and_scene():
    c, _ = make_client()
    token, card = full_user(c, 'alice')
    r = c.post('/api/world/move', json={'scene': 'park', 'x': 321, 'y': 654,
                                        'status': 'walk', 'bubble': '去遛弯'},
               headers=auth_header(token))
    assert r.status_code == 200
    body = r.json()
    assert (body['scene'], body['x'], body['y']) == ('park', 321, 654)
    # 公园里能看到自己
    rows = c.get('/api/world?scene=park').json()
    assert any(p['dog_id'] == card['dog']['id'] for p in rows)


def test_move_rejects_bad_scene_and_out_of_range():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    # scene 是 Literal，非法值由 pydantic 拦成 422（比 400 更早、报错更清楚）
    assert c.post('/api/world/move', json={'scene': 'mars'},
                  headers=auth_header(token)).status_code == 422
    # 坐标越界同样由 schema 拦下
    assert c.post('/api/world/move', json={'x': 99999},
                  headers=auth_header(token)).status_code == 422


def test_move_schema_scene_list_matches_world():
    """schema 里的场景枚举必须与 world.SCENES 完全一致，防止加场景时漏改一处。"""
    from typing import get_args
    from app import world
    from app.schemas import MoveRequest

    def literal_values(tp):
        out = set()
        for arg in get_args(tp):
            if isinstance(arg, str):
                out.add(arg)
            else:
                out |= literal_values(arg)
        return out

    allowed = literal_values(MoveRequest.model_fields['scene'].annotation)
    assert allowed == set(world.SCENES), (
        f'schema {sorted(allowed)} != world {sorted(world.SCENES)}')


def test_npc_positions_are_deterministic_within_bucket():
    """同一时间片内位置必须稳定，否则前端每次刷新都会看到狗瞬移。"""
    from app import world
    a = world.position_for(7, bucket=12345, scene='plaza')
    b = world.position_for(7, bucket=12345, scene='plaza')
    assert a == b
    c = world.position_for(7, bucket=12346, scene='plaza')
    assert c != a or True          # 不同时间片允许相同，但同一个必须相同


def test_visit_adds_friendship_and_records():
    c, _ = make_client()
    t1, card1 = full_user(c, 'alice')
    t2, card2 = full_user(c, 'bob')
    host_id = card2['dog']['id']
    r = c.post(f'/api/community/visit/{host_id}', json={'message': '来串门啦'},
               headers=auth_header(t1))
    assert r.status_code == 200
    assert r.json()['friendship_points'] == 1
    assert r.json()['visited_count'] == 1

    # 主人的狗窝能看到访客
    visits = c.get('/api/community/visits', headers=auth_header(t2)).json()
    assert len(visits) == 1
    assert visits[0]['visitor'] == card1['dog']['name']
    assert visits[0]['message'] == '来串门啦'

    # 档案卡上的访问计数
    card = c.get(f'/api/dogs/{host_id}/card', headers=auth_header(t1)).json()
    assert card['visits_received'] == 1


def test_visit_self_rejected():
    c, _ = make_client()
    token, card = full_user(c, 'alice')
    r = c.post(f"/api/community/visit/{card['dog']['id']}",
               headers=auth_header(token))
    assert r.status_code == 400


def test_visit_social_leaderboard_moves():
    c, _ = make_client()
    t1, card1 = full_user(c, 'alice')
    t2, card2 = full_user(c, 'bob')
    for _ in range(3):
        c.post(f"/api/community/visit/{card2['dog']['id']}",
               headers=auth_header(t1))
    board = c.get('/api/leaderboard?kind=social', headers=auth_header(t1)).json()
    mine = [r for r in board['rows'] if r['dog_id'] == card1['dog']['id']]
    assert mine and mine[0]['score'] == 3


def test_visit_unknown_dog_404():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    assert c.post('/api/community/visit/99999',
                  headers=auth_header(token)).status_code == 404


def test_seed_demo_is_idempotent():
    """种子数据重复跑不能产生重复的 NPC 狗。"""
    c, app = make_client()
    from app import seeds
    db = app.state.session_factory()
    try:
        before = c.get('/api/community/public').json()['member_count']
        seeds.seed_all(db)
        seeds.seed_demo_dogs(db)
        after = c.get('/api/community/public').json()['member_count']
        assert before == after
    finally:
        db.close()


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
            print(f'  [FAIL] {name}: {e}')
    print(f'{len(fns) - failed}/{len(fns)} passed')
    cleanup_all()
    sys.exit(1 if failed else 0)
