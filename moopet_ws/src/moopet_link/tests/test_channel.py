#!/usr/bin/env python3
"""链路端点集成用例：收发 / 心跳 / 去重 / 断连自治 / 恢复补发 / 故障注入。

这些用例全部走**单进程虚拟网络**，所以不需要 ROS 环境即可完整验证双机通信逻辑。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_link import (ChannelConfig, Envelope, FakeClock, FaultProfile,  # noqa: E402
                        LinkChannel, MemoryNetwork)


def make_pair(profile=None, seed=0, cfg=None):
    clock = FakeClock()
    net = MemoryNetwork(profile or FaultProfile(), seed=seed)
    dog = LinkChannel('dog', 'backpack', net.attach('dog'), clock=clock,
                      config=cfg, role='dog')
    bp = LinkChannel('backpack', 'dog', net.attach('backpack'), clock=clock,
                     config=cfg, role='backpack')
    return net, dog, bp, clock


# ---------------- 基本收发 ----------------
def test_send_and_receive():
    net, dog, bp, clock = make_pair()
    dog.send('state', {'level': 7})
    got = bp.poll()
    assert len(got) == 1
    assert got[0].kind == 'state'
    assert got[0].payload == {'level': 7}
    assert got[0].src == 'dog'


def test_bidirectional():
    net, dog, bp, clock = make_pair()
    dog.send('state', {'from': 'dog'})
    bp.send('decision', {'from': 'bp'})
    assert [e.payload['from'] for e in bp.poll()] == ['dog']
    assert [e.payload['from'] for e in dog.poll()] == ['bp']


def test_seq_increments_monotonically():
    net, dog, bp, clock = make_pair()
    for i in range(3):
        dog.send('state', {'i': i})
    got = bp.poll()
    assert [e.seq for e in got] == [1, 2, 3]


def test_chinese_payload_survives():
    net, dog, bp, clock = make_pair()
    dog.send('decision', {'tts_text': '主人，今天还没陪我呢～'})
    got = bp.poll()
    assert got[0].payload['tts_text'] == '主人，今天还没陪我呢～'


def test_kind_subscription():
    net, dog, bp, clock = make_pair()
    states, decisions = [], []
    bp.subscribe('state', lambda e: states.append(e.payload))
    bp.subscribe('decision', lambda e: decisions.append(e.payload))
    dog.send('state', {'a': 1})
    dog.send('decision', {'b': 2})
    bp.poll()
    assert states == [{'a': 1}]
    assert decisions == [{'b': 2}]


def test_subscriber_exception_isolated():
    net, dog, bp, clock = make_pair()
    seen = []
    bp.subscribe('state', lambda e: (_ for _ in ()).throw(RuntimeError('boom')))
    bp.subscribe('state', lambda e: seen.append(e.kind))
    dog.send('state', {})
    import contextlib
    import io
    with contextlib.redirect_stderr(io.StringIO()):   # 预期会打印告警，这里静音
        bp.poll()
    assert seen == ['state']              # 前一个订阅者炸了，后一个照常收到


def test_on_message_receives_all_kinds():
    net, dog, bp, clock = make_pair()
    kinds = []
    bp.on_message(lambda e: kinds.append(e.kind))
    dog.send('state', {})
    dog.beat()
    bp.poll()
    assert 'state' in kinds and 'heartbeat' in kinds


# ---------------- 心跳与健康 ----------------
def test_heartbeat_brings_peer_up_after_blackout():
    net, dog, bp, clock = make_pair()
    clock.advance(20.0)
    assert dog.is_peer_down()             # 静默太久 → 判定断连（触发自治）
    bp.beat()
    dog.poll()
    assert dog.is_peer_up()
    assert dog.health.has_heard()


def test_maybe_beat_respects_interval():
    net, dog, bp, clock = make_pair()
    assert dog.maybe_beat() is not None          # 首拍
    assert dog.maybe_beat() is None              # 间隔未到
    clock.advance(dog.cfg.health.heartbeat_interval + 0.1)
    assert dog.maybe_beat() is not None


def test_rtt_measured_from_heartbeat():
    net, dog, bp, clock = make_pair()
    bp.beat()
    clock.advance(0.25)                          # 模拟传输耗时
    dog.poll()
    assert abs(dog.health.avg_rtt() - 0.25) < 1e-9


# ---------------- 去重 ----------------
def test_duplicate_delivery_processed_once():
    net, dog, bp, clock = make_pair()
    env = dog.send('state', {'n': 1})
    raw = env.to_bytes()
    net.send('dog', raw, clock.now())            # 手工重投同一份字节
    net.send('dog', raw, clock.now())
    got = bp.poll()
    assert len(got) == 1
    assert bp.stats()['counters']['duplicate'] == 2   # 两份重投都被去重挡下


# ---------------- 断连自治与恢复补发 ----------------
def test_offline_queue_then_flush_on_recovery():
    net, dog, bp, clock = make_pair()
    bp.beat()
    dog.poll()                                   # 建立"对端在线"的认知
    clock.advance(20.0)
    assert dog.is_peer_down()

    dog.send('state', {'buffered': True})
    assert dog.pending() == 1                    # 断连期间进队列，不丢
    assert bp.poll() == []                       # 对端确实没收到

    bp.beat()
    dog.poll()                                   # 收到心跳 → 同一轮内自动补发
    got = bp.poll()
    assert any(e.payload.get('buffered') for e in got)
    assert dog.pending() == 0


def test_offline_queue_respects_ttl_on_replay():
    net, dog, bp, clock = make_pair()
    bp.beat()
    dog.poll()
    clock.advance(20.0)
    dog.send('state', {'stale': True}, ttl=1.0)
    clock.advance(10.0)                          # 这条已经过期
    bp.beat()
    dog.poll()
    got = bp.poll()
    assert not any(e.payload.get('stale') for e in got)


def test_heartbeat_is_not_queued_when_down():
    net, dog, bp, clock = make_pair()
    clock.advance(20.0)
    dog.beat()                                   # 断连时心跳不发也不攒
    assert dog.pending() == 0


def test_autonomy_signal_flips_back():
    net, dog, bp, clock = make_pair()
    assert dog.is_peer_up()
    clock.advance(11.0)
    assert dog.state().value == 'DEGRADED'       # 弱网先降级
    clock.advance(5.0)
    assert dog.is_peer_down()                    # 再断连
    bp.beat()
    dog.poll()
    assert dog.is_peer_up()


# ---------------- 异常输入 ----------------
def test_malformed_bytes_ignored():
    net, dog, bp, clock = make_pair()
    net.send('dog', b'{ not json', clock.now())
    assert bp.poll() == []
    assert bp.stats()['counters']['malformed'] == 1


def test_wrong_dst_ignored():
    net, dog, bp, clock = make_pair()
    env = Envelope(kind='state', payload={}, src='dog', dst='someone_else',
                   seq=1, ts=clock.now())
    net.send('dog', env.to_bytes(), clock.now())
    assert bp.poll() == []
    assert bp.stats()['counters']['wrong_dst'] == 1


def test_broadcast_reaches_peer():
    net, dog, bp, clock = make_pair()
    dog.send('diag', {'hello': 1}, dst='*')
    assert len(bp.poll()) == 1


def test_expired_message_ignored():
    net, dog, bp, clock = make_pair()
    env = Envelope(kind='state', payload={}, src='dog', dst='backpack',
                   seq=1, ts=clock.now(), ttl=1.0)
    clock.advance(5.0)
    net.send('dog', env.to_bytes(), clock.now())
    assert bp.poll() == []
    assert bp.stats()['counters']['expired'] == 1


def test_version_mismatch_counted_as_malformed():
    net, dog, bp, clock = make_pair()
    env = Envelope(kind='state', payload={}, src='dog', dst='backpack',
                   seq=1, ts=clock.now())
    d = env.to_dict()
    d['ver'] = 99
    import json
    net.send('dog', json.dumps(d).encode(), clock.now())
    assert bp.poll() == []
    assert bp.stats()['counters']['malformed'] == 1


# ---------------- 故障注入下仍可用 ----------------
def test_weak_wifi_is_deterministic_and_partially_lossy():
    def run():
        net, dog, bp, clock = make_pair(FaultProfile.weak_wifi(), seed=5)
        got = 0
        for i in range(60):
            dog.send('state', {'i': i})
            clock.advance(0.1)
            got += len([e for e in bp.poll() if e.kind == 'state'])
        return got
    a, b = run(), run()
    assert a == b, '同 seed 必须复现同一结果'
    assert 0 < a < 60, f'应部分丢失，实际收到 {a}/60'


def test_partition_blocks_then_heal_restores():
    net, dog, bp, clock = make_pair()
    bp.beat()
    dog.poll()                                   # 链路认知为在线
    net.partition(True)
    dog.send('state', {'during_partition': 1})
    clock.advance(1.0)
    assert bp.poll() == []                       # 断链期间确实收不到
    net.heal()
    clock.advance(1.0)
    dog.send('state', {'after_heal': 1})
    got = bp.poll()
    assert any(e.payload.get('after_heal') for e in got)


def test_unknown_partition_loses_message_but_recovers():
    """链路以为在线、实际断链时消息会丢——这是设计如此（靠上层重试/TTL 兜底），
    恢复后必须立刻可用，且不能把链路状态搞坏。"""
    net, dog, bp, clock = make_pair()
    net.partition(True)
    dog.send('state', {'lost': 1})
    clock.advance(0.5)
    assert bp.poll() == []
    net.heal()
    clock.advance(0.5)
    dog.send('state', {'ok': 1})
    got = bp.poll()
    assert [e.payload for e in got] == [{'ok': 1}]


def test_duplicate_injection_still_deduped():
    net, dog, bp, clock = make_pair(FaultProfile(duplicate_rate=1.0), seed=1)
    dog.send('state', {'once': True})
    clock.advance(0.01)                          # 等两份副本都到期
    got = bp.poll()
    assert len(got) == 1                          # 网络复制了两份，去重后只剩一条
    assert bp.stats()['counters']['duplicate'] == 1


# ---------------- 观测 ----------------
def test_stats_shape():
    net, dog, bp, clock = make_pair()
    dog.send('state', {})
    bp.poll()
    st = bp.stats()
    for k in ('node', 'peer', 'state', 'counters', 'health', 'queue',
              'dedup', 'reorder', 'transport', 'config'):
        assert k in st, f'stats 缺字段 {k}'
    assert st['counters']['received'] == 1


def test_event_log_records_lifecycle():
    net, dog, bp, clock = make_pair()
    clock.advance(20.0)                  # 静默 → 对端被判断连
    bp.beat()
    dog.poll()                           # 收到心跳 → 恢复
    kinds = [e['kind'] for e in dog.events()]
    assert 'link_state' in kinds
    states = [e['detail'] for e in dog.events() if e['kind'] == 'link_state']
    assert any(d.get('to') == 'LINK_UP' for d in states)


def test_reset_counters():
    net, dog, bp, clock = make_pair()
    dog.send('state', {})
    bp.poll()
    bp.reset_counters()
    assert bp.stats()['counters']['received'] == 0


def test_strict_order_holds_gap_after_baseline():
    """建立基线后，缺口会被按住，补齐即按序放行。"""
    clock = FakeClock()
    cfg = ChannelConfig(gap_timeout=1.0)
    net = MemoryNetwork(FaultProfile(), seed=0)
    b = LinkChannel('backpack', 'dog', net.attach('backpack'), clock=clock, config=cfg)

    def mk(seq):
        return Envelope(kind='state', payload={'i': seq}, src='dog', dst='backpack',
                        seq=seq, ts=clock.now())

    net.send('dog', mk(1).to_bytes(), clock.now())
    assert [e.payload['i'] for e in b.poll()] == [1]      # 首包建立基线
    net.send('dog', mk(3).to_bytes(), clock.now())
    assert b.poll() == []                                 # 缺 2 → 按住
    net.send('dog', mk(2).to_bytes(), clock.now())
    assert [e.payload['i'] for e in b.poll()] == [2, 3]    # 补齐 → 顺序放行


def test_strict_order_gap_timeout_releases():
    """缺口迟迟补不上时必须放行，否则一条丢包卡死整条链路。"""
    clock = FakeClock()
    cfg = ChannelConfig(gap_timeout=1.0)
    net = MemoryNetwork(FaultProfile(), seed=0)
    b = LinkChannel('backpack', 'dog', net.attach('backpack'), clock=clock, config=cfg)

    def mk(seq):
        return Envelope(kind='state', payload={'i': seq}, src='dog', dst='backpack',
                        seq=seq, ts=clock.now())

    net.send('dog', mk(1).to_bytes(), clock.now())
    b.poll()
    net.send('dog', mk(4).to_bytes(), clock.now())        # 缺 2、3
    assert b.poll() == []
    clock.advance(1.5)                                    # 超时
    assert [e.payload['i'] for e in b.poll()] == [4]


def test_non_strict_order_delivers_immediately():
    cfg = ChannelConfig(strict_order=False)
    net, dog, bp, clock = make_pair(cfg=cfg)
    e2 = Envelope(kind='state', payload={'i': 2}, src='dog', dst='backpack',
                  seq=2, ts=clock.now())
    net.send('dog', e2.to_bytes(), clock.now())
    assert [e.payload['i'] for e in bp.poll()] == [2]


# ---------------- 无 ROS 依赖 ----------------
def test_links_work_without_ros():
    """整个通信层必须能在没有 rclpy 的机器上跑通——这是可测性的前提。"""
    assert 'rclpy' not in sys.modules
    net, dog, bp, clock = make_pair()
    dog.beat()
    dog.send('state', {'ok': True})
    clock.advance(1.0)
    msgs = bp.poll()
    assert any(e.payload.get('ok') for e in msgs)
