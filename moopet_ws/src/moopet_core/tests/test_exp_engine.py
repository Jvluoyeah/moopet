#!/usr/bin/env python3
"""经验结算引擎边界用例（W2·黄鑫禹条目）。

运行（无需 ROS，任意机器）：
  python3 -m pytest moopet_dog/tests/test_exp_engine.py -v
  或
  python3 moopet_dog/tests/test_exp_engine.py
"""
import os
import sys
import tempfile
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_core.exp_engine import ExpEngine, SOURCES, WEEKLY_MAX_EXP, MAX_LEVEL, \
    MIN_DECAY_LEVEL, GUIDE_EXP, monday_of


def make_engine():
    tmp = tempfile.TemporaryDirectory()
    eng = ExpEngine(os.path.join(tmp.name, 't.db'))
    return eng, tmp


def test_walk_50m_per_10():
    eng, tmp = make_engine()
    r = eng.add_walk_distance(49)
    assert r == [] or all(x['exp_gained'] == 0 for x in r)
    r = eng.add_walk_distance(1)          # 累计 50m → +10
    assert len(r) == 1 and r[0]['exp_gained'] == 10
    r = eng.add_walk_distance(100)        # 累计 150m → +20
    assert sum(x['exp_gained'] for x in r) == 20
    eng.close()


def test_weekly_cap_per_source():
    eng, tmp = make_engine()
    cap = SOURCES['pet']['weekly_cap']    # 200
    total = 0
    for i in range(22):                    # 22 次抚摸
        r = eng.gain('pet')
        total += r['exp_gained']
    assert total == cap                   # 封顶 200，多余不加
    r = eng.gain('pet')
    assert r['exp_gained'] == 0 and r['capped']
    eng.close()


def test_global_weekly_max_2000():
    eng, tmp = make_engine()
    # 说明：7 种来源周上限合计 1400，达不到 2000 全局封顶；
    # 因此本用例直接向本周注入 2000 经验流水，验证全局上限拦截。
    week = monday_of(date.today())
    for _ in range(200):
        eng._insert_record('pet', 10, week, 'test')
    eng._conn.commit()
    # walk 本周尚未使用（来源剩余 500），但因全局已满 2000 → 拦截
    r = eng.gain('walk')
    assert r['exp_gained'] == 0 and r['capped']
    assert r['message'] == '本周经验已满 2000'
    eng.close()


def test_decay_floor_level_30():
    eng, tmp = make_engine()
    # 跨周刷经验，略超过 30 级封底所需累计经验(2180)，保证衰减后能压到封底
    today = date.today()
    for w in range(4):
        d = monday_of(today) - timedelta(weeks=w)   # 过去 4 个周一（不同周，上限重置）
        for src in ['pet', 'handshake', 'call']:
            for _ in range(20):
                eng.gain(src, d=d)
    state = eng.get_state()
    assert state['total_exp'] > 2180                # 已超 30 级封底累计
    assert state['level'] > MIN_DECAY_LEVEL

    # 连续 12 天未使用：开始逐天衰减
    r = eng.decay_check(today + timedelta(days=12))
    assert r['decayed_exp'] > 0
    state = eng.get_state()
    assert state['level'] >= MIN_DECAY_LEVEL

    # 极端：连续 100 天未使用，压到封底 30 级
    r = eng.decay_check(today + timedelta(days=100))
    state = eng.get_state()
    assert state['level'] == MIN_DECAY_LEVEL
    floor = eng._conn.execute(
        'SELECT exp_required FROM level_exp WHERE level = ?',
        (MIN_DECAY_LEVEL,)).fetchone()['exp_required']
    assert state['total_exp'] == floor
    eng.close()


def test_level_100_cap():
    eng, tmp = make_engine()
    # 刷满周上限后跨周继续刷
    d = date.today()
    week_starts = []
    while eng.get_state()['level'] < MAX_LEVEL:
        # 每个不同的周一，来源上限重置
        week = d - timedelta(days=d.weekday())
        week_starts.append(week.isoformat())
        for _ in range(40):
            eng.gain('pet', d=d)
        d = week + timedelta(days=7)
        if len(week_starts) > 300:
            break
    assert eng.get_state()['level'] == MAX_LEVEL
    eng.close()


def test_guide_one_time():
    eng, tmp = make_engine()
    r1 = eng.gain('guide')
    assert r1['exp_gained'] == GUIDE_EXP
    r2 = eng.gain('guide')
    assert r2['exp_gained'] == 0           # 一次性
    eng.close()


def test_achievement_once():
    eng, tmp = make_engine()
    seen = set()
    for _ in range(30):                    # 足够升级 + 解锁若干成就
        r = eng.gain('pet')
        seen.update(r['unlocked'])
    # 再刷 50 次，不应重复解锁
    for _ in range(50):
        r = eng.gain('pet')
        assert not set(r['unlocked']) & seen
    eng.close()


def test_cross_week_cap_reset():
    eng, tmp = make_engine()
    cap = SOURCES['pet']['weekly_cap']
    d1 = date(2026, 8, 10)                 # 周一
    d2 = d1 + timedelta(days=7)            # 下周一
    total = 0
    for _ in range(25):
        total += eng.gain('pet', d=d1)['exp_gained']
    assert total == cap
    r = eng.gain('pet', d=d2)              # 新一周，上限重置
    assert r['exp_gained'] == 10
    eng.close()


if __name__ == '__main__':
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    passed = 0
    for t in tests:
        try:
            t()
            print(f'PASS  {t.__name__}')
            passed += 1
        except Exception as e:
            print(f'FAIL  {t.__name__}: {e}')
    print(f'\n{passed}/{len(tests)} passed')
    sys.exit(0 if passed == len(tests) else 1)
