"""测试台场景：标准录制脚本 + 网络条件预设。

脚本元素：(时刻秒, 产生节点, 事件类型, 取值, 参数)
  * 产生节点决定事件走本地直通还是跨链路（用于验证"搬家"不影响结果）
  * 事件类型对齐 moopet_hal.events 与 interface_spec 的感知来源

"标准一天"覆盖：抚摸 / 握手 / 散步 / 呼唤 / 通风 / 答题（对与错）/ 空气质量差，
涵盖加点、火花续火、每日任务推进、答题过滤四类路径。
"""
from _paths import WS  # noqa: F401

from moopet_deploy import NODE_BACKPACK, NODE_DOG
from moopet_hal import (VALUE_AIR_BAD, VALUE_CORRECT, VALUE_VENTILATED,
                        VALUE_WRONG)
from moopet_link import FaultProfile

# ---------------- 标准录制 ----------------
STANDARD_DAY = [
    (0.0,  NODE_BACKPACK, 'pet', '', {}),
    (2.0,  NODE_BACKPACK, 'handshake', '', {}),
    (4.0,  NODE_DOG, 'walk', '', {}),
    (6.0,  NODE_BACKPACK, 'call', '', {}),
    (8.0,  NODE_BACKPACK, 'air_quality', VALUE_VENTILATED, {}),
    (10.0, NODE_BACKPACK, 'quiz_answer', VALUE_CORRECT, {}),
    (12.0, NODE_BACKPACK, 'pet', '', {}),
    (14.0, NODE_BACKPACK, 'air_quality', VALUE_AIR_BAD, {}),   # 只提醒不加点
    (16.0, NODE_DOG, 'walk', '', {}),
    (18.0, NODE_BACKPACK, 'quiz_answer', VALUE_WRONG, {}),     # 答错不计
]

# 更短的一档：冒烟用（3 个事件，跑 6 秒）
SMOKE = [
    (0.0, NODE_BACKPACK, 'pet', '', {}),
    (2.0, NODE_DOG, 'walk', '', {}),
    (4.0, NODE_BACKPACK, 'quiz_answer', VALUE_CORRECT, {}),
]

# 跨天脚本：验证火花断档结算 / 续火在三摆放一致
# （时间用的是逻辑秒，跨天要靠 case 里改日期基准，这里保留为事件密度更高的版本）
DENSE = [(float(i), NODE_BACKPACK if i % 2 else NODE_DOG,
          'pet' if i % 3 else 'walk', '', {}) for i in range(0, 20, 2)]

SCENARIOS = {
    'standard_day': STANDARD_DAY,
    'smoke': SMOKE,
    'dense': DENSE,
}

# ---------------- 网络条件预设 ----------------
NET_PROFILES = {
    'lan': FaultProfile.lan(),
    'clean': FaultProfile(),
    'weak_wifi': FaultProfile.weak_wifi(),
    'bad_4g': FaultProfile.bad_4g(),
    'blackout': FaultProfile.blackout(),
}

# 做移植不变性时用干净网络（要验的是"搬家"，不是"弱网下也别丢"）
INVARIANCE_PROFILE = 'clean'


def get_script(name):
    if name not in SCENARIOS:
        raise KeyError(f'未知场景 {name}，可选：{sorted(SCENARIOS)}')
    return list(SCENARIOS[name])


def get_profile(name):
    if name not in NET_PROFILES:
        raise KeyError(f'未知网络档位 {name}，可选：{sorted(NET_PROFILES)}')
    return NET_PROFILES[name]
