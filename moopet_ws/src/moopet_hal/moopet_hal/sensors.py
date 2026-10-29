"""感知来源：仿真 / 回放 / 真机三种实现，产出统一的 SensorEvent。

三者的差别只在"事件从哪来"，对上层完全一样：
  * SensorFeed(script)  —— 按脚本在指定时刻产出（仿真 demo 与回放共用）
  * SensorFeed()        —— 只接受外部 push（真机：ROS 回调把事件塞进来）
  * 两者可混用           —— 真机上还可以叠加脚本，做"真机 + 注入"的联调
"""
from .events import SensorEvent


class SensorSource:
    """感知来源接口。"""

    name = 'base'

    def poll(self, now):
        """返回此刻（含之前）应当产出的事件。"""
        raise NotImplementedError

    def push(self, event):
        """外部注入（真机 ROS 回调 / 测试）。"""
        raise NotImplementedError

    def stats(self):
        return {'name': self.name}


class SensorFeed(SensorSource):
    """脚本 + 外部注入混合的感知来源。

    script: [(t, kind, value, params, origin), ...]，t 为逻辑秒，需单调不减。
    """

    name = 'feed'

    def __init__(self, script=None, origin=''):
        self.script = sorted(script or [], key=lambda x: x[0])
        self.origin = origin
        self._cursor = 0
        self._queue = []
        self._emitted = 0
        self._pushed = 0

    @classmethod
    def from_events(cls, events, origin=''):
        """从 SensorEvent 列表建（回放录制时用）。"""
        script = [(e.ts, e.kind, e.value, e.params, e.origin or origin) for e in events]
        return cls(script, origin=origin)

    def poll(self, now):
        out = []
        while self._cursor < len(self.script) and self.script[self._cursor][0] <= now:
            t, kind, value, params, origin = self.script[self._cursor]
            out.append(SensorEvent(kind=kind, value=value, params=dict(params or {}),
                                   ts=t, origin=origin or self.origin))
            self._cursor += 1
        if self._queue:
            out.extend(self._queue)
            self._queue = []
        self._emitted += len(out)
        return out

    def push(self, event):
        self._pushed += 1
        self._queue.append(event)

    def drained(self):
        return self._cursor >= len(self.script) and not self._queue

    def stats(self):
        return {'name': self.name, 'emitted': self._emitted, 'pushed': self._pushed,
                'script_len': len(self.script), 'cursor': self._cursor,
                'pending': len(self._queue)}


class ReplaySensorSource(SensorFeed):
    """回放：语义上强调"这是录下来的"，实现与 SensorFeed 相同。

    移植不变性测试就是靠它把同一份录制喂给三种大脑摆放。
    """

    name = 'replay'


class RealSensorSource(SensorFeed):
    """真机：ROS 订阅回调 push 事件进来（脚本一般为空）。"""

    name = 'real'
