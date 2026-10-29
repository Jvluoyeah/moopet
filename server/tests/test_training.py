#!/usr/bin/env python3
"""剧情关卡用例：进度 / 首通与重复奖励 / 掉落流水 / 通关榜 / 防刷。

服务端只管"记账"，关卡内容在前端 —— 所以这里测的全是账目规则：
  首通只能领一次、重复通关不会把成绩改差、离谱的用时要被拒、榜单按星级+用时排。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

from helpers import auth_header, full_user, make_client   # noqa: E402


def _clear(c, token, code='L1', ticks=900, stars=2, hp_left=800):
    return c.post('/api/training/clear',
                  json={'level_code': code, 'ticks': ticks, 'stars': stars,
                        'hp_left': hp_left},
                  headers=auth_header(token))


# ---------------- 关卡列表 ----------------

def test_levels_list_with_empty_progress():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    rows = c.get('/api/training/levels', headers=auth_header(token)).json()
    assert len(rows) >= 4, rows
    codes = [r['code'] for r in rows]
    assert codes[:4] == ['L1', 'L2', 'L3', 'L4'], codes
    for r in rows:
        assert r['name'] and r['boss']
        assert r['cleared'] is False and r['stars'] == 0 and r['best_ticks'] == 0
        assert r['max_stars'] == 3
    # 难度递增：推荐等级必须非降
    rec = [r['rec_level'] for r in rows]
    assert rec == sorted(rec), rec


def test_levels_requires_login():
    c, _ = make_client()
    assert c.get('/api/training/levels').status_code == 401


# ---------------- 通关与奖励 ----------------

def test_first_clear_gives_big_reward():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    r = _clear(c, token, 'L1', ticks=900, stars=2).json()
    assert r['first_clear'] is True, r
    assert r['exp'] >= 100, r
    assert r['item'], '首通要给一个道具'
    assert r['best_stars'] == 2 and r['best_ticks'] == 900
    assert r['attempts'] == 1


def test_repeat_clear_gives_small_exp_and_no_item():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    first = _clear(c, token, 'L1', ticks=900, stars=2).json()
    again = _clear(c, token, 'L1', ticks=880, stars=2).json()
    assert again['first_clear'] is False
    assert again['item'] == ''
    assert again['exp'] < first['exp'], (first['exp'], again['exp'])
    assert again['attempts'] == 2


def test_progress_keeps_best_not_worst():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    _clear(c, token, 'L1', ticks=900, stars=3)
    # 后面打得更差：星级和用时都不该被改坏
    r = _clear(c, token, 'L1', ticks=1500, stars=1).json()
    assert r['best_stars'] == 3, r
    assert r['best_ticks'] == 900, r
    # 打得更好：应该被刷新
    r2 = _clear(c, token, 'L1', ticks=700, stars=3).json()
    assert r2['best_ticks'] == 700, r2


def test_levels_reflect_progress():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    _clear(c, token, 'L2', ticks=1200, stars=2)
    rows = {r['code']: r for r in
            c.get('/api/training/levels', headers=auth_header(token)).json()}
    assert rows['L2']['cleared'] is True and rows['L2']['stars'] == 2
    assert rows['L1']['cleared'] is False


def test_clear_unknown_level_404():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    assert _clear(c, token, 'L99').status_code == 404


def test_clear_rejects_impossible_time():
    """防刷：第一关不可能 240 帧内打完（关卡本身就有推进段）。"""
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    r = _clear(c, token, 'L1', ticks=5)
    assert r.status_code == 400, r.text
    # 而且不能留下任何进度
    rows = c.get('/api/training/levels', headers=auth_header(token)).json()
    assert all(not x['cleared'] for x in rows)


def test_clear_clamps_stars():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    assert _clear(c, token, 'L1', ticks=900, stars=99).status_code == 422


# ---------------- 掉落流水 ----------------

def test_drops_recorded_both_times():
    c, _ = make_client()
    token, _ = full_user(c, 'alice')
    _clear(c, token, 'L1', ticks=900, stars=2)
    _clear(c, token, 'L1', ticks=880, stars=2)
    drops = c.get('/api/training/drops', headers=auth_header(token)).json()
    assert len(drops) == 2, drops
    assert drops[0]['first_clear'] is False     # 倒序：最新的在前
    assert drops[1]['first_clear'] is True
    assert drops[1]['item'] == '尘埃齿轮'
    assert all(d['exp'] > 0 for d in drops)


def test_drops_are_per_dog():
    c, _ = make_client()
    t1, _ = full_user(c, 'alice')
    t2, _ = full_user(c, 'bob')
    _clear(c, t1, 'L1', ticks=900)
    assert c.get('/api/training/drops', headers=auth_header(t2)).json() == []


# ---------------- 通关榜 ----------------

def test_board_orders_by_stars_then_time():
    c, _ = make_client()
    t1, _ = full_user(c, 'alice')
    t2, _ = full_user(c, 'bob')
    t3, _ = full_user(c, 'carol')
    _clear(c, t1, 'L1', ticks=1000, stars=2)
    _clear(c, t2, 'L1', ticks=1500, stars=3)   # 星级高，排第一
    _clear(c, t3, 'L1', ticks=800, stars=2)    # 同星级，用时短排前面
    rows = c.get('/api/training/board?level=L1').json()
    assert [r['dog_name'] for r in rows] == ['bob的狗', 'carol的狗', 'alice的狗'], rows
    assert [r['rank'] for r in rows] == [1, 2, 3]
    assert rows[0]['seconds'] == round(1500 / 30.0, 1)


def test_board_excludes_uncleared():
    c, _ = make_client()
    t1, _ = full_user(c, 'alice')
    assert c.get('/api/training/board?level=L3').json() == []
    _clear(c, t1, 'L3', ticks=900)
    assert len(c.get('/api/training/board?level=L3').json()) == 1


def test_board_unknown_level_404():
    c, _ = make_client()
    assert c.get('/api/training/board?level=NOPE').status_code == 404


def test_board_is_public():
    """榜单是公开数据，没登录也该能看（和朋友情榜一致）。"""
    c, _ = make_client()
    assert c.get('/api/training/board?level=L1').status_code == 200
