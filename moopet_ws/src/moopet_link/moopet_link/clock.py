"""时钟抽象：让通信层的时间可控、可测。

为什么需要它：
  * 心跳/超时/离线队列 TTL 都依赖时间，测试里不能真的 sleep；
  * 双机联调要能模拟"时钟漂移"（两台机器时间不一致是真实场景）。

约定：所有模块统一用"秒（float）"作为时间单位，基准无所谓（相对量使用）。
"""
import time


class Clock:
    """时钟接口。"""

    def now(self):
        raise NotImplementedError

    def advance(self, seconds):
        """推进时间。真实时钟为 no-op（时间自己会走）。"""
        return None

    def sleep(self, seconds):
        """等待若干秒。真实时钟真的睡；假时钟只推进。"""
        return self.advance(seconds)


class RealClock(Clock):
    """使用 time.monotonic()，不受系统时间调整影响。"""

    def now(self):
        return time.monotonic()

    def sleep(self, seconds):
        if seconds > 0:
            time.sleep(seconds)


class FakeClock(Clock):
    """手动推进的时钟，用于确定性测试。"""

    def __init__(self, start=0.0):
        self._t = float(start)

    def now(self):
        return self._t

    def advance(self, seconds):
        self._t += float(seconds)
        return self._t

    def set(self, t):
        self._t = float(t)


class SkewedClock(Clock):
    """在真实时钟上叠加固定漂移，用于模拟双机时钟不同步。"""

    def __init__(self, base=None, skew_seconds=0.0):
        self._base = base or RealClock()
        self._skew = float(skew_seconds)

    def now(self):
        return self._base.now() + self._skew

    def sleep(self, seconds):
        return self._base.sleep(seconds)
