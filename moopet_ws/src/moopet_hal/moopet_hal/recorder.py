"""录制与回放：把一段感知流存成 JSON，之后可以原样重放。

这是"移植不变性"和"故障回归"的数据基础：
把真机/仿真跑出来的事件录下来 → 换大脑摆放位置或换网络条件 → 重放 → 对比输出。
"""
import json
import os

from .events import SensorEvent
from .sensors import ReplaySensorSource


def dump_events(events, path, meta=None):
    """把事件序列写成 JSON 文件。"""
    data = {'meta': dict(meta or {}), 'events': [e.to_payload() for e in events]}
    d = os.path.dirname(os.path.abspath(path))
    if d:
        os.makedirs(d, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    return path


def load_events(path):
    """读回事件序列（返回 SensorEvent 列表）。"""
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    if isinstance(data, list):            # 容错：直接是数组也认
        return [SensorEvent.from_payload(d) for d in data]
    return [SensorEvent.from_payload(d) for d in data.get('events', [])]


def load_meta(path):
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    return data.get('meta', {}) if isinstance(data, dict) else {}


def replay_source(path, origin=''):
    """从录制文件建一个回放来源。"""
    return ReplaySensorSource.from_events(load_events(path), origin=origin)


class Recorder:
    """在跑动过程中顺手把事件录下来。"""

    def __init__(self):
        self.events = []

    def record(self, event):
        self.events.append(event)

    def record_all(self, events):
        self.events.extend(events)

    @property
    def count(self):
        return len(self.events)

    def save(self, path, meta=None):
        return dump_events(self.events, path, meta=meta)

    def clear(self):
        self.events = []

    def stats(self):
        return {'recorded': len(self.events)}
