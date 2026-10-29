#!/usr/bin/env python3
"""养成系机械狗 · W3 独立演示（Windows / Ubuntu 均可直接跑，无 ROS）。

一条时间轴复现 **W1 地基 → W2 模拟感知层 → W3 答题 + 基础闭环**，
体现李文扬 W3 交付是「基于前两周内容」的延续：
  - W1：工作空间 / 自定义接口 / 冒烟（回顾）
  - W2：背包感知 → 7 来源加点 → 升级（回顾，供 W3 解锁题库）
  - W3：题库按等级解锁 → 答题/连击/难度降档 → 加点升级 →
        行为决策引擎入口（BT 骨架）反应 → 状态卡

用法：
  python standalone_demo_w3.py            # 自动演示（默认）
  python standalone_demo_w3.py --fast     # 加速
  python standalone_demo_w3.py --interactive  # 互动答题养狗
"""
import os
import random
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                'src', 'moopet_dog'))
from moopet_dog.exp_engine import ExpEngine, SOURCES, QUIZ_COMBO_BONUS  # noqa: E402
from moopet_dog.quiz_bank import (CATEGORY_UNLOCK_LEVEL, QuizBank,  # noqa: E402
                                  WRONG_DROP_THRESHOLD)
from moopet_dog.decision import DecisionEngine  # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

os.system('')

COLOR = {'off': '\033[0m', 'bold': '\033[1m', 'dim': '\033[2m',
         'red': '\033[31m', 'green': '\033[32m', 'yellow': '\033[33m',
         'cyan': '\033[36m', 'magenta': '\033[35m'}


def c(s, *kinds):
    return ''.join(COLOR[k] for k in kinds) + str(s) + COLOR['off']


def banner(t):
    print()
    print(c('=' * 64, 'cyan'))
    print(c(t.center(64), 'cyan', 'bold'))
    print(c('=' * 64, 'cyan'))


def event(node, text, color='yellow'):
    print(c(f'  [{node:12s}] ', 'dim') + c(text, color))


def dog_art(level):
    if level >= 15:
        a = r"""    (^o^)        LV.%s  我已经长大啦！汪！
    (   )(   )__
     (   )   \__ """
    elif level >= 8:
        a = r"""    (^_^)        LV.%s  长大中的小狗
    (   )(   )__
    """
    else:
        a = r"""    (>_<)        LV.%s  小奶狗一只，求摸头
    (   )(   )
    """
    return c(a % level, 'green')


def show_state(eng):
    st = eng.get_state()
    print(c(f'  等级 LV.{st["level"]} | 累计经验 {st["total_exp"]} | '
            f'本周 {st["week_exp"]}/2000 | 心情 {st["emotion"]} | '
            f'连续 {st["streak_days"]} 天', 'cyan', 'bold'))


# ---------------- W2 快速回顾（为 W3 解锁题库铺路） ----------------
def replay_w2(eng, gap):
    banner('W2 模拟感知层（回顾：背包感知 → 加点 → 升级）')
    for n, d in [('heartbeat', '5s 心跳'), ('audio', '语音命令'), ('vision', '表情/动作'),
                 ('env', '空气质量'), ('touch', '触摸分区')]:
        print(c(f'  [启动] backpack_{n}  {d}', 'green'))
    print(c('  狗本体启动：odom / exp_engine / state_mgr', 'green'))
    time.sleep(gap * 0.5)

    event('audio', '完成使用指引全套流程（一次性 +100）')
    eng.gain('guide')
    time.sleep(gap * 0.5)
    for i in range(5):
        z = ['头部', '背部'][i % 2]
        event('touch', f'主人抚摸我的{z}（+10）')
        eng.gain('pet', note=f'抚摸 {z}')
    event('audio', '呼唤：\"我叫你你都不理我，叫我一声！\"（+10）')
    eng.gain('call', note='呼唤')
    event('vision', '识别到握手动作（+10）')
    eng.gain('handshake', note='视觉识别握手')
    event('env', '室内空气质量变差 → 主人通风完成（+10）')
    eng.gain('ventilate', note='通风完成')
    event('odom', '外出散步 4 段 × 60m（每 50 米 +10）')
    for _ in range(4):
        eng.add_walk_distance(60)
    event('dog', '执行动作 投影/通讯/握手（各 +10）')
    for act in ['projector', 'communication', 'handshake']:
        eng.gain(act, note=f'/dog/action {act}')
    time.sleep(gap)
    show_state(eng)


# ---------------- W3 答题 + 决策闭环 ----------------
def run_quiz_session(eng, bank, decision, gap, interactive=False):
    banner('W3 答题 + 基础闭环（题库解锁 → 答题 → 连击 → 决策反应）')
    print('  题库按等级解锁：语文/数学=3级、英文/常识=8级、科学/编程=15级、自定义=20级')
    lv = eng.get_state()['level']
    print(c(f'  当前 LV.{lv} 已解锁：' + '、'.join(bank.unlocked_categories(lv))
            or '(尚未解锁)', 'green'))
    time.sleep(gap)

    difficulty = 3
    combo = 0
    wrong_streak = 0
    used = set()
    script = [True] * 10 + [False] * 3 + [True] * 2   # 10连击 → 连错3降档 → 收尾

    def ask():
        return bank.pick(eng.get_state()['level'], difficulty=difficulty,
                         exclude_ids=used)

    for idx, want_correct in enumerate(script, 1):
        q = ask()
        if q is None:
            print(c('  （当前等级无已解锁科目，等升级后再试）', 'red'))
            break
        used.add(q['id'])
        print()
        print(c(f'  第{idx}题 [{q["category"]}·难度{q["difficulty"]}] '
                f'{q["question"]}', 'bold'))
        for k, opt in enumerate(q['options'], 1):
            print(c(f'      {k}. {opt}', 'dim'))

        # 作答（互动模式让用户选；自动模式按脚本）
        if interactive:
            try:
                pick = input(c('  请作答(1-4)：', 'yellow')).strip()
                ans = q['options'][int(pick) - 1]
            except (ValueError, IndexError, EOFError):
                ans = q['options'][-1]
        else:
            time.sleep(gap * 0.8)
            ans = q['answer'] if want_correct else next(
                o for o in q['options'] if o != q['answer'])

        correct = bank.judge(q, ans)
        combo = combo + 1 if correct else 0
        wrong_streak = 0 if correct else wrong_streak + 1
        dropped = False
        if (not correct and wrong_streak >= WRONG_DROP_THRESHOLD
                and difficulty > 1):
            difficulty -= 1
            dropped = True

        result = eng.quiz_answer(correct, combo_count=combo, category=q['category'],
                                 question_id=q['id'])
        tag = c('答对 ✓', 'green', 'bold') if correct else c('答错 ✗', 'red', 'bold')
        line = f'  {tag} | 连击×{combo}'
        if dropped:
            line += c(f' | 连错{WRONG_DROP_THRESHOLD}题 → 难度降至 {difficulty}', 'magenta')
        print(line)
        if result['exp_gained'] > 0:
            line = c(f'  +{result["exp_gained"]} 经验', 'green', 'bold')
            if result.get('bonus_exp'):
                line += c(f'（含连击奖励 +{result["bonus_exp"]}）', 'green')
            line += c(f' | LV.{result["level"]}', 'cyan')
            if result['leveled_up']:
                line += c(' ⬆ 升级！', 'magenta', 'bold')
            print(line)
        for name in result.get('unlocked', []):
            print(c(f'  ★ 成就解锁：{name}！', 'magenta', 'bold'))

        # 决策引擎入口：事件 → BT 路由 → 反应（TTS 联动）
        record = decision.on_event(
            'quiz_answer', 'answer_correct' if correct else 'answer_wrong',
            {'category': q['category'], 'combo': combo, 'difficulty': difficulty,
             'difficulty_dropped': dropped})
        for r in record['reactions']:
            if r.get('tts_text'):
                print(c(f"  [决策→TTS] {r['tts_text']}", 'yellow'))
        time.sleep(gap * 0.6)

        # 中途升级 → 新科目解锁提示
        new_lv = eng.get_state()['level']
        if new_lv != lv:
            new_cats = set(bank.unlocked_categories(new_lv)) - \
                set(bank.unlocked_categories(lv))
            if new_cats:
                print(c(f'  ✨ 新科目解锁：' + '、'.join(new_cats), 'green', 'bold'))
            lv = new_lv

    # 展示 /dog/combo 判题桥接（web 后端同款接口）
    banner('/dog/combo 判题桥接（web 后端对接 ROS 的接口演示）')
    bridge = eng.quiz_answer(True, combo_count=1, category='数学', question_id=0)
    print(c(f'  /dog/combo {{combo_count:1, category:数学}} → +{bridge["exp_gained"]} 经验 '
            f'（new_combo=1）', 'green'))
    time.sleep(gap)

    print()
    print(c('  —— 行为决策引擎黑箱（W4 将据此演化性格/情感账户）——', 'dim'))
    print(c('  事件计数器: ' + str(decision.blackboard['counters']), 'dim'))
    print(c('  决策历史条数: ' + str(len(decision.history)), 'dim'))


# ---------------- 自动演示 ----------------
def run_auto(fast=False):
    gap = 0.15 if fast else 0.7
    banner('养成系机械狗 · W3 答题 + 基础闭环 独立演示（无 ROS）')
    print(c('  环境：Python 标准库 · 模拟数据驱动完整闭环', 'dim'))
    print(c('  本演示承接 W1 地基 + W2 模拟感知层，展示 W3 基于前两周内容的延续。', 'dim'))
    time.sleep(gap)

    with tempfile.TemporaryDirectory() as tmp:
        eng = ExpEngine(os.path.join(tmp, 'demo.db'))
        bank = QuizBank()
        decision = DecisionEngine()

        # ---------- 第一部分：W1 地基（回顾） ----------
        banner('W1 地基（回顾：工作空间 / 接口 / 冒烟）')
        print('  moopet_ws 工作空间：moopet_interfaces / moopet_backpack / moopet_dog')
        print('  自定义接口 16 项：msg 13 + srv 2 + action 1（W3 新增 DecisionEventMsg）')
        print('  冒烟测试通过：Topic / Service / Action 三通')
        time.sleep(gap)

        # ---------- 第二部分：W2 感知层（回顾） ----------
        replay_w2(eng, gap)

        # ---------- 第三部分：W3 答题 + 基础闭环 ----------
        run_quiz_session(eng, bank, decision, gap)

        banner('五、狗狗状态卡（W3 最终）')
        show_state(eng)
        print(dog_art(eng.get_state()['level']))
        banner('演示结束 · 谢谢观看')
        print(c('  提示：试试 --interactive 互动答题养狗', 'dim'))
        eng.close()


# ---------------- 互动模式 ----------------
def run_interactive():
    banner('养成系机械狗 · 互动答题养狗模式（无 ROS）')
    print(c('  输入 1~4 作答；q 退出', 'dim'))
    with tempfile.TemporaryDirectory() as tmp:
        eng = ExpEngine(os.path.join(tmp, 'demo.db'))
        bank = QuizBank()
        decision = DecisionEngine()
        eng.gain('guide')                      # 快速升到可解锁题库的等级
        show_state(eng)
        print(dog_art(eng.get_state()['level']))
        run_quiz_session(eng, bank, decision, 0.05, interactive=True)
        show_state(eng)
        eng.close()


def main():
    args = sys.argv[1:]
    if '--interactive' in args:
        run_interactive()
    else:
        run_auto(fast=('--fast' in args))


if __name__ == '__main__':
    main()
