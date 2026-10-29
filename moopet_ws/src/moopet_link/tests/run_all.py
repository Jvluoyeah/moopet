#!/usr/bin/env python3
"""跑 moopet_link 下全部测试（不需要 pytest，也不需要 ROS）。

用法：python3 tests/run_all.py
"""
import importlib.util
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
PKG_ROOT = os.path.dirname(HERE)          # src/moopet_link
sys.path.insert(0, PKG_ROOT)

VERBOSE = '-v' in sys.argv


def load_module(path):
    name = os.path.splitext(os.path.basename(path))[0]
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    files = sorted(f for f in os.listdir(HERE)
                   if f.startswith('test_') and f.endswith('.py'))
    total = passed = 0
    failures = []
    for f in files:
        mod = load_module(os.path.join(HERE, f))
        fns = [(k, v) for k, v in vars(mod).items()
               if k.startswith('test_') and callable(v)]
        fns.sort()
        print(f'--- {f} ({len(fns)} 项) ---')
        for name, fn in fns:
            total += 1
            try:
                fn()
                passed += 1
                if VERBOSE:
                    print(f'  [PASS] {name}')
            except Exception as e:      # noqa: BLE001
                failures.append((f, name, e))
                print(f'  [FAIL] {name}: {e}')
                if VERBOSE:
                    traceback.print_exc()
    print(f'\n{passed}/{total} passed')
    if failures:
        print('失败清单：')
        for f, name, e in failures:
            print(f'  - {f}::{name} -> {e}')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
