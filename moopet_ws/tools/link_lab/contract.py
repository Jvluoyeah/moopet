"""契约测试：把 `interface_spec.md` 从"文档"变成"可执行断言"。

文档和代码最容易悄悄分家：改了 .msg 忘了改规范，或者规范里写了 16 个接口、
实际只实现了 14 个，谁也不知道。这里把四件事钉死：

  1. 规范里出现的每个 `Xxx.msg/.srv/.action` 都必须在 moopet_interfaces 里存在
  2. 规范里声明的话题/服务/动作数量与清单一致（不漏实现、不写幽灵接口）
  3. 规范里"经验来源 → 感知事件"的 8 条映射，与 exp_engine.SOURCES 完全一致
  4. setup.py 里每个 console_scripts 入口都能找到对应模块文件

全部按文本解析，不需要 ROS、不需要编译。
"""
import os
import re

from _paths import SRC, WS  # noqa: F401

IFACE_DIR = os.path.join(SRC, 'moopet_interfaces')
SPEC_PATH = os.path.join(WS, 'docs', 'interface_spec.md')

TYPE_RE = re.compile(r'`([A-Za-z_][A-Za-z0-9_]*)\.(msg|srv|action)`')
# 话题表里类型是不带后缀写的（`HeartbeatMsg`），也要认，否则会误报"未登记"
BARE_TYPE_RE = re.compile(r'`([A-Z][A-Za-z0-9_]*Msg)`')
TOPIC_RE = re.compile(r'`(/[A-Za-z0-9_/]+)`')
SRV_ROW_RE = re.compile(r'`(/[A-Za-z0-9_/]+)`\s*\|\s*`([A-Za-z_][A-Za-z0-9_]*)\.(srv|action)`')
SOURCE_ROW_RE = re.compile(
    r'^\|\s*\d+\s*\|\s*[^|]*`([a-z_]+)`\s*\|[^|]*\|\s*(\d+)\s*\|\s*(\d+)\s*\|')


def read_spec():
    with open(SPEC_PATH, encoding='utf-8') as fh:
        return fh.read()


def iface_files():
    """moopet_interfaces 下所有接口文件名。"""
    out = {}
    for sub in ('msg', 'srv', 'action'):
        d = os.path.join(IFACE_DIR, sub)
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.endswith('.' + sub):
                    out[f] = os.path.join(d, f)
    return out


# ---------------- 1. 类型存在性 ----------------
def test_spec_interfaces_all_exist():
    spec = read_spec()
    declared = {f'{name}.{ext}' for name, ext in TYPE_RE.findall(spec)}
    have = set(iface_files())
    missing = sorted(declared - have)
    assert not missing, f'规范里声明但未实现的接口：{missing}'


def documented_interfaces(spec=None):
    """规范里登记过的接口文件名（兼容 `X.msg` 与话题表里的 `XMsg` 两种写法）。"""
    spec = spec if spec is not None else read_spec()
    out = {f'{name}.{ext}' for name, ext in TYPE_RE.findall(spec)}
    out |= {name + '.msg' for name in BARE_TYPE_RE.findall(spec)}
    return out


def test_no_undocumented_interfaces():
    """反过来也要查：实现了却没进规范 = 别人不知道能这么用。"""
    spec = read_spec()
    documented = documented_interfaces(spec)
    have = set(iface_files())
    undoc = sorted(have - documented)
    assert not undoc, f'已实现但规范未登记（请补 docs/interface_spec.md）：{undoc}'


def test_interface_count_at_least_sixteen():
    """排期承诺"16 项自定义接口"，少于这个数说明有缺失。"""
    assert len(iface_files()) >= 16, f'接口只有 {len(iface_files())} 项'


# ---------------- 2. 话题/服务/动作清单 ----------------
def test_topics_declared_and_unique():
    spec = read_spec()
    topics = set(TOPIC_RE.findall(spec))
    for must in ('/backpack/heartbeat', '/dog/odom', '/dog/state',
                 '/dog/decision/event', '/dog/quiz/question', '/dog/quiz/answer'):
        assert must in topics, f'规范缺少关键话题 {must}'
    assert len(topics) >= 8, f'话题数偏少：{sorted(topics)}'


def test_service_action_rows_resolve():
    spec = read_spec()
    rows = SRV_ROW_RE.findall(spec)
    assert rows, '规范里没解析到 服务/动作 表格行'
    have = set(iface_files())
    for path, name, ext in rows:
        fname = f'{name}.{ext}'
        assert fname in have, f'{path} 声明的 {fname} 不存在'


# ---------------- 3. 经验来源映射 ----------------
def test_exp_sources_match_spec():
    """规范第四节的 8 条来源映射必须与 exp_engine.SOURCES 一模一样。"""
    from moopet_core.exp_engine import SOURCES
    spec = read_spec()
    declared = {}
    for line in spec.splitlines():
        m = SOURCE_ROW_RE.match(line)
        if m:
            name, exp, cap = m.group(1), int(m.group(2)), int(m.group(3))
            declared[name] = {'exp': exp, 'weekly_cap': cap}
    assert declared, '规范里没解析到经验来源表'
    assert set(declared) == set(SOURCES), (
        f'来源不一致：规范 {sorted(declared)} vs 代码 {sorted(SOURCES)}')
    for name, want in declared.items():
        got = SOURCES[name]
        assert got['exp'] == want['exp'], f'{name} 单位经验不一致'
        assert got['weekly_cap'] == want['weekly_cap'], f'{name} 周上限不一致'


def test_weekly_total_limit_documented():
    """狗2.md 的"每周最多 2000"要在规范里写清楚，且与代码一致。"""
    from moopet_core.exp_engine import WEEKLY_MAX_EXP
    spec = read_spec()
    assert str(WEEKLY_MAX_EXP) in spec, f'规范未写明每周上限 {WEEKLY_MAX_EXP}'


# ---------------- 4. 节点入口 ----------------
def test_console_scripts_resolve_to_modules():
    """每个 console_scripts 入口都要能找到对应 .py 文件。"""
    import ast
    problems = []
    for pkg in ('moopet_dog', 'moopet_backpack', 'moopet_core', 'moopet_link',
                'moopet_hal', 'moopet_deploy'):
        root = os.path.join(SRC, pkg)
        setup_py = os.path.join(root, 'setup.py')
        if not os.path.exists(setup_py):
            continue
        with open(setup_py, encoding='utf-8') as fh:
            text = fh.read()
        for mod in re.findall(r"'([a-z_][a-z0-9_.]*):[a-z_]+'", text):
            rel = mod.replace('.', os.sep) + '.py'
            if not os.path.exists(os.path.join(root, rel)):
                problems.append(f'{pkg}: {mod} → 缺少 {rel}')
    assert not problems, f'入口指向不存在的模块：{problems}'


def test_link_package_has_no_ros_requirement_in_core_paths():
    """通信层的核心模块不得 import rclpy（否则又变成"没 ROS 就测不了"）。"""
    import ast
    link_dir = os.path.join(SRC, 'moopet_link', 'moopet_link')
    bad = []
    for f in sorted(os.listdir(link_dir)):
        if not f.endswith('.py'):
            continue
        with open(os.path.join(link_dir, f), encoding='utf-8') as fh:
            tree = ast.parse(fh.read())
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                bad += [(f, a.name) for a in node.names if a.name.split('.')[0] == 'rclpy']
            elif isinstance(node, ast.ImportFrom) and node.module:
                if node.module.split('.')[0] == 'rclpy':
                    bad.append((f, node.module))
    assert not bad, f'link 核心出现 rclpy 依赖：{bad}'


if __name__ == '__main__':
    import sys
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
