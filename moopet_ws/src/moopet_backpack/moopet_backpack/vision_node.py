#!/usr/bin/env python3
"""W2 · 仿真 vision_node（牛浩然条目，李文扬联调用）。

模拟摄像头视觉识别发布：
- /backpack/vision/expression  （表情识别结果）
- /backpack/vision/motion      （动作识别结果，如握手）
demo 模式按脚本时间轴自动连发（先识别表情 → 再识别握手动作）。

用法：
  ros2 run moopet_backpack vision_node --demo --demo-delay 1.0
"""
import rclpy
from rclpy.node import Node

from moopet_interfaces.msg import VisionMsg

# (delay_sec, detection, value, confidence)
DEMO_SEQ = [
    (2.0, 'expression', 'happy', 0.92),
    (5.0, 'expression', 'neutral', 0.80),
    (9.0, 'motion', 'handshake', 0.95),
    (13.0, 'expression', 'happy', 0.90),
]


class VisionNode(Node):
    def __init__(self, demo=False, demo_delay=0.0):
        super().__init__('backpack_vision')
        self.pub_expr = self.create_publisher(VisionMsg, '/backpack/vision/expression', 10)
        self.pub_mot = self.create_publisher(VisionMsg, '/backpack/vision/motion', 10)
        if demo:
            base = demo_delay
            for offset, detection, value, conf in DEMO_SEQ:
                self.create_timer(
                    base + offset,
                    lambda d=detection, v=value, c=conf: self._emit(d, v, c))
            self.get_logger().info(f'[vision] demo 脚本已排程（{len(DEMO_SEQ)} 条）')

    def _emit(self, detection, value, confidence):
        msg = VisionMsg()
        msg.detection = detection
        msg.value = value
        msg.confidence = confidence
        msg.stamp = self.get_clock().now().to_msg()
        if detection == 'motion':
            self.pub_mot.publish(msg)
            self.get_logger().info(f'[vision→motion] {value} (conf={confidence})')
        else:
            self.pub_expr.publish(msg)
            self.get_logger().info(f'[vision→expression] {value} (conf={confidence})')


def main(args=None):
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--demo', action='store_true')
    parser.add_argument('--demo-delay', type=float, default=0.0)
    args, _ = parser.parse_known_args()

    rclpy.init(args=args)
    node = VisionNode(demo=args.demo, demo_delay=args.demo_delay)
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
