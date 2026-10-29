"""moopet_deploy —— 部署档位与大脑宿主。

一句话：**同一份代码，一个环境变量决定大脑跑在狗上、背包上还是单机。**

    from moopet_deploy import DeployProfile, BrainHost, SensorAgent

    profile = DeployProfile.from_env()          # 读 MOOPET_BRAIN
    if profile.is_brain_node():
        host = BrainHost(channel, profile)      # 这一侧跑大脑
    else:
        agent = SensorAgent(channel, feed, actuator)   # 这一侧只有身体
"""
from .brain_host import (KIND_ACTION, KIND_DECISION, KIND_SENSOR, KIND_STATE,
                         BrainHost, SensorAgent)
from .profile import (DEFAULT_DB, NODE_BACKPACK, NODE_DOG, NODE_SIM, Brain,
                      DeployProfile, Role, profile_for)

__all__ = [
    'Brain', 'Role', 'DeployProfile', 'profile_for',
    'NODE_DOG', 'NODE_BACKPACK', 'NODE_SIM', 'DEFAULT_DB',
    'BrainHost', 'SensorAgent',
    'KIND_SENSOR', 'KIND_DECISION', 'KIND_STATE', 'KIND_ACTION',
]
