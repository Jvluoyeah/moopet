#!/usr/bin/env python3
"""链路自检（link_doctor）：不接 ROS 也能一键验证通信层是否正常。

用法：
    python3 -m moopet_link.doctor            # 人类可读报告
    python3 -m moopet_link.doctor --json     # 机器可读（给 CI / 演示面板）
    ros2 run moopet_link link_doctor

做五件事：
    1. 依赖检查：确认不需要 rclpy 也能跑（可测性前提）
    2. 干净链路：双向收发 + 心跳 + RTT
    3. 弱网：丢包/重复/乱序下仍能送达，且结果可复现
    4. 断连自治：判定断连 → 消息进离线队列 → 恢复后自动补发
    5. 回放：同一份脚本回放两次结果一致（移植不变性的基础）
"""
import json
import sys

from .channel import LinkChannel
from .clock import FakeClock
from .envelope import KIND_STATE
from .faults import FaultProfile
from .health import LinkState
from .transport import MemoryNetwork, ReplayTransport


class Check:
    def __init__(self, name, desc):
        self.name = name
        self.desc = desc
        self.ok = False
        self.detail = ''
        self.metrics = {}

    def to_dict(self):
        return {'name': self.name, 'desc': self.desc, 'ok': self.ok,
                'detail': self.detail, 'metrics': self.metrics}


def _pair(profile=None, seed=0):
    clock = FakeClock()
    net = MemoryNetwork(profile or FaultProfile(), seed=seed)
    dog = LinkChannel('dog', 'backpack', net.attach('dog'), clock=clock, role='dog')
    bp = LinkChannel('backpack', 'dog', net.attach('backpack'), clock=clock, role='backpack')
    return net, dog, bp, clock


def check_no_ros_dependency():
    c = Check('依赖检查', '通信层核心不依赖 rclpy（没有 ROS 也能测）')
    leaked = 'rclpy' in sys.modules
    c.ok = not leaked
    c.detail = 'rclpy 未被打入依赖' if c.ok else 'rclpy 意外被导入，可测性受损'
    return c


def check_clean_link():
    c = Check('干净链路', '双向收发 + 心跳 + RTT 测量')
    net, dog, bp, clock = _pair(FaultProfile.lan())
    bp.beat()
    clock.advance(0.002)
    dog.poll()
    rtt = dog.health.avg_rtt()

    dog.send(KIND_STATE, {'level': 3})
    bp.send(KIND_STATE, {'ack': True})
    clock.advance(0.01)
    got_bp = bp.poll()
    got_dog = dog.poll()
    ok = (dog.is_peer_up() and len(got_bp) == 1 and len(got_dog) == 1
          and rtt is not None)
    c.ok = ok
    c.detail = f'对端状态={dog.state().value} 收到={len(got_bp)}/{len(got_dog)}'
    c.metrics = {'rtt_ms': round(rtt * 1000, 2) if rtt else None,
                 'state': dog.state().value}
    return c


def check_payload_fidelity():
    c = Check('数据保真', '中文/嵌套结构的信封往返不失真')
    net, dog, bp, clock = _pair()
    payload = {'tts_text': '主人，火花续上啦～', 'nested': {'k': [1, 2, 3]},
               'spark': {'days': 12, 'level': 1}}
    dog.send(KIND_STATE, payload)
    got = bp.poll()
    c.ok = bool(got) and got[0].payload == payload
    c.detail = 'payload 完全一致' if c.ok else f'不一致：{got[0].payload if got else None}'
    return c


def check_weak_network():
    c = Check('弱网可用', '丢包/重复/乱序下仍能送达，且同 seed 可复现')
    def run():
        net, dog, bp, clock = _pair(FaultProfile.weak_wifi(), seed=5)
        delivered = 0
        for i in range(60):
            dog.send(KIND_STATE, {'i': i})
            clock.advance(0.1)
            delivered += len([e for e in bp.poll() if e.kind == KIND_STATE])
        return delivered, bp
    a, bp = run()
    b, _ = run()
    c.ok = (a == b) and (0 < a < 60)
    counters = bp.stats()['counters']
    c.detail = f'送达 {a}/60，复现一致={a == b}'
    c.metrics = {'delivered': a, 'total': 60,
                 'lost_estimate': 60 - a,
                 'duplicates_deduped': counters['duplicate']}
    return c


def check_blackout_autonomy():
    c = Check('断连自治', '判定断连 → 消息进离线队列 → 恢复后自动补发')
    net, dog, bp, clock = _pair()
    bp.beat()
    dog.poll()                                   # 先建立在线认知
    clock.advance(20.0)                          # 静默 → 断连
    down = dog.is_peer_down()
    dog.send(KIND_STATE, {'buffered': True})
    queued = dog.pending()
    bp.beat()                                    # 对端回来
    dog.poll()
    got = bp.poll()
    replayed = any(e.payload.get('buffered') for e in got)
    c.ok = down and queued == 1 and replayed
    c.detail = (f'断连判定={down} 入队={queued} 恢复补发={replayed}')
    c.metrics = {'queued': queued, 'replayed': replayed}
    return c


def check_replay_determinism():
    c = Check('回放一致', '同一份录制回放两次，结果必须逐条相同（移植不变性的基础）')
    script = [(0.0, 'dog', b'{"k":1}'), (0.5, 'dog', b'{"k":2}')]
    def run():
        rt = ReplayTransport('backpack', script, base_time=0.0)
        return [d for t in (0.0, 0.6, 1.0) for _, d in rt.poll(t)]
    a, b = run(), run()
    c.ok = a == b and len(a) == 2
    c.detail = f'两次回放一致={a == b}，条数={len(a)}'
    return c


CHECKS = [check_no_ros_dependency, check_clean_link, check_payload_fidelity,
          check_weak_network, check_blackout_autonomy, check_replay_determinism]


def run_checks():
    results = []
    for fn in CHECKS:
        try:
            results.append(fn())
        except Exception as e:      # noqa: BLE001
            c = Check(fn.__name__, '检查过程抛异常')
            c.detail = f'{type(e).__name__}: {e}'
            results.append(c)
    return results


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    as_json = '--json' in argv
    results = run_checks()
    passed = sum(1 for r in results if r.ok)
    if as_json:
        print(json.dumps({'passed': passed, 'total': len(results),
                          'checks': [r.to_dict() for r in results]},
                         ensure_ascii=False, indent=2))
        return 0 if passed == len(results) else 1

    print('=' * 64)
    print('moopet_link 链路自检（link_doctor）')
    print('=' * 64)
    for r in results:
        mark = '✅' if r.ok else '❌'
        print(f'{mark} {r.name}：{r.detail}')
        if r.metrics:
            print(f'     {r.metrics}')
    print('-' * 64)
    print(f'{passed}/{len(results)} 项通过')
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
