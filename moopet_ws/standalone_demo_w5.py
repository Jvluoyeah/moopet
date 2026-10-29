#!/usr/bin/env python3
"""养成系机械狗 · W5 火花计划 + 综合 独立演示（无 ROS）。

一条时间轴：W1 地基 → W2 感知成长 → W3 答题闭环 → W4 情感决策 → W5 火花计划。
W5 主秀（对齐排期 W5 · 李文扬：火花全流程 + 双栈集成 + 里程碑解锁）：
  1) 火花点燃与连续陪伴：首次互动点亮火花 → 连续互动续火
  2) 三档提醒：18:00 / 21:00 / 23:00 催主人续火（行为/回复联动）
  3) 断档熄灭与挽回：错过一天 → 火花熄灭；回归 → 挽回重燃
  4) 每日任务：每天 4 点随机刷新 2 个任务；全部完成 → +2 次抽奖机会
  5) 签到抽奖：每日签到 +1 次机会；抽奖概率出奖（200 次保底超级大奖），经验不计周上限
  6) 里程碑解锁玩法：等级 → 功能 / LED 灯位 / 肤位外观数据占位
  7) 双栈集成：火花提醒 / 状态事件经决策引擎 BT 统一调度（TTS 话术按档位/事件变化）

用法：
  python standalone_demo_w5.py            # 完整时间轴
  python standalone_demo_w5.py --fast     # 快速模式（无停顿）
"""
import os
import sys
import tempfile
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                'src', 'moopet_dog'))

from moopet_dog.decision import DecisionEngine, SparkEngine
from moopet_dog.decision.spark import level_from_days
from moopet_dog.exp_engine import ExpEngine

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
    print(f'  {C("[火花→TTS]", DIM)} {C(text, color)}')


FAST = '--fast' in sys.argv


def pause(sec=1.2):
    if not FAST:
        try:
            import time
            time.sleep(sec)
        except KeyboardInterrupt:
            raise SystemExit


DAY = datetime(2025, 9, 1, 15, 0, 0)          # 演示基准：周一下午


def spark_line(spark):
    st = spark.get_spark()
    status = {'burning': '燃烧中', 'risking': '待续火', 'extinguished': '已熄灭'}.get(
        st['status'], st['status'])
    print(C(f'  火花：连续 {st["current_days"]} 天 ｜ 历史最高 {st["max_days"]} 天 '
            f'｜ 档位 {st["level"]}/5 ｜ {status}', BOLD))


def replay_w14():
    """W1-W4 回顾（浓缩打印）。"""
    hr('W1 地基 + W2 感知 + W3 答题 + W4 情感决策（回顾）')
    print(C('  W1  moopet_ws 三包 + 16 项自定义接口 + T/S/A 冒烟', DIM))
    print(C('  W2  背包 5 节点仿真感知 + 8 来源经验结算 + 升级/成就', DIM))
    print(C('  W3  quiz_node 答题（连击/难度降档）+ 决策引擎骨架', DIM))
    print(C('  W4  行为决策引擎完稿（性格/情感账户/主动关怀/纪念日/日记）', DIM))
    print(C('  →  前四周成果全部保留，W5 在其上加入火花计划 + 综合', DIM))
    pause(0.8)


def show_ignite_and_keep(spark, eng):
    """W5-1 火花点燃与续火。"""
    hr('W5-1 火花点燃 · 连续陪伴（续火）')
    print(C('  9月1日 —— 主人第一次互动，火花点亮！', DIM))
    ev = spark.register_activity(date(2025, 9, 1))
    rec = eng.on_tick(idle_seconds=0, now=DAY, spark_event=ev)
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'])
    spark_line(spark)
    print(C('  9月2日 —— 主人继续陪伴，火花续上！', DIM))
    ev = spark.register_activity(date(2025, 9, 2))
    rec = eng.on_tick(idle_seconds=0, now=DAY + timedelta(days=1), spark_event=ev)
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'])
    spark_line(spark)
    print(C('  连续陪伴满 7 天 → 升到 1 档佩戴', DIM))
    for i in range(5, 8):
        ev = spark.register_activity(date(2025, 9, i))
        eng.on_tick(idle_seconds=0, now=DAY + timedelta(days=i - 1), spark_event=ev)
    spark_line(spark)
    pause()


def show_reminders(spark, eng):
    """W5-2 三档提醒（18:00 / 21:00 / 23:00）行为/回复联动。"""
    hr('W5-2 三档提醒（18:00 / 21:00 / 23:00）')
    print(C('  9月8日主人忙到很晚还没互动…（18:00 第一档提醒）', DIM))
    due = spark.remind_due(datetime(2025, 9, 8, 18, 5, 0))
    rec = eng.on_tick(idle_seconds=0, now=datetime(2025, 9, 8, 18, 5, 0),
                      spark_reminder=due)
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'], r.get('tone', 'cheer'))
    spark.mark_reminded(18, date(2025, 9, 8))
    print(C('  21:00 还没回来…（第二档提醒）', DIM))
    due = spark.remind_due(datetime(2025, 9, 8, 21, 0, 0))
    rec = eng.on_tick(idle_seconds=0, now=datetime(2025, 9, 8, 21, 0, 0),
                      spark_reminder=due)
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'], r.get('tone', 'cheer'))
    spark.mark_reminded(21, date(2025, 9, 8))
    print(C('  23:00 最后一档，再不续火就要灭了…（第三档提醒）', DIM))
    due = spark.remind_due(datetime(2025, 9, 8, 23, 0, 0))
    rec = eng.on_tick(idle_seconds=0, now=datetime(2025, 9, 8, 23, 0, 0),
                      spark_reminder=due)
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'], r.get('tone', 'cheer'))
    spark.mark_reminded(23, date(2025, 9, 8))
    pause()


def show_extinguish_recover(spark, eng):
    """W5-3 断档熄灭与挽回。"""
    hr('W5-3 断档熄灭 · 回归挽回')
    print(C('  9月9日整天没互动…周期检查结算断档 → 火花熄灭', DIM))
    ext = spark.settle_missed_days(date(2025, 9, 9))
    if ext:
        rec = eng.on_tick(idle_seconds=0, now=datetime(2025, 9, 9, 23, 30, 0),
                          spark_event={'event': 'extinguish', 'current_days': 0,
                                       'level': 0})
        for r in rec['reactions']:
            if r.get('tts_text'):
                say(r['tts_text'], r.get('tone', 'cheer'))
    spark_line(spark)
    print(C('  9月10日主人想起它，回来互动 → 火花挽回重燃', DIM))
    ev = spark.register_activity(date(2025, 9, 10))
    rec = eng.on_tick(idle_seconds=0, now=datetime(2025, 9, 10, 12, 0, 0),
                      spark_event=ev)
    for r in rec['reactions']:
        if r.get('tts_text'):
            say(r['tts_text'], r.get('tone', 'cheer'))
    spark_line(spark)
    pause()


def show_daily_tasks(spark):
    """W5-4 每日任务（随机刷新 / 进度 / 完成 +2 机会）。"""
    hr('W5-4 每日任务（每天 4 点随机刷新）')
    tasks = spark.daily_tasks(date(2025, 9, 10))
    print(C('  今日任务：' + '、'.join(
        f'{t["task_type"]}×{t["target"]}' for t in tasks), DIM))
    bonus = False
    for t in tasks:
        for _ in range(t['target']):
            res = spark.report_event(t['task_type'], date(2025, 9, 10))
            if res['bonus_granted']:
                bonus = True
    print(C(f'  全部完成 → +2 次抽奖机会（bonus_granted={bonus}）', DIM))
    print(C(f'  当前抽奖机会：{spark.lottery_chances(date(2025, 9, 10))} 次', BOLD))
    pause()


def show_signin_lottery(spark, exp):
    """W5-5 签到 + 抽奖（概率出奖 / 200 保底 / 经验不计周上限）。"""
    hr('W5-5 签到 + 抽奖（40/30/20/9.5/0.5% · 200 次保底）')
    print(C('  每日签到 → +1 次抽奖机会', DIM))
    spark.sign_in(date(2025, 9, 10))
    print(C(f'  签到后抽奖机会：{spark.lottery_chances(date(2025, 9, 10))} 次', DIM))
    for _ in range(3):
        result = spark.draw_lottery(date(2025, 9, 10))
        if not result['ok']:
            print(C('  （没有抽奖机会了）', DIM))
            break
        say(result['message'], 'cheer')
        # 抽奖经验 → weekly-exempt 加点（不计每周上限）
        r = exp.lottery_gain(result['exp'], note=f'抽奖「{result["prize"]}」')
        print(C(f'    经验结算：+{result["exp"]}（本周不计上限）→ 当前等级 '
                f'{exp.get_state()["level"]}', DIM))
    print(C(f'  今日累计：{spark.today_summary(date(2025, 9, 10))["exp_gained"]} 经验', DIM))
    print(C('  （200 次未中超级大奖 → 第 200 次保底出超级大奖，单测已锁定）', DIM))
    pause()


def show_milestone(spark, eng):
    """W5-6 里程碑解锁玩法（LED 灯位 / 肤位数据占位）+ 双栈集成。"""
    hr('W5-6 里程碑解锁玩法（LED 灯位 / 肤位数据占位）')
    for lv in (1, 5, 10, 15, 20):
        u = spark.milestone_unlocks(lv)
        line = (f'LV.{lv}: 功能 {len(u["features"])} 项 ｜ LED {u["led"]} '
                f'｜ 肤位 {u["skin"]}')
        print(C(f'  {line}', DIM))
    print(C('  （LED 灯位 / 肤位为数据占位，供前端主题/皮肤切换与外观成长消费）', DIM))
    print(C('  双栈集成：以上火花提醒 / 状态事件均由决策引擎 BT 统一调度（双栈）', DIM))
    pause()


def final_card(spark, exp):
    hr('狗狗状态卡（W5 最终）')
    st = spark.get_spark()
    es = exp.get_state()
    print(C(f'  等级 LV.{es["level"]} ｜ 总经验 {es["total_exp"]} ｜ '
            f'火花连续 {st["current_days"]} 天（{st["level"]}/5 档）', BOLD))
    print(C('    (^o^)   我会记得陪你，也会在快忘记时提醒你。汪！', GREEN))
    print()
    print(C('演示结束 · 谢谢观看', BOLD))
    print(C('提示：单测 28 项见 tests/test_spark_w5.py + test_decision_w5.py；'
            'ROS 联调用 start_demo.sh', DIM))


def main():
    hr('养成系机械狗 · W5 火花计划 + 综合 独立演示（无 ROS）')
    print(C('  环境：Python 标准库 · 承接 W1-W4，新增火花计划引擎 + 双栈集成', DIM))
    replay_w14()

    tmp = tempfile.TemporaryDirectory()
    db = os.path.join(tmp.name, 'moopet.db')
    spark = SparkEngine(db)
    exp = ExpEngine(db)
    eng = DecisionEngine()

    show_ignite_and_keep(spark, eng)
    show_reminders(spark, eng)
    show_extinguish_recover(spark, eng)
    show_daily_tasks(spark)
    show_signin_lottery(spark, exp)
    show_milestone(spark, eng)
    final_card(spark, exp)

    spark.close()
    exp.close()


if __name__ == '__main__':
    main()
