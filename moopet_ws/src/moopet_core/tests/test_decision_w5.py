#!/usr/bin/env python3
"""行为决策引擎 W5 集成用例（李文扬）——火花双栈统一调度。

覆盖：三档提醒经 on_tick 路由到火花子树（18/21/23 话术）、
火花状态事件（续火/首次点燃/挽回/熄灭）经主树联动反应、
火花与纪念日/主动关怀共存互不干扰（双栈统一调度）。

运行（无需 ROS，任意机器）：
  python moopet_dog/tests/test_decision_w5.py
"""
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_core.decision import DecisionEngine

NOW = datetime(2025, 9, 1, 15, 0, 0)      # 周一下午（演示基准）


def texts(record):
    return [r.get('tts_text', '') for r in record['reactions'] if r.get('tts_text')]


def test_spark_reminder_18():
    eng = DecisionEngine()
    rec = eng.on_tick(idle_seconds=0, now=datetime(2025, 9, 1, 18, 0, 0),
                      spark_reminder=18)
    assert any('续火' in t or '陪我' in t for t in texts(rec))


def test_spark_reminder_23_urgent():
    eng = DecisionEngine()
    rec = eng.on_tick(idle_seconds=0, now=datetime(2025, 9, 1, 23, 0, 0),
                      spark_reminder=23)
    assert any('最后一小时' in t or '熄灭' in t for t in texts(rec))


def test_no_spark_reminder_without_tier():
    eng = DecisionEngine()
    rec = eng.on_tick(idle_seconds=0, now=NOW)
    assert not any('续火' in t or '火花' in t for t in texts(rec))


def test_spark_keep_event_routed():
    eng = DecisionEngine()
    rec = eng.on_tick(idle_seconds=0, now=NOW,
                      spark_event={'event': 'keep', 'current_days': 5, 'level': 0})
    assert any('连续陪伴 5 天' in t for t in texts(rec))


def test_spark_new_event_routed():
    eng = DecisionEngine()
    rec = eng.on_tick(idle_seconds=0, now=NOW,
                      spark_event={'event': 'new', 'current_days': 1, 'level': 0})
    assert any('点亮' in t or '火花' in t for t in texts(rec))


def test_spark_recover_event_routed():
    eng = DecisionEngine()
    rec = eng.on_tick(idle_seconds=0, now=NOW,
                      spark_event={'event': 'recover', 'current_days': 1, 'level': 0})
    assert any('挽回' in t or '回来啦' in t for t in texts(rec))


def test_spark_extinguish_event_routed():
    eng = DecisionEngine()
    rec = eng.on_tick(idle_seconds=0, now=NOW,
                      spark_event={'event': 'extinguish', 'current_days': 0, 'level': 0})
    assert any('熄灭' in t for t in texts(rec))


def test_spark_coexists_with_ritual_morning():
    """双栈统一调度：火花事件与早安仪式并存，互不短路。"""
    eng = DecisionEngine()
    morning = datetime(2025, 9, 1, 7, 0, 0)
    # 早安仪式（同一天先触发过一次仪式记录）
    eng.on_tick(idle_seconds=0, now=morning)
    # 第二次 tick 带火花续火事件 → 应仍能路由到火花反应
    rec = eng.on_tick(idle_seconds=0, now=morning + timedelta_sec(60),
                      spark_event={'event': 'keep', 'current_days': 3, 'level': 0})
    assert any('连续陪伴 3 天' in t for t in texts(rec))


def timedelta_sec(sec):
    from datetime import timedelta
    return timedelta(seconds=sec)


def test_spark_reminder_with_proactive_care_cold():
    """冷淡期不主动关怀，但不影响火花提醒（火花提醒独立于情感账户）。"""
    eng = DecisionEngine()
    eng.blackboard['emotion_account'] = 10.0         # 冷淡期
    rec = eng.on_tick(idle_seconds=3 * 3600, now=datetime(2025, 9, 1, 18, 0, 0),
                      spark_reminder=18)
    assert any('续火' in t or '陪我' in t for t in texts(rec))


def test_spark_record_history():
    eng = DecisionEngine()
    rec = eng.on_tick(idle_seconds=0, now=NOW,
                      spark_event={'event': 'keep', 'current_days': 2, 'level': 0})
    assert rec['event_type'] == 'spark' and rec['event_value'] == 'keep'
    assert eng.history[-1]['event_type'] == 'spark'


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
        except Exception as e:                      # noqa: BLE001
            failed += 1
            print(f'  [ERROR] {fn.__name__}: {type(e).__name__}: {e}')
    print(f'{len(fns) - failed}/{len(fns)} passed')
    sys.exit(1 if failed else 0)
