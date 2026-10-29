#!/usr/bin/env python3
"""行为树 · 条件节点（W4 完稿 · 李文扬）。

W3 可用的条件（支撑答题闭环路由）：
  - EventType / EventValue：按决策引擎入口事件类型/值匹配
  - LevelGE / EmotionIs：按狗等级 / 心情匹配（读 ctx 黑箱状态）
W4 真实化的条件（对齐狗2.md 主动关怀 / 陪伴仪式感 / 纪念日）：
  - TimeInRange        时间区间（早安 6-9 / 晚安 21-24 / 深夜 23-6）
  - SilenceLong        长沉默（距上次互动 ≥ 阈值 → 主动关怀）
  - NewDayDetected     跨日首次感知（早安仪式 / 日记）
  - IsTick             周期事件（仪式/关怀只由 on_tick 主动触发，不混入被动事件）
  - EmotionAccountGE   情感账户档位门槛（冷淡期不主动搭话）
  - RitualNotDone      今日该仪式还没做过（防重复问候）
  - AnniversaryToday   今天是自定义纪念日
"""
from .core import Condition

# 预设时间区间（24h 制；跨天区间自动回绕）
TIME_RANGES = {
    'morning': (6, 9),
    'evening': (21, 23),
    'night': (23, 6),
    # W5 火花三档提醒：18:00 / 21:00 / 23:00（单点时刻，用 SparkReminderDue 判定）
}


class EventType(Condition):
    """事件类型匹配：ctx.event_type == value。"""

    def __init__(self, value, name=None):
        super().__init__(name or f'event_type={value}')
        self.value = value

    def check(self, ctx):
        return ctx.get('event_type') == self.value


class EventValue(Condition):
    """事件值匹配：ctx.event_value == value。"""

    def __init__(self, value, name=None):
        super().__init__(name or f'event_value={value}')
        self.value = value

    def check(self, ctx):
        return ctx.get('event_value') == self.value


class LevelGE(Condition):
    """等级达到阈值：ctx.level >= value（读黑箱等级）。"""

    def __init__(self, value, name=None):
        super().__init__(name or f'level>= {value}')
        self.value = value

    def check(self, ctx):
        return int(ctx.get('level', 0)) >= self.value


class EmotionIs(Condition):
    """心情匹配：ctx.emotion == value。"""

    def __init__(self, value, name=None):
        super().__init__(name or f'emotion={value}')
        self.value = value

    def check(self, ctx):
        return ctx.get('emotion') == self.value


# ---------------- W4 真实化 ----------------

class IsTick(Condition):
    """周期事件：只有 on_tick 主动检查才走仪式/关怀子树。"""

    def check(self, ctx):
        return ctx.get('event_type') == 'tick'


class TimeInRange(Condition):
    """时间区间判定（早安/晚安/深夜）。读 ctx.params.hour。"""

    def __init__(self, name_or_range, start=None, end=None):
        if start is not None:
            rng = (int(start), int(end))
            label = f'{start}-{end}'
        else:
            rng = TIME_RANGES[name_or_range]
            label = name_or_range
        super().__init__(f'time_in={label}')
        self.start, self.end = rng

    def check(self, ctx):
        hour = (ctx.get('params') or {}).get('hour')
        if hour is None:
            return False
        s, e = self.start, self.end
        if s <= e:
            return s <= hour < e
        return hour >= s or hour < e      # 跨天区间（如深夜 23-6）


class SilenceLong(Condition):
    """长沉默判定（主动关怀触发）：距上次互动 idle_seconds >= 阈值。"""

    def __init__(self, threshold_s=2 * 3600):
        super().__init__(f'idle>={threshold_s}s')
        self.threshold_s = threshold_s

    def check(self, ctx):
        idle = (ctx.get('params') or {}).get('idle_seconds', 0) or 0
        return float(idle) >= self.threshold_s


class NewDayDetected(Condition):
    """跨日判定：今天 != 黑箱里记录的上次互动日期（首日不触发）。"""

    def check(self, ctx):
        today = (ctx.get('params') or {}).get('today')
        last = (ctx.get('blackboard') or {}).get('last_event_date')
        return bool(today) and bool(last) and today != last


class EmotionAccountGE(Condition):
    """情感账户门槛：冷淡期（<30）不主动搭话（对齐狗2.md「长期忽视减少主动互动」）。"""

    def __init__(self, value=30.0):
        super().__init__(f'account>={value}')
        self.value = value

    def check(self, ctx):
        acc = (ctx.get('blackboard') or {}).get('emotion_account', 0.0)
        return float(acc) >= self.value


class RitualNotDone(Condition):
    """今日该仪式还没做过（早安/晚安每天只问候一次）。"""

    def __init__(self, name):
        super().__init__(f'ritual_not_done={name}')
        self.name = name

    def check(self, ctx):
        today = (ctx.get('params') or {}).get('today')
        done = ((ctx.get('blackboard') or {}).get('rituals_done') or {}).get(self.name)
        return bool(today) and done != today


class AnniversaryToday(Condition):
    """今天是自定义纪念日（黑箱 anniversaries 命中今天 / 每年同月日）。"""

    def check(self, ctx):
        name = (ctx.get('params') or {}).get('anniversary_name')
        return bool(name)


class PersonalityChanged(Condition):
    """性格发生变化待播报（引擎在黑箱 _personality_changed 里标记）。"""

    def check(self, ctx):
        return bool((ctx.get('params') or {}).get('personality_changed'))


# ---------------- W5 火花集成（双栈：决策引擎 + 火花 统一调度） ----------------

class SparkReminderDue(Condition):
    """火花三档提醒：params.spark_reminder 命中 18/21/23 且今天还没续火。"""

    def check(self, ctx):
        tier = (ctx.get('params') or {}).get('spark_reminder')
        return tier in (18, 21, 23)


class SparkEventType(Condition):
    """火花事件匹配（续火/熄灭/挽回）：ctx.event_type == 'spark' 且事件值匹配。"""

    def __init__(self, value=None, name=None):
        super().__init__(name or f'spark_event={value or "*"}')
        self.value = value

    def check(self, ctx):
        if ctx.get('event_type') != 'spark':
            return False
        if self.value is None:
            return True
        return ctx.get('event_value') == self.value
