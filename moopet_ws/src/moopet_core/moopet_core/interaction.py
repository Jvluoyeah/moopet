"""互动路由：把"感知/决策事件"翻译成养成动作。

原先这套映射埋在 `decision_engine_node`（每日任务）和 `exp_engine_node`（加点）里，
两边各写一份，很容易改一处漏一处。抽到 core 之后：

  * 无 ROS 即可单测（对齐 W2-W5 的一贯做法）；
  * 狗侧节点、背包侧大脑、服务端校验**共用同一份规则**，不会三处不一致。

一次互动通常同时产生三件事：
  1. 加经验（exp_engine，带周上限）
  2. 续火花（spark_engine 连续陪伴）+ 每日任务进度
  3. 决策反应（decision_engine 的 BT 路由 → 话术/动作）
InteractionRouter 把它们串起来，返回结构化的结果供上层落地。
"""
from datetime import date as _date

# 事件类型 → 经验来源（对齐 exp_engine.SOURCES 与 interface_spec 的归一映射）
EVENT_TO_SOURCE = {
    'pet': 'pet',
    'handshake': 'handshake',
    'call': 'call',
    'walk': 'walk',
    'quiz_answer': 'quiz',
    'ventilate': 'ventilate',
    'air_quality': 'ventilate',
    'projector': 'projector',
    'communication': 'communication',
    'guide': 'guide',
}

# 事件类型 → 每日任务来源（对齐 SparkEngine.TASK_POOL）
EVENT_TO_TASK = {
    'pet': 'pet',
    'handshake': 'handshake',
    'call': 'call',
    'walk': 'walk',
    'quiz_answer': 'quiz',
    'air_quality': 'ventilate',
    'ventilate': 'ventilate',
}

# 只有取到这些值才算"真的完成了"，避免"打开页面就算通风"这类误判
EVENT_VALUE_ALLOW = {
    'quiz_answer': ('answer_correct', 'correct', 'true', '1'),
    'air_quality': ('1', 'true', 'ventilated'),
}


def normalize_value(value):
    if isinstance(value, bool):
        return 'true' if value else 'false'
    return str(value).strip().lower()


def should_count_event(event_type, event_value=''):
    """该事件在当前取值下是否算"完成"（用于任务进度与加点）。"""
    allow = EVENT_VALUE_ALLOW.get(event_type)
    if not allow:
        return True
    return normalize_value(event_value) in allow


def resolve_source(event_type, event_value=''):
    """事件 → 经验来源；不算完成则返回 None。"""
    if not should_count_event(event_type, event_value):
        return None
    return EVENT_TO_SOURCE.get(event_type)


def resolve_task(event_type, event_value=''):
    """事件 → 每日任务来源；不算完成则返回 None。"""
    if not should_count_event(event_type, event_value):
        return None
    return EVENT_TO_TASK.get(event_type)


class InteractionRouter:
    """把一次互动落到经验 / 火花 / 每日任务 / 决策反应四处。"""

    def __init__(self, exp_engine=None, spark_engine=None, decision_engine=None):
        self.exp = exp_engine
        self.spark = spark_engine
        self.decision = decision_engine

    # ---------------- 单次互动 ----------------
    def handle(self, event_type, event_value='', params=None, d=None, now=None,
               level=None, emotion=None):
        """处理一次互动事件，返回结构化结果。

        返回：
            {
              'event_type', 'event_value',
              'counted': bool,            # 是否算完成
              'exp': int,                 # 本次加点（受周上限影响，0 表示没加）
              'spark_event': dict|None,   # 火花状态事件（new/keep/recover）
              'task': {'task_type','done','bonus_granted'}|None,
              'reactions': [ ... ],       # 决策反应（话术/动作）
              'reason': str,              # 未计数原因（便于排查）
            }
        """
        d = d or (now.date() if now is not None else _date.today())
        params = params or {}
        out = {'event_type': event_type, 'event_value': event_value,
               'counted': False, 'exp': 0, 'spark_event': None, 'task': None,
               'reactions': [], 'reason': ''}

        counted = should_count_event(event_type, event_value)
        out['counted'] = counted
        if not counted:
            out['reason'] = f'{event_type}={event_value} 不算完成（未计数）'

        # 1) 经验
        source = resolve_source(event_type, event_value)
        if source and self.exp is not None:
            res = self.exp.gain(source, d=d)
            out['exp'] = int(res.get('exp_gained', 0) or 0)
            out['exp_result'] = res

        # 2) 火花连续陪伴（只要互动就算陪伴，不论是否计入任务）
        #    注意：streak 表由 SparkEngine 独家写入 —— exp_engine.gain() 已不再碰它，
        #    否则 register_activity 会看到"今天已登记"而把点燃/续火/挽回事件吞掉。
        if self.spark is not None:
            ev = self.spark.register_activity(d)
            out['spark_event'] = ev                 # 'already' 也如实记录，便于排查
            if ev and ev.get('event') != 'already':
                out['spark_changed'] = True

        # 3) 每日任务进度
        task = resolve_task(event_type, event_value)
        if task and self.spark is not None:
            res = self.spark.report_event(task, d)
            updated = res.get('tasks_updated') or []
            cur = updated[0] if updated else {}
            out['task'] = {'task_type': task,
                           'progress': cur.get('progress'),
                           'target': cur.get('target'),
                           'done': cur.get('done'),
                           'all_done': bool(res.get('all_done')),
                           'bonus_granted': bool(res.get('bonus_granted'))}

        # 4) 决策反应（BT 路由 → 话术/动作）
        if self.decision is not None:
            if level is not None or emotion is not None:
                self.decision.set_state(level=level, emotion=emotion)
            rec = self.decision.on_event(event_type, event_value, params=params)
            out['reactions'] = list(rec.get('reactions', []))
            out['record'] = rec
            if out.get('spark_changed'):            # 仅在火花真的变化时联动话术
                rec2 = self.decision.on_tick(idle_seconds=0.0, now=now,
                                             spark_event=out['spark_event'])
                out['reactions'].extend(rec2.get('reactions', []))
                out['spark_record'] = rec2
        return out

    # ---------------- 周期检查 ----------------
    def tick(self, now, idle_seconds=0.0, level=None, emotion=None):
        """周期检查：火花断档结算 + 三档提醒 + 决策引擎 on_tick。

        返回 {'reminder': 18|21|23|None, 'spark': {...}|None, 'reactions': [...]}
        """
        d = now.date() if now is not None else _date.today()
        out = {'reminder': None, 'extinguished': False, 'reactions': [],
               'tasks_done': False}
        reminder = None
        if self.spark is not None:
            out['extinguished'] = bool(self.spark.settle_missed_days(d))
            reminder = self.spark.remind_due(now)
            if reminder:
                self.spark.mark_reminded(reminder, d)
            out['reminder'] = reminder
        if self.decision is not None:
            if level is not None or emotion is not None:
                self.decision.set_state(level=level, emotion=emotion)
            rec = self.decision.on_tick(idle_seconds=idle_seconds, now=now,
                                        spark_reminder=reminder)
            out['reactions'] = list(rec.get('reactions', []))
            out['record'] = rec
        return out

    # ---------------- 便捷查询 ----------------
    def snapshot(self, d=None):
        snap = {}
        if self.exp is not None:
            snap['state'] = self.exp.get_state()
        if self.spark is not None:
            snap['spark'] = self.spark.get_spark()
            snap['lottery_chances'] = self.spark.lottery_chances(
                d or _date.today())
        return snap
