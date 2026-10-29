#!/usr/bin/env python3
"""行为决策引擎（W4 完稿 · 李文扬）——决策引擎入口。

对齐排期 W4「完成行为决策引擎（性格/主动关怀/纪念日）+ 情感账户」：
  - on_event(event_type, event_value, params) 统一入口：事件 → 黑箱更新 → BT 路由 → 反应
  - on_tick(idle_seconds, now)                周期检查：主动关怀 / 早安晚安 / 纪念日
  - 性格演化：双轴（依恋度 / 表达度）计数器+衰减 → 粘人型/独立型/话痨型/安静型（2×2 映射）
  - 情感账户：0~100，正向互动 +，闲置衰减 -（对齐狗2.md：投入越多回应越丰富、长期忽视会伤心、和好机制）
  - 决策历史带日期，供成长日记（diary.py）统计成文

黑箱字段：
  level / emotion / personality / counters
  attachment（依恋轴）/ expressiveness（表达轴）
  emotion_account（情感账户）/ last_active_ts / last_event_date
  rituals_done {'morning'|'evening': 日期} / anniversaries {'YYYY-MM-DD'|'MM-DD': 名称}
"""
import json
import logging
from datetime import datetime

from .behavior_tree.core import Status
from .behavior_tree.trees import build_main_tree

log = logging.getLogger('moopet.decision')

# ---------------- 情感账户（对齐狗2.md 情感账户机制） ----------------
ACCOUNT_INIT = 50.0
ACCOUNT_MAX = 100.0
ACCOUNT_COLD = 30.0                 # <30 冷淡期：长期忽视，减少主动互动
ACCOUNT_WARM = 70.0                 # >70 依赖期：回应更丰富
ACCOUNT_GAIN = 2.0                  # 每次正向互动 +
ACCOUNT_IDLE_DECAY_PER_DAY = 5.0    # 每闲置一天 -

# ---------------- 性格双轴（计数器+衰减 → 2×2 映射四型） ----------------
AXIS_INIT = 50.0
AXIS_EVENT_GAIN = 6.0               # 命中事件给所在轴 +
AXIS_DECAY_PER_EVENT = 1.0          # 每次事件双轴自然衰减 -
AXIS_IDLE_DECAY_PER_DAY = 3.0       # 每闲置一天双轴 -
AXIS_HIGH = 55.0                    # 高/低分界

COMPANION_EVENTS = {'pet', 'handshake', 'walk', 'guide'}   # 陪伴类 → 依恋轴
EXPRESSIVE_EVENTS = {'quiz_answer', 'call'}                # 说话类 → 表达轴
POSITIVE_EVENTS = {'pet', 'handshake', 'walk', 'guide',
                   'air_quality', 'milestone', 'anniversary'}

# ---------------- 主动关怀 / 仪式 / 纪念日 ----------------
IDLE_CARE_THRESHOLD_S = 2 * 3600    # 长沉默 2 小时 → 主动关怀
MORNING_RANGE = (6, 9)              # 早安窗口
EVENING_RANGE = (21, 23)            # 晚安窗口（23 点起让位给深夜关怀）
NIGHT_RANGE = (23, 6)               # 深夜（特殊场景，关怀话术不同）
MILESTONE_LEVELS = (10, 20, 30, 40, 50, 60, 70, 80, 90, 100)


def _parse_params(params):
    """params 支持 dict 或 JSON 文本（ROS 消息里是字符串）。"""
    if isinstance(params, dict):
        return dict(params)
    if isinstance(params, str) and params:
        try:
            return json.loads(params)
        except (ValueError, TypeError):
            return {'raw': params}
    return {}


def derive_personality(attachment, expressiveness):
    """双轴 → 四型（2×2 映射，对齐狗2.md 独特性格塑造）。

    依恋高+表达高 → 粘人型；低+高 → 话痨型；
    高+低 → 安静型（默默陪着主人）；低+低 → 独立型。
    """
    hi_att = attachment >= AXIS_HIGH
    hi_exp = expressiveness >= AXIS_HIGH
    if hi_att and hi_exp:
        return '粘人型'
    if hi_exp:
        return '话痨型'
    if hi_att:
        return '安静型'
    return '独立型'


class DecisionEngine:
    """行为决策引擎（W4 完稿）：事件路由 + 性格/情感账户 + 主动关怀/纪念日。"""

    def __init__(self, tree=None, now=None):
        self.tree = tree or build_main_tree()
        self.blackboard = {
            'level': 1,
            'emotion': 'neutral',
            'personality': derive_personality(AXIS_INIT, AXIS_INIT),
            'counters': {},
            'attachment': AXIS_INIT,
            'expressiveness': AXIS_INIT,
            'emotion_account': ACCOUNT_INIT,
            'last_active_ts': None,          # datetime：最近一次互动
            'last_event_date': None,         # 'YYYY-MM-DD'
            '_last_ts': None,                # datetime：上次衰减结算点（防双重衰减）
            'rituals_done': {},              # {'morning'/'evening': 日期}
            'anniversaries': {},             # {'YYYY-MM-DD' 或 'MM-DD': 名称}
        }
        self.history = []

    # ---------------- 状态同步 ----------------

    def set_state(self, level=None, emotion=None, personality=None):
        if level is not None:
            self.blackboard['level'] = level
        if emotion is not None:
            self.blackboard['emotion'] = emotion
        if personality is not None:      # 显式指定时覆盖演化结果（外部干预）
            self.blackboard['personality'] = personality

    def get_state(self):
        return dict(self.blackboard)

    def set_anniversaries(self, anniversaries):
        """设置自定义纪念日：{'2025-09-01': '认识主人满月'} 或 {'09-01': '主人生日'}。"""
        self.blackboard['anniversaries'].update(anniversaries or {})

    def account_level(self):
        """情感账户档位：cold(<30 冷淡) / balanced(30~70) / warm(>70 依赖)。"""
        acc = self.blackboard['emotion_account']
        if acc < ACCOUNT_COLD:
            return 'cold'
        if acc > ACCOUNT_WARM:
            return 'warm'
        return 'balanced'

    # ---------------- 决策引擎入口（被动：外部事件） ----------------

    def on_event(self, event_type, event_value='', params=None, now=None):
        """事件 → 黑箱更新 → BT 路由 → 反应列表（返回决策记录 dict）。"""
        params = _parse_params(params)
        now = now or datetime.now()
        self._update_blackboard(event_type, event_value, params, now)
        if event_type == 'milestone' and 'milestone' not in params:
            params['milestone'] = params.get('level')   # 升级里程碑：LV.10/20/...
        ctx = self._build_ctx(event_type, event_value, params)
        status = self.tree.tick(ctx)
        return self._record(event_type, event_value, status, ctx, now)

    # ---------------- 周期检查（主动：主动关怀/仪式/纪念日） ----------------

    def on_tick(self, idle_seconds=0.0, now=None, spark_reminder=None,
                spark_event=None):
        """决策引擎周期入口：长沉默主动关怀 / 早安晚安仪式 / 自定义纪念日 + W5 火花提醒。

        由 decision_engine_node 定时器（或 demo）调用；返回结构与 on_event 相同。
        spark_reminder：火花三档提醒时刻（18/21/23 或 None），命中且今天未续火时催续火。
        spark_event：火花状态事件（keep/new/recover/extinguish），走火花子树联动。
        """
        now = now or datetime.now()
        idle = max(0.0, float(idle_seconds))
        self._apply_idle_decay(now, idle)
        ann_name = self._anniversary_today(now)
        if ann_name and self.blackboard['rituals_done'].get(
                'anniversary') == now.strftime('%Y-%m-%d'):
            ann_name = None          # 今天已庆祝过 → 让位给早安/晚安仪式
        params = {
            'idle_seconds': idle,
            'hour': now.hour,
            'today': now.strftime('%Y-%m-%d'),
            'ritual': self._ritual_in_window(now.hour),
            'anniversary_name': ann_name,
            'account_level': self.account_level(),
            'spark_reminder': spark_reminder,
        }
        ctx = self._build_ctx('tick', '', params)
        status = self.tree.tick(ctx)
        # 触发了仪式 → 记录已做（防止同日重复问候）
        for r in ctx.get('reactions', []):
            mark = r.get('mark_ritual')
            if mark:
                self.blackboard['rituals_done'][mark] = params['today']
        # tick 感知"今天是哪天"（供 NewDayDetected 比较）
        self.blackboard['last_event_date'] = params['today']
        record = self._record('tick', '', status, ctx, now)
        # W5 火花状态事件（续火/点燃/挽回/熄灭）→ 统一调度走火花子树联动
        if spark_event:
            record = self._route_spark_event(spark_event, now)
        return record

    def _route_spark_event(self, spark_event, now):
        """把火花状态事件作为被动事件送进主树（火花子树联动）。"""
        params = {
            'spark_days': spark_event.get('current_days', 0),
            'spark_level': spark_event.get('level', 0),
        }
        ctx = self._build_ctx('spark', spark_event.get('event', ''), params)
        status = self.tree.tick(ctx)
        return self._record('spark', spark_event.get('event', ''), status, ctx, now)

    # ---------------- 黑箱更新（W4 完稿） ----------------

    def _update_blackboard(self, event_type, event_value, params, now):
        c = self.blackboard['counters']
        c[event_type] = c.get(event_type, 0) + 1
        # 闲置衰减（自上次衰减结算点起算：tick 已结算过则只衰减增量，防双重衰减）
        self._apply_idle_decay(now)
        # 性格双轴：命中事件增益 + 自然衰减（计数器+衰减演化）
        att = max(0.0, self.blackboard['attachment'] - AXIS_DECAY_PER_EVENT)
        exp = max(0.0, self.blackboard['expressiveness'] - AXIS_DECAY_PER_EVENT)
        if event_type in COMPANION_EVENTS:
            att = min(100.0, att + AXIS_EVENT_GAIN)
        if event_type in EXPRESSIVE_EVENTS:
            exp = min(100.0, exp + AXIS_EVENT_GAIN)
        self.blackboard['attachment'] = att
        self.blackboard['expressiveness'] = exp
        # 情感账户：正向互动 +
        positive = (event_type in POSITIVE_EVENTS
                    or (event_type == 'quiz_answer' and event_value == 'answer_correct')
                    or event_type == 'milestone')
        if positive:
            self.blackboard['emotion_account'] = min(
                ACCOUNT_MAX, self.blackboard['emotion_account'] + ACCOUNT_GAIN)
        # 记录时间
        self.blackboard['last_active_ts'] = now
        self.blackboard['last_event_date'] = now.strftime('%Y-%m-%d')
        # 性格重算（变化时挂起播报标记，由周期检查播报一次后消费）
        new_p = derive_personality(att, exp)
        if new_p != self.blackboard['personality']:
            self.blackboard['_personality_changed'] = True
            self.blackboard['personality'] = new_p

    def _apply_idle_decay(self, now, idle_seconds=None):
        """闲置衰减：情感账户 -5/天，双轴 -3/天（长期忽视会伤心、性格淡化）。

        idle_seconds 为 None 时按内部结算点（_last_ts）取增量，
        保证 on_tick（显式闲置时长）与 on_event（增量）不重复衰减。
        """
        if idle_seconds is None:
            if self.blackboard.get('_last_ts') is None:
                self.blackboard['_last_ts'] = now     # 首次互动前不衰减
                return
            idle_seconds = (now - self.blackboard['_last_ts']).total_seconds()
        days = idle_seconds / 86400.0
        if days > 0:
            self.blackboard['emotion_account'] = max(
                0.0, self.blackboard['emotion_account'] - ACCOUNT_IDLE_DECAY_PER_DAY * days)
            for key in ('attachment', 'expressiveness'):
                self.blackboard[key] = max(
                    0.0, self.blackboard[key] - AXIS_IDLE_DECAY_PER_DAY * days)
        self.blackboard['_last_ts'] = now

    def _ritual_in_window(self, hour):
        m0, m1 = MORNING_RANGE
        e0, e1 = EVENING_RANGE
        if m0 <= hour < m1:
            return 'morning'
        if e0 <= hour < e1:
            return 'evening'
        return None

    def _anniversary_today(self, now):
        ann = self.blackboard['anniversaries']
        full = now.strftime('%Y-%m-%d')
        if full in ann:
            return ann[full]
        md = now.strftime('%m-%d')
        if md in ann:
            return ann[md]
        return None

    # ---------------- BT 上下文与记录 ----------------

    def _build_ctx(self, event_type, event_value, params):
        params.setdefault('personality', self.blackboard['personality'])
        params.setdefault('personality_changed',
                          bool(self.blackboard.get('_personality_changed')))
        params.setdefault('account_level', self.account_level())
        return {
            'event_type': event_type,
            'event_value': event_value,
            'params': params,
            'level': self.blackboard['level'],
            'emotion': self.blackboard['emotion'],
            'blackboard': self.blackboard,
            'reactions': [],
        }

    def _record(self, event_type, event_value, status, ctx, now):
        reactions = ctx.get('reactions', [])
        record = {
            'event_type': event_type,
            'event_value': event_value,
            'status': status.name,
            'reactions': reactions,
            'blackboard_snapshot': dict(self.blackboard),
            'ts': now.isoformat(timespec='seconds'),
            'date': now.strftime('%Y-%m-%d'),
        }
        self.history.append(record)
        log.info('[决策] %s/%s → %s，反应 %d 条',
                 event_type, event_value, status.name, len(reactions))
        return record

    # ---------------- 成长日记素材（写入由调用方落库） ----------------

    def daily_stats(self, date=None):
        """统计某天的互动：{pet, quiz_correct, quiz_wrong, walk, ...}（来自 history）。"""
        date = date or datetime.now().strftime('%Y-%m-%d')
        stats = {}
        for rec in self.history:
            if rec.get('date') != date:
                continue
            et, ev = rec['event_type'], rec['event_value']
            key = et
            if et == 'quiz_answer':
                key = 'quiz_correct' if ev == 'answer_correct' else 'quiz_wrong'
            stats[key] = stats.get(key, 0) + 1
        return stats
