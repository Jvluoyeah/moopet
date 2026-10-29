#!/usr/bin/env python3
"""一次性重构：把纯逻辑从 moopet_dog 抽到 moopet_core（W6 · D1）。

做的事：
  1. 新建 src/moopet_core 包骨架（package.xml / setup.py / setup.cfg / resource）
  2. 平移纯逻辑：exp_engine.py、quiz_bank.py、decision/、data/schema.sql、tests/
  3. 改写引用：moopet_dog.* → moopet_core.*（节点与测试）
  4. moopet_dog 的 setup.py/package.xml 去掉已搬走的数据文件、加上 moopet_core 依赖

可重复执行（幂等）：已搬过的会跳过。
"""
import os
import re
import shutil
import sys

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(WS, 'src')
DOG = os.path.join(SRC, 'moopet_dog', 'moopet_dog')
CORE_PKG = os.path.join(SRC, 'moopet_core', 'moopet_core')
CORE_ROOT = os.path.join(SRC, 'moopet_core')

MOVES = [
    ('exp_engine.py', 'exp_engine.py'),
    ('quiz_bank.py', 'quiz_bank.py'),
    (os.path.join('decision', 'decision_engine.py'), os.path.join('decision', 'decision_engine.py')),
    (os.path.join('decision', 'diary.py'), os.path.join('decision', 'diary.py')),
    (os.path.join('decision', 'spark.py'), os.path.join('decision', 'spark.py')),
    (os.path.join('decision', '__init__.py'), os.path.join('decision', '__init__.py')),
    (os.path.join('decision', 'behavior_tree', 'actions.py'),
     os.path.join('decision', 'behavior_tree', 'actions.py')),
    (os.path.join('decision', 'behavior_tree', 'conditions.py'),
     os.path.join('decision', 'behavior_tree', 'conditions.py')),
    (os.path.join('decision', 'behavior_tree', 'core.py'),
     os.path.join('decision', 'behavior_tree', 'core.py')),
    (os.path.join('decision', 'behavior_tree', 'trees.py'),
     os.path.join('decision', 'behavior_tree', 'trees.py')),
    (os.path.join('decision', 'behavior_tree', '__init__.py'),
     os.path.join('decision', 'behavior_tree', '__init__.py')),
    (os.path.join('data', 'schema.sql'), os.path.join('data', 'schema.sql')),
]

PKG_XML = '''<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>moopet_core</name>
  <version>0.1.0</version>
  <description>纯逻辑大脑：经验结算/等级/火花/行为决策/日记/题库。零 ROS 依赖，可在狗本体或算力背包任一侧运行</description>
  <maintainer email="liwenyang@moopet.local">李文扬</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_python</buildtool_depend>

  <!-- 刻意不依赖 rclpy：本包必须能在无 ROS 环境下独立运行与测试 -->
  <test_depend>python3-pytest</test_depend>

  <export>
    <build_type>ament_python</build_type>
  </export>
</package>
'''

SETUP_PY = '''from setuptools import find_packages, setup

package_name = 'moopet_core'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['tests', 'tests.*']),
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/data', ['moopet_core/data/schema.sql']),
    ],
    package_data={'moopet_core': ['data/*.sql']},
    install_requires=['setuptools'],
    zip_safe=False,
    maintainer='李文扬',
    maintainer_email='liwenyang@moopet.local',
    description='纯逻辑大脑：经验结算/等级/火花/行为决策/日记/题库（零 ROS 依赖，可搬家）',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={'console_scripts': []},
)
'''

SETUP_CFG = '''[develop]
script_dir=$base/lib/moopet_core
[install]
install_scripts=$base/lib/moopet_core
'''

CORE_INIT = '''"""moopet_core —— 纯逻辑大脑（零 ROS 依赖）。

这一层刻意不 import rclpy / moopet_interfaces，因此可以：
  * 在无 ROS 的开发机上直接跑单测与仿真；
  * 通过 MOOPET_BRAIN=dog|backpack|sim 决定部署在狗本体还是算力背包；
  * 被 FastAPI 服务端直接复用做数值校验。

分层约定：core 只依赖标准库与 sqlite3；一切 ROS/网络/硬件访问都在上层。
"""
'''

DECISION_INIT_UNCHANGED = True   # decision/__init__.py 用相对 import，可直接搬


def ensure_dir(p):
    os.makedirs(p, exist_ok=True)


def move_files():
    ensure_dir(CORE_PKG)
    ensure_dir(os.path.join(CORE_PKG, 'data'))
    ensure_dir(os.path.join(CORE_PKG, 'decision', 'behavior_tree'))
    moved = []
    for rel_src, rel_dst in MOVES:
        s = os.path.join(DOG, rel_src)
        d = os.path.join(CORE_PKG, rel_dst)
        if not os.path.exists(s):
            if os.path.exists(d):
                moved.append((rel_src, 'already'))
            else:
                moved.append((rel_src, 'MISSING'))
            continue
        ensure_dir(os.path.dirname(d))
        shutil.move(s, d)
        moved.append((rel_src, 'moved'))
    return moved


def move_tests():
    s = os.path.join(SRC, 'moopet_dog', 'tests')
    d = os.path.join(CORE_ROOT, 'tests')
    if os.path.isdir(s):
        ensure_dir(CORE_ROOT)
        if os.path.isdir(d):
            shutil.rmtree(d)
        shutil.move(s, d)
        return 'moved'
    return 'already' if os.path.isdir(d) else 'MISSING'


def rewrite_imports():
    """把 moopet_dog.{exp_engine,quiz_bank,decision} 改成 moopet_core.*"""
    pat = re.compile(r'\bmoopet_dog\.(exp_engine|quiz_bank|decision)\b')
    targets = []
    for root, dirs, files in os.walk(SRC):
        dirs[:] = [x for x in dirs if x != '__pycache__']
        for f in files:
            if f.endswith('.py'):
                targets.append(os.path.join(root, f))
    changed = []
    for p in targets:
        with open(p, encoding='utf-8') as fh:
            text = fh.read()
        new = pat.sub(r'moopet_core.\1', text)
        if new != text:
            with open(p, 'w', encoding='utf-8') as fh:
                fh.write(new)
            changed.append(os.path.relpath(p, WS))
    return changed


def write_metadata():
    ensure_dir(os.path.join(CORE_ROOT, 'resource'))
    open(os.path.join(CORE_ROOT, 'resource', 'moopet_core'), 'w').close()
    with open(os.path.join(CORE_ROOT, 'package.xml'), 'w', encoding='utf-8') as fh:
        fh.write(PKG_XML)
    with open(os.path.join(CORE_ROOT, 'setup.py'), 'w', encoding='utf-8') as fh:
        fh.write(SETUP_PY)
    with open(os.path.join(CORE_ROOT, 'setup.cfg'), 'w', encoding='utf-8') as fh:
        fh.write(SETUP_CFG)
    with open(os.path.join(CORE_PKG, '__init__.py'), 'w', encoding='utf-8') as fh:
        fh.write(CORE_INIT)
    ensure_dir(os.path.join(CORE_PKG, 'decision'))
    p = os.path.join(CORE_PKG, 'decision', '__init__.py')
    if not os.path.exists(p):
        with open(p, 'w', encoding='utf-8') as fh:
            fh.write('')
    p = os.path.join(CORE_PKG, 'decision', 'behavior_tree', '__init__.py')
    if not os.path.exists(p):
        with open(p, 'w', encoding='utf-8') as fh:
            fh.write('')


def patch_dog_setup():
    """moopet_dog/setup.py：去掉已搬走的 schema.sql data_files。"""
    p = os.path.join(SRC, 'moopet_dog', 'setup.py')
    with open(p, encoding='utf-8') as fh:
        t = fh.read()
    t2 = t.replace("        ('share/' + package_name + '/data', ['moopet_dog/data/schema.sql']),\n", '')
    if t2 != t:
        with open(p, 'w', encoding='utf-8') as fh:
            fh.write(t2)
        return True
    return False


def patch_dog_package_xml():
    """moopet_dog/package.xml：加 moopet_core 依赖。"""
    p = os.path.join(SRC, 'moopet_dog', 'package.xml')
    with open(p, encoding='utf-8') as fh:
        t = fh.read()
    if '<depend>moopet_core</depend>' in t:
        return False
    t2 = t.replace('  <depend>moopet_interfaces</depend>\n',
                   '  <depend>moopet_interfaces</depend>\n  <depend>moopet_core</depend>\n')
    with open(p, 'w', encoding='utf-8') as fh:
        fh.write(t2)
    return True


def main():
    moved = move_files()
    for rel, st in moved:
        print(f'  move {rel:<45} {st}')
    print(f'  tests/ -> moopet_core/tests  {move_tests()}')
    write_metadata()
    changed = rewrite_imports()
    print(f'  import 改写 {len(changed)} 个文件:')
    for c in changed:
        print(f'    - {c}')
    print(f"  moopet_dog/setup.py 去掉 schema data_files: {patch_dog_setup()}")
    print(f'  moopet_dog/package.xml 加 moopet_core 依赖: {patch_dog_package_xml()}')
    print('done')


if __name__ == '__main__':
    sys.exit(main())
