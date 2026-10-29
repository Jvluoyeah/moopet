#!/usr/bin/env python3
"""link_lab 命令行：一个命令跑完"通信 + 契约 + 可移植"三类验证。

用法：
    python tools/link_lab/run_lab.py                    # 全部检查
    python tools/link_lab/run_lab.py --portability      # 只验移植不变性
    python tools/link_lab/run_lab.py --contract         # 只验接口契约
    python tools/link_lab/run_lab.py --faults           # 跑故障矩阵（弱网/断链）
    python tools/link_lab/run_lab.py --json out.json    # 追加导出 JSON 报告
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from _paths import WS  # noqa: F401,E402

import contract as C  # noqa: E402
from harness import compare_placements, run_placement  # noqa: E402
from moopet_deploy import Brain  # noqa: E402
from moopet_link import FaultProfile  # noqa: E402
from scenarios import NET_PROFILES, STANDARD_DAY, get_profile  # noqa: E402


def _ok(label, passed, detail=''):
    mark = '✅' if passed else '❌'
    print(f'{mark} {label}' + (f'：{detail}' if detail else ''))
    return {'label': label, 'ok': bool(passed), 'detail': detail}


def run_contract():
    print('\n[1/4] 接口契约（规范 ↔ 实现）')
    results = []
    for name, fn in sorted(vars(C).items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                results.append(_ok(name, True))
            except Exception as e:      # noqa: BLE001
                results.append(_ok(name, False, str(e)))
    return results


def run_portability():
    print('\n[2/4] 移植不变性（BRAIN=dog / backpack / sim 输出逐条一致）')
    results = []
    for label, profile in (('干净网络', 'clean'), ('局域网 1ms', 'lan')):
        try:
            outs, same, diffs = compare_placements(
                STANDARD_DAY, duration=20.0, step=1.0,
                net_profile=get_profile(profile))
            detail = (f'{len(outs["dog"])} 条输出三摆放一致'
                      if same else '; '.join(diffs)[:160])
            results.append(_ok(f'标准一天·{label}', same, detail))
        except Exception as e:          # noqa: BLE001
            results.append(_ok(f'标准一天·{label}', False, f'{type(e).__name__}: {e}'))
    return results


def run_faults():
    print('\n[3/4] 故障矩阵（弱网/断链下系统不崩、结果可复现）')
    results = []
    for name in ('weak_wifi', 'bad_4g', 'blackout'):
        try:
            a = run_placement(Brain.BACKPACK, STANDARD_DAY, duration=20.0, step=1.0,
                              net_profile=NET_PROFILES[name])
            b = run_placement(Brain.BACKPACK, STANDARD_DAY, duration=20.0, step=1.0,
                              net_profile=NET_PROFILES[name])
            same = (a == b)
            results.append(_ok(f'{name}·可复现', same,
                               f'输出 {len(a)} 条，两次一致={same}'))
        except Exception as e:          # noqa: BLE001
            results.append(_ok(f'{name}·可复现', False, f'{type(e).__name__}: {e}'))
    return results


def run_autonomy():
    print('\n[4/4] 断连自治（对端不通时大脑仍独立工作，恢复后继续）')
    from harness import Simulation
    results = []
    sim = Simulation(brain=Brain.BACKPACK, script=STANDARD_DAY,
                     net_profile=FaultProfile.lan())
    try:
        sim.run(6.0)
        before = len(sim.outputs())
        sim.clock.set(6.0)
        sim.host.channel.health.beat(now=sim.clock.now())    # 假装刚收到心跳
        sim.clock.set(60.0)                                  # 静默很久 → 判定断连
        sim.host.tick(60.0)
        results.append(_ok('断连判定', sim.host.is_autonomous(),
                           f'link={sim.host.channel.state(60.0).value}'))
        results.append(_ok('断连后仍有产出', len(sim.outputs()) >= before,
                           f'{before} → {len(sim.outputs())}'))
    except Exception as e:              # noqa: BLE001
        results.append(_ok('断连自治', False, f'{type(e).__name__}: {e}'))
    finally:
        sim.close()
    return results


def main(argv=None):
    ap = argparse.ArgumentParser(description='link_lab · 通信/契约/可移植 验证台')
    ap.add_argument('--contract', action='store_true', help='只跑接口契约')
    ap.add_argument('--portability', action='store_true', help='只跑移植不变性')
    ap.add_argument('--faults', action='store_true', help='只跑故障矩阵')
    ap.add_argument('--json', metavar='PATH', help='把结果写成 JSON')
    args = ap.parse_args(argv)

    only = args.contract or args.portability or args.faults
    print('=' * 68)
    print('moopet link_lab · 通信 / 契约 / 可移植 验证台')
    print('=' * 68)

    results = []
    if not only or args.contract:
        results += run_contract()
    if not only or args.portability:
        results += run_portability()
    if not only or args.faults:
        results += run_faults()
    if not only:
        results += run_autonomy()

    passed = sum(1 for r in results if r['ok'])
    print('-' * 68)
    print(f'{passed}/{len(results)} 项通过')
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as fh:
            json.dump({'passed': passed, 'total': len(results),
                       'results': results}, fh, ensure_ascii=False, indent=2)
        print(f'报告已写入 {args.json}')
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
