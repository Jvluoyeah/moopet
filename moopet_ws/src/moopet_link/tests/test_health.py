#!/usr/bin/env python3
"""链路健康用例：乐观启动 / 三态迁移 / 心跳 / RTT / 回调。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_link import FakeClock, HealthConfig, LinkHealth, LinkState  # noqa: E402


def make(cfg=None, assume_alive=True):
    clock = FakeClock()
    return LinkHealth('dog', 'backpack', cfg or HealthConfig(), clock,
                      assume_alive=assume_alive), clock


def test_optimistic_start_is_up():
    h, _ = make()
    assert h.state() == LinkState.UP
    assert not h.has_heard()          # 还没真的听到，但先按在线处理


def test_pessimistic_start_is_down():
    h, _ = make(assume_alive=False)
    assert h.state() == LinkState.DOWN


def test_beat_marks_heard():
    h, c = make()
    c.advance(1.0)
    h.beat(now=c.now())
    assert h.has_heard()
    assert h.state() == LinkState.UP
    assert h.last_seen() == c.now()


def test_degrade_after_one_missed_beat():
    """默认 5s 心跳：丢 1 拍(≥10s) 降级，丢 2 拍(≥15s) 断连。"""
    h, c = make()
    h.beat(now=c.now())
    c.advance(9.0)
    assert h.state() == LinkState.UP
    c.advance(2.0)                    # 累计 11s
    assert h.state() == LinkState.DEGRADED
    c.advance(5.0)                    # 累计 16s
    assert h.state() == LinkState.DOWN


def test_recovery_transitions_back_to_up():
    h, c = make()
    h.beat(now=c.now())
    c.advance(20.0)
    assert h.state() == LinkState.DOWN
    h.beat(now=c.now())
    assert h.state() == LinkState.UP


def test_transitions_recorded():
    h, c = make()
    h.beat(now=c.now())
    c.advance(11.0)                   # 先降级
    h.state()
    c.advance(5.0)                    # 再断连
    h.state()
    seqs = [(f, t) for _, f, t in h.transitions]
    assert ('LINK_UP', 'DEGRADED') in seqs
    assert ('DEGRADED', 'DOWN') in seqs


def test_change_callback_fires():
    h, c = make()
    seen = []
    h.on_change(lambda old, new, now: seen.append((old.value, new.value)))
    h.beat(now=c.now())
    c.advance(11.0)
    h.state()
    c.advance(5.0)
    h.state()
    assert ('LINK_UP', 'DEGRADED') in seen
    assert ('DEGRADED', 'DOWN') in seen


def test_callback_exception_does_not_break_link():
    h, c = make()
    h.on_change(lambda *a: (_ for _ in ()).throw(RuntimeError('boom')))
    h.beat(now=c.now())
    c.advance(20.0)
    assert h.state() == LinkState.DOWN      # 监听器炸了也要照常工作


def test_rtt_average():
    h, c = make()
    for rtt in (0.01, 0.03):
        h.beat(now=c.now(), rtt=rtt)
        c.advance(1.0)
    assert abs(h.avg_rtt() - 0.02) < 1e-9


def test_expected_beats_counts_missed():
    h, c = make()
    h.beat(now=c.now())
    c.advance(26.0)                   # 5s 一拍 → 本该 5 拍
    assert h.expected_beats() == 5


def test_custom_thresholds_validated():
    try:
        HealthConfig(heartbeat_interval=5.0, degraded_after=20.0, down_after=10.0)
        raise AssertionError('阈值倒置应当报错')
    except ValueError:
        pass


def test_stats_shape():
    h, c = make()
    h.beat(now=c.now())
    st = h.stats()
    for k in ('state', 'beats', 'missed_windows', 'avg_rtt_ms', 'thresholds'):
        assert k in st
    assert st['state'] == 'LINK_UP'
