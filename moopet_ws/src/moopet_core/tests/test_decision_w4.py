#!/usr/bin/env python3
"""行为决策引擎 W4 完稿用例（李文扬）。

覆盖：性格双轴演化四型（粘人/独立/话痨/安静）、情感账户（增益/上限/闲置衰减/档位）、
主动关怀（长沉默触发/冷淡期不触发/深夜话术）、早安/晚安仪式（防重复）、
自定义纪念日、等级里程碑、性格变化播报、成长日记（成文 + 落库读写）。

运行（无需 ROS，任意机器）：
  python moopet_dog/tests/test_decision_w4.py
"""
import os
import sys
import tempfile
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_core.decision import (DecisionEngine, DogDiary,
                                 build_diary_content)
from moopet_core.decision.decision_engine import (
    ACCOUNT_MAX, derive_personality)

NOW = datetime(2025, 8, 25, 15, 0, 0)      # 周一下午（白天基准时间）


def texts(record):
    return [r.get('tts_text', '') for r in record['reactions'] if r.get('tts_text')]


# ---------------- 性格演化 ----------------

def test_personality_mapping_2x2():
    assert derive_personality(60, 60) == '粘人型'
    assert derive_personality(40, 60) == '话痨型'
    assert derive_personality(60, 40) == '安静型'
    assert derive_personality(40, 40) == '独立型'


def test_initial_personality_independent():
    eng = DecisionEngine()
    assert eng.get_state()['personality'] == '独立型'


def test_companion_talk_mix_becomes_clingy():
    eng = DecisionEngine()
    for _ in range(4):
        eng.on_event('pet', now=NOW)
    assert eng.get_state()['personality'] == '安静型'      # 依恋高、表达低
    for _ in range(3):
        eng.on_event('call', now=NOW)
    st = eng.get_state()
    assert st['personality'] == '粘人型'                    # 依恋高 + 表达高
    assert st['attachment'] >= 55 and st['expressiveness'] >= 55


def test_quiz_becomes_chatty():
    eng = DecisionEngine()
    for _ in range(4):
        eng.on_event('quiz_answer', 'answer_correct',
                     params={'category': '数学'}, now=NOW)
    assert eng.get_state()['personality'] == '话痨型'


# ---------------- 情感账户 ----------------

def test_account_gain_cap_and_wrong_no_gain():
    eng = DecisionEngine()
    eng.on_event('pet', now=NOW)
    assert eng.get_state()['emotion_account'] == 52.0       # 50 + 2
    eng.on_event('quiz_answer', 'answer_wrong', now=NOW)    # 答错不加分
    assert eng.get_state()['emotion_account'] == 52.0
    eng.blackboard['emotion_account'] = ACCOUNT_MAX - 1.0
    eng.on_event('walk', now=NOW)
    assert eng.get_state()['emotion_account'] == ACCOUNT_MAX   # 封顶


def test_account_idle_decay():
    eng = DecisionEngine()
    eng.on_event('pet', now=NOW)                            # 52
    eng.on_tick(idle_seconds=2 * 86400, now=NOW)            # 闲置 2 天 -10
    assert eng.get_state()['emotion_account'] == 42.0


def test_account_levels():
    eng = DecisionEngine()
    eng.blackboard['emotion_account'] = 20.0
    assert eng.account_level() == 'cold'
    eng.blackboard['emotion_account'] = 50.0
    assert eng.account_level() == 'balanced'
    eng.blackboard['emotion_account'] = 80.0
    assert eng.account_level() == 'warm'


# ---------------- 主动关怀 ----------------

def test_proactive_care_triggers_on_silence():
    eng = DecisionEngine()
    eng.on_event('pet', now=NOW)
    rec = eng.on_tick(idle_seconds=3 * 3600, now=NOW)       # 沉默 3h ≥ 2h
    assert any('要不要摸摸我' in t or '等你好久' in t for t in texts(rec))


def test_proactive_care_silent_when_cold():
    eng = DecisionEngine()
    eng.on_event('pet', now=NOW)
    eng.blackboard['emotion_account'] = 10.0                # 冷淡期
    eng.blackboard['_personality_changed'] = False          # 排除性格播报干扰
    rec = eng.on_tick(idle_seconds=3 * 3600, now=NOW)
    assert texts(rec) == []                                 # 长期忽视 → 减少主动互动


def test_proactive_care_night_text():
    eng = DecisionEngine()
    eng.on_event('pet', now=NOW)
    night = datetime(2025, 8, 25, 23, 30, 0)
    rec = eng.on_tick(idle_seconds=3 * 3600, now=night)
    assert any('早点休息' in t for t in texts(rec))


# ---------------- 早安 / 晚安 / 纪念日 / 里程碑 ----------------

def test_morning_ritual_once_per_day():
    eng = DecisionEngine()
    day = datetime(2025, 8, 25, 7, 0, 0)
    rec1 = eng.on_tick(idle_seconds=0, now=day)
    assert any(r.get('params', {}).get('kind') == 'morning'
               for r in rec1['reactions'])                       # 早安已问候
    rec2 = eng.on_tick(idle_seconds=0, now=datetime(2025, 8, 25, 8, 0, 0))
    assert not any(r.get('params', {}).get('kind') == 'morning'
                   for r in rec2['reactions'])                   # 同日不重复
    rec3 = eng.on_tick(idle_seconds=0, now=datetime(2025, 8, 26, 7, 0, 0))
    assert any(r.get('params', {}).get('kind') == 'morning'
               for r in rec3['reactions'])                       # 次日再问候


def test_evening_ritual():
    eng = DecisionEngine()
    rec = eng.on_tick(idle_seconds=0, now=datetime(2025, 8, 25, 21, 30, 0))
    assert any('晚安' in t for t in texts(rec))


def test_custom_anniversary():
    eng = DecisionEngine()
    eng.set_anniversaries({'2025-08-25': '认识主人满月'})
    rec = eng.on_tick(idle_seconds=0, now=NOW)
    assert any('认识主人满月' in t for t in texts(rec))


def test_custom_anniversary_once_per_day():
    eng = DecisionEngine()
    eng.set_anniversaries({'2025-08-25': '认识主人满月'})
    rec1 = eng.on_tick(idle_seconds=0, now=NOW)
    assert any(r.get('params', {}).get('kind') == 'anniversary'
               for r in rec1['reactions'])
    rec2 = eng.on_tick(idle_seconds=0, now=NOW)          # 同日第二次
    assert not any(r.get('params', {}).get('kind') == 'anniversary'
                   for r in rec2['reactions'])


def test_milestone_celebration():
    eng = DecisionEngine()
    rec = eng.on_event('milestone', params={'level': 10}, now=NOW)
    assert any('LV.10' in t and '庆祝' in t for t in texts(rec))
    assert eng.get_state()['emotion_account'] == 52.0        # 里程碑也算正向互动


def test_personality_change_announced():
    eng = DecisionEngine()
    for _ in range(4):
        eng.on_event('pet', now=NOW)                         # → 安静型
    rec = eng.on_tick(idle_seconds=0, now=NOW)
    assert any('请多指教' in t for t in texts(rec))          # 性格变化播报
    rec2 = eng.on_tick(idle_seconds=0, now=NOW)
    assert not any('请多指教' in t for t in texts(rec2))     # 播报一次后不重复


# ---------------- 成长日记 ----------------

def test_daily_stats():
    eng = DecisionEngine()
    eng.on_event('pet', now=NOW)
    eng.on_event('quiz_answer', 'answer_correct', now=NOW)
    eng.on_event('quiz_answer', 'answer_wrong', now=NOW)
    stats = eng.daily_stats('2025-08-25')
    assert stats == {'pet': 1, 'quiz_correct': 1, 'quiz_wrong': 1}


def test_build_diary_content():
    eng = DecisionEngine()
    eng.on_event('pet', now=NOW)
    eng.on_event('pet', now=NOW)
    eng.on_event('quiz_answer', 'answer_correct', now=NOW)
    stats = eng.daily_stats('2025-08-25')
    content = build_diary_content('2025-08-25', stats, eng.get_state())
    assert '2025-08-25' in content and '摸了我 2 次' in content
    assert '答了 1 道题' in content
    assert eng.get_state()['personality'] in content         # 日记带当前性格


def test_dog_diary_write_read_overwrite():
    tmp = tempfile.TemporaryDirectory()
    db = os.path.join(tmp.name, 'd.db')
    diary = DogDiary(db)
    diary.write('第一版', date='2025-08-25')
    assert diary.read('2025-08-25') == '第一版'
    diary.write('覆盖版', date='2025-08-25')                 # UNIQUE(date) 覆盖
    assert diary.read('2025-08-25') == '覆盖版'
    diary.write('今天的事', date='2025-08-26')
    assert len(diary.latest(7)) == 2
    diary.close()


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
        except Exception as e:                            # noqa: BLE001
            failed += 1
            print(f'  [ERROR] {fn.__name__}: {type(e).__name__}: {e}')
    print(f'{len(fns) - failed}/{len(fns)} passed')
    sys.exit(1 if failed else 0)
