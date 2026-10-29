"""传输抽象：让通信层不绑死在 ROS 上。

三种实现：
  * MemoryNetwork / InProcTransport —— 单进程虚拟网络，带故障注入。单测与 link_lab 单机模式用它，
    所以**没有 ROS 也能把通信逻辑测干净**。
  * ReplayTransport —— 回放录制的消息流，用于"移植不变性"验证（同一份回放，三种大脑摆放结果须一致）。
  * RosTransport（后续 W6 接入 rclpy）—— 真实双机走 DDS。

上层（channel）只依赖 Transport 接口，因此换传输不影响业务。
"""
from .faults import FaultInjector, FaultProfile


class Transport:
    """传输接口：发字节、收字节，仅此而已。"""

    name = 'base'

    def send(self, data, now):
        raise NotImplementedError

    def poll(self, now):
        """返回 [(src_id, data), ...]，即此刻已到达本端的消息。"""
        raise NotImplementedError

    def close(self):
        return None

    def stats(self):
        return {'name': self.name}


class MemoryNetwork:
    """单进程虚拟网络：托管若干端点，统一注入故障。"""

    def __init__(self, profile=None, seed=0):
        self.profile = profile or FaultProfile()
        self.seed = int(seed)
        self.injector = FaultInjector(self.profile, self.seed)
        self._endpoints = {}
        self._inflight = []          # (deliver_at, dst, src, data)
        self._sent = 0
        self._delivered = 0
        self._dropped_at_dst = 0     # 目标不存在

    # ---------------- 端点管理 ----------------
    def attach(self, node_id):
        ep = InProcTransport(node_id, self)
        self._endpoints[node_id] = ep
        return ep

    def detach(self, node_id):
        self._endpoints.pop(node_id, None)

    def endpoints(self):
        return sorted(self._endpoints)

    # ---------------- 网络条件 ----------------
    def set_profile(self, profile):
        """运行时切换网络条件（例如"现在网变差了"）。"""
        self.profile = profile
        self.injector = FaultInjector(profile, self.seed)

    def partition(self, on=True):
        p = FaultProfile(**self.profile.to_dict())
        p.partition = bool(on)
        self.set_profile(p)

    def heal(self):
        self.partition(False)

    # ---------------- 收发 ----------------
    def send(self, src_id, data, now):
        self._sent += 1
        for deliver_at, payload in self.injector.transform(data, now):
            for dst in self._endpoints:
                if dst == src_id:
                    continue
                self._inflight.append((deliver_at, dst, src_id, payload))
        self._inflight.sort(key=lambda x: x[0])

    def poll(self, dst_id, now):
        ready, rest = [], []
        for item in self._inflight:
            deliver_at, dst, src, data = item
            if dst == dst_id and deliver_at <= now:
                ready.append((src, data))
            else:
                rest.append(item)
        self._inflight = rest
        self._delivered += len(ready)
        return ready

    def pending(self):
        return len(self._inflight)

    def stats(self):
        return {'endpoints': self.endpoints(), 'sent': self._sent,
                'delivered': self._delivered, 'inflight': self.pending(),
                'seed': self.seed, 'profile': self.profile.to_dict(),
                'injector': self.injector.stats()}


class InProcTransport(Transport):
    """虚拟网络上的一个端点。"""

    name = 'inproc'

    def __init__(self, node_id, network):
        self.node_id = node_id
        self.network = network
        self._closed = False
        self._sent = 0
        self._received = 0

    def send(self, data, now):
        if self._closed:
            return False
        self._sent += 1
        self.network.send(self.node_id, data, now)
        return True

    def poll(self, now):
        if self._closed:
            return []
        got = self.network.poll(self.node_id, now)
        self._received += len(got)
        return got

    def close(self):
        self._closed = True
        self.network.detach(self.node_id)

    def stats(self):
        return {'name': self.name, 'node': self.node_id, 'sent': self._sent,
                'received': self._received, 'closed': self._closed}


class LoopbackTransport(Transport):
    """自发自收：单机部署（MOOPET_BRAIN=sim）用，不需要任何网络栈。

    大脑和身体在同一进程时，感知事件不必绕一圈网络，但**保持同一套收发语义**，
    这样单机档位与双机档位跑的是同一条代码路径（也才能做不变性对比）。
    """

    name = 'loopback'

    def __init__(self, node_id, profile=None, seed=0):
        self.node_id = node_id
        self.injector = FaultInjector(profile or FaultProfile(), seed)
        self._inbox = []                 # (deliver_at, src, data)
        self._sent = 0
        self._received = 0

    def send(self, data, now):
        self._sent += 1
        for at, payload in self.injector.transform(data, now):
            self._inbox.append((at, self.node_id, payload))
        return True

    def poll(self, now):
        ready = [(src, data) for at, src, data in self._inbox if at <= now]
        self._inbox = [x for x in self._inbox if x[0] > now]
        self._received += len(ready)
        return ready

    def stats(self):
        return {'name': self.name, 'node': self.node_id, 'sent': self._sent,
                'received': self._received, 'inflight': len(self._inbox)}


class ReplayTransport(Transport):
    """回放一段录制的消息流（用于移植不变性与回归）。

    script: [(t_offset_seconds, src_id, data), ...]，按时间顺序。
    """

    name = 'replay'

    def __init__(self, node_id, script, speed=1.0, base_time=0.0):
        self.node_id = node_id
        self.script = sorted(script, key=lambda x: x[0])
        self.speed = float(speed) if speed > 0 else 1.0
        self.base_time = float(base_time)
        self._cursor = 0
        self._out = []
        self._closed = False

    def send(self, data, now):
        # 回放端点只读：发出的东西被记录下来，便于对比
        self._out.append((now, data))
        return True

    def poll(self, now):
        if self._closed:
            return []
        elapsed = (now - self.base_time) * self.speed
        got = []
        while self._cursor < len(self.script) and self.script[self._cursor][0] <= elapsed:
            _, src, data = self.script[self._cursor]
            got.append((src, data))
            self._cursor += 1
        return got

    def close(self):
        self._closed = True

    def emitted(self):
        return list(self._out)

    def stats(self):
        return {'name': self.name, 'cursor': self._cursor,
                'total': len(self.script), 'emitted': len(self._out)}
