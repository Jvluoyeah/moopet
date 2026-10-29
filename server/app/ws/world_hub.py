"""开放世界房间：位置广播（**不是锁步**）。

和 `hub.py`（对战锁步房间）的区别，值得写在这里免得以后有人搞混：

  对战房间                世界房间
  ─────────────────       ─────────────────────────────
  两端必须逐位一致          各看各的，看着顺就行
  服务端只转发输入帧        服务端**校验**位置再广播
  固定两个座位              一个场景几十个人，随时进出
  掉线 → AI 接管            掉线 → 告诉别人"他走了"

为什么世界不做锁步：锁步意味着每一步都要等对方确认，移动会带一个 RTT 的延迟，
大厅里走两步顿一下，手感直接废掉。世界用「客户端权威 + 服务端校验 + 远端插值」，
代价是别人看你可能有点漂移、理论上能加速——大厅里无所谓，**对战才需要锁步**。

服务端在这里确实要"看懂"位置，所以守三条线（计划 2.2 写的）：
  1. 边界：坐标必须落在场景尺寸内
  2. 速度：两次上报的位移不能超过 max_speed × 时间 + grace
  3. 限频：一秒内消息数有上限，超了直接断
"""
import asyncio
import json
import math
import os
import time
from datetime import datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_SHARED = os.path.normpath(os.path.join(_HERE, '..', '..', '..', 'shared',
                                        'world_scenes.json'))


def _load_shared():
    """读共用的场景表。读不到就用内置兜底，保证服务端不会因为少一个文件起不来。"""
    fallback = {
        'scenes': {
            'plaza': {'name': '长夜月广场', 'w': 2200, 'd': 1700,
                      'spawn': [1100, 1200], 'capacity': 64},
            'park': {'name': '长夜月公园', 'w': 2400, 'd': 1900,
                     'spawn': [1200, 1350], 'capacity': 48},
            'kennel': {'name': '我的狗窝', 'w': 1500, 'd': 1150,
                       'spawn': [750, 700], 'capacity': 8},
            'arena': {'name': '月光竞技场', 'w': 2200, 'd': 1700,
                      'spawn': [1100, 1200], 'capacity': 32},
        },
        'motion': {'max_speed': 520, 'grace': 40, 'report_hz': 10,
                   'max_msg_per_sec': 40, 'reject_budget': 20,
                   'presence_write_sec': 5},
    }
    try:
        with open(_SHARED, encoding='utf-8') as f:
            data = json.load(f)
        data.setdefault('scenes', fallback['scenes'])
        motion = dict(fallback['motion'])
        motion.update(data.get('motion') or {})
        data['motion'] = motion
        return data
    except Exception:      # noqa: BLE001  文件缺失/损坏都不该让服务端起不来
        return fallback


SHARED = _load_shared()
SCENES = SHARED['scenes']
MOTION = SHARED['motion']


def scene_or_none(code):
    return SCENES.get(code)


def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


class Peer:
    """一个在世界里的玩家。位置是客户端说了算，服务端只做校验与转发。"""

    __slots__ = ('dog_id', 'name', 'breed_code', 'level', 'ws', 'x', 'z',
                 'facing', 'status', 'bubble', 'last_at', 'rejects',
                 'reject_window', 'msg_window', 'msg_count', 'last_db_at',
                 'joined_at', 'track')

    def __init__(self, dog_id, name, ws, breed_code='', level=1):
        self.dog_id = dog_id
        self.name = name
        self.breed_code = breed_code
        self.level = int(level or 1)
        self.ws = ws
        self.x = 0.0
        self.z = 0.0
        self.facing = 1
        self.status = 'idle'
        self.bubble = ''
        self.last_at = time.monotonic()
        self.joined_at = time.monotonic()
        self.rejects = 0
        self.reject_window = time.monotonic()
        self.msg_window = time.monotonic()
        self.msg_count = 0
        self.last_db_at = 0.0
        # 最近 1.2 秒的轨迹 [(t, x, z)]，用来算"单位时间走了多远"
        self.track = []

    def hello(self):
        """进房时发给别人的自我介绍（也发给本人一份，方便客户端统一处理）。"""
        return {'dog_id': self.dog_id, 'name': self.name,
                'breed_code': self.breed_code, 'level': self.level,
                'x': round(self.x, 1), 'z': round(self.z, 1),
                'facing': self.facing, 'status': self.status,
                'bubble': self.bubble}

    def move_msg(self):
        return {'type': 'peer_move', 'dog_id': self.dog_id,
                'x': round(self.x, 1), 'z': round(self.z, 1),
                'facing': self.facing, 'status': self.status,
                't': int(time.time() * 1000)}


class WorldRoom:
    def __init__(self, code):
        self.code = code
        self.meta = SCENES.get(code, {})
        self.peers = {}            # dog_id -> Peer
        self.lock = asyncio.Lock()

    @property
    def size(self):
        return float(self.meta.get('w', 1000)), float(self.meta.get('d', 1000))

    def capacity(self):
        return int(self.meta.get('capacity', 32))

    def roster(self, exclude=None):
        return [p.hello() for p in self.peers.values() if p.dog_id != exclude]

    def summary(self):
        return {'scene': self.code, 'peers': len(self.peers),
                'names': [p.name for p in self.peers.values()][:12]}


class WorldHub:
    """场景注册表。每个场景一个房间，房间常驻（空着也在，省得反复创建）。"""

    def __init__(self):
        self.rooms = {code: WorldRoom(code) for code in SCENES}
        # 位置校验的拒绝计数（测试要读，也方便排查"为什么别人看不到我动"）
        self.stats = {'moves': 0, 'rejected_bounds': 0, 'rejected_speed': 0,
                      'rejected_rate': 0, 'joins': 0, 'leaves': 0}

    def room(self, code):
        return self.rooms.get(code)

    async def join(self, code, peer):
        room = self.rooms.get(code)
        if room is None:
            return None, 'no_scene'
        async with room.lock:
            if len(room.peers) >= room.capacity() and peer.dog_id not in room.peers:
                return room, 'full'
            old = room.peers.get(peer.dog_id)
            if old is not None and old.ws is not peer.ws:
                # 同一只狗换了连接（刷新/多标签页）：先把旧连接踢掉，别留幽灵
                await self._safe_send(old.ws, {'type': 'error',
                                               'detail': '同一只狗在别处上线了'})
                try:
                    await old.ws.close(code=4409)
                except Exception:      # noqa: BLE001
                    pass
            w, d = room.size
            spawn = SCENES[code].get('spawn') or [w / 2, d / 2]
            peer.x = clamp(peer.x or float(spawn[0]), 0.0, w)
            peer.z = clamp(peer.z or float(spawn[1]), 0.0, d)
            room.peers[peer.dog_id] = peer
        self.stats['joins'] += 1
        return room, None

    async def leave(self, code, dog_id):
        room = self.rooms.get(code)
        if room is None:
            return 0
        async with room.lock:
            gone = room.peers.pop(dog_id, None)
        if gone is None:
            return 0
        self.stats['leaves'] += 1
        await self.broadcast(code, {'type': 'peer_leave', 'dog_id': dog_id})
        return 1

    async def broadcast(self, code, payload, exclude=None):
        room = self.rooms.get(code)
        if room is None:
            return 0
        sent = 0
        for p in list(room.peers.values()):
            if exclude is not None and p.dog_id == exclude:
                continue
            if await self._safe_send(p.ws, payload):
                sent += 1
        return sent

    # ---------------- 位置校验 ----------------

    def check_rate(self, peer, now=None):
        """限频：返回 False 表示这条消息该被直接丢掉。"""
        now = time.monotonic() if now is None else now
        if now - peer.msg_window >= 1.0:
            peer.msg_window = now
            peer.msg_count = 0
        peer.msg_count += 1
        if peer.msg_count > MOTION['max_msg_per_sec']:
            self.stats['rejected_rate'] += 1
            return False
        return True

    def validate_move(self, room, peer, x, z, now=None):
        """三条线：数值合法 → 在场景内 → 单位时间没走太远。

        超速判定用了**两道**，缺一不可：

          ① 逐帧：`dist <= max_speed × dt + grace`
             挡住"一跳八百里"的瞬移。
          ② 滑窗：最近 1.2 秒的轨迹总长 <= `max_speed × 1.0 + 2×grace`
             挡住"每次只走 50 格、但一秒发 40 次"的持续超速。

        为什么不能只用 ①：10Hz 上报的包在 TCP 上可能**攒在一起到达**
        （浏览器切标签页、网络抖动都会），那时第二条消息的 dt≈0，
        43 格的正常位移会被 ① 判成超速。宽限 g 只能盖住一两条，
        而滑窗天然容忍突发、不容忍持续。
        """
        now = time.monotonic() if now is None else now
        try:
            x = float(x)
            z = float(z)
        except (TypeError, ValueError):
            return False, 'bad_number'
        if not (math.isfinite(x) and math.isfinite(z)):
            return False, 'bad_number'

        w, d = room.size
        if not (0.0 <= x <= w and 0.0 <= z <= d):
            self.stats['rejected_bounds'] += 1
            return False, 'out_of_bounds'

        grace = MOTION['grace']
        dt = max(0.0, now - peer.last_at)
        dist = math.hypot(x - peer.x, z - peer.z)
        if dist > MOTION['max_speed'] * dt + grace:
            self.stats['rejected_speed'] += 1
            return False, 'too_fast'

        # 滑窗：把窗口以外的点丢掉，再算轨迹总长
        win = MOTION.get('window_sec', 1.2)
        track = [p for p in peer.track if now - p[0] <= win]
        window = sum(math.hypot(track[i + 1][1] - track[i][1],
                                track[i + 1][2] - track[i][2])
                     for i in range(len(track) - 1))
        window += math.hypot(x - track[-1][1], z - track[-1][2]) if track else 0.0
        if window > MOTION['max_speed'] * win + 2 * grace:
            self.stats['rejected_speed'] += 1
            return False, 'too_fast'
        return True, ''

    def apply_move(self, peer, x, z, facing=None, status=None, now=None):
        now = time.monotonic() if now is None else now
        win = MOTION.get('window_sec', 1.2)
        peer.track = [p for p in peer.track if now - p[0] <= win]
        peer.track.append((now, float(x), float(z)))
        peer.x = float(x)
        peer.z = float(z)
        if facing is not None:
            peer.facing = 1 if int(facing) >= 0 else -1
        if status is not None:
            peer.status = str(status)[:16]
        peer.last_at = now

    @staticmethod
    async def _safe_send(ws, payload):
        try:
            await ws.send_json(payload)
            return True
        except Exception:      # noqa: BLE001  对端已断，忽略
            return False

    def snapshot(self):
        return {'scenes': {c: r.summary() for c, r in self.rooms.items()},
                'stats': dict(self.stats)}
