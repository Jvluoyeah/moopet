#!/usr/bin/env python3
"""传输层用例：虚拟网络 / 故障切换 / 回放端点。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_link import (FakeClock, FaultProfile, MemoryNetwork,  # noqa: E402
                         ReplayTransport)


def test_network_delivers_to_all_peers_except_sender():
    net = MemoryNetwork(FaultProfile())
    net.attach('dog')
    net.attach('backpack')
    net.attach('cloud')
    net.send('dog', b'hi', now=0.0)
    assert len(net.poll('backpack', 0.0)) == 1
    assert len(net.poll('cloud', 0.0)) == 1
    assert net.poll('dog', 0.0) == []          # 不回给自己


def test_network_endpoints_tracked():
    net = MemoryNetwork(FaultProfile())
    net.attach('dog')
    net.attach('backpack')
    assert net.endpoints() == ['backpack', 'dog']
    net.detach('dog')
    assert net.endpoints() == ['backpack']


def test_latency_defers_delivery():
    net = MemoryNetwork(FaultProfile(latency_ms=100.0))
    net.attach('dog')
    net.attach('backpack')
    net.send('dog', b'x', now=0.0)
    assert net.poll('backpack', 0.05) == []    # 还没到
    assert len(net.poll('backpack', 0.11)) == 1


def test_profile_can_change_at_runtime():
    net = MemoryNetwork(FaultProfile.lan())
    net.attach('dog')
    net.attach('backpack')
    assert net.poll('backpack', 0.0) == []
    net.send('dog', b'ok', now=0.0)
    assert len(net.poll('backpack', 0.01)) == 1

    net.partition(True)                        # 网断了
    net.send('dog', b'lost', now=0.01)
    assert net.poll('backpack', 0.02) == []

    net.heal()                                 # 网好了
    net.send('dog', b'back', now=0.02)
    assert len(net.poll('backpack', 0.03)) == 1


def test_partition_helper_roundtrip():
    net = MemoryNetwork(FaultProfile.lan())
    net.partition(True)
    assert net.profile.partition is True
    net.heal()
    assert net.profile.partition is False


def test_pending_counts_inflight():
    net = MemoryNetwork(FaultProfile(latency_ms=50.0))
    net.attach('dog')
    net.attach('backpack')
    net.send('dog', b'x', now=0.0)
    assert net.pending() == 1
    net.poll('backpack', 1.0)
    assert net.pending() == 0


def test_transport_stats_shape():
    net = MemoryNetwork(FaultProfile())
    t = net.attach('dog')
    net.attach('backpack')
    t.send(b'x', now=0.0)
    st = net.stats()
    for k in ('endpoints', 'sent', 'delivered', 'inflight', 'seed', 'profile'):
        assert k in st
    assert t.stats()['sent'] == 1


def test_closed_transport_stops_traffic():
    net = MemoryNetwork(FaultProfile())
    dog = net.attach('dog')
    net.attach('backpack')
    dog.close()
    assert dog.send(b'x', now=0.0) is False
    assert dog.poll(0.0) == []


def test_replay_follows_script_timing():
    script = [(0.0, 'dog', b'a'), (1.0, 'dog', b'b'), (2.0, 'dog', b'c')]
    rt = ReplayTransport('backpack', script, speed=1.0, base_time=0.0)
    assert len(rt.poll(0.0)) == 1
    assert len(rt.poll(0.5)) == 0
    assert [d for _, d in rt.poll(1.0)] == [b'b']
    assert [d for _, d in rt.poll(5.0)] == [b'c']
    assert rt.poll(9.0) == []


def test_replay_speed_scales_timeline():
    script = [(10.0, 'dog', b'x')]
    slow = ReplayTransport('bp', script, speed=1.0, base_time=0.0)
    fast = ReplayTransport('bp', script, speed=10.0, base_time=0.0)
    assert fast.poll(1.0) != []          # 10 倍速：1s 就走完 10s 的脚本
    assert slow.poll(1.0) == []


def test_replay_records_emitted():
    rt = ReplayTransport('bp', [], base_time=0.0)
    rt.send(b'out', now=1.0)
    assert rt.emitted() == [(1.0, b'out')]


def test_replay_is_sorted_by_time():
    script = [(2.0, 'dog', b'c'), (0.0, 'dog', b'a'), (1.0, 'dog', b'b')]
    rt = ReplayTransport('bp', script, base_time=0.0)
    assert [d for _, d in rt.poll(10.0)] == [b'a', b'b', b'c']
