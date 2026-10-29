#!/usr/bin/env python3
"""行为树 · 树定义（W4 完稿 · W5 火花集成 · 李文扬）。

主树 = W3 基础子树（答题/抚摸/握手/呼唤/空气/散步/指引）
     + W4 完稿子树：
       - 纪念日/仪式：自定义纪念日、早安、晚安（tick 主动触发，防重复）、
         等级里程碑（milestone 事件触发，对齐狗2.md 等级里程碑庆祝）
       - 主动关怀：长沉默 → 深夜关怀 / 按情感账户档位搭话（冷淡期不主动）
       - 性格播报：性格演化变化时主动告知
     + W5 火花子树（双栈集成）：
       - 三档提醒：tick 检查命中 18/21/23 且今天未续火 → 催续火
       - 火花状态：续火/首次点燃/熄灭后挽回 事件 → 行为/回复联动
"""
from .core import Fallback, Selector, Sequence
from .conditions import (AnniversaryToday, EmotionAccountGE, EventType,
                         EventValue, IsTick, PersonalityChanged, RitualNotDone,
                         SilenceLong, SparkEventType, SparkReminderDue,
                         TimeInRange)
from .actions import (AirQualityReactionAction, AnniversaryReactionAction,
                      CallReactionAction, GuideReactionAction,
                      HandshakeReactionAction, PersonalityDeciderAction,
                      PetReactionAction, ProactiveCareReactionAction,
                      QuizReactionAction, SparkReminderReactionAction,
                      SparkStatusReactionAction, WalkReactionAction)


def build_quiz_tree():
    """答题子树：答对 → 表扬；答错 → 鼓励（含难度降档提示）。

    注意：子树内不设 Fallback 兜底，非答题事件整体 FAILURE，
    交由主树继续路由（否则会短路吞掉其他事件）。
    """
    return Selector([
        Sequence([
            EventType('quiz_answer'), EventValue('answer_correct'),
            QuizReactionAction('quiz_correct_action'),
        ], 'quiz_correct_seq'),
        Sequence([
            EventType('quiz_answer'), EventValue('answer_wrong'),
            QuizReactionAction('quiz_wrong_action'),
        ], 'quiz_wrong_seq'),
    ], 'quiz_root')


def build_ritual_tree():
    """W4 仪式/纪念日子树：自定义纪念日 / 早安 / 晚安 / 等级里程碑。"""
    return Selector([
        # 自定义纪念日（tick 检查今天是否命中；每天只庆祝一次）
        Sequence([IsTick(), AnniversaryToday(), RitualNotDone('anniversary'),
                  AnniversaryReactionAction('anniversary_custom')],
                 'anniversary_custom_seq'),
        # 早安仪式（6-9 点，每天一次）
        Sequence([IsTick(), TimeInRange('morning'), RitualNotDone('morning'),
                  AnniversaryReactionAction('ritual_morning')],
                 'ritual_morning_seq'),
        # 晚安仪式（21-24 点，每天一次）
        Sequence([IsTick(), TimeInRange('evening'), RitualNotDone('evening'),
                  AnniversaryReactionAction('ritual_evening')],
                 'ritual_evening_seq'),
        # 等级里程碑庆祝（升级事件触发，对齐狗2.md「等级里程碑庆祝」）
        Sequence([EventType('milestone'),
                  AnniversaryReactionAction('milestone_action')],
                 'milestone_seq'),
    ], 'ritual_root')


def build_proactive_care_tree():
    """W4 主动关怀子树：长沉默 → 深夜特殊话术 / 按情感账户档位搭话。

    对齐狗2.md：主动关怀（长时间沉默主动搭话）；
    情感账户（长期忽视会伤心 → 冷淡期 <30 不主动搭话）。
    """
    return Selector([
        # 深夜（23-6 点）长沉默 → 轻声关怀（优先于普通关怀）
        Sequence([IsTick(), SilenceLong(), EmotionAccountGE(30.0),
                  TimeInRange('night'),
                  ProactiveCareReactionAction('care_night_action')],
                 'care_night_seq'),
        # 白天长沉默 → 按账户档位主动搭话
        Sequence([IsTick(), SilenceLong(), EmotionAccountGE(30.0),
                  ProactiveCareReactionAction('care_idle_action')],
                 'care_idle_seq'),
    ], 'care_root')


def build_spark_tree():
    """W5 火花子树（双栈集成：决策引擎 + 火花统一调度）。

    对齐排期 W5·李文扬「火花全流程与行为/回复联动（提醒三档 18/21/23）」
    +「双栈集成：决策引擎 + 火花 + 纪念日统一调度」。
    三档提醒由 on_tick 携带 spark_reminder 触发；火花状态事件（续火/点燃/挽回）
    由 on_event('spark', ...) 触发。
    """
    return Selector([
        # 三档提醒（tick 周期检查命中 18/21/23 且今天未续火 → 催续火）
        Sequence([IsTick(), SparkReminderDue(),
                  SparkReminderReactionAction('spark_reminder_action')],
                 'spark_reminder_seq'),
        # 火花状态反应（续火/首次点燃/熄灭后挽回）
        Sequence([SparkEventType(), SparkStatusReactionAction('spark_status_action')],
                 'spark_status_seq'),
    ], 'spark_root')


def build_main_tree():
    """W4 主树：W3 基础子树 + 仪式/纪念日 + 主动关怀 + 性格播报 + 兜底。"""
    return Selector([
        # ---- 基础事件反应（W3，可运行）----
        build_quiz_tree(),
        Sequence([EventType('pet'), PetReactionAction('pet_action')], 'pet_seq'),
        Sequence([EventType('handshake'),
                  HandshakeReactionAction('handshake_action')], 'handshake_seq'),
        Sequence([EventType('call'), CallReactionAction('call_action')], 'call_seq'),
        Sequence([EventType('air_quality'),
                  AirQualityReactionAction('air_action')], 'air_seq'),
        Sequence([EventType('walk'), WalkReactionAction('walk_action')], 'walk_seq'),
        Sequence([EventType('guide'), GuideReactionAction('guide_action')], 'guide_seq'),
        # ---- W4：仪式 / 纪念日 / 主动关怀 / 性格播报 ----
        # W5 火花提醒置前：今天还没互动时，18/21/23 的火花催续火优先于晚安仪式/
        # 深夜关怀（没回家的人不道晚安，先喊他回来续火）；已互动则火花不触发，照常走仪式。
        build_spark_tree(),
        build_ritual_tree(),
        build_proactive_care_tree(),
        Sequence([PersonalityChanged(),
                  PersonalityDeciderAction('personality_announce')],
                 'personality_seq'),
        # ---- 兜底 ----
        Fallback('idle_noop'),
    ], 'main_root')
