"""测试台核心：按指定"大脑摆放位置"搭一套可跑的系统，并给出可比对的输出。

这是"移植不变性"的执行者。三种摆放：

    BRAIN=dog       狗跑大脑；背包的感知经链路送过来，动作经链路发回去
    BRAIN=backpack  背包跑大脑（默认，贴合"算力背包"）；狗只做身体
    BRAIN=sim       单机：大脑与身体同进程，感知走 loopback（同一套收发语义）

三种摆放喂**同一份录制**、按**同一个步长**推进，大脑看到的输入序列完全相同，
因此输出必须逐条一致——不一致就说明"搬家"搬坏了。
"""
import os
import tempfile

from _paths import WS  # noqa: F401  触发 sys.path 引导

from moopet_deploy import (KIND_SENSOR, Brain, BrainHost, DeployProfile,
                           NODE_BACKPACK, NODE_DOG, NODE_SIM, SensorAgent)
from moopet_hal import RecordingActuator, SensorFeed
from moopet_link import (ChannelConfig, FakeClock, FaultProfile, LinkChannel,
                         LoopbackTransport, MemoryNetwork)

ALL_NODES = (NODE_DOG, NODE_BACKPACK)


class Simulation:
    """按大脑摆放位置搭好的一套最小系统。"""

    def __init__(self, brain=Brain.BACKPACK, script=(), seed=0, net_profile=None,
                 step=1.0, db_dir=None, cfg=None, settle_window=0.2):
        self.brain = Brain(brain) if not isinstance(brain, Brain) else brain
        self.script = sorted(script, key=lambda x: x[0])
        self.step = float(step)
        self.seed = int(seed)
        # 每一步之内允许的"沉降窗口"：把该窗口内到达的消息全部收进来再进大脑，
        # 这样链路那点延迟（局域网 1ms、弱网 40ms）不会让事件晚一拍、
        # 从而把"搬家"和"时序噪声"混为一谈。
        self.settle_window = float(settle_window)
        self.clock = FakeClock(0.0)
        self._tmp = tempfile.TemporaryDirectory(dir=db_dir)
        db = os.path.join(self._tmp.name, 'moopet.db')
        net_profile = net_profile or FaultProfile()

        self.agents = {}
        self.network = None

        if self.brain == Brain.SIM:
            # 单机：一个节点，既是大脑也是身体
            self.brain_node = NODE_SIM
            transport = LoopbackTransport(NODE_SIM, net_profile, seed)
            ch = LinkChannel(NODE_SIM, NODE_SIM, transport, clock=self.clock,
                             config=cfg or ChannelConfig())
            self.channels = {NODE_SIM: ch}
            # 单机档位：所有节点的事件都进本机这一个 feed（origin 保留原样）
            self.feeds = {NODE_SIM: SensorFeed(
                [(t, kind, val, params, origin)
                 for (t, origin, kind, val, params) in self.script],
                origin=NODE_SIM)}
            profile = DeployProfile(brain=self.brain, node_id=NODE_SIM,
                                    peer_id=NODE_SIM, db_path=db)
            self.host = BrainHost(ch, profile, db_path=db, clock=self.clock)
        else:
            self.brain_node = self.brain.value
            other = NODE_BACKPACK if self.brain_node == NODE_DOG else NODE_DOG
            self.peer_node = other
            self.network = MemoryNetwork(net_profile, seed)
            self.channels = {
                n: LinkChannel(n, other if n == self.brain_node else self.brain_node,
                               self.network.attach(n), clock=self.clock,
                               config=cfg or ChannelConfig())
                for n in ALL_NODES}
            profile = DeployProfile(brain=self.brain, node_id=self.brain_node,
                                    peer_id=other, db_path=db)
            self.host = BrainHost(self.channels[self.brain_node], profile,
                                  db_path=db, clock=self.clock)
            # 各节点只拿属于自己的事件；大脑所在节点的感知直通，另一侧过链路
            self.feeds = {n: SensorFeed(
                [(t, k, v, p, o) for (t, o, k, v, p) in self.script if o == n],
                origin=n) for n in ALL_NODES}
            self.agents = {other: SensorAgent(self.channels[other],
                                              source=self.feeds[other],
                                              actuator=RecordingActuator())}
        self.steps = 0

    # ---------------- 运行 ----------------
    def _settle(self, now):
        """把沉降窗口内到达的消息收干净（最多几轮），避免事件跨拍错位。"""
        until = now + self.settle_window
        for _ in range(4):
            moved = 0
            for ch in self.channels.values():
                moved += len(ch.poll(until))
            if not moved:
                break

    def step_once(self):
        now = self.clock.now()
        # 1) 本地感知进入系统
        for node, feed in self.feeds.items():
            events = feed.poll(now)
            if not events:
                continue
            if node == self.host.node_id:
                self.host.ingest_local(events)          # 同机直通
            elif node in self.agents:
                agent = self.agents[node]
                for ev in events:
                    ev.origin = ev.origin or node
                    agent.channel.send(KIND_SENSOR, ev.to_payload(), now=now)
        # 2) 让本拍发出的东西都落地
        self._settle(now)
        # 3) 身体侧：心跳 + 收包（动作/话术在这里落地）
        for agent in self.agents.values():
            agent.channel.maybe_beat(now)
            agent.channel.poll(now)
        # 4) 大脑侧：心跳 + 收包 + 结算 + 发布
        self.host.tick(now)
        self.steps += 1

    def run(self, duration=20.0):
        # 每日任务是随机抽取的（SparkEngine 用 random.sample）——统一播种，
        # 保证三种摆放抽到同一组任务，否则输出差异无法归因于"搬家"。
        import random
        random.seed(self.seed)
        t = 0.0
        while t <= duration + 1e-9:
            self.clock.set(t)
            self.step_once()
            t += self.step
        return self.outputs()

    # ---------------- 观测 ----------------
    def outputs(self):
        """大脑产生的规范化输出序列（不含时间戳，跨摆放可直接比对）。"""
        return self.host.outputs()

    def agent_actions(self):
        """身体侧真正执行过的动作（按节点汇总）。"""
        out = {}
        for node, agent in self.agents.items():
            out[node] = agent.executed()
        return out

    def stats(self):
        return {'brain': self.brain.value, 'brain_node': self.brain_node,
                'steps': self.steps, 'outputs': len(self.outputs()),
                'network': self.network.stats() if self.network else 'loopback'}

    def close(self):
        try:
            for obj in (getattr(self.host, 'exp', None), getattr(self.host, 'spark', None)):
                if obj is not None:
                    obj.close()
        except Exception:      # noqa: BLE001
            pass
        try:
            self._tmp.cleanup()
        except Exception:      # noqa: BLE001
            pass


def run_placement(brain, script, duration=20.0, step=1.0, seed=0, net_profile=None):
    """跑一种摆放，返回输出序列。"""
    sim = Simulation(brain=brain, script=script, seed=seed, step=step,
                     net_profile=net_profile)
    try:
        return sim.run(duration)
    finally:
        sim.close()


def compare_placements(script, duration=20.0, step=1.0, seed=0, net_profile=None):
    """三种摆放各跑一遍，返回 (输出字典, 是否一致, 差异说明)。"""
    results = {}
    for brain in (Brain.DOG, Brain.BACKPACK, Brain.SIM):
        results[brain.value] = run_placement(brain, script, duration, step, seed,
                                             net_profile)
    base = results[Brain.DOG.value]
    diffs = []
    for name, out in results.items():
        if out != base:
            for i, (a, b) in enumerate(zip(base, out)):
                if a != b:
                    diffs.append(f'{name} 第 {i} 条不同：{a} != {b}')
                    break
            else:
                diffs.append(f'{name} 长度不同：{len(base)} vs {len(out)}')
    return results, not diffs, diffs
