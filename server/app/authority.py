"""权威房间（服务端）
============================================================
一个房间 = 一份权威模拟 + 一份输入表 + 一个固定 128Hz 的时钟。

和原来"锁步"的区别（这是用户报的"加入方很卡"的根因）：
    锁步：服务端只转发按键，两端各自跑模拟，**双方都要等最慢的那一方**
    权威：服务端跑唯一一份模拟，客户端只发输入、收结果 —— **不用等对手**

三个关键设计，都在下面标了原因：
  ① **输入延迟**（delay_ticks）：客户端第 N 帧的输入不可能及时到，
     所以服务端"发出第 N 帧快照"和"消费第 N 帧输入"之间要留几帧的余量。
     不留的话，迟到的输入只能被丢掉 —— 玩家的操作会莫名其妙失效。
  ② **按 tick 推进而不是按墙上时钟**：模拟的步进必须是整数帧，
     和网速无关。晚了就一次补多帧（catch-up），但不能改变帧率。
  ③ **快照按帧广播，顺带带上指纹**：客户端拿去对账/回滚。

这个类**不碰网络**（广播交给回调），所以能在没有 WebSocket 的情况下测。
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable

from .engine_host import EngineHost, TICK_HZ


@dataclass
class _Pending:
    """某一帧的输入。side -> input（没到的就是 None）"""
    inputs: dict[int, dict] = field(default_factory=dict)


class AuthorityRoom:
    """一份权威模拟 + 输入表 + 时钟。

    用法：
        room = AuthorityRoom(seed=1, breeds=[...], on_frame=ws_send)
        room.push_input(side=0, frame=10, input={...})
        room.pump()          # 按墙上时钟推进（该推几帧推几帧）
        room.status()
    """

    def __init__(self, *, seed: int, breeds: list[dict], ai: bool = False,
                 training: bool = False, delay_ticks: int = 3,
                 on_frame: Callable[[list[dict]], None] | None = None,
                 on_tick: Callable[[int], None] | None = None) -> None:
        self.host = EngineHost(seed=seed, breeds=breeds, ai=ai,
                               training=training)
        self.delay = max(0, int(delay_ticks))
        self.on_frame = on_frame
        self.on_tick = on_tick
        self.sides = 2
        # frame -> 输入；只保留最近若干帧，别无限涨
        self.pending: dict[int, _Pending] = {}
        self.next_frame = 0            # 下一个要**消费**的帧
        # ⚠️ 第一次 pump 只用来**对表**（把基准设成调用方给的 now）。
        #    原来这里直接取 time.monotonic()，于是测试传进来的假时钟
        #    比真实时钟小的时候，elapsed 是负的 → 一帧都推不动。
        self.last_real: float | None = None
        self.dropped = 0               # 因为迟到太久被丢掉的输入数
        self.last_hash = ""
        self.last_inputs: list[list[dict]] = []
        # 每个座位"最后一次收到的输入"（缺输入的帧沿用它）
        self.last_input: dict[int, dict] = {}
        self.last_frames: list[dict] = []
        self.closed = False

    # ---------------- 输入 ----------------
    def push_input(self, side: int, frame: int, inp: dict) -> bool:
        """收一个客户端输入。frame 是客户端认为的帧号。

        客户端可能因为预测跑在前面，发来比服务端还早/还晚的帧号 ——
        这里只做**范围裁剪**，不做纠正（纠正交给客户端的回滚）。
        """
        if self.closed:
            return False
        # ⚠️ **客户端的帧号一律忽略，输入应用到"下一个还没消费的帧"。**
        #
        # 为什么不再按帧号对齐：
        #   客户端按 rAF（60~144Hz，取决于显示器）产输入，服务端按 **固定 128Hz** 消费。
        #   两边节拍根本不同源，帧号只会越对越歪：
        #     · 按"太晚就丢" → 丢掉绝大多数输入（实测 240 条丢 220 条）
        #     · 按"迟到就塞进最早的可用帧" → 客户端帧号一旦跑到前面
        #       （144Hz 屏幕、或 netFrame 被 ackFrame 拉到服务端帧号之后）
        #       就会撞上"领先太多"那一支，同样丢
        #     · 实战里表现为"一点都动不了"（实测丢 741/1740/2740…）
        #
        # 权威模式本来就不需要客户端告诉我"这是第几帧" ——
        # 服务端自己知道下一个要消费哪一帧，客户端发的就是"我现在的输入"。
        # 把它放到**下一个还没消费的帧**上，语义最准、也永远丢不了。
        #
        # （回滚重放不受影响：客户端重放用的是**服务端广播回去的权威输入**，
        #   不是它自己发过的帧号。）
        frame = self.next_frame + self.delay
        if frame <= self.next_frame:
            frame = self.next_frame
        # ⚠️ 输入必须是字典。收到别的类型（比如协议不匹配时发来的数组）
        #    就**丢掉这一条**，绝不能让 pump() 抛异常 ——
        #    pump() 抛异常会把整个推进循环带走（这条路径我付出过四轮的代价）。
        if not isinstance(inp, dict):
            self.bad_inputs = getattr(self, 'bad_inputs', 0) + 1
            return False
        slot = self.pending.setdefault(frame, _Pending())
        slot.inputs[int(side)] = inp
        # 别让 pending 无限涨（正常情况下也就 delay+几帧）
        if len(self.pending) > TICK_HZ:
            for k in sorted(self.pending)[:len(self.pending) - TICK_HZ]:
                self.pending.pop(k, None)
        return True

    # ---------------- 推进 ----------------
    def pump(self, now: float | None = None, max_ticks: int = 8) -> list[dict]:
        """按墙上时钟推进若干帧，返回这一批的公开帧。

        一次最多补 max_ticks 帧（和客户端那边的做法一致）：
        机器忙/切后台回来时不要一口气补几百帧。
        """
        if self.closed:
            return []
        now = time.monotonic() if now is None else now
        if self.last_real is None:      # 第一次：只对表，不推进
            self.last_real = now
            return []
        elapsed = now - self.last_real
        tick_dt = 1.0 / TICK_HZ
        n = int(elapsed / tick_dt)
        # 排查用：把"这一轮流逝了多少、算出该推几帧"记下来。
        # 心跳里会打出来 —— "循环活着但帧号不动"这种症状，
        # 看这两个数一眼就能分清是时间基准的问题还是别的。
        self.dbg_elapsed = elapsed
        self.dbg_n = n
        self.dbg_calls = getattr(self, 'dbg_calls', 0) + 1
        if n <= 0:
            return []
        n = min(n, max_ticks)
        self.last_real += n * tick_dt          # 只吃掉推进掉的那部分时间

        batch: list[list[dict]] = []
        for _ in range(n):
            f = self.next_frame
            slot = self.pending.pop(f, None)
            pair = []
            for side in range(self.sides):
                got = (slot.inputs.get(side) if slot else None)
                if got is not None:
                    # 有新输入 → 记下来，后面没新输入的帧**沿用**它
                    self.last_input[side] = got
                else:
                    # ⚠️ 没新输入时要**沿用上一次的**，不能填中立。
                    # 客户端按 60Hz 渲染，服务端按 128Hz 跑 ——
                    # 每两帧才有一条新输入是常态。
                    # 填中立的话，按住方向键会变成「走一帧停一帧」，
                    # 玩家的感受是「按着不动」（其实是每帧都在松开）。
                    got = self.last_input.get(side) or {}
                pair.append({"mx": int(got.get("mx", 0)),
                             "skill": int(got.get("skill", -1)),
                             "btn": int(got.get("btn", 0))})
            batch.append(pair)
            self.next_frame += 1
            if self.on_tick:
                self.on_tick(f)

        frames = self.host.step(batch)
        self.last_hash = self.host.hash()
        # 把**这一批消费掉的输入**也发出去。
        # 客户端的回滚重放需要它：收到权威快照之后要「从那一刻重放一遍」，
        # 如果不知道对手按了什么，重放出来的结果必然和权威不一致 ——
        # 那就成了「每次快照都回滚、每次都对不上」，画面会一直抖。
        # 把权威用过的输入带上，重放才是精确的。
        self.last_inputs = batch
        self.last_frames = frames
        if self.on_frame and frames:
            self.on_frame(frames)
        return frames

    # ---------------- 快照 / 回滚 ----------------
    def snapshot(self) -> dict[str, Any]:
        """快照 + 指纹 + 帧号 + **最后一批消费掉的输入**。
        客户端的回滚重放全靠这四样。"""
        return {"snap": self.host.snapshot(), "hash": self.last_hash,
                "frame": self.next_frame, "inputs": self.last_inputs}

    def restore(self, snap: dict) -> str:
        h = self.host.restore(snap)
        self.next_frame = int(snap.get("tick", self.next_frame))
        self.pending.clear()
        self.last_hash = h
        return h

    def status(self) -> dict[str, Any]:
        return {
            "frame": self.next_frame,
            "hash": self.last_hash,
            "dropped": self.dropped,
            "pending_frames": len(self.pending),
            "delay_ticks": self.delay,
            "closed": self.closed,
        }

    def close(self) -> None:
        if not self.closed:
            self.closed = True
            self.host.close()

    def __enter__(self) -> "AuthorityRoom":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


__all__ = ["AuthorityRoom", "TICK_HZ"]
