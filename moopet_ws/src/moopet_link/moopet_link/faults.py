"""故障注入：把"弱网"变成可复现的测试条件。

双机联调最怕"偶发"——现场好的，换台机器就断。所以把故障做成参数化注入：
  * latency / jitter —— 延迟与抖动
  * loss_rate        —— 丢包
  * duplicate_rate   —— 重复投递（考验去重）
  * reorder_rate     —— 乱序（给部分消息额外加延迟，考验归位）
  * partition        —— 完全断链（考验断连自治与恢复补发）
  * bandwidth        —— 限带宽（按字节数折算发送耗时）

同一个 seed → 同一串故障序列，失败可复现、可进回归。
"""
import random


class FaultProfile:
    """一组网络故障参数。"""

    def __init__(self, latency_ms=0.0, jitter_ms=0.0, loss_rate=0.0,
                 duplicate_rate=0.0, reorder_rate=0.0, partition=False,
                 bandwidth_per_s=0):
        self.latency_ms = float(latency_ms)
        self.jitter_ms = float(jitter_ms)
        self.loss_rate = float(loss_rate)
        self.duplicate_rate = float(duplicate_rate)
        self.reorder_rate = float(reorder_rate)
        self.partition = bool(partition)
        self.bandwidth_per_s = int(bandwidth_per_s)
        for name, v in (('loss_rate', self.loss_rate),
                        ('duplicate_rate', self.duplicate_rate),
                        ('reorder_rate', self.reorder_rate)):
            if not 0.0 <= v <= 1.0:
                raise ValueError(f'{name} 必须在 0~1 之间，实际 {v}')

    @property
    def is_clean(self):
        return (self.latency_ms == 0 and self.jitter_ms == 0
                and self.loss_rate == 0 and self.duplicate_rate == 0
                and self.reorder_rate == 0 and not self.partition
                and self.bandwidth_per_s == 0)

    def to_dict(self):
        return {'latency_ms': self.latency_ms, 'jitter_ms': self.jitter_ms,
                'loss_rate': self.loss_rate, 'duplicate_rate': self.duplicate_rate,
                'reorder_rate': self.reorder_rate, 'partition': self.partition,
                'bandwidth_per_s': self.bandwidth_per_s}

    @classmethod
    def from_dict(cls, d):
        return cls(**{k: v for k, v in d.items() if k in (
            'latency_ms', 'jitter_ms', 'loss_rate', 'duplicate_rate',
            'reorder_rate', 'partition', 'bandwidth_per_s')})

    # ---- 预设场景（link_lab 直接引用） ----
    @classmethod
    def lan(cls):
        """局域网：几乎无损，1ms 级延迟。"""
        return cls(latency_ms=1.0, jitter_ms=0.5)

    @classmethod
    def weak_wifi(cls):
        """弱网：丢包 + 抖动 + 偶发乱序。"""
        return cls(latency_ms=40.0, jitter_ms=30.0, loss_rate=0.05,
                   duplicate_rate=0.02, reorder_rate=0.05)

    @classmethod
    def bad_4g(cls):
        """差网络：高延迟高丢包。"""
        return cls(latency_ms=180.0, jitter_ms=120.0, loss_rate=0.15,
                   duplicate_rate=0.05, reorder_rate=0.15)

    @classmethod
    def blackout(cls):
        """断链。"""
        return cls(partition=True)


class FaultInjector:
    """按 profile 决定每条消息何时到、到几次、或者干脆不到。"""

    def __init__(self, profile=None, seed=0):
        self.profile = profile or FaultProfile()
        self.seed = int(seed)
        self._rng = random.Random(self.seed)
        self._sent = 0
        self._dropped = 0
        self._duplicated = 0
        self._reordered = 0

    def transform(self, data, now):
        """返回 [(deliver_at, data), ...]；空列表 = 这条丢了。"""
        p = self.profile
        self._sent += 1
        if p.partition:
            self._dropped += 1
            return []
        if p.loss_rate > 0 and self._rng.random() < p.loss_rate:
            self._dropped += 1
            return []
        # 基础延迟 + 抖动
        delay = p.latency_ms / 1000.0
        if p.jitter_ms > 0:
            delay += (self._rng.random() * 2 - 1) * (p.jitter_ms / 1000.0)
        # 乱序：给一部分消息再加一段额外延迟，让它排到后面去
        if p.reorder_rate > 0 and self._rng.random() < p.reorder_rate:
            delay += 0.05 + self._rng.random() * 0.05
            self._reordered += 1
        # 限带宽：按消息大小折算
        if p.bandwidth_per_s > 0:
            delay += len(data) / float(p.bandwidth_per_s)
        delay = max(0.0, delay)
        out = [(now + delay, data)]
        if p.duplicate_rate > 0 and self._rng.random() < p.duplicate_rate:
            self._duplicated += 1
            out.append((now + delay + 0.001, data))
        return out

    def reset(self):
        self._rng = random.Random(self.seed)

    def stats(self):
        return {'sent': self._sent, 'dropped': self._dropped,
                'duplicated': self._duplicated, 'reordered': self._reordered,
                'seed': self.seed, 'profile': self.profile.to_dict()}
