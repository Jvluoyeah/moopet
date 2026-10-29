"""moopet_link —— 狗↔背包通信层。

设计目标（对应全栈计划主线 A/B）：
  1. **可测**：核心逻辑不依赖 ROS，单进程虚拟网络即可跑全部用例；
  2. **可复现**：弱网/断连由参数化故障注入制造，同 seed 同结果；
  3. **可搬家**：传输层可替换（内存/回放/ROS），上层业务无感；
  4. **不破坏历史**：W1-W5 的 16 项 msg/srv/action 保持不变，信封包在外层。

典型用法：
    from moopet_link import MemoryNetwork, LinkChannel, FaultProfile

    net = MemoryNetwork(FaultProfile.lan(), seed=42)
    dog = LinkChannel('dog', 'backpack', net.attach('dog'))
    bp = LinkChannel('backpack', 'dog', net.attach('backpack'))

    dog.beat(); bp.poll()            # 心跳 → 对端健康变 UP
    dog.send('state', {'level': 7})  # 业务消息
    for env in bp.poll():
        print(env.kind, env.payload)
"""
from .buffers import DedupWindow, OfflineQueue, QueueConfig, ReorderBuffer
from .channel import ChannelConfig, LinkChannel
from .clock import Clock, FakeClock, RealClock, SkewedClock
from .envelope import (ENVELOPE_VERSION, KIND_ACK, KIND_ACTION, KIND_CONTROL,
                       KIND_DECISION, KIND_DIAG, KIND_HEARTBEAT, KIND_SENSOR,
                       KIND_STATE, Envelope, EnvelopeError, new_msg_id)
from .faults import FaultInjector, FaultProfile
from .health import HealthConfig, LinkHealth, LinkState
from .transport import (InProcTransport, LoopbackTransport, MemoryNetwork,
                        ReplayTransport, Transport)

__all__ = [
    # 信封
    'Envelope', 'EnvelopeError', 'ENVELOPE_VERSION', 'new_msg_id',
    'KIND_HEARTBEAT', 'KIND_STATE', 'KIND_SENSOR', 'KIND_DECISION',
    'KIND_ACTION', 'KIND_CONTROL', 'KIND_ACK', 'KIND_DIAG',
    # 链路
    'LinkChannel', 'ChannelConfig', 'LinkState', 'LinkHealth', 'HealthConfig',
    # 缓冲
    'OfflineQueue', 'QueueConfig', 'DedupWindow', 'ReorderBuffer',
    # 传输
    'Transport', 'MemoryNetwork', 'InProcTransport', 'LoopbackTransport',
    'ReplayTransport',
    # 故障
    'FaultProfile', 'FaultInjector',
    # 时钟
    'Clock', 'RealClock', 'FakeClock', 'SkewedClock',
]
