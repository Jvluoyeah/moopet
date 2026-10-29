"""统一感知事件：HAL 与通信层之间的公共语言。

为什么单独定义：ROS 的 16 项 msg 是"线格式"，不适合当业务内部模型。
core/link 只认这个统一下来的 SensorEvent，于是：
  * 仿真、回放、真机三种来源产出同一种东西，大脑完全无感（可搬家、可回放）；
  * 事件能直接 JSON 序列化进信封 payload，跨机传输零转换。
"""
from dataclasses import dataclass, field


@dataclass
class SensorEvent:
    """一次感知/互动事件。"""

    kind: str                       # pet/handshake/call/walk/quiz_answer/air_quality/...
    value: str = ''                 # 取值（如 quiz_answer 的 answer_correct）
    params: dict = field(default_factory=dict)
    ts: float = 0.0                 # 逻辑时间（秒）——回放与不变性对比都依赖它
    origin: str = ''                # 产生该事件的节点（dog / backpack）

    def to_payload(self):
        return {'kind': self.kind, 'value': self.value, 'params': dict(self.params),
                'ts': self.ts, 'origin': self.origin}

    @classmethod
    def from_payload(cls, d):
        return cls(kind=d.get('kind', ''), value=d.get('value', ''),
                   params=dict(d.get('params') or {}), ts=float(d.get('ts', 0.0)),
                   origin=d.get('origin', ''))

    def __repr__(self):
        v = f'={self.value}' if self.value else ''
        return f'<SensorEvent {self.kind}{v} @{self.ts:.2f} from {self.origin}>'


# ---- 与 interface_spec 的感知来源对齐（一眼能看出哪些事件来自哪一侧） ----
DOG_EVENTS = ('walk',)                                     # 里程：狗本体
BACKPACK_EVENTS = ('pet', 'handshake', 'call', 'air_quality')  # 触摸/视觉/语音/环境：背包

# 常用的即时事件取值（供脚本与测试引用，避免各写一份字符串）
VALUE_OK = 'ok'
VALUE_CORRECT = 'answer_correct'
VALUE_WRONG = 'answer_wrong'
VALUE_VENTILATED = 'ventilated'
VALUE_AIR_BAD = 'bad'
