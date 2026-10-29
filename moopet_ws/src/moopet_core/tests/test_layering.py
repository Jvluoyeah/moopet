#!/usr/bin/env python3
"""分层边界测试：moopet_core 必须保持"零 ROS、零上层依赖"。

这是"大脑可搬家"的地基——只要 core 不碰 rclpy / moopet_interfaces / moopet_dog，
它就能原样跑在狗本体、算力背包、开发机或服务端里。

用 AST 解析真实 import 语句（不匹配注释与文档字符串）。
"""
import ast
import os
import sys

CORE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORE_PKG = os.path.join(CORE_DIR, 'moopet_core')

FORBIDDEN_ROOTS = {
    'rclpy',              # ROS2 Python 客户端
    'moopet_interfaces',  # ROS 消息包
    'moopet_dog',         # 上层：狗侧节点
    'moopet_backpack',    # 上层：背包侧节点
    'moopet_link',        # 上层：通信层
    'moopet_hal',         # 上层：硬件抽象
}
ALLOWED_STDLIB_EXTRA = {'sqlite3', 'json', 'math', 'random', 'datetime', 'os', 'sys',
                        'time', 'typing', 'dataclasses', 'enum', 'collections',
                        'itertools', 'functools', 're', 'pathlib', 'tempfile',
                        'hashlib', 'logging', 'copy', 'contextlib', 'abc'}


def iter_core_files():
    for root, dirs, files in os.walk(CORE_PKG):
        dirs[:] = [d for d in dirs if d != '__pycache__']
        for f in sorted(files):
            if f.endswith('.py'):
                yield os.path.join(root, f)


def imported_roots(path):
    """返回该文件 import 的顶层模块名集合（AST，忽略函数内 import 也算）。"""
    with open(path, encoding='utf-8') as fh:
        tree = ast.parse(fh.read(), filename=path)
    roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                roots.add(a.name.split('.')[0])
        elif isinstance(node, ast.ImportFrom):
            if node.level and node.level > 0:
                continue                      # 包内相对 import，必然合法
            if node.module:
                roots.add(node.module.split('.')[0])
    return roots


def test_core_has_no_ros_or_upper_layer_imports():
    bad = []
    for p in iter_core_files():
        for r in imported_roots(p):
            if r in FORBIDDEN_ROOTS:
                bad.append((os.path.relpath(p, CORE_DIR), r))
    assert not bad, f'moopet_core 出现越层依赖：{bad}'


def test_core_files_exist():
    """确认抽层结果完整（缺文件说明搬迁不彻底）。"""
    must = ['exp_engine.py', 'quiz_bank.py',
            os.path.join('decision', 'decision_engine.py'),
            os.path.join('decision', 'diary.py'),
            os.path.join('decision', 'spark.py'),
            os.path.join('decision', 'behavior_tree', 'trees.py'),
            os.path.join('data', 'schema.sql')]
    missing = [m for m in must if not os.path.exists(os.path.join(CORE_PKG, m))]
    assert not missing, f'moopet_core 缺少文件：{missing}'


def test_core_imports_standalone():
    """core 能在只有本目录的情况下被导入（不依赖 ROS 环境）。"""
    sys.path.insert(0, CORE_DIR)
    for mod in ('moopet_core', 'moopet_core.exp_engine', 'moopet_core.quiz_bank',
                'moopet_core.decision', 'moopet_core.decision.spark',
                'moopet_core.decision.diary', 'moopet_core.decision.behavior_tree'):
        __import__(mod)


def test_no_ros_nodes_left_in_core():
    """core 里不应残留任何 *_node.py（节点属于上层）。"""
    leftovers = [os.path.relpath(p, CORE_DIR) for p in iter_core_files()
                 if os.path.basename(p).endswith('_node.py')]
    assert not leftovers, f'moopet_core 残留 ROS 节点文件：{leftovers}'


if __name__ == '__main__':
    fns = [(k, v) for k, v in sorted(globals().items())
           if k.startswith('test_') and callable(v)]
    failed = 0
    for name, fn in fns:
        try:
            fn()
            print(f'  [PASS] {name}')
        except Exception as e:      # noqa: BLE001
            failed += 1
            print(f'  [FAIL] {name}: {e}')
    print(f'{len(fns) - failed}/{len(fns)} passed')
    sys.exit(1 if failed else 0)
