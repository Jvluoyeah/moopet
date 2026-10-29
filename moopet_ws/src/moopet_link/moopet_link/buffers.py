"""消息缓冲三件套：离线队列 / 去重窗口 / 乱序归位。

这三个是"弱网下还能用"的关键：
  * OfflineQueue —— 断连期间攒下来的消息，恢复后按序号补发（带 TTL，旧的宁可丢）
  * DedupWindow  —— 重试与重复投递只处理一次
  * ReorderBuffer—— 乱序到达时先归位；但缺口超时后必须放行，否则一条丢包卡死整条链路
"""
from collections import OrderedDict


class QueueConfig:
    def __init__(self, max_items=1000, ttl=300.0):
        self.max_items = int(max_items)
        self.ttl = float(ttl)
        if self.max_items <= 0:
            raise ValueError('max_items 必须为正')

    def to_dict(self):
        return {'max_items': self.max_items, 'ttl': self.ttl}


class OfflineQueue:
    """断连期间的消息暂存区（有界 + 有寿命）。"""

    def __init__(self, config=None, clock=None):
        from .clock import RealClock
        self.cfg = config or QueueConfig()
        self.clock = clock or RealClock()
        self._items = []
        self._pushed = 0
        self._dropped_full = 0
        self._dropped_expired = 0
        self._replayed = 0

    def push(self, env, now=None):
        """入队。返回是否真的留下了。"""
        now = self.clock.now() if now is None else now
        self._pushed += 1
        if env.is_expired(now):
            self._dropped_expired += 1
            return False
        if len(self._items) >= self.cfg.max_items:
            # 丢最旧的，保证最新状态能出去
            self._items.pop(0)
            self._dropped_full += 1
        self._items.append(env)
        return True

    def drain(self, now=None):
        """取出全部未过期消息，按 seq 升序返回并清空。"""
        now = self.clock.now() if now is None else now
        alive = [e for e in self._items if not e.is_expired(now)]
        self._dropped_expired += len(self._items) - len(alive)
        self._items = []
        alive.sort(key=lambda e: (e.src, e.seq))
        self._replayed += len(alive)
        return alive

    def peek(self):
        return list(self._items)

    def expired_in_queue(self, now=None):
        now = self.clock.now() if now is None else now
        return [e for e in self._items if e.is_expired(now)]

    def clear(self):
        self._items = []

    def __len__(self):
        return len(self._items)

    def is_empty(self):
        return not self._items

    def stats(self):
        return {'pending': len(self._items), 'pushed': self._pushed,
                'dropped_full': self._dropped_full,
                'dropped_expired': self._dropped_expired,
                'replayed': self._replayed, 'config': self.cfg.to_dict()}


class DedupWindow:
    """最近处理过的 msg_id（LRU），用于丢弃重复投递。"""

    def __init__(self, capacity=2048):
        self.capacity = int(capacity)
        self._seen = OrderedDict()
        self._duplicates = 0
        self._total = 0

    def check_and_mark(self, msg_id):
        """返回 True 表示这是重复消息（调用方应丢弃）。"""
        self._total += 1
        if msg_id in self._seen:
            self._seen.move_to_end(msg_id)
            self._duplicates += 1
            return True
        self._seen[msg_id] = True
        if len(self._seen) > self.capacity:
            self._seen.popitem(last=False)
        return False

    def seen(self, msg_id):
        return msg_id in self._seen

    def clear(self):
        self._seen.clear()

    def stats(self):
        return {'capacity': self.capacity, 'tracked': len(self._seen),
                'total': self._total, 'duplicates': self._duplicates}


class ReorderBuffer:
    """按发送方序号归位，缺口超时后强制放行。

    expected_seq 传 None 表示"以收到的第一条消息为基线"——这是端点的默认用法：
    链路刚建好时我们并不知道对端从哪个序号开始，若无条件从 0 等起，
    第一条消息会被无辜扣住直到超时。
    """

    def __init__(self, expected_seq=None, gap_timeout=1.0, max_hold=256, clock=None):
        from .clock import RealClock
        self.next_seq = None if expected_seq is None else int(expected_seq)
        self.gap_timeout = float(gap_timeout)
        self.max_hold = int(max_hold)
        self.clock = clock or RealClock()
        self._held = {}            # seq -> (env, arrived_at)
        self._forced = 0
        self._delivered = 0
        self._dropped_old = 0

    def push(self, env, now=None):
        """投递一条消息，返回按序可交付的列表。"""
        now = self.clock.now() if now is None else now
        seq = env.seq
        if self.next_seq is None:
            self.next_seq = seq                     # 以首包为基线
        if seq < self.next_seq:
            self._dropped_old += 1
            return []
        if seq == self.next_seq:
            out = [env]
            self.next_seq += 1
            self._delivered += 1
            # 吃掉落在这条后面的连续消息
            while self.next_seq in self._held:
                nxt, _ = self._held.pop(self.next_seq)
                out.append(nxt)
                self._delivered += 1
                self.next_seq += 1
            return out
        # seq > next_seq：缺口
        if len(self._held) >= self.max_hold:
            out = self.flush(now, force=True)
            self._held[seq] = (env, now)
            return out
        self._held[seq] = (env, now)
        return []

    def flush(self, now=None, force=False):
        """放行。force=False 时只在缺口超时后才放行。"""
        now = self.clock.now() if now is None else now
        if not self._held:
            return []
        lowest = min(self._held)
        _, arrived = self._held[lowest]
        if not force and (now - arrived) < self.gap_timeout:
            return []
        out = []
        for seq in sorted(self._held):
            env, _ = self._held[seq]
            out.append(env)
            self._delivered += 1
        self.next_seq = max(self._held) + 1
        self._held = {}
        self._forced += 1
        return out

    def held_count(self):
        return len(self._held)

    def reset(self, expected_seq=None):
        self.next_seq = None if expected_seq is None else int(expected_seq)
        self._held = {}

    def stats(self):
        return {'next_seq': self.next_seq, 'held': len(self._held),
                'delivered': self._delivered, 'forced_flush': self._forced,
                'dropped_old': self._dropped_old,
                'gap_timeout': self.gap_timeout}
