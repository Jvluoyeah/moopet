#!/usr/bin/env python3
"""狗侧 · 里程节点（W2·/dog/odom，10Hz，遛狗统计用）。

口径：distance 为累计里程(米)，odom 每 10Hz 一帧。
- 通过 /dog/cmd/walk (std_srvs/SetBool) 控制走/停
- --demo 模式：自动走两段，快速跑完 ~200m 演示「每 50 米 +10 经验」

用法：
  ros2 run moopet_dog odom_node
  ros2 run moopet_dog odom_node --demo --demo-delay 1.0
"""
import math

import rclpy
from rclpy.node import Node
from std_srvs.srv import SetBool

from moopet_interfaces.msg import OdomMsg

DEMO_WALK_CNT = 4          # demo 段数
DEMO_DIST_PER_SEG = 60.0   # 每段里程 m（>50m，触发一次结算 + 余量）
DEMO_VEL = 12.0            # demo 线速度 m/s（加速演示）


class OdomNode(Node):
    def __init__(self, demo=False, demo_delay=0.0):
        super().__init__('dog_odom')
        self.declare_parameter('walk_velocity', 0.6)   # 真实遛狗速度 m/s
        self.vel = self.get_parameter('walk_velocity').get_parameter_value().double_value
        self._use_demo_vel = demo                        # demo 时用加速速度

        self.pub = self.create_publisher(OdomMsg, '/dog/odom', 10)
        self.srv = self.create_service(SetBool, '/dog/cmd/walk', self.on_cmd)

        self._distance = 0.0
        self._x = 0.0
        self._y = 0.0
        self._yaw = 0.0
        self._walking = False
        self._last_t = self.get_clock().now()

        self.create_timer(0.1, self.tick)              # 10Hz

        if demo:
            self._schedule_demo(demo_delay)

    def _schedule_demo(self, delay):
        self.get_logger().info(f'[odom] demo 已排程：{DEMO_WALK_CNT} 段 × {DEMO_DIST_PER_SEG}m')
        for i in range(DEMO_WALK_CNT):
            self.create_timer(delay + 2.0 + i * 3.5, lambda: self._set_walk(True))
            self.create_timer(delay + 2.0 + i * 3.5 + 1.5, lambda: self._set_walk(False))

    def on_cmd(self, request, response):
        self._set_walk(request.data)
        response.success = True
        response.message = 'walking' if request.data else 'stopped'
        return response

    def _set_walk(self, walking):
        self._walking = walking
        self.get_logger().info(f'[odom] 遛狗状态: {"行走" if walking else "停止"}')

    def tick(self):
        now = self.get_clock().now()
        dt = (now - self._last_t).nanoseconds / 1e9
        self._last_t = now

        if self._walking:
            v = DEMO_VEL if self._use_demo_vel else self.vel
            ds = v * dt
            self._distance += ds
            self._yaw += 0.02
            self._x += ds * math.cos(self._yaw)
            self._y += ds * math.sin(self._yaw)

        msg = OdomMsg()
        msg.x = self._x
        msg.y = self._y
        msg.yaw = self._yaw
        msg.linear_vel = (DEMO_VEL if self._use_demo_vel else self.vel) if self._walking else 0.0
        msg.distance = self._distance
        msg.stamp = now.to_msg()
        self.pub.publish(msg)


def main(args=None):
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--demo', action='store_true')
    parser.add_argument('--demo-delay', type=float, default=0.0)
    args, _ = parser.parse_known_args()

    rclpy.init(args=args)
    node = OdomNode(demo=args.demo, demo_delay=args.demo_delay)
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
