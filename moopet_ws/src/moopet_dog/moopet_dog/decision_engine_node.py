#!/usr/bin/env python3
"""狗侧 · 行为决策引擎节点（W4 完稿 · W5 火花集成 · 李文扬）。

W3 能力（保留）：
  订阅 /dog/decision/event → DecisionEngine.on_event → BT 路由 → 动作/TTS 联动
W4 新增：
  - 周期检查（默认 60s）：engine.on_tick(idle_seconds, now) → 主动关怀（长沉默/深夜）、
    早安/晚安仪式、自定义纪念日、性格变化播报
  - 情感账户闲置衰减（on_tick 内按距上次互动时长折算）
  - 成长日记：跨日检测到后把昨天互动写成第一人称日记，落库 diary 表（DogDiary）
    DB 与 exp_engine_node 共用（参数 db_path，默认 ~/.moopet/moopet.db）
W5 新增（火花计划，双栈集成到 on_tick 统一调度）：
  - SparkEngine：连续陪伴（续火/熄灭/挽回）+ 三档提醒（18/21/23）+ 每日任务 + 签到抽奖
  - on_tick：火花断档结算（跨日熄灭）、三档提醒判定（命中且今天未续火 → 催续火）
  - 互动事件 → spark.register_activity + report_event（每日任务进度 + 完成 +2 抽奖机会）

用法：
  ros2 run moopet_dog decision_engine_node
  ros2 run moopet_dog decision_engine_node --ros-args -p db_path:=/path/to/moopet.db
"""
import json
import os
from datetime import datetime, timedelta

import rclpy
from rclpy.action import ActionClient
from rclpy.node import Node

from moopet_interfaces.action import TtsSpeak
from moopet_interfaces.msg import DecisionEventMsg, DogStateMsg
from moopet_interfaces.srv import DogAction
from moopet_core.decision import (DecisionEngine, DogDiary, SparkEngine,
                                 build_diary_content)

DEFAULT_DB = os.path.join(os.path.expanduser('~'), '.moopet', 'moopet.db')
TICK_PERIOD_S = 60.0          # 主动检查周期（关怀/仪式/纪念日/火花）
IDLE_FROM = 'events'          # 闲置时长从最近一次决策事件算起

# 决策事件 → 每日任务来源映射（对齐 SparkEngine.TASK_POOL 的 task_type）
EVENT_TO_TASK = {
    'pet': 'pet',
    'handshake': 'handshake',
    'call': 'call',
    'walk': 'walk',
    'quiz_answer': 'quiz',        # 答对才累计（下方按 event_value 过滤）
    'air_quality': 'ventilate',   # 通风完成才累计
}


class DecisionEngineNode(Node):
    def __init__(self):
        super().__init__('dog_decision_engine')
        self.declare_parameter('db_path', DEFAULT_DB)
        db_path = self.get_parameter('db_path').get_parameter_value().string_value
        self.engine = DecisionEngine()
        self.level = 1
        self.emotion = 'neutral'
        self.last_event_wall = None            # 最近一次决策事件（墙钟，算闲置）
        self._last_diary_date = datetime.now().strftime('%Y-%m-%d')
        try:
            self.diary = DogDiary(db_path)
        except Exception as e:                 # 数据库不可用不阻塞决策主线
            self.diary = None
            self.get_logger().warn(f'[diary] 日记库不可用（{e}），日记功能降级')
        try:
            self.spark = SparkEngine(db_path)  # W5 火花计划引擎（共用同库）
        except Exception as e:
            self.spark = None
            self.get_logger().warn(f'[spark] 火花库不可用（{e}），火花功能降级')

        self.create_subscription(DecisionEventMsg, '/dog/decision/event',
                                 self.on_event, 10)
        self.create_subscription(DogStateMsg, '/dog/state', self.on_state, 10)

        # 动作 / TTS 客户端（背包 TTS 节点 W4 起提供 /backpack/tts_speak）
        self.tts_client = ActionClient(self, TtsSpeak, '/backpack/tts_speak')
        self.action_client = self.create_client(DogAction, '/dog/action')

        # W4+W5：周期主动检查（主动关怀 / 早安晚安 / 纪念日 / 火花提醒 / 断档结算）
        self.create_timer(TICK_PERIOD_S, self.on_tick)

        self.get_logger().info(
            '[decision] 行为决策引擎就绪（W4：性格/情感账户/主动关怀/纪念日/日记；'
            f'W5：火花计划），DB={db_path}，检查周期={TICK_PERIOD_S:.0f}s')

    def on_state(self, msg: DogStateMsg):
        self.level = msg.level
        self.emotion = msg.emotion

    def on_event(self, msg: DecisionEventMsg):
        self.engine.set_state(level=self.level, emotion=self.emotion)
        record = self.engine.on_event(
            msg.event_type, msg.event_value,
            params=msg.params if msg.params else {})
        self.last_event_wall = datetime.now()
        self._on_interaction(msg.event_type, msg.event_value)
        self._log_record(record)
        for r in record['reactions']:
            self._apply_reaction(r)

    def on_tick(self):
        """W4+W5 周期检查：闲置时长 → 主动关怀/仪式/纪念日/火花提醒；跨日写日记。"""
        now = datetime.now()
        idle = 0.0
        if self.last_event_wall is not None:
            idle = (now - self.last_event_wall).total_seconds()
        self.engine.set_state(level=self.level, emotion=self.emotion)
        # W5：火花断档结算（跨日熄灭）+ 三档提醒判定
        spark_reminder = None
        spark_event = None
        if self.spark is not None:
            self.spark.settle_missed_days(now.date())
            spark_reminder = self.spark.remind_due(now)
            if spark_reminder:
                self.spark.mark_reminded(spark_reminder, now.date())
        record = self.engine.on_tick(idle_seconds=idle, now=now,
                                     spark_reminder=spark_reminder,
                                     spark_event=spark_event)
        self._log_record(record)
        for r in record['reactions']:
            self._apply_reaction(r)
        self._maybe_write_diary(now)

    # ---------------- W5 火花联动：互动事件 → 连续陪伴 + 每日任务 ----------------

    def _on_interaction(self, event_type, event_value):
        if self.spark is None:
            return
        now = datetime.now()
        # 连续陪伴登记 → 火花状态事件（续火/点燃/挽回）送入决策引擎联动
        spark_event = self.spark.register_activity(now.date())
        if spark_event and spark_event['event'] != 'already':
            rec = self.engine.on_tick(idle_seconds=0, now=now,
                                      spark_event=spark_event)
            for r in rec['reactions']:
                self._apply_reaction(r)
        # 每日任务进度（答对才算 quiz；通风完成才算 ventilate）
        source = EVENT_TO_TASK.get(event_type)
        if source == 'quiz' and event_value != 'answer_correct':
            return
        if source == 'ventilate' and not str(event_value).lower() in ('1', 'true',
                                                                      'ventilated'):
            return
        if source:
            res = self.spark.report_event(source, now.date())
            if res['bonus_granted']:
                self.get_logger().info(
                    '[spark] 今日每日任务全部完成 → +2 次抽奖机会')

    # ---------------- 成长日记（W4：跨日写昨日日记） ----------------

    def _maybe_write_diary(self, now):
        if self.diary is None:
            return
        today = now.strftime('%Y-%m-%d')
        if today == self._last_diary_date:
            return
        yesterday = (now - timedelta(days=1)).strftime('%Y-%m-%d')
        stats = self.engine.daily_stats(yesterday)
        content = build_diary_content(yesterday, stats, self.engine.get_state())
        try:
            self.diary.write(content, date=yesterday)
            self.get_logger().info(f'[diary] 已写入 {yesterday} 成长日记')
        except Exception as e:
            self.get_logger().warn(f'[diary] 写入失败：{e}')
        self._last_diary_date = today

    # ---------------- 日志与反应落地：动作 / TTS 联动 ----------------

    def _log_record(self, record):
        self.get_logger().info(
            f'[decision] {record["event_type"]}/{record["event_value"]} → '
            f'[{record["status"]}] 反应 {len(record["reactions"])} 条 '
            f'(性格={record["blackboard_snapshot"].get("personality")}, '
            f'账户={record["blackboard_snapshot"].get("emotion_account"):.0f})')

    def _apply_reaction(self, r):
        if not isinstance(r, dict):
            return
        tts = r.get('tts_text')
        action_type = r.get('action_type')
        if tts:
            self._speak(tts)
        if action_type:
            self._do_action(action_type, r.get('params', {}))

    def _speak(self, text):
        if not self.tts_client.server_is_ready():
            self.get_logger().info(
                f'[TTS] 背包 TTS 服务未就绪，跳过："{text}"')
            return
        goal = TtsSpeak.Goal()
        goal.text = text
        goal.rate = 1.0
        goal.pitch = 1.0
        future = self.tts_client.send_goal_async(goal)
        future.add_done_callback(self._on_tts_sent)

    def _on_tts_sent(self, future):
        gh = future.result()
        if gh is None or not gh.accepted:
            self.get_logger().warn('[TTS] 目标被拒绝')
            return
        result_fut = gh.get_result_async()
        result_fut.add_done_callback(self._on_tts_result)

    def _on_tts_result(self, future):
        res = future.result()
        if res is not None and res.result.success:
            self.get_logger().info(
                f'[TTS] 播放完成，时长 {res.result.duration:.1f}s')
        else:
            self.get_logger().warn('[TTS] 播放失败或中断')

    def _do_action(self, action_type, params):
        if not self.action_client.service_is_ready():
            self.get_logger().info(
                f'[动作] /dog/action 服务未就绪，跳过：{action_type}')
            return
        req = DogAction.Request()
        req.action_type = action_type
        req.params = json.dumps(params, ensure_ascii=False) if params else ''
        future = self.action_client.call_async(req)
        future.add_done_callback(lambda f: self._on_action_result(action_type, f))

    def _on_action_result(self, action_type, future):
        res = future.result()
        if res is not None and res.success:
            self.get_logger().info(
                f'[动作] {action_type} 执行成功，+{res.exp_gained} 经验：{res.message}')
        else:
            self.get_logger().info(f'[动作] {action_type} 执行失败：'
                                   f'{res.message if res else "服务不可达"}')


def main(args=None):
    rclpy.init(args=args)
    node = DecisionEngineNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
