#!/usr/bin/env python3
"""背包盒子 · TTS 语音播报节点（W4 · 李文扬：决策 → 语音联动闭环）。

对齐排期 W4「双端联调：决策输出 → /dog/action + TTS」：
  实现 TtsSpeak 动作服务端 /backpack/tts_speak，接住决策引擎发来的播报目标：
    goal:    text（播报文本）/ rate（语速）/ pitch（音调）
    result:  success / duration（按文本长度模拟的播报时长）
    feedback: progress（0~1 播报进度）
  本节点为仿真实现：不接真实扬声器，demo 模式打印播报文本与进度；
  后续接入 edge-tts / 本地 TTS 时仅需替换 _synthesize 实现（接口不变）。

用法：
  ros2 run moopet_backpack tts_node            # 正常模式（静默模拟）
  ros2 run moopet_backpack tts_node --demo     # demo 模式（打印播报内容）
"""
import time

import rclpy
from rclpy.action import ActionServer, CancelResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node

from moopet_interfaces.action import TtsSpeak

CHAR_SECONDS = 0.08        # 每字模拟播报时长（秒）
MIN_DURATION = 0.5
MAX_DURATION = 30.0
FEEDBACK_PERIOD = 0.2


class TtsNode(Node):
    def __init__(self):
        super().__init__('backpack_tts')
        self.declare_parameter('demo', False)
        self.demo = self.get_parameter('demo').get_parameter_value().bool_value
        self.declare_parameter('voice', 'sim')   # 预留：edge-tts / 本地音色名
        self._server = ActionServer(
            self, TtsSpeak, '/backpack/tts_speak',
            execute_callback=self.on_goal,
            cancel_callback=lambda req: CancelResponse.ACCEPT,
            callback_group=ReentrantCallbackGroup())
        self.get_logger().info(
            f'[tts] 背包 TTS 节点就绪：/backpack/tts_speak '
            f'(demo={"打印播报" if self.demo else "静默模拟"}, voice=sim)')

    def on_goal(self, goal_handle):
        text = (goal_handle.request.text or '').strip()
        rate = max(0.5, float(goal_handle.request.rate or 1.0))
        self.get_logger().info(f'[tts] 收到播报目标（{len(text)} 字，语速 x{rate:.1f}）')
        duration = min(MAX_DURATION, max(MIN_DURATION, len(text) * CHAR_SECONDS / rate))
        feedback = TtsSpeak.Feedback()
        spoken = 0.0
        while spoken < duration:
            if goal_handle.is_cancel_requested:
                goal_handle.canceled()
                result = TtsSpeak.Result()
                result.success = False
                result.duration = spoken
                self.get_logger().info('[tts] 播报被取消')
                return result
            step = min(FEEDBACK_PERIOD, duration - spoken)
            time.sleep(step)
            spoken += step
            feedback.progress = min(1.0, spoken / duration)
            goal_handle.publish_feedback(feedback)
        if self.demo and text:
            self.get_logger().info(f'[tts] 🔊 播报：{text}')
        goal_handle.succeed()
        result = TtsSpeak.Result()
        result.success = True
        result.duration = float(duration)
        return result


def main(args=None):
    rclpy.init(args=args)
    node = TtsNode()
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
