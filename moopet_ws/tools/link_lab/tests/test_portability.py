#!/usr/bin/env python3
"""移植不变性测试：同一份录制，三种大脑摆放，输出必须逐条一致。

这是"便于移植到背包"的**可测定义**。只要这条守住，把大脑从狗搬到背包
（或反过来）就只有部署差异，没有行为差异。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _paths import WS  # noqa: F401,E402

from harness import Simulation, compare_placements, run_placement  # noqa: E402
from moopet_deploy import Brain, DeployProfile  # noqa: E402
from moopet_link import FaultProfile  # noqa: E402
from scenarios import (DENSE, SMOKE, STANDARD_DAY, get_profile,  # noqa: E402
                       get_script)


def test_standard_day_invariant_across_placements():
    results, same, diffs = compare_placements(STANDARD_DAY, duration=20.0, step=1.0)
    assert same, '移植后行为不一致：' + '; '.join(diffs)
    assert len(results['dog']) > 0, '应该有输出'


def test_smoke_invariant():
    _, same, diffs = compare_placements(SMOKE, duration=6.0, step=1.0)
    assert same, '; '.join(diffs)


def test_dense_invariant():
    _, same, diffs = compare_placements(DENSE, duration=20.0, step=1.0)
    assert same, '; '.join(diffs)


def test_placements_produce_identical_output_shape():
    """三种摆放不仅"一致"，还要真的产生了决策反应（否则一致是无意义的空集）。"""
    results, _, _ = compare_placements(STANDARD_DAY, duration=20.0, step=1.0)
    for name, out in results.items():
        decisions = [o for o in out if o['kind'] == 'decision']
        assert decisions, f'{name} 摆放没产出任何决策反应'


def test_brain_node_differs_but_output_does_not():
    dog = Simulation(brain=Brain.DOG, script=STANDARD_DAY)
    bp = Simulation(brain=Brain.BACKPACK, script=STANDARD_DAY)
    try:
        assert dog.host.node_id != bp.host.node_id          # 大脑确实换了地方
        assert dog.run(20.0) == bp.run(20.0)                # 但行为一模一样
    finally:
        dog.close()
        bp.close()


def test_sim_placement_is_single_node():
    sim = Simulation(brain=Brain.SIM, script=STANDARD_DAY)
    ref = Simulation(brain=Brain.DOG, script=STANDARD_DAY)
    try:
        assert sim.host.node_id == 'sim'
        assert sim.agents == {}                             # 单机没有远端身体
        assert sim.network is None                          # 不走网络
        assert sim.run(20.0) == ref.run(20.0)
    finally:
        sim.close()
        ref.close()


def test_agent_executes_actions_in_remote_placement():
    """大脑在背包时，狗这一侧要真的收到并执行了动作/话术。"""
    sim = Simulation(brain=Brain.BACKPACK, script=STANDARD_DAY)
    try:
        sim.run(20.0)
        actions = sim.agent_actions()
        assert 'dog' in actions
        assert actions['dog'], '狗侧应当执行过动作或话术'
    finally:
        sim.close()


def test_brain_side_needs_no_actuator():
    """大脑侧不做执行：动作只下发到身体侧。"""
    sim = Simulation(brain=Brain.DOG, script=STANDARD_DAY)
    try:
        sim.run(20.0)
        assert sim.host.node_id == 'dog'
        assert 'backpack' in sim.agent_actions()
        assert sim.agent_actions()['backpack'], '背包侧应当执行过话术'
    finally:
        sim.close()


def test_clean_network_is_lossless_for_invariance():
    """不变性测试的前提：干净网络下事件不丢（否则差异无法归因）。"""
    sim = Simulation(brain=Brain.BACKPACK, script=STANDARD_DAY,
                     net_profile=get_profile('clean'))
    try:
        sim.run(20.0)
        counters = sim.channels['backpack'].stats()['counters']
        assert counters['malformed'] == 0
        assert counters['expired'] == 0
        assert counters['duplicate'] == 0
    finally:
        sim.close()


def test_profile_role_mapping():
    dog_brain = DeployProfile(brain=Brain.DOG, node_id='dog', peer_id='backpack')
    assert dog_brain.is_brain_node('dog')
    assert not dog_brain.is_brain_node('backpack')
    bp_brain = DeployProfile(brain=Brain.BACKPACK, node_id='backpack',
                             peer_id='dog')
    assert bp_brain.is_brain_node('backpack')
    assert not bp_brain.is_brain_node('dog')
    assert bp_brain.crosses_link
    sim = DeployProfile(brain=Brain.SIM, node_id='sim', peer_id='sim')
    assert not sim.crosses_link


def test_env_var_selects_brain():
    p = DeployProfile.from_env({'MOOPET_BRAIN': 'dog', 'MOOPET_NODE_ID': 'dog'})
    assert p.brain == Brain.DOG
    assert p.is_brain_node()
    p2 = DeployProfile.from_env({'MOOPET_BRAIN': 'backpack', 'MOOPET_NODE_ID': 'backpack'})
    assert p2.is_brain_node()
    p3 = DeployProfile.from_env({'MOOPET_BRAIN': '乱写的'})       # 兜底为默认
    assert p3.brain == Brain.BACKPACK


def test_invariance_under_lan_latency():
    """局域网有延迟也要一致：大脑看到的仍是同一串事件。"""
    _, same, diffs = compare_placements(STANDARD_DAY, duration=20.0, step=1.0,
                                        net_profile=FaultProfile.lan())
    assert same, '; '.join(diffs)


def test_outputs_are_timestamp_free():
    """输出记录不能带时间戳，否则跨摆放永远"不一致"。"""
    out = run_placement(Brain.SIM, SMOKE, duration=6.0)
    for item in out:
        assert set(item.keys()) == {'kind', 'payload'}
        assert 'ts' not in item and 'ts' not in item['payload']
