#!/usr/bin/env python3
"""火花计划引擎 W5 用例（李文扬）。

覆盖：连续陪伴（首次点燃/续火/断档熄灭/挽回）、0-5 档佩戴映射、
三档提醒（18/21/23 命中与去重、已互动不提醒）、每日任务（随机生成/进度/全部完成 +2 机会）、
签到（每天 1 次 +1 机会）、抽奖（概率出奖/消耗机会/200 次保底超级大奖/经验不计周上限）、
里程碑解锁（功能 / LED 灯位 / 肤位占位）。

运行（无需 ROS，任意机器）：
  python moopet_dog/tests/test_spark_w5.py
"""
import os
import random
import sqlite3
import sys
import tempfile
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_core.decision import SparkEngine
from moopet_core.decision.spark import (
    DAILY_TASK_CHANCES, LOTTERY_PITY, LOTTERY_SUPER, REMIND_TIMES,
    SIGNIN_CHANCES, level_from_days)

NOW = datetime(2025, 9, 1, 15, 0, 0)      # 周一下午（决策引擎基准；火花状态用真实 today）

# 火花状态（burning/risking）依赖"真实今天"，测试用相对今天的前后日期保证状态可预期
TODAY = date.today()
YDAY = TODAY - timedelta(days=1)
DBEFORE = TODAY - timedelta(days=2)

# 全局资源登记：跑完统一关闭/清理，避免临时目录与未关闭连接冲突
_RESOURCES = []


def make_db():
    tmp = tempfile.TemporaryDirectory()
    eng = SparkEngine(os.path.join(tmp.name, 'spark.db'))
    _RESOURCES.append((eng, tmp))
    return eng, tmp


def cleanup_all():
    for eng, tmp in reversed(_RESOURCES):
        try:
            eng.close()
        except Exception:                      # noqa: BLE001
            pass
        try:
            tmp.cleanup()
        except Exception:                      # noqa: BLE001
            pass
    _RESOURCES.clear()


# ---------------- 连续陪伴：续火 / 熄灭 / 挽回 ----------------

def test_first_ignite():
    eng, tmp = make_db()
    ev = eng.register_activity(TODAY)
    assert ev['event'] == 'new' and ev['current_days'] == 1
    st = eng.get_spark()
    assert st['current_days'] == 1 and st['status'] == 'burning'
    eng.close()


def test_keep_fire_consecutive():
    eng, tmp = make_db()
    eng.register_activity(YDAY)
    ev = eng.register_activity(TODAY)     # 连续 → 续火
    assert ev['event'] == 'keep' and ev['current_days'] == 2
    assert eng.get_spark()['status'] == 'burning'
    eng.close()


def test_miss_day_then_recover():
    eng, tmp = make_db()
    eng.register_activity(date(2025, 9, 1))
    eng.register_activity(date(2025, 9, 2))
    # 9/3 断档 → 9/5 回归 → 挽回，天数重置为 1
    ev = eng.register_activity(date(2025, 9, 5))
    assert ev['event'] == 'recover' and ev['current_days'] == 1
    st = eng.get_spark()
    assert st['max_days'] == 2                       # 历史最高保留
    eng.close()


def test_settle_missed_days_extinguish():
    eng, tmp = make_db()
    eng.register_activity(date(2025, 9, 1))
    eng.register_activity(date(2025, 9, 2))
    # 9/4 结算：上次活动 9/2，间隔 ≥2 天 → 熄灭归零
    ext = eng.settle_missed_days(date(2025, 9, 4))
    assert ext is True
    st = eng.get_spark()
    assert st['current_days'] == 0 and st['status'] == 'extinguished'
    # 再次结算不重复熄灭
    assert eng.settle_missed_days(date(2025, 9, 5)) is False
    eng.close()


def test_level_from_days_mapping():
    assert level_from_days(0) == 0
    assert level_from_days(6) == 0
    assert level_from_days(7) == 1
    assert level_from_days(14) == 2
    assert level_from_days(34) == 4
    assert level_from_days(35) == 5
    assert level_from_days(100) == 5                 # 封顶 5 档


# ---------------- 三档提醒（18:00 / 21:00 / 23:00） ----------------

def test_remind_due_at_tiers():
    eng, tmp = make_db()
    eng.register_activity(date(2025, 9, 1))        # 昨天互动
    for hour in REMIND_TIMES:
        due = eng.remind_due(datetime(2025, 9, 2, hour, 5, 0))   # 今天还没互动 → 提醒
        assert due == hour, f'hour={hour} 应提醒'
    # 非提醒时刻不提醒
    assert eng.remind_due(datetime(2025, 9, 2, 15, 0, 0)) is None
    eng.close()


def test_remind_not_when_already_active():
    eng, tmp = make_db()
    eng.register_activity(date(2025, 9, 2))        # 今天已互动
    assert eng.remind_due(datetime(2025, 9, 2, 18, 0, 0)) is None
    eng.close()


def test_remind_dedupe_per_tier():
    eng, tmp = make_db()
    eng.register_activity(date(2025, 9, 1))
    assert eng.remind_due(datetime(2025, 9, 2, 18, 0, 0)) == 18
    eng.mark_reminded(18, date(2025, 9, 2))
    assert eng.remind_due(datetime(2025, 9, 2, 18, 30, 0)) is None   # 已提醒去重
    assert eng.remind_due(datetime(2025, 9, 2, 21, 0, 0)) == 21       # 下一档仍提醒
    eng.close()


# ---------------- 每日任务（随机 / 进度 / 完成 +2 机会） ----------------

def test_daily_tasks_generated_random():
    eng, tmp = make_db()
    tasks = eng.daily_tasks(date(2025, 9, 1))
    assert len(tasks) == 2                          # 每天 2 个随机任务
    assert all(t['progress'] == 0 for t in tasks)
    # 同一天重复获取稳定
    assert eng.daily_tasks(date(2025, 9, 1)) == tasks
    eng.close()


def test_report_event_progress_and_bonus():
    eng, tmp = make_db()
    tasks = eng.daily_tasks(date(2025, 9, 1))
    # 把当天任务全部刷到完成
    bonus_granted = False
    for t in tasks:
        for _ in range(t['target']):
            res = eng.report_event(t['task_type'], date(2025, 9, 1))
            if res['bonus_granted']:
                bonus_granted = True
    assert bonus_granted is True                     # 全部完成 → 发放加成
    assert eng.tasks_all_done(date(2025, 9, 1))
    assert eng.lottery_chances(date(2025, 9, 1)) == DAILY_TASK_CHANCES
    # 再上报一次不重复发放
    eng.report_event(tasks[0]['task_type'], date(2025, 9, 1))
    assert eng.lottery_chances(date(2025, 9, 1)) == DAILY_TASK_CHANCES
    eng.close()


def test_report_event_unrelated_source_ignored():
    eng, tmp = make_db()
    eng.daily_tasks(date(2025, 9, 1))
    res = eng.report_event('guide', date(2025, 9, 1))   # 当天没有 guide 任务
    assert res['tasks_updated'] == []
    eng.close()


# ---------------- 签到（每天 1 次 +1 机会） ----------------

def test_sign_in_once_per_day():
    eng, tmp = make_db()
    assert eng.sign_in(date(2025, 9, 1)) is True
    assert eng.lottery_chances(date(2025, 9, 1)) == SIGNIN_CHANCES
    assert eng.sign_in(date(2025, 9, 1)) is False      # 同日第二次不重复
    assert eng.lottery_chances(date(2025, 9, 1)) == SIGNIN_CHANCES
    assert eng.sign_in(date(2025, 9, 2)) is True       # 次日可再签
    eng.close()


# ---------------- 抽奖（概率出奖 / 保底 200 / 经验不计周上限） ----------------

def test_lottery_consumes_chance_and_prize_table():
    eng, tmp = make_db()
    eng.sign_in(date(2025, 9, 1))
    rng = random.Random(42)
    result = eng.draw_lottery(date(2025, 9, 1), rng=rng)
    assert result['ok'] is True
    assert result['prize'] in ('三等奖', '二等奖', '一等奖', '特等奖', '超级大奖')
    assert result['exp'] >= 20
    assert eng.lottery_chances(date(2025, 9, 1)) == 0   # 机会被消耗
    assert eng.draw_lottery(date(2025, 9, 1), rng=rng)['ok'] is False   # 无机会
    eng.close()


def test_lottery_pity_guarantees_super():
    eng, tmp = make_db()
    # 连续抽 199 次低档（用固定 rng 逼近）→ 第 200 次保底超级大奖
    # 这里直接注入 pity=199 验证边界，再验证第 200 次必出
    eng._set_meta('pity', LOTTERY_PITY - 1)
    eng._add_chances(date(2025, 9, 1), 1)
    rng = random.Random(1)
    # 让随机 roll 最大 → 若是普通轮会落到最低概率档；但保底必须触发超级
    result = eng.draw_lottery(date(2025, 9, 1), rng=rng)
    assert result['prize'] == LOTTERY_SUPER
    assert result['pity'] == 0                          # 保底后计数清零
    eng.close()


def test_lottery_pity_reset_on_natural_super():
    eng, tmp = make_db()
    eng._set_meta('pity', 5)
    eng._add_chances(date(2025, 9, 1), 1)
    # 构造 rng，让 roll 命中 0.5% 超级大奖区间（累计概率 ≥ 0.995）
    class _Rng:
        def random(self):
            return 0.9995
    result = eng.draw_lottery(date(2025, 9, 1), rng=_Rng())
    assert result['prize'] == LOTTERY_SUPER
    assert result['pity'] == 0
    eng.close()


def test_lottery_exp_not_counted_in_week():
    """抽奖经验经 exp_engine.lottery_gain 加点，不计入每周经验上限（狗2.md）。"""
    from moopet_core.exp_engine import ExpEngine
    tmp = tempfile.TemporaryDirectory()
    db = os.path.join(tmp.name, 'e.db')
    eng = ExpEngine(db)
    _RESOURCES.append((eng, tmp))
    before = eng.get_state()
    r = eng.lottery_gain(500, skip_achievements=True)   # 隔离：不计成就奖励
    assert r['exp_gained'] == 500
    st = eng.get_state()
    assert st['week_exp'] == before['week_exp']          # 不计周上限
    assert st['total_exp'] == before['total_exp'] + 500
    eng.close()


# ---------------- 里程碑解锁（功能 / LED 灯位 / 肤位占位） ----------------

def test_milestone_unlocks_core_then_noncore():
    eng, tmp = make_db()
    u1 = eng.milestone_unlocks(1)
    assert '时钟' in u1['features'] and 'AI 交互' not in u1['features']
    u3 = eng.milestone_unlocks(3)
    assert '导航' in u3['features']
    u10 = eng.milestone_unlocks(10)
    assert '核心功能解锁完成' in u10['features']
    assert '核心功能解锁完成' not in u3['features']
    u30 = eng.milestone_unlocks(30)
    assert '非核心功能·D' in u30['features']
    u99 = eng.milestone_unlocks(99)
    assert '非核心功能·D' in u99['features']
    eng.close()


def test_milestone_unlocks_led_and_skin_placeholders():
    eng, tmp = make_db()
    u1 = eng.milestone_unlocks(1)
    assert u1['led'] == ['耳部 LED'] and u1['skin'] == ['经典白']
    u20 = eng.milestone_unlocks(20)
    assert '尾部 LED' in u20['led']
    assert '曜石黑' in u20['skin']
    u30 = eng.milestone_unlocks(30)
    assert '全身 LED' in u30['led'] and '鎏金' in u30['skin']
    eng.close()


if __name__ == '__main__':
    fns = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f'  [PASS] {fn.__name__}')
        except AssertionError as e:
            failed += 1
            print(f'  [FAIL] {fn.__name__}: {e}')
        except Exception as e:                       # noqa: BLE001
            failed += 1
            print(f'  [ERROR] {fn.__name__}: {type(e).__name__}: {e}')
    print(f'{len(fns) - failed}/{len(fns)} passed')
    cleanup_all()
    sys.exit(1 if failed else 0)
