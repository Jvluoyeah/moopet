"""行为决策引擎包（W4 完稿 · W5 火花集成 · 李文扬）。

对齐排期 W3+W4+W5「决策引擎骨架 → 完稿 → 火花集成」：
  - behavior_tree/    行为树（core 运行原语 / conditions 条件 / actions 行为 / trees 树定义）
  - decision_engine   决策引擎入口：事件路由 + 性格演化（双轴四型）+ 情感账户
                      + on_tick（主动关怀 / 早安晚安 / 纪念日 / 里程碑 + W5 火花提醒）
  - diary             成长日记（统计决策历史 → 第一人称日记 → diary 表落库）
  - spark             火花计划引擎（连续陪伴/三档提醒/每日任务/签到抽奖/里程碑解锁，
                      双栈集成到决策引擎 on_tick 统一调度）
"""
from .decision_engine import DecisionEngine
from .diary import DogDiary, build_diary_content
from .spark import SparkEngine

__all__ = ['DecisionEngine', 'DogDiary', 'build_diary_content', 'SparkEngine']
