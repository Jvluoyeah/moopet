#!/usr/bin/env python3
"""W1 · 冒烟测试节点：确认 Topic / Service / Action 三者往返可达。

- 单机自检：  ros2 run moopet_dog smoke_test_node --role both
- 双机联调： 狗机   ros2 run moopet_dog smoke_test_node --role server
            背包机 ros2 run moopet_dog smoke_test_node --role client
            （两台机器同一局域网 + 相同 ROS_DOMAIN_ID）

验证内容：
  T  Topic    /smoke/topic → /smoke/reply   发布→订阅→回显  往返
  S  Service  /smoke/service (DogAction.srv)               请求→响应
  A  Action   /smoke/action  (TtsSpeak.action)             目标→结果
"""
import time

import rclpy
from rclpy.action import ActionClient, ActionServer
from rclpy.node import Node
from std_msgs.msg import String

from moopet_interfaces.action import TtsSpeak
from moopet_interfaces.srv import DogAction

TOPIC = '/smoke/topic'
REPLY = '/smoke/reply'
SERVICE = '/smoke/service'
ACTION = '/smoke/action'


class SmokeNode(Node):
    def __init__(self, role='both'):
        super().__init__('smoke_test_node')
        self.role = role
        self._reply_received = False

        if role in ('server', 'both'):
            self._make_server()
        if role in ('client', 'both'):
            self._make_client()

    # ---------- 服务端 ----------
    def _make_server(self):
        self.pub = self.create_publisher(String, REPLY, 10)
        self.create_subscription(String, TOPIC, self._on_topic, 10)
        self.create_service(DogAction, SERVICE, self._on_service)
        self._action_server = ActionServer(self, TtsSpeak, ACTION, self._on_action)
        self.get_logger().info(f'[smoke:server] {TOPIC}/{SERVICE}/{ACTION} 就绪')

    def _on_topic(self, msg):
        self.get_logger().info(f'[smoke:server] 收到 Topic: "{msg.data}"，回显')
        reply = String()
        reply.data = f'echo:{msg.data}'
        self.pub.publish(reply)

    def _on_service(self, request, response):
        self.get_logger().info(
            f'[smoke:server] 收到 Service: {request.action_type}')
        response.success = True
        response.exp_gained = 0
        response.message = 'service-echo-ok'
        return response

    def _on_action(self, goal_handle):
        self.get_logger().info(
            f'[smoke:server] 收到 Action 目标: "{goal_handle.request.text}"')
        goal_handle.succeed()
        result = TtsSpeak.Result()
        result.success = True
        result.duration = 1.0
        return result

    # ---------- 客户端 ----------
    def _make_client(self):
        self._sub_reply = self.create_subscription(String, REPLY, self._on_reply, 10)
        self.get_logger().info('[smoke:client] 客户端就绪，等待发现...')

    def _on_reply(self, msg):
        self._reply_received = True
        self.get_logger().info(f'[smoke:client] Topic 回显成功: "{msg.data}"')

    def _spin_until(self, fut, timeout):
        deadline = time.time() + timeout
        while time.time() < deadline and not fut.done():
            rclpy.spin_once(self, timeout_sec=0.05)

    def run_tests(self):
        ok = True
        ok &= self._test_topic()
        ok &= self._test_service()
        ok &= self._test_action()
        self.get_logger().info(
            f'[smoke] T/S/A 冒烟结果: {"全部通过" if ok else "存在失败"}')
        return ok

    def _test_topic(self):
        pub = self.create_publisher(String, TOPIC, 1)
        msg = String()
        msg.data = 'T-往返'
        pub.publish(msg)
        self.get_logger().info('[smoke:T] Topic 已发布，等待回显...')
        deadline = time.time() + 6.0
        while time.time() < deadline and not self._reply_received:
            rclpy.spin_once(self, timeout_sec=0.05)
        if self._reply_received:
            self.get_logger().info('[smoke:T] Topic 往返成功')
            return True
        self.get_logger().error('[smoke:T] Topic 往返失败（未收到回显）')
        return False

    def _test_service(self):
        cli = self.create_client(DogAction, SERVICE)
        if not cli.wait_for_service(timeout_sec=5.0):
            self.get_logger().error('[smoke:S] Service 不可达')
            return False
        req = DogAction.Request()
        req.action_type = 'smoke'
        fut = cli.call_async(req)
        self._spin_until(fut, 5.0)
        if fut.result() and fut.result().success:
            self.get_logger().info(
                f'[smoke:S] Service 往返成功: {fut.result().message}')
            return True
        self.get_logger().error('[smoke:S] Service 往返失败')
        return False

    def _test_action(self):
        cli = ActionClient(self, TtsSpeak, ACTION)
        if not cli.wait_for_server(timeout_sec=5.0):
            self.get_logger().error('[smoke:A] Action 服务不可达')
            return False
        goal = TtsSpeak.Goal()
        goal.text = '汪汪'
        send = cli.send_goal_async(goal)
        self._spin_until(send, 5.0)
        gh = send.result()
        if gh and gh.accepted:
            result_fut = gh.get_result_async()
            self._spin_until(result_fut, 5.0)
            if result_fut.result() and result_fut.result().result.success:
                self.get_logger().info('[smoke:A] Action 往返成功')
                return True
        self.get_logger().error('[smoke:A] Action 往返失败')
        return False


def main(args=None):
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--role', choices=['both', 'server', 'client'], default='both')
    args, _ = parser.parse_known_args()

    rclpy.init(args=args)
    node = SmokeNode(role=args.role)

    if args.role == 'server':
        try:
            rclpy.spin(node)          # 常驻服务
        except KeyboardInterrupt:
            pass
    else:
        time.sleep(2.0)               # 等待 DDS 发现
        ok = node.run_tests()
        node.destroy_node()
        rclpy.shutdown()
        if not ok:
            raise SystemExit(1)


if __name__ == '__main__':
    main()
