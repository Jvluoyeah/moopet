"""对战场次：锁步房间的内存态与转发。

服务端**不跑游戏模拟**（模拟只在客户端跑一次，见全栈计划第十节），它只做四件事：
  1. 撮合：把两个客户端放进同一个房间，分配 side（0/1）
  2. 转发：把一方的输入帧原样转给另一方（锁步的核心就这一句）
  3. 记录：把输入帧存下来，用于回放与结果核对
  4. 掉线处理：一方断开 → 立刻告诉另一方"对手没了"，客户端切成 AI 接管

为什么不在这里跑模拟：真要服务器权威就得同时维护 Python 与 JS 两份模拟并逐帧对账，
8 天工期里这是最高风险项（详见计划第十节的取舍）。
"""
import asyncio
from datetime import datetime


class Room:
    """一个对战房间（内存态，进程内有效）。"""

    def __init__(self, code, match_id, seed=0):
        self.code = code
        self.match_id = match_id
        self.seed = int(seed)
        self.sockets = {}            # side(int) -> WebSocket
        self.names = {}              # side -> 显示名
        self.ready = set()
        self.frame = 0
        self.input_log = []          # [{'frame':n,'side':s,'keys':[...]}]
        self.started = False
        self.finished = False
        self.created_at = datetime.utcnow()
        self.lock = asyncio.Lock()

    @property
    def seats(self):
        return sorted(self.sockets)

    def free_side(self):
        for s in (0, 1):
            if s not in self.sockets:
                return s
        return None

    def is_full(self):
        return len(self.sockets) >= 2

    def summary(self):
        return {'room': self.code, 'match_id': self.match_id, 'seed': self.seed,
                'seats': self.seats, 'ready': sorted(self.ready),
                'frame': self.frame, 'started': self.started,
                'finished': self.finished, 'inputs': len(self.input_log)}


class MatchHub:
    """房间注册表 + 转发逻辑。"""

    def __init__(self):
        self.rooms = {}
        self._lock = asyncio.Lock()

    async def create_room(self, code, match_id, seed=0):
        async with self._lock:
            room = self.rooms.get(code)
            if room is None:
                room = Room(code, match_id, seed)
                self.rooms[code] = room
            return room

    def get(self, code):
        return self.rooms.get(code)

    async def drop_room(self, code):
        async with self._lock:
            self.rooms.pop(code, None)

    async def join(self, code, side, ws, match_id=0, seed=0, name=''):
        room = await self.create_room(code, match_id, seed)
        async with room.lock:
            room.sockets[side] = ws
            if name:
                room.names[side] = name
        return room

    async def leave(self, code, side):
        """一方离开：通知另一方，并把房间标记为可结束。"""
        room = self.rooms.get(code)
        if room is None:
            return None
        async with room.lock:
            room.sockets.pop(side, None)
            room.ready.discard(side)
            peer = 1 - side
            other = room.sockets.get(peer)
        if other is not None:
            await self._safe_send(other, {
                'type': 'peer_left', 'side': side, 'takeover': 'ai',
                'reason': '对手掉线，已由 AI 接管',
            })
        return room

    async def relay(self, code, side, payload):
        """把一方的消息转给另一方；输入帧顺便记账。"""
        room = self.rooms.get(code)
        if room is None:
            return 0
        kind = payload.get('type')
        if kind == 'input':
            async with room.lock:
                frame = int(payload.get('frame', room.frame))
                room.frame = max(room.frame, frame)
                room.input_log.append({'frame': frame, 'side': side,
                                       'keys': payload.get('keys') or []})
                if len(room.input_log) > 20000:      # 一局 60s@30Hz 约 1800 帧
                    room.input_log = room.input_log[-20000:]
        elif kind == 'ready':
            async with room.lock:
                room.ready.add(side)
                both = len(room.ready) >= 2
                if both and not room.started:
                    room.started = True
        peer = 1 - side
        other = room.sockets.get(peer)
        if other is None:
            return 0
        out = dict(payload)
        out['side'] = side
        await self._safe_send(other, out)
        return 1

    async def broadcast(self, code, payload):
        room = self.rooms.get(code)
        if room is None:
            return 0
        sent = 0
        for ws in list(room.sockets.values()):
            if await self._safe_send(ws, payload):
                sent += 1
        return sent

    @staticmethod
    async def _safe_send(ws, payload):
        try:
            await ws.send_json(payload)
            return True
        except Exception:      # noqa: BLE001  对端已断，忽略即可
            return False

    def stats(self):
        return {'rooms': len(self.rooms),
                'detail': [r.summary() for r in self.rooms.values()]}
