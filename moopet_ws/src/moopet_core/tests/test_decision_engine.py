#!/usr/bin/env python3
"""行为决策引擎边界用例（W3 · 李文扬，无需 ROS）。

运行：
  python3 moopet_dog/tests/test_decision_engine.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_core.decision import DecisionEngine  # noqa: E402


def make_engine():
    return DecisionEngine()


def _quiz_reaction(record, behavior):
    return next(x for x in record['reactions'] if x.get('behavior') == behavior)


def test_quiz_correct_route():
    eng = make_engine()
    r = eng.on_event('quiz_answer', 'answer_correct',
                     {'category': '语文', 'combo': 5, 'difficulty': 3})
    assert r['status'] == 'SUCCESS'
    qa = _quiz_reaction(r, 'quiz_correct_action')
    assert qa['tone'] == 'cheer' and '连击' in qa['tts_text']


def test_quiz_wrong_route_with_difficulty_drop():
    eng = make_engine()
    r = eng.on_event('quiz_answer', 'answer_wrong',
                     {'category': '语文', 'combo': 0, 'difficulty': 3,
                      'difficulty_dropped': True})
    qa = _quiz_reaction(r, 'quiz_wrong_action')
    assert qa['tone'] == 'encourage' and '难度' in qa['tts_text']


def test_pet_route():
    eng = make_engine()
    r = eng.on_event('pet', '', {'zone': 0})
    pet = _quiz_reaction(r, 'pet_action')
    assert '摸' in pet['tts_text']


def test_handshake_route_with_action():
    eng = make_engine()
    r = eng.on_event('handshake', '', {})
    hs = _quiz_reaction(r, 'handshake_action')
    assert hs['action_type'] == 'handshake'      # 联动 /dog/action


def test_unknown_event_fallback_does_not_crash():
    eng = make_engine()
    r = eng.on_event('unknown_xyz', '')
    assert r['status'] == 'SUCCESS'              # 兜底（W4 起静默，无占位反应）
    assert r['reactions'] == []


def test_blackboard_counters():
    eng = make_engine()
    eng.on_event('quiz_answer', 'answer_correct', {})
    eng.on_event('quiz_answer', 'answer_correct', {})
    assert eng.blackboard['counters']['quiz_answer'] == 2
    assert eng.blackboard['last_active_ts'] is not None     # W4：记录最近互动时间


def test_params_json_string():
    eng = make_engine()
    r = eng.on_event('quiz_answer', 'answer_correct',
                     json.dumps({'category': '数学', 'combo': 3},
                                ensure_ascii=False))
    qa = _quiz_reaction(r, 'quiz_correct_action')
    assert '数学' in qa['tts_text']


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
