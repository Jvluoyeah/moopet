#!/usr/bin/env python3
"""狗狗档案与品种用例：领养 / 档案卡 / 镜像上报 / 边界。"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from helpers import (adopt, auth_header, cleanup_all, full_user,  # noqa: E402
                     make_client, register)


def test_breeds_seeded_eight_without_emoji():
    c, _ = make_client()
    rows = c.get('/api/breeds').json()
    assert len(rows) == 8
    codes = {b['code'] for b in rows}
    for want in ('samoyed', 'border_collie', 'golden', 'corgi', 'shiba',
                 'german_shepherd', 'husky', 'bichon'):
        assert want in codes
    for b in rows:
        assert b['name'] and b['stats']['power'] > 0
        assert b['asset_pack'], '每个品种都要有形象包路径'
        # 需求明确"不要使用 emoji"：名字与副标题里不能出现 emoji
        assert not any(ord(ch) > 0x1F000 for ch in (b['name'] + b['subtitle']))


def test_breed_detail_and_population():
    c, _ = make_client()
    r = c.get('/api/breeds/samoyed')
    assert r.status_code == 200 and r.json()['name'] == '萨摩耶'
    assert c.get('/api/breeds/nope').status_code == 404
    pop = c.get('/api/breeds/samoyed/population').json()
    assert pop['population'] >= 1          # 演示 NPC 里有一只萨摩耶


def test_adopt_creates_card_and_joins_community():
    c, _ = make_client()
    token = register(c, username='alice')['access_token']
    card = adopt(c, token, name='雪团子', breed='samoyed')
    assert card['dog']['name'] == '雪团子'
    assert card['dog']['breed_name'] == '萨摩耶'
    assert card['owner'] == 'alice'
    assert card['community']['code'] == 'plaza'      # 自动加入公开社群
    assert card['social_level'] == 1
    assert card['stats']['affinity'] == 88


def test_adopt_requires_login():
    c, _ = make_client()
    r = c.post('/api/dogs/adopt', json={'name': 'x', 'breed_code': 'samoyed'})
    assert r.status_code == 401


def test_adopt_unknown_breed_rejected():
    c, _ = make_client()
    token = register(c, username='alice')['access_token']
    r = c.post('/api/dogs/adopt', json={'name': 'x', 'breed_code': 'dragon'},
               headers=auth_header(token))
    assert r.status_code == 404


def test_adopt_limit_per_account():
    c, _ = make_client()
    token = register(c, username='alice')['access_token']
    for i in range(3):
        adopt(c, token, name=f'汪{i}', breed='corgi')
    r = c.post('/api/dogs/adopt', json={'name': '第四只', 'breed_code': 'corgi'},
               headers=auth_header(token))
    assert r.status_code == 409


def test_my_dogs_list():
    c, _ = make_client()
    token = register(c, username='alice')['access_token']
    adopt(c, token, name='甲', breed='shiba')
    adopt(c, token, name='乙', breed='husky')
    rows = c.get('/api/dogs/mine', headers=auth_header(token)).json()
    assert [d['name'] for d in rows] == ['甲', '乙']
    assert rows[0]['breed_name'] == '柴犬'


def test_require_dog_before_dog_scoped_api():
    c, _ = make_client()
    token = register(c, username='alice')['access_token']
    r = c.patch('/api/dogs/mine', json={'level': 5}, headers=auth_header(token))
    assert r.status_code == 409                 # 还没领养
    assert '领养' in r.json()['detail']


def test_mirror_update_level_and_leaderboard():
    c, _ = make_client()
    token, card = full_user(c, 'alice')
    dog_id = card['dog']['id']
    r = c.patch('/api/dogs/mine', json={'level': 23, 'total_exp': 1500,
                                        'personality': '粘人型',
                                        'achievements': ['FIRST_EXP', 'LEVEL_10']},
                headers=auth_header(token))
    assert r.status_code == 200
    body = r.json()
    assert body['level'] == 23 and body['achievements'] == ['FIRST_EXP', 'LEVEL_10']
    # 档案卡要能读到镜像过来的数据
    got = c.get(f'/api/dogs/{dog_id}/card', headers=auth_header(token)).json()
    assert got['dog']['level'] == 23
    assert got['dog']['personality'] == '粘人型'
    # 等级榜同步
    board = c.get('/api/leaderboard?kind=level', headers=auth_header(token)).json()
    mine = [r for r in board['rows'] if r['dog_id'] == dog_id][0]
    assert mine['score'] == 23 and mine['is_me'] is True


def test_card_of_other_dog_visible():
    """社群里能看到别人的狗（这是社群玩法的基础）。"""
    c, _ = make_client()
    t1, card1 = full_user(c, 'alice')
    t2, card2 = full_user(c, 'bob')
    other = c.get(f"/api/dogs/{card2['dog']['id']}/card",
                  headers=auth_header(t1)).json()
    assert other['owner'] == 'bob'
    assert other['dog']['name'] == 'bob的狗'


def test_card_404_for_unknown_dog():
    c, _ = make_client()
    token = register(c, username='alice')['access_token']
    assert c.get('/api/dogs/9999/card', headers=auth_header(token)).status_code == 404


def test_delete_own_dog_only():
    c, _ = make_client()
    t1, card1 = full_user(c, 'alice')
    t2, card2 = full_user(c, 'bob')
    assert c.delete(f"/api/dogs/{card2['dog']['id']}",
                    headers=auth_header(t1)).status_code == 403
    assert c.delete(f"/api/dogs/{card1['dog']['id']}",
                    headers=auth_header(t1)).status_code == 204
    assert c.get('/api/dogs/mine', headers=auth_header(t1)).json() == []


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
