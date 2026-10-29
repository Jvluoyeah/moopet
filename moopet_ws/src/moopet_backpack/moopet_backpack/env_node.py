#!/usr/bin/env python3
"""W2 · 仿真 env_node（牛浩然条目，李文扬联调用）。

模拟 ENS160 / PMS5003 空气质量发布：/backpack/env/air_quality
demo 模式：正常 → 空气变差(触发通风提醒) → 用户通风(ventilated=True) → 恢复
经验引擎据此给「居家类·通风」加点。

用法：
  ros2 run moopet_backpack env_node --demo --demo-delay 1.0
"""
import rclpy
from rclpy.node import Node

from moopet_interfaces.msg import AirQualityMsg

# (delay_sec, pm2_5, tvoc, co2, warning_level, ventilated)
DEMO_SEQ = [
    (1.0, 18, 60, 450, 0, False),    # 正常
    (6.0, 82, 480, 1450, 2, False),  # 变差 → 触发通风提醒
    (9.0, 82, 480, 1450, 2, True),   # 用户已通风 → +10 经验
    (12.0, 15, 40, 380, 0, False),   # 恢复
]


class EnvNode(Node):
    def __init__(self, demo=False, demo_delay=0.0):
        super().__init__('backpack_env')
        self.pub = self.create_publisher(AirQualityMsg, '/backpack/env/air_quality', 10)
        if demo:
            base = demo_delay
            for offset, pm, tvoc, co2, warn, vent in DEMO_SEQ:
                self.create_timer(
                    base + offset,
                    lambda pm=pm, tv=tvoc, c=co2, w=warn, v=vent: self._emit(pm, tv, c, w, v))
            self.get_logger().info(f'[env] demo 脚本已排程（{len(DEMO_SEQ)} 条）')

    def _emit(self, pm2_5, tvoc, co2, warning_level, ventilated):
        msg = AirQualityMsg()
        msg.pm2_5 = pm2_5
        msg.tvoc = tvoc
        msg.co2 = co2
        msg.warning_level = warning_level
        msg.ventilated = ventilated
        msg.stamp = self.get_clock().now().to_msg()
        self.pub.publish(msg)
        tag = '通风完成' if ventilated else ('警告' if warning_level >= 2 else '正常')
        self.get_logger().info(
            f'[env→air_quality] warn={warning_level} pm2.5={pm2_5} co2={co2} '
            f'ventilated={ventilated} ({tag})')


def main(args=None):
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--demo', action='store_true')
    parser.add_argument('--demo-delay', type=float, default=0.0)
    args, _ = parser.parse_known_args()

    rclpy.init(args=args)
    node = EnvNode(demo=args.demo, demo_delay=args.demo_delay)
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
