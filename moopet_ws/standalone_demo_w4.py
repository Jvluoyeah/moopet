#!/usr/bin/env python3
"""养成系机械狗 · W4 情感决策 + 成长日记 独立演示（无 ROS）。

一条时间轴：W1 地基 → W2 感知成长 → W3 答题闭环 → W4 情感决策完稿。
W4 主秀（对齐排期 W4 · 李文扬：决策引擎完稿 + 情感账户 + 双端联调）：
  1) 性格演化：依恋/表达双轴 → 独立型 → 安静型 → 粘人型（计数器+衰减）
  2) 情感账户：正向互动+、闲置衰减-、冷淡期不主动、和好机制
  3) 主动关怀：长沉默搭话 / 深夜轻声关怀
  4) 陪伴仪式：早安/晚安（按性格说不同的话）、等级里程碑、自定义纪念日
  5) 成长日记：当天互动统计 → 第一人称日记 → diary 表落库

用法：
  python standalone_demo_w4.py            # 完整时间轴
  python standalone_demo_w4.py --fast     # 快速模式（无停顿）
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                'src', 'moopet_dog'))

from moopet_dog.decision import DecisionEngine, DogDiary, build_diary_content

# ---------------- 终端配色 ----------------
C = lambda s, c: f'\033[{c}m{s}\033[0m'
BOLD, DIM = '1', '2'
CYAN, GREEN, YELLOW, MAGENTA, RED = '36', '32', '33', '35', '31'


def hr(title=''):
    print()
    print(C('=' * 64, CYAN))
    if title:
        print(C(C(title, BOLD), CYAN))
        print(C('=' * 64, CYAN))


def say(text, tone='cheer'):
    color = {'cheer': GREEN, 'encourage': YELLOW, 'gentle': MAGENTA,
             'neutral': DIM, 'sad': RED}.get(tone, DIM)
    print(f'  {C("[决策→TTS]", DIM)} {C(text, color)}')


def state_line(eng, extra=''):
    bb = eng.get_state()
    acc = round(bb['emotion_account'])
    print(C(f'  黑箱：性格 {bb["personality"]} ｜ 情感账户 {acc}/100 '
            f'({dict(cold="冷淡", balanced="平衡", warm="依赖")[eng.account_level()]})'
            f' ｜ 依恋 {bb["attachment"]:.0f} · 表达 {bb["expressiveness"]:.0f} {extra}',
            BOLD))


FAST = '--fast' in sys.argv


def pause(sec=1.2):
    if not FAST:
        try:
            import time
            time.sleep(sec)
        except KeyboardInterrupt:
            raise SystemExit


DAY = datetime(2025, 8, 25, 15, 0, 0)          # 演示基准：周一下午


def replay_w12():
    """W1/W2/W3 回顾（浓缩打印）。"""
    hr('W1 地基 + W2 感知成长 + W3 答题闭环（回顾）')
    print(C('  W1  moopet_ws 三包 + 16 项自定义接口 + T/S/A 冒烟', DIM))
    print(C('  W2  背包 5 节点仿真感知 + 8 来源经验结算 + 升级/成就', DIM))
    print(C('  W3  quiz_node 答题（连击/难度降档）+ 决策引擎骨架（BT 目录）', DIM))
    print(C('  →  前三周成果全部保留，W4 在其上完稿决策引擎', DIM))
    pause(0.8)


def show_personality(eng):
    """W4-1 性格演化：独立 → 安静 → 粘人。"""
    hr('W4-1 性格演化（依恋/表达双轴 · 计数器+衰减）')
    state_line(eng, '（初始：独立型）')
    print(C('  主人连摸 4 次头（陪伴类事件 → 依恋轴 ↑）', DIM))
    for i in range(4):
        eng.on_event('pet', now=DAY + timedelta(minutes=i))
        say('被摸摸头好舒服～再摸一下嘛！')
    state_line(eng, '（依恋高、表达低 → 安静型）')
    print(C('  主人连呼 3 次 + 答题互动（说话类事件 → 表达轴 ↑）', DIM))
    for i in range(3):
        eng.on_event('call', now=DAY + timedelta(minutes=10 + i))
    for i in range(3):
        eng.on_event('quiz_answer', 'answer_correct',
                     params={'category': '数学', 'combo': i + 1},
                     now=DAY + timedelta(minutes=15 + i))
    say('答对啦（数学）！我摇摇尾巴给你庆祝～')
    state_line(eng, '（双轴都高 → 粘人型）')
    print(C('  周期检查：性格变化主动播报（W4：性格由计数器演化）', DIM))
    rec = eng.on_tick(idle_seconds=0, now=DAY + timedelta(minutes=20))
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'])
    pause()


def show_account_and_care(eng):
    """W4-2/3 情感账户 + 主动关怀。"""
    hr('W4-2 情感账户（投入越多回应越丰富 · 长期忽视会伤心）')
    state_line(eng, '（依赖期）')
    print(C('  …主人 2 天没有互动（闲置衰减：账户 -5/天）…', DIM))
    eng.on_tick(idle_seconds=2 * 86400, now=DAY + timedelta(days=2))
    state_line(eng, '（账户被闲置拉低）')
    print(C('  模拟长期忽视：账户掉入冷淡区（<30）', DIM))
    eng.blackboard['emotion_account'] = 20.0
    state_line(eng, '（进入冷淡期）')
    print(C('  周期检查：冷淡期 → 不主动搭话（对齐狗2.md：减少主动互动）', DIM))
    eng.on_tick(idle_seconds=3600, now=DAY + timedelta(days=2, hours=1))
    print(C('  （无反应，狗狗安静地等你回来）', DIM))
    print(C('  和好机制：主人回来多摸摸它，账户慢慢恢复…', DIM))
    for i in range(6):
        eng.on_event('pet', now=DAY + timedelta(days=2, hours=2))
        say('被摸摸头好舒服～再摸一下嘛！')
    state_line(eng, '（重新回到平衡期）')

    hr('W4-3 主动关怀（长沉默 ≥2h 主动搭话）')
    print(C('  主人下午出门，3 小时没动静…', DIM))
    rec = eng.on_tick(idle_seconds=3 * 3600, now=DAY + timedelta(days=2, hours=5))
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'], r.get('tone', 'cheer'))
    print(C('  深夜 23:30 还没回家…（特殊场景：轻声关怀）', DIM))
    rec = eng.on_tick(idle_seconds=3 * 3600,
                      now=datetime(2025, 8, 27, 23, 30, 0))
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'], r.get('tone', 'cheer'))
    pause()


def show_rituals(eng):
    """W4-4 早安/晚安/里程碑/纪念日。"""
    hr('W4-4 陪伴仪式（早安/晚安按性格说话 · 里程碑 · 纪念日）')
    morning = datetime(2025, 8, 28, 7, 0, 0)
    print(C('  8月28日 早 7:00 —— 第一次互动触发早安仪式', DIM))
    eng.on_event('call', now=morning)
    rec = eng.on_tick(idle_seconds=600, now=morning + timedelta(minutes=5))
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'])
    print(C('  同一天再检查一次 → 不会重复问候（防重复）', DIM))
    eng.on_tick(idle_seconds=600, now=morning + timedelta(hours=1))

    eng.set_state(level=10)
    print(C('  升级到 LV.10 —— 等级里程碑庆祝（对齐狗2.md）', DIM))
    rec = eng.on_event('milestone', params={'level': 10}, now=morning + timedelta(hours=2))
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'])

    eng.set_anniversaries({'2025-08-28': '认识主人满月'})
    print(C('  今天是「认识主人满月」—— 自定义纪念日', DIM))
    rec = eng.on_tick(idle_seconds=0, now=morning + timedelta(hours=3))
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'])

    evening = datetime(2025, 8, 28, 21, 30, 0)
    print(C('  晚 21:30 —— 晚安仪式', DIM))
    rec = eng.on_tick(idle_seconds=3600, now=evening)
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'], r.get('tone', 'cheer'))
    pause()


def show_diary(eng):
    """W4-5 成长日记（决策输出 → diary 表）。"""
    hr('W4-5 成长日记（第一人称 · 落库 diary 表）')
    tmp = tempfile.TemporaryDirectory()
    diary = DogDiary(os.path.join(tmp.name, 'moopet.db'))
    date = '2025-08-28'
    stats = {k: v for k, v in eng.daily_stats(date).items() if k != 'tick'}
    content = build_diary_content(date, stats, eng.get_state())
    diary.write(content, date=date)
    print(C(f'  {date} 互动统计：{stats}', DIM))
    print()
    for line in content.splitlines():
        print(C('  ｜ ' + line, MAGENTA))
    print()
    print(C('  （已写入 diary 表，一天一条；供前端日记页/周报读取）', DIM))
    diary.close()


def final_card(eng):
    hr('狗狗状态卡（W4 最终）')
    bb = eng.get_state()
    print(C(f'  等级 LV.{bb["level"]} ｜ 性格 {bb["personality"]} ｜ '
            f'情感账户 {bb["emotion_account"]:.0f}/100 ｜ 心情 {bb["emotion"]}',
            BOLD))
    print(C('    (^o^)   我不只是会答题，我还记得你、懂你的心情。汪！', GREEN))
    print()
    print(C('演示结束 · 谢谢观看', BOLD))
    print(C('提示：单测 19 项见 tests/test_decision_w4.py；ROS 联调用 start_demo.sh', DIM))


def main():
    hr('养成系机械狗 · W4 情感决策 + 成长日记 独立演示（无 ROS）')
    print(C('  环境：Python 标准库 · 承接 W1-W3，完稿行为决策引擎', DIM))
    replay_w12()

    eng = DecisionEngine()
    show_personality(eng)
    show_account_and_care(eng)
    show_rituals(eng)
    show_diary(eng)
    final_card(eng)


if __name__ == '__main__':
    main()
