#!/usr/bin/env python3
"""狗侧 · 状态管理节点（W2）。

订阅：
  - /dog/state              (DogStateMsg) 养成结算后的狗状态
  - /backpack/heartbeat     (HeartbeatMsg) 背包在线心跳
打印统一「状态卡」，作为 demo 的可见反馈（等级/经验/心情/连续/背包在线）。

用法：
  ros2 run moopet_dog state_mgr_node
"""
import rclpy
from rclpy.node import Node
from rclpy.time import Time

from moopet_interfaces.msg import DogStateMsg, HeartbeatMsg

EMOJI = {'happy': '[开心]', 'sad': '[难过]', 'angry': '[生气]',
         'tired': '[疲惫]', 'neutral': '[平静]'}


class StateMgrNode(Node):
    def __init__(self):
        super().__init__('dog_state_mgr')
        self._last = None
        self._hb = None
        self.create_subscription(DogStateMsg, '/dog/state', self.on_state, 10)
        self.create_subscription(HeartbeatMsg, '/backpack/heartbeat', self.on_heartbeat, 10)

    def on_state(self, msg: DogStateMsg):
        self._last = msg
        self._print()

    def on_heartbeat(self, msg: HeartbeatMsg):
        self._hb = msg

    def _print(self):
        if self._last is None:
            return
        s = self._last
        emo = EMOJI.get(s.emotion, f'[{s.emotion}]')
        hb_online = False
        if self._hb is not None:
            hb_online = (self.get_clock().now() - Time.from_msg(self._hb.stamp)
                         ).nanoseconds / 1e9 < 15.0
        online = '在线' if hb_online else '离线'
        print(f'\n========== 狗狗状态卡 ==========')
        print(f'  等级    : LV.{s.level}')
        print(f'  累计经验: {s.total_exp}')
        print(f'  本周经验: {s.week_exp}/2000')
        print(f'  心情    : {emo}')
        print(f'  连续天数: {s.streak_days} 天')
        print(f'  背包心跳: {online}')
        print(f'  最近事件: {s.last_action}')
        print(f'================================\n')


def main(args=None):
    rclpy.init(args=args)
    node = StateMgrNode()
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
