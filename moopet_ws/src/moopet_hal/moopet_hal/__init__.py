"""moopet_hal —— 硬件抽象层。

同一套大脑要能跑在三种地方：仿真、回放、真机（狗本体或算力背包）。
把"感知从哪来、动作去哪了"抽象掉，上层就只剩业务。

    from moopet_hal import SensorFeed, SimActuator

    feed = SensorFeed([(0.0, 'pet', '', {}, 'backpack')], origin='backpack')
    act = SimActuator()
    for e in feed.poll(now=1.0):
        ...
"""
from .actuators import Actuator, LogActuator, RecordingActuator, SimActuator
from .events import (BACKPACK_EVENTS, DOG_EVENTS, VALUE_AIR_BAD, VALUE_CORRECT,
                     VALUE_OK, VALUE_VENTILATED, VALUE_WRONG, SensorEvent)
from .recorder import Recorder, dump_events, load_events, load_meta, replay_source
from .sensors import (RealSensorSource, ReplaySensorSource, SensorFeed,
                      SensorSource)

__all__ = [
    'SensorEvent', 'DOG_EVENTS', 'BACKPACK_EVENTS',
    'VALUE_OK', 'VALUE_CORRECT', 'VALUE_WRONG', 'VALUE_VENTILATED', 'VALUE_AIR_BAD',
    'SensorSource', 'SensorFeed', 'ReplaySensorSource', 'RealSensorSource',
    'Actuator', 'LogActuator', 'SimActuator', 'RecordingActuator',
    'Recorder', 'dump_events', 'load_events', 'load_meta', 'replay_source',
]
