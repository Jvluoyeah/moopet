#!/usr/bin/env python3
"""部署自检（moopet doctor）：装到狗本体/算力背包上后，先跑它确认环境可用。

用法：
    python3 -m moopet_deploy.doctor             # 人类可读
    python3 -m moopet_deploy.doctor --json      # 机器可读
    MOOPET_BRAIN=dog python3 -m moopet_deploy.doctor

七项检查（全部离线，不依赖 ROS 运行时）：
    1. 档位解析：MOOPET_BRAIN 是否认得，角色划分是否正确
    2. 纯逻辑大脑：core 引擎能在本机建库并结算
    3. 通信层：link 自检（复用 moopet_link.doctor）
    4. 硬件抽象：HAL 能产出并回放事件
    5. 大脑宿主：能装配起来并跑通一拍
    6. 布局边界：core 不依赖 ROS（可搬家的前提）
    7. 数据库：目标路径可写、表齐全
"""
import json
import os
import sys
import tempfile

from moopet_core.decision import DecisionEngine, SparkEngine
from moopet_core.exp_engine import ExpEngine
from moopet_hal import SensorFeed, SimActuator
from moopet_link import ChannelConfig, FakeClock, LinkChannel, LoopbackTransport

from .brain_host import BrainHost, SensorAgent
from .profile import Brain, DeployProfile


class Check:
    def __init__(self, name, desc):
        self.name, self.desc = name, desc
        self.ok = False
        self.detail = ''
        self.metrics = {}

    def to_dict(self):
        return {'name': self.name, 'desc': self.desc, 'ok': self.ok,
                'detail': self.detail, 'metrics': self.metrics}


def check_profile():
    c = Check('档位解析', 'MOOPET_BRAIN 能被识别并正确划分角色')
    p = DeployProfile.from_env()
    d = p.describe()
    c.ok = d['role'] in ('brain', 'agent') and d['brain'] in ('dog', 'backpack', 'sim')
    c.detail = (f"brain={d['brain']} 本机={d['node_id']} 角色={d['role']} "
                f"跨机={d['crosses_link']}")
    c.metrics = d
    return c


def check_core(tmpdir):
    c = Check('纯逻辑大脑', 'core 引擎能在本机建库并完成一次加点/续火')
    db = os.path.join(tmpdir, 'doctor.db')
    from datetime import date
    exp, spark = ExpEngine(db), SparkEngine(db)
    try:
        r = exp.gain('pet', d=date(2025, 9, 1))
        ev = spark.register_activity(date(2025, 9, 1))
        c.ok = r.get('exp_gained') == 10 and ev.get('event') == 'new'
        c.detail = f"加点={r.get('exp_gained')} 火花事件={ev.get('event')}"
        c.metrics = {'level': exp.get_state()['level']}
    finally:
        exp.close()
        spark.close()
    return c


def check_link():
    c = Check('通信层', '链路自检（信封/心跳/去重/断连恢复）')
    try:
        from moopet_link.doctor import run_checks
        results = run_checks()
        bad = [r.name for r in results if not r.ok]
        c.ok = not bad
        c.detail = f'{len(results) - len(bad)}/{len(results)} 项通过' + (
            f'，失败：{bad}' if bad else '')
        c.metrics = {r.name: r.detail for r in results}
    except Exception as e:      # noqa: BLE001
        c.detail = f'{type(e).__name__}: {e}'
    return c


def check_hal():
    c = Check('硬件抽象', 'HAL 能按脚本产出事件（仿真/回放路径可用）')
    feed = SensorFeed([(0.0, 'pet', '', {}, 'backpack'),
                       (2.0, 'walk', '', {}, 'dog')], origin='backpack')
    first = feed.poll(0.0)
    later = feed.poll(2.0)
    act = SimActuator()
    res = act.execute('handshake', {})
    c.ok = len(first) == 1 and len(later) == 1 and res.get('success')
    c.detail = f'事件 {len(first)}+{len(later)} 条，执行器返回 {res.get("duration")}s'
    c.metrics = feed.stats()
    return c


def check_brain_host(tmpdir):
    c = Check('大脑宿主', 'BrainHost + SensorAgent 能装配并跑通一拍')
    clock = FakeClock(0.0)
    p = DeployProfile(brain=Brain.SIM, node_id='sim', peer_id='sim',
                      db_path=os.path.join(tmpdir, 'host.db'))
    ch = LinkChannel('sim', 'sim', LoopbackTransport('sim'), clock=clock,
                     config=ChannelConfig())
    try:
        host = BrainHost(ch, p, clock=clock)
        feed = SensorFeed([(0.0, 'pet', '', {}, 'sim')], origin='sim')
        agent = SensorAgent(ch, source=feed, actuator=SimActuator())
        host.ingest_local(feed.poll(0.0))
        host.tick(0.0)
        out = host.outputs()
        c.ok = len(out) > 0
        c.detail = f'产出了 {len(out)} 条输出（决策/状态）'
        c.metrics = {'outputs': len(out)}
        host.exp.close()
        host.spark.close()
    except Exception as e:      # noqa: BLE001
        c.detail = f'{type(e).__name__}: {e}'
    return c


def check_layering():
    c = Check('布局边界', 'core 不依赖 ROS（"大脑可搬家"的前提）')
    core_dir = None
    try:
        import moopet_core
        core_dir = os.path.dirname(os.path.abspath(moopet_core.__file__))
    except ImportError:
        pass
    if not core_dir:
        c.detail = 'moopet_core 未安装'
        return c
    import ast
    bad = []
    for root, _dirs, files in os.walk(core_dir):
        for f in files:
            if not f.endswith('.py'):
                continue
            p = os.path.join(root, f)
            with open(p, encoding='utf-8') as fh:
                tree = ast.parse(fh.read())
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    bad += [(f, a.name) for a in node.names if a.name.split('.')[0] == 'rclpy']
                elif isinstance(node, ast.ImportFrom) and node.module:
                    if node.module.split('.')[0] == 'rclpy':
                        bad.append((f, node.module))
    c.ok = not bad
    c.detail = '零 ROS 依赖' if c.ok else f'越层依赖：{bad}'
    return c


def check_db(target):
    c = Check('数据库', '目标 DB 路径可写、11 张表齐全（+火花兜底表）')
    path = target or DeployProfile.from_env().db_path
    try:
        d = os.path.dirname(os.path.abspath(path))
        os.makedirs(d, exist_ok=True)
        eng = ExpEngine(path)
        names = {r[0] for r in eng._conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        eng.close()
        spark = SparkEngine(path)
        names |= {r[0] for r in spark._conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        spark.close()
        need = {'user', 'dog_state', 'exp_record', 'level_exp', 'achievement',
                'user_achievement', 'streak', 'diary', 'quiz_record',
                'daily_task', 'daily_reward'}
        missing = sorted(need - names)
        c.ok = not missing
        c.detail = f'{len(names)} 张表' + (f'，缺 {missing}' if missing else '，齐全')
        c.metrics = {'path': path, 'tables': len(names)}
    except Exception as e:      # noqa: BLE001
        c.detail = f'{type(e).__name__}: {e}'
    return c


def run_checks(db_target=None):
    results = []
    tmp = tempfile.TemporaryDirectory()
    try:
        for fn in (check_profile, check_layering):
            try:
                results.append(fn())
            except Exception as e:      # noqa: BLE001
                c = Check(fn.__name__, '检查抛异常')
                c.detail = f'{type(e).__name__}: {e}'
                results.append(c)
        for fn in (check_core, check_brain_host):
            try:
                results.append(fn(tmp.name))
            except Exception as e:      # noqa: BLE001
                c = Check(fn.__name__, '检查抛异常')
                c.detail = f'{type(e).__name__}: {e}'
                results.append(c)
        for fn in (check_link, check_hal):
            try:
                results.append(fn())
            except Exception as e:      # noqa: BLE001
                c = Check(fn.__name__, '检查抛异常')
                c.detail = f'{type(e).__name__}: {e}'
                results.append(c)
        try:
            results.append(check_db(db_target))
        except Exception as e:      # noqa: BLE001
            c = Check('check_db', '检查抛异常')
            c.detail = f'{type(e).__name__}: {e}'
            results.append(c)
    finally:
        tmp.cleanup()
    return results


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    as_json = '--json' in argv
    db = None
    if '--db' in argv:
        i = argv.index('--db')
        if i + 1 < len(argv):
            db = argv[i + 1]
    results = run_checks(db)
    passed = sum(1 for r in results if r.ok)
    if as_json:
        print(json.dumps({'passed': passed, 'total': len(results),
                          'checks': [r.to_dict() for r in results]},
                         ensure_ascii=False, indent=2))
        return 0 if passed == len(results) else 1
    print('=' * 66)
    print('moopet doctor · 部署自检（狗本体 / 算力背包 通用）')
    print('=' * 66)
    for r in results:
        print(f"{'✅' if r.ok else '❌'} {r.name}：{r.detail}")
    print('-' * 66)
    print(f'{passed}/{len(results)} 项通过')
    if passed != len(results):
        print('提示：失败项请对照 docs/部署文档.md 排查。')
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
