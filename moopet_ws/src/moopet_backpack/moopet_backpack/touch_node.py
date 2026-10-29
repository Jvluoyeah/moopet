#!/usr/bin/env python3
"""W2 · 仿真 touch_node（牛浩然条目，李文扬联调用）。

模拟 MPR121 电容触摸发布：/backpack/touch/zone
demo 模式：对头部/背部多次抚摸（互动类·抚摸 → +10 经验/次）。

用法：
  ros2 run moopet_backpack touch_node --demo --demo-delay 1.0
"""
import rclpy
from rclpy.node import Node

from moopet_interfaces.msg import TouchEventMsg

# (delay_sec, zone, gesture, duration_ms)
DEMO_SEQ = [
    (1.5, 0, 'stroke', 900),
    (3.5, 1, 'pat', 600),
    (5.5, 0, 'stroke', 1200),
    (7.5, 1, 'pat', 700),
    (9.5, 0, 'stroke', 1500),
]

ZONE_NAME = {0: '头部', 1: '背部', 2: '前爪'}


class TouchNode(Node):
    def __init__(self, demo=False, demo_delay=0.0):
        super().__init__('backpack_touch')
        self.pub = self.create_publisher(TouchEventMsg, '/backpack/touch/zone', 10)
        if demo:
            base = demo_delay
            for offset, zone, gesture, dur in DEMO_SEQ:
                self.create_timer(
                    base + offset,
                    lambda z=zone, g=gesture, d=dur: self._emit(z, g, d))
            self.get_logger().info(f'[touch] demo 脚本已排程（{len(DEMO_SEQ)} 条）')

    def _emit(self, zone, gesture, duration_ms):
        msg = TouchEventMsg()
        msg.zone = zone
        msg.gesture = gesture
        msg.duration_ms = duration_ms
        msg.stamp = self.get_clock().now().to_msg()
        self.pub.publish(msg)
        self.get_logger().info(
            f'[touch→zone] {ZONE_NAME.get(zone, zone)} 抚摸({gesture}) {duration_ms}ms')


def main(args=None):
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--demo', action='store_true')
    parser.add_argument('--demo-delay', type=float, default=0.0)
    args, _ = parser.parse_known_args()

    rclpy.init(args=args)
    node = TouchNode(demo=args.demo, demo_delay=args.demo_delay)
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
