#!/usr/bin/env python3
"""狗侧 · 经验结算节点（W2 核心联调）。

订阅背包仿真感知（touch/vision/audio/env）+ 狗侧里程（odom），
将 7 种来源归一交给 ExpEngine 加点结算，发布 /dog/state 状态广播，
并提供 /dog/action 服务（投影/通讯/握手/指引 等动作加点）。

用法：
  ros2 run moopet_dog exp_engine_node
  ros2 run moopet_dog exp_engine_node --ros-args -p db_path:=/path/to/moopet.db
"""
import os

import rclpy
from rclpy.node import Node

from moopet_interfaces.msg import (AirQualityMsg, DogStateMsg, HeartbeatMsg,
                                   OdomMsg, TouchEventMsg, VisionMsg, VoiceCmdMsg)
from moopet_interfaces.srv import DogAction
from moopet_core.exp_engine import ExpEngine

DEFAULT_DB = os.path.join(os.path.expanduser('~'), '.moopet', 'moopet.db')
PET_GESTURES = ('pat', 'stroke')
HEARTBEAT_TIMEOUT_S = 15.0      # 超过 15s 未收到背包心跳视为断连


class ExpEngineNode(Node):
    def __init__(self):
        super().__init__('dog_exp_engine')
        self.declare_parameter('db_path', DEFAULT_DB)
        db_path = self.get_parameter('db_path').get_parameter_value().string_value
        self.engine = ExpEngine(db_path)

        self.pub_state = self.create_publisher(DogStateMsg, '/dog/state', 10)

        self._walk_last = None
        self._last_heartbeat = None
        self._heartbeat_ok = False

        # ---- 订阅背包感知 + 狗侧里程 ----
        self.create_subscription(TouchEventMsg, '/backpack/touch/zone', self.on_touch, 10)
        self.create_subscription(VisionMsg, '/backpack/vision/motion', self.on_motion, 10)
        self.create_subscription(VisionMsg, '/backpack/vision/expression', self.on_expression, 10)
        self.create_subscription(VoiceCmdMsg, '/backpack/audio/voice_cmd', self.on_voice, 10)
        self.create_subscription(AirQualityMsg, '/backpack/env/air_quality', self.on_air, 10)
        self.create_subscription(OdomMsg, '/dog/odom', self.on_odom, 10)
        self.create_subscription(HeartbeatMsg, '/backpack/heartbeat', self.on_heartbeat, 10)

        # ---- 服务 ----
        self.srv = self.create_service(DogAction, '/dog/action', self.on_action)

        # ---- 周期任务：衰减检查 + 心跳监测 ----
        self.create_timer(5.0, self._housekeeping)

        st = self.engine.get_state()
        self.get_logger().info(
            f'[exp_engine] 初始化完成 等级={st["level"]} 总经验={st["total_exp"]} '
            f'DB={db_path}')

    # ---------------- 事件回调 ----------------

    def on_touch(self, msg: TouchEventMsg):
        if msg.gesture in PET_GESTURES:
            self._settle(self.engine.gain('pet', note=f'抚摸 zone={msg.zone}'))

    def on_motion(self, msg: VisionMsg):
        if msg.value == 'handshake':
            self._settle(self.engine.gain('handshake', note='视觉识别握手'))

    def on_expression(self, msg: VisionMsg):
        if msg.value in ('happy', 'sad', 'angry', 'tired', 'neutral'):
            self.engine.set_emotion(msg.value)

    def on_voice(self, msg: VoiceCmdMsg):
        if msg.intent == 'call':
            self._settle(self.engine.gain('call', note=f'呼唤："{msg.text}"'))
        elif msg.intent == 'guide':
            self._settle(self.engine.gain('guide', note='完成使用指引全套流程'))
        if msg.emotion in ('happy', 'sad', 'angry', 'tired', 'neutral'):
            self.engine.set_emotion(msg.emotion)

    def on_air(self, msg: AirQualityMsg):
        if msg.ventilated:
            self._settle(self.engine.gain('ventilate', note='通风完成，空气质量恢复'))

    def on_odom(self, msg: OdomMsg):
        if self._walk_last is None:
            self._walk_last = msg.distance
            return
        delta = msg.distance - self._walk_last
        self._walk_last = msg.distance
        if delta < 0 or delta > 1000:      # 里程重置/异常，忽略
            return
        for r in self.engine.add_walk_distance(delta):
            self._settle(r)

    def on_heartbeat(self, msg: HeartbeatMsg):
        self._last_heartbeat = self.get_clock().now()

    # ---------------- 服务 ----------------

    def on_action(self, request, response):
        at = request.action_type
        handler = {
            'projector':     lambda: self.engine.gain('projector', note='使用投影功能'),
            'communication': lambda: self.engine.gain('communication', note='使用通讯功能'),
            'handshake':     lambda: self.engine.gain('handshake', note='执行握手'),
            'guide':         lambda: self.engine.gain('guide', note='完成使用指引'),
        }
        if at in handler:
            result = handler[at]()
            self._settle(result)
            response.success = True
            response.exp_gained = result['exp_gained']
            response.message = result['message']
        else:
            response.success = False
            response.exp_gained = 0
            response.message = f'未知动作类型: {at}'
        return response

    # ---------------- 结算落地 ----------------

    def _settle(self, result):
        if result is None:
            return
        if result['exp_gained'] > 0:
            if result['leveled_up']:
                self.get_logger().info(
                    f"[升级] {result['old_level']}级 -> {result['level']}级 "
                    f"({result['source']} +{result['exp_gained']}经验)")
            else:
                self.get_logger().info(
                    f"[加点] {result['source']} +{result['exp_gained']}经验 "
                    f"当前{result['level']}级 本周{result['week_exp']}/2000")
        elif result['capped']:
            self.get_logger().info(f"[封顶] {result['source']} 本周已达上限，不加点")
        for name in result.get('unlocked', []):
            self.get_logger().info(f'[成就解锁] {name}')
        if result.get('exp_gained', 0) > 0 or result.get('unlocked'):
            self._publish_state(result['message'])

    def _publish_state(self, message=''):
        st = self.engine.get_state()
        msg = DogStateMsg()
        msg.level = st['level']
        msg.total_exp = st['total_exp']
        msg.week_exp = st['week_exp']
        msg.streak_days = st['streak_days']
        msg.emotion = st['emotion']
        msg.last_action = message
        msg.message = message
        msg.stamp = self.get_clock().now().to_msg()
        self.pub_state.publish(msg)

    # ---------------- 周期任务 ----------------

    def _housekeeping(self):
        self.engine.decay_check()
        if self._last_heartbeat is None:
            return
        now = self.get_clock().now()
        since = (now - self._last_heartbeat).nanoseconds / 1e9
        if since > HEARTBEAT_TIMEOUT_S:
            if self._heartbeat_ok:
                self._heartbeat_ok = False
                self.get_logger().warn('[心跳] 背包盒子断连（超过15s未收到心跳）')
        else:
            if not self._heartbeat_ok:
                self._heartbeat_ok = True
                self.get_logger().info('[心跳] 背包盒子在线')


def main(args=None):
    rclpy.init(args=args)
    node = ExpEngineNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.engine.close()
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
