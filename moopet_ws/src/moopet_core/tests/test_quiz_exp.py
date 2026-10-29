#!/usr/bin/env python3
"""答题结算边界用例（W3 · 李文扬，无需 ROS）。

运行：
  python3 moopet_dog/tests/test_quiz_exp.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_core.exp_engine import ExpEngine, QUIZ_COMBO_BONUS  # noqa: E402


def make_engine():
    tmp = tempfile.TemporaryDirectory()
    eng = ExpEngine(os.path.join(tmp.name, 't.db'))
    return eng, tmp


def test_correct_gain_10():
    eng, tmp = make_engine()
    r = eng.quiz_answer(True, combo_count=1, category='语文', question_id=1)
    assert r['correct'] and r['exp_gained'] == 10
    assert eng.quiz_correct_total() == 1
    eng.close()


def test_wrong_no_exp():
    eng, tmp = make_engine()
    r = eng.quiz_answer(False, combo_count=0, category='语文', question_id=1)
    assert not r['correct'] and r['exp_gained'] == 0
    assert eng.quiz_correct_total() == 0
    eng.close()


def test_combo_bonus_5_and_10():
    eng, tmp = make_engine()
    for i in range(1, 6):                       # 第 5 题连击×5 → +50
        r = eng.quiz_answer(True, combo_count=i, category='语文', question_id=i)
        if i == 5:
            assert r['bonus_exp'] == QUIZ_COMBO_BONUS[5]
            assert r['exp_gained'] == 10 + QUIZ_COMBO_BONUS[5]
    for i in range(6, 11):                      # 第 10 题连击×10 → +100
        r = eng.quiz_answer(True, combo_count=i, category='语文', question_id=i)
        if i == 10:
            assert r['bonus_exp'] == QUIZ_COMBO_BONUS[10]
            assert r['exp_gained'] == 10 + QUIZ_COMBO_BONUS[10]
    eng.close()


def test_quiz_weekly_cap_200_and_combo_exempt():
    eng, tmp = make_engine()
    total = 0
    for i in range(1, 21):
        r = eng.quiz_answer(True, combo_count=1, category='语文', question_id=i)
        total += r['exp_gained']
    assert total == 200                          # 20 题 × 10 = 200 达 quiz 周上限
    r = eng.quiz_answer(True, combo_count=5, category='语文', question_id=999)
    assert r['base_exp'] == 0                    # 基础被周上限拦截
    assert r['bonus_exp'] == QUIZ_COMBO_BONUS[5]  # 连击奖励免周上限仍发放
    eng.close()


def test_quiz_record_written():
    eng, tmp = make_engine()
    eng.quiz_answer(True, combo_count=3, category='数学', question_id=5)
    eng.quiz_answer(False, combo_count=0, category='数学', question_id=6)
    rows = eng._conn.execute('SELECT * FROM quiz_record').fetchall()
    assert len(rows) == 2
    assert rows[0]['is_correct'] == 1 and rows[0]['combo_count'] == 3
    assert rows[1]['is_correct'] == 0
    eng.close()


def test_quiz_achievement_10():
    eng, tmp = make_engine()
    unlocked = []
    for i in range(1, 11):
        r = eng.quiz_answer(True, combo_count=1, category='语文', question_id=i)
        unlocked += r['unlocked']
    assert '答题小能手' in unlocked
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
