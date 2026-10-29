#!/usr/bin/env python3
"""行为树最小运行器（W3 骨架 · 李文扬）。

对齐排期 W3「搭建行为决策引擎骨架（Behavior Tree 目录结构 + 空节点）」，
本模块只提供**最小可用**的 Behavior Tree 原语，全部无 ROS 依赖、可在纯 Python 单测：

  - Node / Condition / Action      叶节点基类
  - Sequence / Selector            组合节点（短路）
  - Decorator / Inverter / Fallback 装饰与兜底
  - tick(ctx) -> Status            ctx 为决策上下文（事件 + 黑箱状态 + 反应收集）

W4 将在此基础上补齐性格/情感账户/主动关怀/纪念日等完整决策逻辑。
"""
from enum import Enum


class Status(Enum):
    SUCCESS = 1
    FAILURE = 2
    RUNNING = 3


class Node:
    """行为树节点基类（骨架）。子类实现 tick(ctx)。"""
    name = 'Node'

    def __init__(self, name=None):
        if name:
            self.name = name

    def tick(self, ctx):
        raise NotImplementedError(
            f'{self.name} 未实现 tick（骨架空节点，待 W4 填充）')


class Composite(Node):
    """组合节点基类。"""

    def __init__(self, children, name=None):
        super().__init__(name)
        self.children = list(children)


class Sequence(Composite):
    """顺序节点：全部子节点 SUCCESS 才 SUCCESS（遇失败短路）。"""

    def tick(self, ctx):
        for ch in self.children:
            if ch.tick(ctx) != Status.SUCCESS:
                return Status.FAILURE
        return Status.SUCCESS


class Selector(Composite):
    """选择节点：任一子节点 SUCCESS 即 SUCCESS（遇成功短路）。"""

    def tick(self, ctx):
        for ch in self.children:
            if ch.tick(ctx) == Status.SUCCESS:
                return Status.SUCCESS
        return Status.FAILURE


class Decorator(Node):
    """装饰节点基类。"""

    def __init__(self, child, name=None):
        super().__init__(name)
        self.child = child


class Inverter(Decorator):
    """取反节点。"""

    def tick(self, ctx):
        return Status.SUCCESS if self.child.tick(ctx) == Status.FAILURE \
            else Status.FAILURE


class Fallback(Node):
    """兜底节点：没有匹配决策时静默收尾（W4 完稿后不再输出占位反应）。"""

    def __init__(self, name='fallback'):
        super().__init__(name)

    def tick(self, ctx):
        return Status.SUCCESS


class Condition(Node):
    """条件节点基类：子类实现 check(ctx) -> bool。"""

    def tick(self, ctx):
        return Status.SUCCESS if self.check(ctx) else Status.FAILURE

    def check(self, ctx):
        raise NotImplementedError(f'{self.name} 未实现 check')


class Action(Node):
    """行为节点基类：子类实现 run(ctx) -> dict（决策反应）。

    tick 成功后把反应追加进 ctx['reactions']，供决策引擎统一落地
    （TTS / /dog/action / 状态记录）。
    """

    def tick(self, ctx):
        reaction = self.run(ctx)
        ctx.setdefault('reactions', []).append(reaction)
        return Status.SUCCESS

    def run(self, ctx):
        raise NotImplementedError(f'{self.name} 未实现 run')
