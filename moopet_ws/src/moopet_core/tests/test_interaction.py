#!/usr/bin/env python3
"""互动路由用例：事件 → 经验/火花/每日任务/决策反应 的单一事实来源。"""
import os
import sys
import tempfile
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_core.decision import DecisionEngine, SparkEngine  # noqa: E402
from moopet_core.exp_engine import ExpEngine  # noqa: E402
from moopet_core.interaction import (EVENT_TO_SOURCE, EVENT_TO_TASK,  # noqa: E402
                                     InteractionRouter, resolve_source,
                                     resolve_task, should_count_event)

_RES = []


def make_router():
    tmp = tempfile.TemporaryDirectory()
    db = os.path.join(tmp.name, 'moopet.db')
    exp = ExpEngine(db)
    spark = SparkEngine(db)
    dec = DecisionEngine()
    r = InteractionRouter(exp, spark, dec)
    _RES.append((exp, spark, tmp))
    return r, exp, spark


def cleanup():
    for exp, spark, tmp in reversed(_RES):
        for obj in (exp, spark):
            try:
                obj.close()
            except Exception:      # noqa: BLE001
                pass
        try:
            tmp.cleanup()
        except Exception:          # noqa: BLE001
            pass
    _RES.clear()


# ---------------- 纯函数口径 ----------------
def test_value_filter_rejects_incomplete_events():
    assert should_count_event('pet', '') is True          # 抚摸没有取值要求
    assert should_count_event('quiz_answer', 'answer_wrong') is False
    assert should_count_event('quiz_answer', 'answer_correct') is True
    assert should_count_event('air_quality', 'bad') is False
    assert should_count_event('air_quality', 'ventilated') is True
    assert should_count_event('air_quality', True) is True


def test_resolve_maps():
    assert resolve_source('pet') == 'pet'
    assert resolve_source('air_quality', 'ventilated') == 'ventilate'
    assert resolve_source('air_quality') is None         # 没给取值 → 不算完成
    assert resolve_source('quiz_answer', 'answer_wrong') is None
    assert resolve_task('pet') == 'pet'
    assert resolve_task('quiz_answer', 'answer_correct') == 'quiz'
    assert 'projector' in EVENT_TO_SOURCE            # 投影只加点、不占每日任务
    assert 'projector' not in EVENT_TO_TASK


# ---------------- 端到端互动 ----------------
def test_pet_grants_exp_spark_and_task():
    r, exp, spark = make_router()
    d = date(2025, 9, 1)
    kinds = {t['task_type'] for t in spark.daily_tasks(d)}    # 当天任务是随机抽的
    out = r.handle('pet', d=d, level=3, emotion='happy')
    assert out['counted'] is True
    assert out['exp'] == 10                                   # 抚摸 +10
    assert out['spark_event']['event'] == 'new'               # 首次互动点燃火花
    assert out['task']['task_type'] == 'pet'
    if 'pet' in kinds:                                        # 抽中了才算进度
        assert out['task']['progress'] == 1
    cleanup()


def test_daily_task_progress_when_task_matches():
    """用当天真实存在的任务来验进度，避免依赖随机抽签结果。"""
    r, exp, spark = make_router()
    d = date(2025, 9, 1)
    tt = spark.daily_tasks(d)[0]['task_type']
    ev = {'quiz': 'quiz_answer', 'ventilate': 'air_quality'}.get(tt, tt)
    val = {'quiz_answer': 'answer_correct', 'air_quality': 'ventilated'}.get(ev, '')
    out = r.handle(ev, val, d=d)
    assert out['task']['task_type'] == tt
    assert out['task']['progress'] == 1
    assert out['task']['done'] in (True, False)
    cleanup()


def test_wrong_quiz_answer_counts_nothing():
    r, exp, spark = make_router()
    d = date(2025, 9, 1)
    out = r.handle('quiz_answer', 'answer_wrong', d=d)
    assert out['counted'] is False
    assert out['exp'] == 0
    assert out['task'] is None
    assert '未计数' in out['reason']
    cleanup()


def test_correct_quiz_answer_counts():
    r, exp, spark = make_router()
    d = date(2025, 9, 1)
    out = r.handle('quiz_answer', 'answer_correct', d=d)
    assert out['counted'] is True
    assert out['exp'] == 10
    assert out['task']['task_type'] == 'quiz'
    cleanup()


def test_projector_adds_exp_without_task():
    r, exp, spark = make_router()
    out = r.handle('projector', d=date(2025, 9, 1))
    assert out['exp'] == 10
    assert out['task'] is None
    cleanup()


def test_reactions_come_back():
    r, exp, spark = make_router()
    out = r.handle('pet', d=date(2025, 9, 1), level=5, emotion='happy')
    assert isinstance(out['reactions'], list)
    cleanup()


def test_repeated_interaction_keeps_fire():
    r, exp, spark = make_router()
    d = date(2025, 9, 1)
    r.handle('pet', d=d)
    out = r.handle('handshake', d=d)
    assert out['spark_event']['event'] == 'already'           # 同一天不重复续火
    assert out['spark_event']['current_days'] == 1
    cleanup()


# ---------------- 周期检查 ----------------
def test_tick_returns_reminder_tier():
    from datetime import datetime
    r, exp, spark = make_router()
    day = date(2025, 9, 1)
    spark.register_activity(day)                              # 昨天互动
    out = r.tick(datetime(2025, 9, 2, 18, 5, 0))
    assert out['reminder'] == 18                              # 今天没互动 → 催续火
    assert 'reactions' in out
    cleanup()


def test_tick_settles_extinguish():
    from datetime import datetime
    r, exp, spark = make_router()
    spark.register_activity(date(2025, 9, 1))
    out = r.tick(datetime(2025, 9, 3, 12, 0, 0))              # 断档两天
    assert out['extinguished'] is True
    cleanup()


def test_snapshot_shape():
    r, exp, spark = make_router()
    r.handle('pet', d=date(2025, 9, 1))
    snap = r.snapshot(date(2025, 9, 1))
    assert 'state' in snap and 'spark' in snap
    assert snap['state']['level'] >= 1
    cleanup()


def test_router_tolerates_missing_engines():
    r = InteractionRouter(None, None, None)
    out = r.handle('pet', d=date(2025, 9, 1))
    assert out['counted'] is True and out['exp'] == 0         # 不炸即可
    assert r.tick(None)['reminder'] is None


# ---------------- 跨引擎共用同一个 SQLite 的锁问题（真实踩过） ----------------
def test_readers_leave_no_open_write_transaction():
    """exp/spark 共用同一个库时，"只读"接口绝不能留下未提交的写事务。

    历史 bug：SparkEngine._reward_row 在当天行缺失时偷偷 INSERT 且不提交，
    于是 spark 连接长期占着写锁，exp 的 INSERT 报 "database is locked"。
    """
    r, exp, spark = make_router()
    d = date(2025, 9, 1)
    # 这些都是"查询"性质的调用
    spark.lottery_chances(d)
    spark.get_spark()
    spark.today_summary(d)
    spark.mark_reminded(18, d)
    assert spark._conn.in_transaction is False, 'spark 留下了未提交事务'
    assert exp._conn.in_transaction is False, 'exp 留下了未提交事务'
    cleanup()


def test_exp_and_spark_can_interleave_writes():
    """两个引擎反复交替写同一个库，不能出现锁冲突。"""
    r, exp, spark = make_router()
    for i in range(6):
        d = date(2025, 9, 1 + i)
        out = r.handle('pet', d=d)                       # exp.gain + spark.report_event
        assert out['exp'] == 10
        spark.lottery_chances(d)                         # 触发 _reward_row 建行
        exp.gain('walk', d=d)
    cleanup()


def test_router_full_day_then_reminder_does_not_lock():
    """跨天跑一轮完整流程，末尾的提醒登记也不能锁住库。"""
    from datetime import datetime
    r, exp, spark = make_router()
    r.handle('pet', d=date(2025, 9, 1))
    r.handle('walk', d=date(2025, 9, 1))
    r.tick(datetime(2025, 9, 2, 18, 5, 0))               # 含 settle + remind + mark_reminded
    assert spark._conn.in_transaction is False
    r.handle('pet', d=date(2025, 9, 2))                  # 锁没被占，这里必须能写
    cleanup()


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
    cleanup()
    sys.exit(1 if failed else 0)
