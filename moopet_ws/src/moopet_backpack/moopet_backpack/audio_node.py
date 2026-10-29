#!/usr/bin/env python3
"""W2 · 仿真 audio_node（牛浩然条目，李文扬联调用）。

模拟语音命令发布：/backpack/audio/voice_cmd
- 手动模式：stdin 输入文本回车触发（intent 取 talk）
- demo 模式：按脚本时间轴自动连发（含 呼唤/使用指引/散步/握手 意图）

用法：
  ros2 run moopet_backpack audio_node                 # 手动
  ros2 run moopet_backpack audio_node --demo          # 自动脚本
  ros2 run moopet_backpack audio_node --demo --demo-delay 2.0
"""
import rclpy
from rclpy.node import Node

from moopet_interfaces.msg import VoiceCmdMsg

# (delay_sec, text, intent, emotion)  相对 demo 起点
DEMO_SEQ = [
    (1.0, '汪汪，小狗狗来啦！', 'guide', 'happy'),
    (4.0, '我叫你你都不理我，叫我一声！', 'call', 'neutral'),
    (8.0, '我们去散步吧！', 'walk', 'happy'),
    (12.0, '握手握手！', 'handshake', 'happy'),
    (16.0, '你今天累不累呀？', 'talk', 'neutral'),
]


class AudioNode(Node):
    def __init__(self, demo=False, demo_delay=0.0):
        super().__init__('backpack_audio')
        self.pub = self.create_publisher(VoiceCmdMsg, '/backpack/audio/voice_cmd', 10)
        self.demo = demo
        if demo:
            self._schedule_demo(demo_delay)
        else:
            self.get_logger().info('[audio] 手动模式：输入文本回车发送（intent=talk）')

    def _schedule_demo(self, delay):
        base = delay
        for offset, text, intent, emotion in DEMO_SEQ:
            self.create_timer(base + offset, lambda t=text, i=intent, e=emotion: self._emit(t, i, e))
        self.get_logger().info(f'[audio] demo 脚本已排程（{len(DEMO_SEQ)} 条）')

    def _emit(self, text, intent, emotion):
        msg = VoiceCmdMsg()
        msg.text = text
        msg.intent = intent
        msg.emotion = emotion
        msg.volume = 0.7
        msg.stamp = self.get_clock().now().to_msg()
        self.pub.publish(msg)
        self.get_logger().info(f'[audio→voice_cmd] intent={intent} "{text}"')


def main(args=None):
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--demo', action='store_true', help='自动脚本模式')
    parser.add_argument('--demo-delay', type=float, default=0.0, help='demo 起点延迟(秒)')
    args, _ = parser.parse_known_args()

    rclpy.init(args=args)
    node = AudioNode(demo=args.demo, demo_delay=args.demo_delay)

    if not args.demo:
        def reader():
            try:
                while True:
                    text = input('>>> ')
                    if text:
                        node._emit(text, 'talk', 'neutral')
            except EOFError:
                pass
        import threading
        threading.Thread(target=reader, daemon=True).start()

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
