"""信封协议：跨机消息的统一外壳。

为什么要有信封：
  W1-W5 的 16 项 msg/srv/action 各自为政，双机一出问题（重复投递、乱序、断连补发）
  就没有统一的地方可以处理。信封把这些问题收敛到一层：

    { ver, msg_id, seq, ts, src, dst, kind, ttl, payload }

  * msg_id —— 去重（重试与重复投递用同一个 id）
  * seq    —— 每个发送方单调递增，用于乱序检测与补发排序
  * ts/ttl —— 过期丢弃（断连期间攒的旧消息不该在恢复后一次性糊上去）
  * ver    —— 版本协商，双机固件不同步时不至于直接崩

payload 保持"业务无关"：link 层不解释它，只负责可靠送达。
"""
import json
import uuid

ENVELOPE_VERSION = 1

# ---- 常用 kind（业务语义标签；link 层不解释，只用于分发） ----
KIND_HEARTBEAT = 'heartbeat'
KIND_STATE = 'state'          # 养成状态广播（等级/经验/心情/火花）
KIND_SENSOR = 'sensor'        # 感知事件（触摸/表情/语音/空气质量/里程）
KIND_DECISION = 'decision'    # 决策反应（话术/动作）
KIND_ACTION = 'action'        # 动作请求/回执
KIND_CONTROL = 'control'      # 控制指令（走/停/模式切换）
KIND_ACK = 'ack'
KIND_DIAG = 'diag'            # 链路自检/诊断

REQUIRED_FIELDS = ('ver', 'msg_id', 'src', 'kind', 'seq', 'ts')


class EnvelopeError(ValueError):
    """信封格式非法（解析或校验失败）。"""


def new_msg_id(src, factory=None):
    """生成消息 id。factory 可注入，便于测试复现。"""
    if factory is not None:
        return factory()
    return f'{src}-{uuid.uuid4().hex[:12]}'


class Envelope:
    """跨机消息外壳（不可变）。"""

    __slots__ = ('ver', 'msg_id', 'seq', 'ts', 'src', 'dst', 'kind', 'ttl', 'payload')

    def __init__(self, kind, payload=None, src='', dst='*', seq=0, ts=0.0,
                 ttl=0.0, msg_id='', ver=ENVELOPE_VERSION):
        self.ver = int(ver)
        self.msg_id = msg_id or new_msg_id(src or 'anon')
        self.seq = int(seq)
        self.ts = float(ts)
        self.src = src
        self.dst = dst
        self.kind = kind
        self.ttl = float(ttl)
        # 只对 dict 做拷贝；非法类型原样留着，交给 validate() 报 EnvelopeError
        self.payload = dict(payload) if isinstance(payload, dict) else payload

    # ---------------- 序列化 ----------------
    def to_dict(self):
        return {
            'ver': self.ver,
            'msg_id': self.msg_id,
            'seq': self.seq,
            'ts': self.ts,
            'src': self.src,
            'dst': self.dst,
            'kind': self.kind,
            'ttl': self.ttl,
            'payload': self.payload,
        }

    def to_bytes(self):
        return json.dumps(self.to_dict(), ensure_ascii=False,
                          separators=(',', ':')).encode('utf-8')

    @classmethod
    def from_dict(cls, d):
        if not isinstance(d, dict):
            raise EnvelopeError(f'信封必须是对象，实际是 {type(d).__name__}')
        missing = [f for f in REQUIRED_FIELDS if f not in d]
        if missing:
            raise EnvelopeError(f'信封缺字段：{missing}')
        env = cls(kind=d['kind'], payload=d.get('payload') or {}, src=d['src'],
                  dst=d.get('dst', '*'), seq=d['seq'], ts=d['ts'],
                  ttl=d.get('ttl', 0.0), msg_id=d['msg_id'], ver=d['ver'])
        env.validate()
        return env

    @classmethod
    def from_bytes(cls, data):
        if isinstance(data, (bytes, bytearray)):
            data = data.decode('utf-8')
        try:
            d = json.loads(data)
        except (ValueError, UnicodeDecodeError) as e:
            raise EnvelopeError(f'信封解析失败：{e}') from e
        return cls.from_dict(d)

    # ---------------- 校验 ----------------
    def validate(self):
        if self.ver != ENVELOPE_VERSION:
            raise EnvelopeError(
                f'信封版本不支持：收到 v{self.ver}，本机支持 v{ENVELOPE_VERSION}')
        if not self.kind or not isinstance(self.kind, str):
            raise EnvelopeError('kind 必须是非空字符串')
        if not self.src:
            raise EnvelopeError('src 不能为空')
        if self.seq < 0:
            raise EnvelopeError(f'seq 不能为负：{self.seq}')
        if self.ts < 0:
            raise EnvelopeError(f'ts 不能为负：{self.ts}')
        if self.ttl < 0:
            raise EnvelopeError(f'ttl 不能为负：{self.ttl}')
        if not isinstance(self.payload, dict):
            raise EnvelopeError('payload 必须是对象')
        return True

    # ---------------- 时间语义 ----------------
    def is_expired(self, now):
        """ttl<=0 表示永不过期。"""
        if self.ttl <= 0:
            return False
        return (now - self.ts) > self.ttl

    def age(self, now):
        return now - self.ts

    def is_for(self, node_id):
        return self.dst in ('*', '', node_id)

    # ---------------- 派生 ----------------
    def stamped(self, seq=None, ts=None):
        """返回带新 seq/ts 的副本（发送时由 channel 调用）。"""
        return Envelope(kind=self.kind, payload=self.payload, src=self.src,
                        dst=self.dst, seq=self.seq if seq is None else seq,
                        ts=self.ts if ts is None else ts, ttl=self.ttl,
                        msg_id=self.msg_id, ver=self.ver)

    def __repr__(self):
        return (f'<Envelope {self.kind} {self.src}->{self.dst} seq={self.seq} '
                f'id={self.msg_id[:16]} ttl={self.ttl}>')

    def __eq__(self, other):
        return isinstance(other, Envelope) and self.to_dict() == other.to_dict()

    def __hash__(self):
        return hash(self.msg_id)
