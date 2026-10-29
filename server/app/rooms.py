"""房间管理：一个对局一个权威房间
============================================================
`AuthorityRoom` 管的是"一份模拟怎么推进"，这里管的是"哪些房间活着、
谁在往里发输入、结果往哪广播"。

为什么要有这一层（而不是让 WS 路由直接拿 AuthorityRoom）：
  · 房间要能被**多个入口**拿到：WS 收输入、HTTP 查状态、超时清理
  · 每个房间是一个**子进程**（Node 承载引擎），必须有集中的清理，
    否则玩家一多就是一堆僵尸 node 进程
  · 广播回调在这里注入，WS 层不用知道引擎的存在

生命周期：
    create(code, ...) → 拿到房间
    push_input(code, side, frame, input)
    pump_all()        → 由后台任务按 ~128Hz 调，推进到点的房间并广播
    close(code)       → 关掉引擎子进程
    reap(idle_sec)    → 清掉长时间没人的房间（防僵尸）

    ⚠️ 引擎是**子进程**，忘记 close 会留下 node 进程。
       close 必须幂等，而且要在应用退出时全部关掉（见 close_all）。
"""

from __future__ import annotations

import threading
import time
from typing import Any, Callable

from .authority import AuthorityRoom, TICK_HZ


class RoomManager:
    def __init__(self, *, on_frame: Callable[[str, list[dict]], None] | None = None,
                 delay_ticks: int = 3, max_rooms: int = 64) -> None:
        self.rooms: dict[str, AuthorityRoom] = {}
        self.meta: dict[str, dict[str, Any]] = {}
        self.on_frame = on_frame
        self.delay_ticks = delay_ticks
        self.max_rooms = max_rooms
        self._lock = threading.RLock()

    # ---------------- 生命周期 ----------------
    def create(self, code: str, *, seed: int, breeds: list[dict],
               sides: int = 2) -> AuthorityRoom:
        code = code.upper()
        with self._lock:
            if code in self.rooms:
                return self.rooms[code]
            if len(self.rooms) >= self.max_rooms:
                self.reap(idle_sec=0)          # 先清一轮
                if len(self.rooms) >= self.max_rooms:
                    raise RuntimeError(f'房间太多了（上限 {self.max_rooms}）')
            room = AuthorityRoom(
                seed=seed, breeds=breeds, delay_ticks=self.delay_ticks,
                on_frame=(lambda frames, c=code: self._broadcast(c, frames)),
            )
            self.rooms[code] = room
            self.meta[code] = {
                'created': time.monotonic(),
                'last_input': time.monotonic(),
                'sides': sides,
                'players': {},
            }
            return room

    def get(self, code: str) -> AuthorityRoom | None:
        return self.rooms.get(code.upper())

    def join(self, code: str, side: int, who: Any) -> bool:
        with self._lock:
            m = self.meta.get(code.upper())
            if not m:
                return False
            if side in m['players'] and m['players'][side] != who:
                return False
            m['players'][side] = who
            return True

    def join_left(self, code: str, side: int) -> None:
        """有人走了：把座位腾出来。座位空着比"占着但人不在"好 ——
        后者会让重连的人挤不进来。"""
        with self._lock:
            m = self.meta.get(code.upper())
            if m:
                m['players'].pop(side, None)

    def has(self, code: str) -> bool:
        return code.upper() in self.rooms

    # ---------------- 输入 / 推进 ----------------
    def push_input(self, code: str, side: int, frame: int, inp: dict) -> bool:
        room = self.get(code)
        if room is None:
            return False
        ok = room.push_input(side, frame, inp)
        m = self.meta.get(code.upper())
        if m:
            m['last_input'] = time.monotonic()
        return ok

    def pump_all(self, now: float | None = None) -> int:
        """推进所有到点的房间。返回这一轮一共广播了多少帧。

        ⚠️ 每个房间的异常都被吞掉并记在 status 里 ——
           一个房间崩了不该把整个服务端带下水。
        """
        now = time.monotonic() if now is None else now
        total = 0
        with self._lock:
            for code, room in list(self.rooms.items()):
                if room.closed:
                    continue
                try:
                    total += len(room.pump(now=now))
                except Exception as e:      # noqa: BLE001
                    self.meta.setdefault(code, {})['last_error'] = str(e)[:200]
        return total

    def _broadcast(self, code: str, frames: list[dict]) -> None:
        if self.on_frame and frames:
            self.on_frame(code, frames)

    # ---------------- 清理 ----------------
    def close(self, code: str) -> bool:
        with self._lock:
            room = self.rooms.pop(code.upper(), None)
            self.meta.pop(code.upper(), None)
        if room:
            room.close()
            return True
        return False

    def reap(self, idle_sec: float = 120.0) -> list[str]:
        """清掉长时间没输入的房间（防僵尸 node 进程）。返回清掉的房间号。"""
        now = time.monotonic()
        dead: list[str] = []
        with self._lock:
            for code, m in list(self.meta.items()):
                if idle_sec > 0 and now - m['last_input'] < idle_sec:
                    continue
                if idle_sec <= 0 and now - m['last_input'] < 1.0:
                    continue
                dead.append(code)
        for code in dead:
            self.close(code)
        return dead

    def close_all(self) -> int:
        with self._lock:
            codes = list(self.rooms.keys())
        for c in codes:
            self.close(c)
        return len(codes)

    # ---------------- 观测 ----------------
    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                'rooms': len(self.rooms),
                'codes': list(self.rooms.keys()),
                'detail': {c: {**r.status(),
                               'players': sorted(self.meta.get(c, {})
                                                 .get('players', {}).keys()),
                               'error': self.meta.get(c, {}).get('last_error')}
                           for c, r in self.rooms.items()},
            }


__all__ = ['RoomManager', 'TICK_HZ']
