#!/usr/bin/env python3
"""W2 · 李文扬条目：/backpack/heartbeat 心跳（5s 一帧）。

背包盒子在线保活信号，狗侧据此监测断连/重连。
"""
import rclpy
from rclpy.node import Node

from moopet_interfaces.msg import HeartbeatMsg


def _cpu_percent():
    try:
        import psutil
        return psutil.cpu_percent(interval=None)
    except Exception:
        with open('/proc/stat') as f:
            fields = [int(x) for x in f.readline().split()[1:]]
        idle, total = fields[3], sum(fields)
        return round(100.0 * (1.0 - idle / total), 1)


def _mem_percent():
    try:
        import psutil
        return psutil.virtual_memory().percent
    except Exception:
        try:
            with open('/proc/meminfo') as f:
                lines = {k: int(v) for k, v in (l.split()[:2] for l in f)}
            return round(100.0 * (1.0 - lines['MemAvailable'] / lines['MemTotal']), 1)
        except Exception:
            return 0.0


class HeartbeatNode(Node):
    PERIOD_S = 5.0   # 心跳频率：5s

    def __init__(self):
        super().__init__('backpack_heartbeat')
        self.pub = self.create_publisher(HeartbeatMsg, '/backpack/heartbeat', 10)
        self.seq = 0
        self.timer = self.create_timer(self.PERIOD_S, self.tick)
        self.get_logger().info(f'[heartbeat] topic=/backpack/heartbeat 周期={self.PERIOD_S}s')

    def tick(self):
        msg = HeartbeatMsg()
        msg.node_id = self.get_name()
        msg.seq = self.seq
        msg.stamp = self.get_clock().now().to_msg()
        msg.cpu_percent = _cpu_percent()
        msg.mem_percent = _mem_percent()
        msg.alive = True
        self.seq += 1
        self.pub.publish(msg)
        self.get_logger().info(
            f'[heartbeat] seq={self.seq} cpu={msg.cpu_percent:.1f}% mem={msg.mem_percent:.1f}%')


def main(args=None):
    rclpy.init(args=args)
    rclpy.spin(HeartbeatNode())
    rclpy.shutdown()


if __name__ == '__main__':
    main()
