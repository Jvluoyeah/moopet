"""部署档位：决定"大脑跑在哪一侧"。

这是"便于移植到背包"的开关面。同一份代码，换一个环境变量就换一种部署：

    MOOPET_BRAIN=backpack  → 狗本体只做身体（感知/动作），大脑在背包（默认）
    MOOPET_BRAIN=dog       → 大脑在狗本体，背包当算力/感知外设
    MOOPET_BRAIN=sim       → 单机开发：两个角色在同一进程里跑，不做跨机传输

角色只有两种，非常干净：
    BRAIN —— 跑 moopet_core 的养成/决策大脑
    AGENT —— 只有感知与执行，事件经链路送给大脑，动作由大脑下发
"""
import os
from enum import Enum


class Brain(str, Enum):
    DOG = 'dog'
    BACKPACK = 'backpack'
    SIM = 'sim'


class Role(str, Enum):
    BRAIN = 'brain'
    AGENT = 'agent'


NODE_DOG = 'dog'
NODE_BACKPACK = 'backpack'
NODE_SIM = 'sim'

DEFAULT_DB = os.path.join(os.path.expanduser('~'), '.moopet', 'moopet.db')


class DeployProfile:
    """一次部署的档位描述。"""

    def __init__(self, brain=Brain.BACKPACK, node_id=NODE_DOG,
                 peer_id=NODE_BACKPACK, db_path=None):
        self.brain = Brain(brain) if not isinstance(brain, Brain) else brain
        self.node_id = node_id
        self.peer_id = peer_id
        self.db_path = db_path or DEFAULT_DB

    # ---------------- 构造 ----------------
    @classmethod
    def from_env(cls, env=None, node_id=None, peer_id=None):
        env = os.environ if env is None else env
        brain = env.get('MOOPET_BRAIN', Brain.BACKPACK.value)
        try:
            brain = Brain(brain)
        except ValueError:
            brain = Brain.BACKPACK
        node = node_id or env.get('MOOPET_NODE_ID', NODE_DOG)
        peer = peer_id or env.get('MOOPET_PEER_ID',
                                  NODE_BACKPACK if node == NODE_DOG else NODE_DOG)
        return cls(brain=brain, node_id=node, peer_id=peer,
                   db_path=env.get('MOOPET_DB') or None)

    # ---------------- 角色判定 ----------------
    def role_of(self, node_id=None):
        node_id = node_id or self.node_id
        if self.brain == Brain.SIM:
            # 单机：本进程既是大脑也是身体，不存在远端大脑
            return Role.BRAIN if node_id == self.node_id else Role.AGENT
        return Role.BRAIN if node_id == self.brain.value else Role.AGENT

    def is_brain_node(self, node_id=None):
        return self.role_of(node_id) == Role.BRAIN

    @property
    def brain_node(self):
        return NODE_SIM if self.brain == Brain.SIM else self.brain.value

    @property
    def crosses_link(self):
        """感知是否需要跨机传输（单机档位不需要）。"""
        return self.brain != Brain.SIM

    # ---------------- 展示 ----------------
    def describe(self):
        return {
            'brain': self.brain.value,
            'brain_node': self.brain_node,
            'node_id': self.node_id,
            'role': self.role_of().value,
            'peer_id': self.peer_id,
            'crosses_link': self.crosses_link,
            'db_path': self.db_path,
        }

    def __repr__(self):
        d = self.describe()
        return (f"<DeployProfile brain={d['brain']} node={d['node_id']}"
                f" role={d['role']}>")


def profile_for(brain, node_id=NODE_DOG):
    """便捷构造：给定大脑位置与本机节点。"""
    peer = NODE_BACKPACK if node_id == NODE_DOG else NODE_DOG
    return DeployProfile(brain=brain, node_id=node_id, peer_id=peer)
