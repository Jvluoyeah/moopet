#!/usr/bin/env python3
"""缓冲用例：离线队列 / 去重窗口 / 乱序归位。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_link import (DedupWindow, Envelope, FakeClock, OfflineQueue,  # noqa: E402
                         QueueConfig, ReorderBuffer)


def env(seq, ts=0.0, ttl=0.0, src='dog', kind='state'):
    return Envelope(kind=kind, payload={'i': seq}, src=src, dst='backpack',
                    seq=seq, ts=ts, ttl=ttl)


# ---------------- 离线队列 ----------------
def test_queue_fifo_then_sorted_on_drain():
    q = OfflineQueue(clock=FakeClock())
    for s in (3, 1, 2):
        q.push(env(s))
    out = q.drain()
    assert [e.seq for e in out] == [1, 2, 3]      # 补发按序号，不按入队顺序
    assert len(q) == 0


def test_queue_drops_expired_on_push():
    c = FakeClock(100.0)
    q = OfflineQueue(clock=c)
    assert q.push(env(1, ts=100.0, ttl=5.0)) is True
    c.advance(10.0)
    assert q.push(env(2, ts=100.0, ttl=5.0)) is False     # 入队时就已过期
    assert q.stats()['dropped_expired'] == 1


def test_queue_drops_expired_on_drain():
    c = FakeClock(100.0)
    q = OfflineQueue(clock=c)
    q.push(env(1, ts=100.0, ttl=5.0))
    q.push(env(2, ts=100.0, ttl=0.0))            # 永不过期
    c.advance(10.0)
    out = q.drain()
    assert [e.seq for e in out] == [2]
    assert q.stats()['dropped_expired'] == 1


def test_queue_bounded_keeps_newest():
    q = OfflineQueue(QueueConfig(max_items=3), clock=FakeClock())
    for s in range(1, 6):
        q.push(env(s))
    assert len(q) == 3
    assert [e.seq for e in q.peek()] == [3, 4, 5]   # 丢最旧，保留最新
    assert q.stats()['dropped_full'] == 2


def test_queue_clear_and_empty():
    q = OfflineQueue(clock=FakeClock())
    assert q.is_empty()
    q.push(env(1))
    q.clear()
    assert q.is_empty()
    assert q.drain() == []


# ---------------- 去重窗口 ----------------
def test_dedup_marks_duplicates():
    d = DedupWindow(capacity=8)
    assert d.check_and_mark('m1') is False        # 第一次
    assert d.check_and_mark('m1') is True         # 重复
    assert d.check_and_mark('m2') is False
    assert d.stats()['duplicates'] == 1


def test_dedup_lru_eviction():
    d = DedupWindow(capacity=2)
    d.check_and_mark('a')
    d.check_and_mark('b')
    d.check_and_mark('c')                          # 挤掉 a
    assert d.seen('a') is False
    assert d.seen('b') and d.seen('c')
    assert d.check_and_mark('a') is False          # 被遗忘后可再次通过


def test_dedup_touch_refreshes_lru():
    d = DedupWindow(capacity=2)
    d.check_and_mark('a')
    d.check_and_mark('b')
    d.check_and_mark('a')                          # 命中，a 变最新
    d.check_and_mark('c')                          # 该挤掉 b
    assert d.seen('a') and not d.seen('b')


# ---------------- 乱序归位 ----------------
def test_reorder_in_order_passthrough():
    r = ReorderBuffer(expected_seq=1, clock=FakeClock())
    assert [e.seq for e in r.push(env(1), 0.0)] == [1]
    assert [e.seq for e in r.push(env(2), 0.0)] == [2]
    assert r.held_count() == 0


def test_reorder_holds_gap_then_releases():
    r = ReorderBuffer(expected_seq=1, clock=FakeClock())
    assert r.push(env(2), 0.0) == []              # 缺 1，先按住
    assert r.held_count() == 1
    out = r.push(env(1), 0.0)                     # 补齐 → 1、2 一起放行
    assert [e.seq for e in out] == [1, 2]
    assert r.held_count() == 0


def test_reorder_gap_timeout_forces_flush():
    c = FakeClock()
    r = ReorderBuffer(expected_seq=1, gap_timeout=1.0, clock=c)
    r.push(env(5), c.now())
    c.advance(0.5)
    assert r.flush(c.now()) == []                 # 还没超时，继续等
    c.advance(0.6)
    out = r.flush(c.now())
    assert [e.seq for e in out] == [5]            # 超时放行，避免一条丢包卡死
    assert r.stats()['forced_flush'] == 1


def test_reorder_drops_stale_seq():
    r = ReorderBuffer(expected_seq=10, clock=FakeClock())
    assert r.push(env(3), 0.0) == []
    assert r.stats()['dropped_old'] == 1


def test_reorder_max_hold_bounds_memory():
    r = ReorderBuffer(expected_seq=1, gap_timeout=99.0, max_hold=3, clock=FakeClock())
    for s in (5, 6, 7):
        r.push(env(s), 0.0)
    assert r.held_count() == 3
    out = r.push(env(8), 0.0)                     # 超过上限 → 强制放行
    assert out and r.held_count() <= 3


def test_reorder_reset():
    r = ReorderBuffer(expected_seq=1, clock=FakeClock())
    r.push(env(9), 0.0)
    r.reset(expected_seq=9)
    assert r.held_count() == 0
    assert r.next_seq == 9
