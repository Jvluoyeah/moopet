#!/usr/bin/env python3
"""故障注入用例：可复现性 / 丢包 / 断链 / 重复 / 乱序 / 限带宽。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_link import FaultInjector, FaultProfile  # noqa: E402


def test_clean_profile_passes_through():
    f = FaultInjector(FaultProfile())
    out = f.transform(b'hello', now=0.0)
    assert len(out) == 1
    assert out[0] == (0.0, b'hello')


def test_latency_applied():
    f = FaultInjector(FaultProfile(latency_ms=50.0))
    (at, data), = f.transform(b'x', now=10.0)
    assert abs(at - 10.05) < 1e-9


def test_partition_drops_everything():
    f = FaultInjector(FaultProfile.blackout())
    assert f.transform(b'x', now=0.0) == []
    assert f.stats()['dropped'] == 1


def test_total_loss_drops_everything():
    f = FaultInjector(FaultProfile(loss_rate=1.0))
    assert f.transform(b'x', now=0.0) == []


def test_no_loss_keeps_everything():
    f = FaultInjector(FaultProfile(loss_rate=0.0))
    assert all(f.transform(b'x', now=0.0) for _ in range(50))


def test_duplicate_rate_produces_two_copies():
    f = FaultInjector(FaultProfile(duplicate_rate=1.0))
    out = f.transform(b'x', now=0.0)
    assert len(out) == 2
    assert f.stats()['duplicated'] == 1


def test_reorder_adds_extra_delay():
    f = FaultInjector(FaultProfile(reorder_rate=1.0), seed=1)
    at, _ = f.transform(b'x', now=0.0)[0]
    assert at >= 0.05                    # 被推后，才会与后发消息换位


def test_bandwidth_limits_speed():
    payload = b'0' * 1000
    fast = FaultInjector(FaultProfile(bandwidth_per_s=100_000))
    slow = FaultInjector(FaultProfile(bandwidth_per_s=1_000))
    at_fast, _ = fast.transform(payload, now=0.0)[0]
    at_slow, _ = slow.transform(payload, now=0.0)[0]
    assert at_slow > at_fast


def test_same_seed_same_fault_sequence():
    """同 seed 必须复现同一串故障——否则测试无法回归。"""
    def run():
        f = FaultInjector(FaultProfile(loss_rate=0.3, duplicate_rate=0.2), seed=7)
        return [len(f.transform(b'x', now=float(i))) for i in range(200)]
    assert run() == run()


def test_different_seed_differs():
    def run(seed):
        f = FaultInjector(FaultProfile(loss_rate=0.5), seed=seed)
        return [len(f.transform(b'x', now=float(i))) for i in range(200)]
    assert run(1) != run(2)


def test_invalid_rate_rejected():
    for kw in ({'loss_rate': 1.5}, {'duplicate_rate': -0.1}, {'reorder_rate': 2.0}):
        try:
            FaultProfile(**kw)
            raise AssertionError(f'{kw} 应被拒绝')
        except ValueError:
            pass


def test_presets_are_progressive():
    lan, weak, bad = FaultProfile.lan(), FaultProfile.weak_wifi(), FaultProfile.bad_4g()
    assert lan.latency_ms < weak.latency_ms < bad.latency_ms
    assert lan.loss_rate < weak.loss_rate < bad.loss_rate
    assert FaultProfile.blackout().partition is True


def test_profile_round_trip_dict():
    p = FaultProfile.bad_4g()
    assert FaultProfile.from_dict(p.to_dict()).to_dict() == p.to_dict()


def test_reset_restores_sequence():
    f = FaultInjector(FaultProfile(loss_rate=0.5), seed=3)
    first = [len(f.transform(b'x', now=float(i))) for i in range(50)]
    f.reset()
    assert first == [len(f.transform(b'x', now=float(i))) for i in range(50)]
