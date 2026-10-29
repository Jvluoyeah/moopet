"""链路健康：心跳跟踪 + 三态状态机（UP / DEGRADED / DOWN）。

对应 W2 的 `/backpack/heartbeat`(5s) 口径，但把它从"一个 Topic"提升为"链路状态机"：
  * 5s 有心跳        → LINK_UP
  * 超过 degraded 阈值 → DEGRADED（抖动/弱网，业务应降级而非停摆）
  * 超过 down 阈值     → DOWN（触发断连自治：本地大脑接管）

状态变化会回调通知，供上层做决策（自治/补发/告警）。
"""
from enum import Enum

from .clock import RealClock


class LinkState(str, Enum):
    UP = 'LINK_UP'
    DEGRADED = 'DEGRADED'
    DOWN = 'DOWN'


class HealthConfig:
    """阈值配置（秒）。默认对齐 W2：心跳 5s。"""

    def __init__(self, heartbeat_interval=5.0, degraded_after=None,
                 down_after=None, jitter_tolerance=2.0):
        self.heartbeat_interval = float(heartbeat_interval)
        self.jitter_tolerance = float(jitter_tolerance)
        # 缺省：允许丢 1 拍进 DEGRADED，丢 2 拍进 DOWN
        self.degraded_after = float(
            degraded_after if degraded_after is not None
            else self.heartbeat_interval * 2)
        self.down_after = float(
            down_after if down_after is not None else self.heartbeat_interval * 3)
        if self.degraded_after <= 0 or self.down_after <= self.degraded_after:
            raise ValueError('阈值必须满足 0 < degraded_after < down_after')

    def to_dict(self):
        return {'heartbeat_interval': self.heartbeat_interval,
                'degraded_after': self.degraded_after,
                'down_after': self.down_after,
                'jitter_tolerance': self.jitter_tolerance}


class LinkHealth:
    """跟踪某个对端的存活情况，并给出链路状态。

    冷启动策略（assume_alive）：新建链路时**先乐观认为对端在线**，超时才降级/断连。
    理由：若初始即 DOWN，那么"刚开机就发状态"会全部进离线队列，等心跳才放行，
    既不符合直觉也不符合真实网络（真实网络里发出去多数是能到的）。
    """

    def __init__(self, self_id='dog', peer_id='backpack', config=None, clock=None,
                 assume_alive=True):
        self.self_id = self_id
        self.peer_id = peer_id
        self.cfg = config or HealthConfig()
        self.clock = clock or RealClock()
        self.assume_alive = bool(assume_alive)
        self._beats = 0
        self._missed = 0
        self._rtt_samples = []
        self._transitions = []                # [(t, from, to)]
        self._listeners = []
        self._started_at = self.clock.now()
        self._has_heard = False
        # "上次确认存活"的时刻：乐观启动时从当下算起
        self._last_alive_at = self._started_at
        self._state = LinkState.UP if self.assume_alive else LinkState.DOWN

    # ---------------- 心跳 ----------------
    def beat(self, peer_id=None, now=None, rtt=None):
        """收到一次心跳。"""
        now = self.clock.now() if now is None else now
        self._last_alive_at = now
        self._has_heard = True
        self._beats += 1
        if rtt is not None:
            self._rtt_samples.append(float(rtt))
            if len(self._rtt_samples) > 64:
                self._rtt_samples.pop(0)
        self._evaluate(now)

    def expected_beats(self, now=None):
        """按心跳间隔算，自上次确认存活以来本该收到多少拍。"""
        now = self.clock.now() if now is None else now
        span = max(0.0, now - self._last_alive_at)
        return int(span // self.cfg.heartbeat_interval)

    def has_heard(self):
        """是否真的收到过心跳（区别于乐观启动）。"""
        return self._has_heard

    # ---------------- 状态 ----------------
    def state(self, now=None):
        self._evaluate(self.clock.now() if now is None else now)
        return self._state

    def _evaluate(self, now):
        if not self._has_heard and not self.assume_alive:
            new = LinkState.DOWN          # 悲观启动：没听到过就当作断连
        else:
            gap = now - self._last_alive_at
            if gap >= self.cfg.down_after:
                new = LinkState.DOWN
            elif gap >= self.cfg.degraded_after:
                new = LinkState.DEGRADED
            else:
                new = LinkState.UP
        if new != self._state:
            old, self._state = self._state, new
            self._transitions.append((now, old.value, new.value))
            if len(self._transitions) > 128:
                self._transitions.pop(0)
            if new == LinkState.DOWN:
                self._missed += 1
            for cb in self._listeners:
                try:
                    cb(old, new, now)
                except Exception:      # noqa: BLE001  监听器异常不能影响链路
                    pass

    def is_up(self, now=None):
        return self.state(now) == LinkState.UP

    def is_down(self, now=None):
        return self.state(now) == LinkState.DOWN

    # ---------------- 观测 ----------------
    def on_change(self, callback):
        """注册状态变化回调 cb(old_state, new_state, now)。"""
        self._listeners.append(callback)

    @property
    def transitions(self):
        return list(self._transitions)

    def last_seen(self):
        """上次确认存活的时刻（乐观启动时等于链路建立时刻）。"""
        return self._last_alive_at if self._has_heard else None

    def time_since_last(self, now=None):
        now = self.clock.now() if now is None else now
        return now - self._last_alive_at

    def avg_rtt(self):
        if not self._rtt_samples:
            return None
        return sum(self._rtt_samples) / len(self._rtt_samples)

    def stats(self, now=None):
        now = self.clock.now() if now is None else now
        return {
            'self': self.self_id,
            'peer': self.peer_id,
            'state': self.state(now).value,
            'has_heard': self._has_heard,
            'beats': self._beats,
            'missed_windows': self._missed,
            'since_alive_s': self.time_since_last(now),
            'avg_rtt_ms': (self.avg_rtt() * 1000.0) if self.avg_rtt() is not None else None,
            'thresholds': self.cfg.to_dict(),
            'transitions': self.transitions[-8:],
        }

    def reset(self):
        self._beats = 0
        self._missed = 0
        self._rtt_samples = []
        self._transitions = []
        self._started_at = self.clock.now()
        self._has_heard = False
        self._last_alive_at = self._started_at
        self._state = LinkState.UP if self.assume_alive else LinkState.DOWN
