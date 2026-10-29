#!/usr/bin/env python3
"""题库边界用例（W3 · 李文扬，无需 ROS）。

运行：
  python3 moopet_dog/tests/test_quiz_bank.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_core.quiz_bank import CATEGORY_UNLOCK_LEVEL, QuizBank  # noqa: E402


def make_bank():
    return QuizBank()


def test_unlock_by_level():
    bank = make_bank()
    assert bank.unlocked_categories(1) == []
    assert set(bank.unlocked_categories(3)) == {'语文', '数学'}
    assert set(bank.unlocked_categories(8)) == {'语文', '数学', '英文', '常识'}
    assert set(bank.unlocked_categories(15)) == {'语文', '数学', '英文', '常识',
                                                 '科学', '编程'}
    assert set(bank.unlocked_categories(20)) == set(CATEGORY_UNLOCK_LEVEL)


def test_pick_respects_unlock():
    bank = make_bank()
    assert bank.pick(1) is None                     # 未解锁不抽题
    for _ in range(60):
        q = bank.pick(3)
        assert q is not None and q['category'] in ('语文', '数学')
        assert q['difficulty'] <= 3


def test_pick_difficulty_preference():
    bank = make_bank()
    q = bank.pick(8, difficulty=2)
    assert q is not None and q['difficulty'] == 2


def test_pick_exclude_ids():
    bank = make_bank()
    q1 = bank.pick(3, exclude_ids=set())
    q2 = bank.pick(3, exclude_ids={q1['id']})
    assert q2['id'] != q1['id']


def test_judge_correct_wrong():
    bank = make_bank()
    q = bank.pick(8)
    assert bank.judge(q, q['answer'])
    assert bank.judge(q, q['answer'] + ' ')         # 忽略首尾空白
    wrong = next(o for o in q['options'] if o != q['answer'])
    assert not bank.judge(q, wrong)
    assert not bank.judge(q, None)
    assert not bank.judge(None, 'x')


def test_english_case_insensitive():
    bank = make_bank()
    q = dict(id=99, category='英文', difficulty=1, question='x',
             options=[], answer='Apple')
    assert bank.judge(q, 'apple')
    assert not bank.judge(q, 'banana')


def test_difficulty_drop_after_3_wrong():
    bank = make_bank()
    assert bank.next_difficulty(3, True, 0) == 3    # 答对保持
    assert bank.next_difficulty(3, False, 2) == 3   # 连错 2 未到阈值
    assert bank.next_difficulty(3, False, 3) == 2   # 连错 3 降一档
    assert bank.next_difficulty(1, False, 3) == 1   # 已最低不再降


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
