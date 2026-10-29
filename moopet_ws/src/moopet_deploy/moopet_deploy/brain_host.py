"""大脑宿主与感知代理：把 moopet_core 挂到链路上，且能整体换边。

    ┌── BRAIN 侧 ──────────────┐        ┌── AGENT 侧 ─────────────┐
    │ BrainHost                │        │ SensorAgent             │
    │  InteractionRouter       │◄──link─┤  SensorFeed（本地感知） │
    │  ExpEngine/SparkEngine   │──link─►│  Actuator（本地执行）   │
    │  DecisionEngine          │        │                         │
    └──────────────────────────┘        └─────────────────────────┘

`MOOPET_BRAIN` 一换，左右两边互换，**代码一行不改**——这就是"大脑可搬家"。
搬家的正确性由 link_lab 的移植不变性测试守住：同一份录制回放，三种摆放输出逐条一致。
"""
from datetime import datetime, timedelta

from moopet_core.decision import DecisionEngine, SparkEngine
from moopet_core.exp_engine import ExpEngine
from moopet_core.interaction import InteractionRouter

from moopet_hal import SensorEvent

from .profile import NODE_SIM, Role

KIND_SENSOR = 'sensor'
KIND_DECISION = 'decision'
KIND_STATE = 'state'
KIND_ACTION = 'action'

# 逻辑时间原点：链路层用"秒（float）"，core 用 datetime，这里做唯一一处换算。
# 固定默认值让回放/测试可复现（真机跑时由宿主传入真实时间原点）。
DEFAULT_TIME_ORIGIN = datetime(2025, 9, 1, 15, 0, 0)


class BrainHost:
    """在 BRAIN 侧运行：收感知事件 → 跑养成/决策 → 下发反应与状态。"""

    def __init__(self, channel, profile, db_path=None, clock=None, router=None,
                 time_origin=None):
        self.channel = channel
        self.profile = profile
        self.clock = clock or getattr(channel, 'clock', None)
        self.node_id = channel.node_id
        self.time_origin = time_origin or DEFAULT_TIME_ORIGIN
        self._queue = []
        self._seen = 0
        self._outputs = []                 # 规范化输出记录（不变性对比用）
        self._last_event_ts = None
        self._last_state = None
        self._autonomy = False             # 对端不通时是否仍独立工作

        if router is not None:
            self.router = router
        else:
            db = db_path or profile.db_path
            self.exp = ExpEngine(db)
            self.spark = SparkEngine(db)
            self.decision = DecisionEngine()
            self.router = InteractionRouter(self.exp, self.spark, self.decision)

        channel.subscribe(KIND_SENSOR, self._on_sensor)
        channel.health.on_change(self._on_link_change)

    # ---------------- 链路 ----------------
    def _on_sensor(self, env):
        self._queue.append(SensorEvent.from_payload(env.payload))
        self._seen += 1

    def _on_link_change(self, old, new, now):
        # 断连不再"傻等"：大脑在其所在侧继续独立工作（自治），恢复后照常
        self._autonomy = (new.value != 'LINK_UP')
        self._record('link', {'from': old.value, 'to': new.value})

    def _record(self, kind, payload):
        self._outputs.append({'kind': kind, 'payload': payload})

    def _emit(self, kind, payload, now, ttl=0.0):
        self.channel.send(kind, payload, now=now, ttl=ttl)
        self._record(kind, payload)

    # ---------------- 事件入口 ----------------
    def ingest_local(self, events):
        """本地感知直通（同机的传感器不必绕网络）。

        仍按 ts 排序处理，因此"本地直通"与"跨机链路"对大脑是等价的——
        这正是同一份录制在三种摆放位置下输出一致的前提。
        """
        for ev in events:
            if ev.origin == '':
                ev.origin = self.node_id
            self._queue.append(ev)
        self._seen += len(events)
        return len(events)

    # ---------------- 时间桥接 ----------------
    def to_datetime(self, now):
        """链路层给的是秒（float）或已经是 datetime；core 只吃 datetime。"""
        if isinstance(now, datetime):
            return now
        if now is None:
            return self.time_origin
        return self.time_origin + timedelta(seconds=float(now))

    # ---------------- 主循环 ----------------
    def tick(self, now, idle_seconds=None):
        """跑一拍：心跳 → 收包 → 处理事件 → 发布状态。返回本拍产出。"""
        dt = self.to_datetime(now)
        self.channel.maybe_beat(now)
        self.channel.poll(now)

        produced = []
        for ev in sorted(self._queue, key=lambda e: e.ts):
            produced.extend(self._handle_event(ev, dt, now))
        self._queue = []

        if idle_seconds is None:
            idle_seconds = 0.0 if self._last_event_ts is None else max(
                0.0, self._logical(now) - self._last_event_ts)
        rec = self.router.tick(dt, idle_seconds=idle_seconds)
        for r in rec.get('reactions', []):
            produced.extend(self._emit_reaction(r, now))
        if rec.get('extinguished'):
            self._emit(KIND_STATE, {'event': 'spark_extinguished'}, now)
        self._publish_state(dt, now)
        return produced

    def _logical(self, now):
        """把任意 now 归一成"本运行内的逻辑秒"，供闲置时长计算。"""
        if isinstance(now, datetime):
            return (now - self.time_origin).total_seconds()
        return float(now)

    def _handle_event(self, ev, dt, now):
        self._last_event_ts = ev.ts
        out = self.router.handle(ev.kind, ev.value, params=ev.params,
                                 d=dt.date(), now=dt)
        produced = []
        for r in out.get('reactions', []):
            produced.extend(self._emit_reaction(r, now))
        if out.get('exp'):
            self._record('exp', {'source': ev.kind, 'exp': out['exp']})
        if out.get('task') and out['task'].get('bonus_granted'):
            self._emit(KIND_STATE, {'event': 'task_bonus', 'chances': 2}, now)
        self._publish_state(dt, now)
        return produced

    def _emit_reaction(self, reaction, now):
        if not isinstance(reaction, dict):
            return []
        payload = {'behavior': reaction.get('behavior'),
                   'tone': reaction.get('tone'),
                   'tts_text': reaction.get('tts_text'),
                   'action_type': reaction.get('action_type'),
                   'params': reaction.get('params') or {}}
        # 规范化记录：不带时间戳，便于跨摆放逐条对比
        self._record(KIND_DECISION, payload)
        self.channel.send(KIND_DECISION, payload, now=now)
        if payload['action_type']:
            self.channel.send(KIND_ACTION, {'action_type': payload['action_type'],
                                            'params': payload['params']}, now=now)
        return [payload]

    def _publish_state(self, dt, now):
        # 还没有任何事件时不广播"空快照"：否则跨机摆放会因为事件晚一拍到达，
        # 多出一条开机状态，看起来像"搬家改变了行为"（实际只是时序噪声）。
        if self._seen == 0 and not self._queue:
            return
        snap = self.router.snapshot(dt.date())
        state = snap.get('state') or {}
        key = (state.get('level'), (snap.get('spark') or {}).get('current_days'),
               (snap.get('spark') or {}).get('level'))
        if key == self._last_state:
            return
        self._last_state = key
        self._emit(KIND_STATE, {'level': state.get('level'),
                                'total_exp': state.get('total_exp'),
                                'spark_days': (snap.get('spark') or {}).get('current_days'),
                                'spark_level': (snap.get('spark') or {}).get('level')},
                   now)

    # ---------------- 观测 ----------------
    def outputs(self):
        return [dict(o) for o in self._outputs]

    def clear_outputs(self):
        self._outputs = []

    def is_autonomous(self):
        return self._autonomy

    def stats(self):
        return {'node': self.node_id, 'role': Role.BRAIN.value,
                'outputs': len(self._outputs), 'queued': len(self._queue),
                'autonomous': self._autonomy}


class SensorAgent:
    """在 AGENT 侧运行：把本地感知送出去，把大脑下发的动作执行掉。"""

    def __init__(self, channel, source=None, actuator=None):
        self.channel = channel
        self.source = source
        self.actuator = actuator
        self.node_id = channel.node_id
        self._executed = []
        channel.subscribe(KIND_ACTION, self._on_action)
        channel.subscribe(KIND_DECISION, self._on_decision)

    def _on_action(self, env):
        action_type = env.payload.get('action_type')
        params = env.payload.get('params') or {}
        if action_type and self.actuator is not None:
            res = self.actuator.execute(action_type, params)
            self._executed.append((action_type, params, res))

    def _on_decision(self, env):
        """话术侧：真机上这里接 TTS；仿真里记下来即可。"""
        text = env.payload.get('tts_text')
        if text and self.actuator is not None:
            self.actuator.execute('tts', {'text': text})

    def pump(self, now):
        """把本地到期的感知事件发往大脑。返回发送条数。"""
        if self.source is None:
            return 0
        sent = 0
        for ev in self.source.poll(now):
            ev.origin = ev.origin or self.node_id
            self.channel.send(KIND_SENSOR, ev.to_payload(), now=now)
            sent += 1
        return sent

    def tick(self, now):
        self.channel.maybe_beat(now)
        self.channel.poll(now)
        return self.pump(now)

    def executed(self):
        return list(self._executed)

    def stats(self):
        return {'node': self.node_id, 'role': Role.AGENT.value,
                'executed': len(self._executed),
                'source': self.source.stats() if self.source else None}


def _date_of(now):
    """把逻辑时刻折算成日期（保留给外部调用；内部走 to_datetime）。"""
    if now is None:
        return datetime.now().date()
    if isinstance(now, datetime):
        return now.date()
    return DEFAULT_TIME_ORIGIN.date()
