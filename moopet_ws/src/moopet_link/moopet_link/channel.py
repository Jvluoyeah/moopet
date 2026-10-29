"""链路端点：把信封、健康、离线队列、去重、归位、传输串成一个可用对象。

一句话：**上层只管 send(kind, payload) 和 poll()，弱网下的脏活都在这层干完。**

发送路径：
    建信封（带 seq/ts） → 链路 DOWN？→ 进离线队列
                                          → 否则交给传输
接收路径：
    传输取回字节 → 解析信封 → 校验（版本/字段）→ 目标过滤 → 去重
                 → 乱序归位 → 心跳喂给健康状态机 → 分发给订阅者

恢复路径：
    健康状态从 DOWN/DEGRADED 回到 UP 时，自动把离线队列按序补发出去。
"""
from . import envelope as env_mod
from .buffers import DedupWindow, OfflineQueue, QueueConfig, ReorderBuffer
from .clock import RealClock
from .envelope import Envelope, EnvelopeError
from .health import HealthConfig, LinkHealth, LinkState


class ChannelConfig:
    """链路端点配置。默认值对齐 W2：心跳 5s、丢 1 拍降级、丢 2 拍断连。"""

    def __init__(self, heartbeat_interval=5.0, degraded_after=None, down_after=None,
                 queue_max_items=1000, queue_ttl=300.0, dedup_capacity=2048,
                 gap_timeout=1.0, strict_order=True, heartbeat_ttl=None,
                 event_log_size=256):
        self.health = HealthConfig(heartbeat_interval=heartbeat_interval,
                                   degraded_after=degraded_after,
                                   down_after=down_after)
        self.queue = QueueConfig(max_items=queue_max_items, ttl=queue_ttl)
        self.dedup_capacity = int(dedup_capacity)
        self.gap_timeout = float(gap_timeout)
        self.strict_order = bool(strict_order)
        self.heartbeat_ttl = float(heartbeat_ttl if heartbeat_ttl is not None
                                   else self.health.heartbeat_interval * 2)
        self.event_log_size = int(event_log_size)

    def to_dict(self):
        return {'heartbeat_interval': self.health.heartbeat_interval,
                'degraded_after': self.health.degraded_after,
                'down_after': self.health.down_after,
                'strict_order': self.strict_order,
                'gap_timeout': self.gap_timeout,
                'queue': self.queue.to_dict()}


class LinkChannel:
    """一个通信端点（狗侧或背包侧各一个）。"""

    def __init__(self, node_id, peer_id, transport, clock=None, config=None,
                 role=''):
        self.node_id = node_id
        self.peer_id = peer_id
        self.transport = transport
        self.clock = clock or RealClock()
        self.cfg = config or ChannelConfig()
        self.role = role                     # 'dog' / 'backpack'，供观测用

        self.health = LinkHealth(self_id=node_id, peer_id=peer_id,
                                 config=self.cfg.health, clock=self.clock)
        self.queue = OfflineQueue(self.cfg.queue, clock=self.clock)
        self.dedup = DedupWindow(self.cfg.dedup_capacity)
        self._reorder = {}                   # src -> ReorderBuffer

        self._seq = 0
        self._subs = {}                      # kind -> [handler]
        self._all_subs = []
        self._events = []
        self._needs_flush = False
        self._last_beat_at = None

        self._counters = {'sent': 0, 'queued': 0, 'replayed': 0, 'received': 0,
                          'malformed': 0, 'duplicate': 0, 'wrong_dst': 0,
                          'expired': 0, 'reordered_held': 0, 'beats_out': 0,
                          'beats_in': 0}

        self.health.on_change(self._on_health_change)

    # ---------------- 内部 ----------------
    def _log(self, kind, detail=None):
        self._events.append({'t': self.clock.now(), 'kind': kind,
                             'detail': detail or {}})
        if len(self._events) > self.cfg.event_log_size:
            self._events.pop(0)

    def _on_health_change(self, old, new, now):
        self._log('link_state', {'from': old.value, 'to': new.value})
        if new == LinkState.UP and old != LinkState.UP:
            self._needs_flush = True     # 对端回来了，补发断连期间攒的

    def _next_seq(self):
        self._seq += 1
        return self._seq

    def _reorder_for(self, src):
        if src not in self._reorder:
            self._reorder[src] = ReorderBuffer(gap_timeout=self.cfg.gap_timeout,
                                               clock=self.clock)
        return self._reorder[src]

    # ---------------- 发送 ----------------
    def send(self, kind, payload=None, dst=None, ttl=0.0, now=None,
             allow_offline=True, force=False):
        """发一条消息。链路断时自动进离线队列（allow_offline=False 则丢弃）。

        force=True 表示"无视链路状态照发"——只有心跳用它：
        如果断连时连心跳都不发，链路就永远发现不了对端已经回来。
        """
        now = self.clock.now() if now is None else now
        env = Envelope(kind=kind, payload=payload or {}, src=self.node_id,
                       dst=dst if dst is not None else self.peer_id,
                       seq=self._next_seq(), ts=now, ttl=ttl)
        self._counters['sent'] += 1

        if not force and self.health.is_down(now):
            if allow_offline:
                kept = self.queue.push(env, now)
                self._counters['queued'] += 1 if kept else 0
                self._log('queued', {'kind': kind, 'seq': env.seq, 'kept': kept})
                return env if kept else None
            self._log('dropped_offline', {'kind': kind, 'seq': env.seq})
            return None

        self.transport.send(env.to_bytes(), now)
        self._log('sent', {'kind': kind, 'seq': env.seq})
        return env

    def beat(self, now=None, ttl=None):
        """发一次心跳（强制发送，不受当前链路状态影响）。"""
        now = self.clock.now() if now is None else now
        self._last_beat_at = now
        self._counters['beats_out'] += 1
        return self.send(env_mod.KIND_HEARTBEAT,
                         {'sent_at': now, 'state': self.health.state(now).value},
                         ttl=self.cfg.heartbeat_ttl if ttl is None else ttl,
                         now=now, allow_offline=False, force=True)

    def maybe_beat(self, now=None):
        """到了间隔就发心跳（宿主循环里调用即可，不需要额外线程）。"""
        now = self.clock.now() if now is None else now
        if (self._last_beat_at is None
                or (now - self._last_beat_at) >= self.cfg.health.heartbeat_interval):
            return self.beat(now)
        return None

    def flush_offline(self, now=None, force=False):
        """把离线队列补发出去。对端恢复时自动触发。"""
        now = self.clock.now() if now is None else now
        if self.health.is_down(now) and not force:
            return 0
        pending = self.queue.drain(now)
        sent = 0
        for env in pending:
            if env.is_expired(now):
                self._counters['expired'] += 1
                continue
            # 保留原 msg_id（对端可能已用去重窗口见过它），只刷新 seq/ts
            out = env.stamped(seq=self._next_seq(), ts=now)
            self.transport.send(out.to_bytes(), now)
            sent += 1
        self._counters['replayed'] += sent
        self._needs_flush = False
        if sent:
            self._log('flushed', {'count': sent})
        return sent

    # ---------------- 接收 ----------------
    def poll(self, now=None):
        """收取并处理到达的消息，返回通过全部检查的业务消息列表。"""
        now = self.clock.now() if now is None else now
        if self._needs_flush or (not self.health.is_down(now) and len(self.queue)):
            self.flush_offline(now)

        out = []
        # 1) 先放行"缺口已超时"的滞留消息——否则一条丢包会让它们永远卡在缓冲里
        for buf in self._reorder.values():
            for env in buf.flush(now):
                self._log('reorder_forced', {'seq': env.seq})
                self._dispatch(env, now)
                out.append(env)

        # 2) 处理本轮新到达
        for src, data in self.transport.poll(now):
            self._counters['received'] += 1
            try:
                env = Envelope.from_bytes(data)
            except EnvelopeError as e:
                self._counters['malformed'] += 1
                self._log('malformed', {'src': src, 'err': str(e)})
                continue
            if not env.is_for(self.node_id):
                self._counters['wrong_dst'] += 1
                continue
            if env.is_expired(now):
                self._counters['expired'] += 1
                self._log('expired', {'kind': env.kind, 'seq': env.seq})
                continue
            if self.dedup.check_and_mark(env.msg_id):
                self._counters['duplicate'] += 1
                self._log('duplicate', {'kind': env.kind, 'seq': env.seq})
                continue
            if env.kind == env_mod.KIND_HEARTBEAT:
                self._counters['beats_in'] += 1
                sent_at = env.payload.get('sent_at')
                rtt = None
                if isinstance(sent_at, (int, float)) and now >= sent_at:
                    rtt = now - sent_at
                self.health.beat(env.src, now=now, rtt=rtt)
            for d in self._deliver_order(env, now):
                self._dispatch(d, now)
                out.append(d)

        # 3) 本轮可能收到了心跳让链路恢复 → 立刻补发，不必等下一次 poll
        if self._needs_flush and not self.health.is_down(now):
            self.flush_offline(now)
        return out

    def _deliver_order(self, env, now):
        """按配置决定是否做乱序归位（超时放行由 poll 开头统一处理）。"""
        if not self.cfg.strict_order:
            return [env]
        buf = self._reorder_for(env.src)
        ready = buf.push(env, now)
        if buf.held_count():
            self._counters['reordered_held'] = buf.held_count()
        return ready

    def _dispatch(self, env, now):
        for h in self._subs.get(env.kind, []):
            self._safe_call(h, env)
        for h in self._all_subs:
            self._safe_call(h, env)

    @staticmethod
    def _safe_call(handler, env):
        try:
            handler(env)
        except Exception as e:      # noqa: BLE001  单个订阅者出错不能拖垮链路
            import sys
            print(f'[moopet_link] 订阅者异常：{e}', file=sys.stderr)

    # ---------------- 订阅 ----------------
    def subscribe(self, kind, handler):
        self._subs.setdefault(kind, []).append(handler)
        return handler

    def unsubscribe(self, kind, handler):
        if handler in self._subs.get(kind, []):
            self._subs[kind].remove(handler)

    def on_message(self, handler):
        self._all_subs.append(handler)
        return handler

    # ---------------- 观测 ----------------
    def state(self, now=None):
        return self.health.state(now)

    def is_peer_down(self, now=None):
        return self.health.is_down(now)

    def is_peer_up(self, now=None):
        return self.health.is_up(now)

    def pending(self):
        return len(self.queue)

    def events(self, limit=50):
        return self._events[-limit:]

    def stats(self, now=None):
        now = self.clock.now() if now is None else now
        return {
            'node': self.node_id, 'peer': self.peer_id, 'role': self.role,
            'state': self.state(now).value,
            'counters': dict(self._counters),
            'health': self.health.stats(now),
            'queue': self.queue.stats(),
            'dedup': self.dedup.stats(),
            'reorder': {s: b.stats() for s, b in self._reorder.items()},
            'transport': self.transport.stats(),
            'config': self.cfg.to_dict(),
        }

    def reset_counters(self):
        for k in self._counters:
            self._counters[k] = 0
