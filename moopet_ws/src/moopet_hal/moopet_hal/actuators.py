"""执行器：大脑决定"做什么"，这里是"真的去做"的一侧。

同样三种实现，保证大脑不用关心自己在跟谁说话：
  * LogActuator       —— 打印（开发演示）
  * SimActuator       —— 模拟耗时/结果（无硬件联调）
  * RecordingActuator —— 只记录不执行（移植不变性对比用）
"""
import sys


class Actuator:
    """执行器接口。execute 返回结构化结果，便于回执与对比。"""

    name = 'base'

    def execute(self, action_type, params=None):
        raise NotImplementedError

    def history(self):
        return []

    def stats(self):
        return {'name': self.name}


class RecordingActuator(Actuator):
    """只记录调用序列——不变性测试的"输出侧"就靠它留下证据。"""

    name = 'recording'

    def __init__(self):
        self._calls = []

    def execute(self, action_type, params=None):
        params = params or {}
        self._calls.append((action_type, dict(params)))
        return {'success': True, 'action_type': action_type, 'dry_run': True}

    def history(self):
        return list(self._calls)

    def clear(self):
        self._calls = []

    def stats(self):
        return {'name': self.name, 'calls': len(self._calls)}


class LogActuator(Actuator):
    """打印到终端，给人看。"""

    name = 'log'

    def __init__(self, prefix='[actuator]', stream=None):
        self.prefix = prefix
        self.stream = stream or sys.stdout
        self._calls = []

    def execute(self, action_type, params=None):
        params = params or {}
        self._calls.append((action_type, dict(params)))
        print(f'{self.prefix} {action_type} {params}', file=self.stream)
        return {'success': True, 'action_type': action_type, 'logged': True}

    def history(self):
        return list(self._calls)

    def stats(self):
        return {'name': self.name, 'calls': len(self._calls)}


class SimActuator(Actuator):
    """模拟硬件：按动作类型给出合理的耗时/结果（对齐 DogAction.srv 的语义）。"""

    name = 'sim'

    DURATIONS = {'projector': 3.0, 'communication': 2.0, 'handshake': 1.5,
                 'guide': 5.0, 'walk': 10.0}

    def __init__(self):
        self._calls = []

    def execute(self, action_type, params=None):
        params = params or {}
        self._calls.append((action_type, dict(params)))
        return {'success': True, 'action_type': action_type,
                'duration': self.DURATIONS.get(action_type, 1.0)}

    def history(self):
        return list(self._calls)

    def stats(self):
        return {'name': self.name, 'calls': len(self._calls)}
