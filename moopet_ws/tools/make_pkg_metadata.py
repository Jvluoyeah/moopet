#!/usr/bin/env python3
"""为 ROS2 ament_python 包生成标准元数据（package.xml / setup.py / setup.cfg / resource）。

用法：
    python tools/make_pkg_metadata.py moopet_hal "说明文字" [--entry name=mod:func ...]

为什么要脚本：手工复制这四个文件最容易漏改包名，而漏改会在 colcon build 时才炸。
"""
import os
import sys

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(WS, 'src')

PKG_XML = '''<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>{name}</name>
  <version>0.1.0</version>
  <description>{desc}</description>
  <maintainer email="liwenyang@moopet.local">李文扬</maintainer>
  <license>Apache-2.0</license>

  <buildtool_depend>ament_python</buildtool_depend>
{deps}
  <test_depend>python3-pytest</test_depend>

  <export>
    <build_type>ament_python</build_type>
  </export>
</package>
'''

SETUP_PY = '''from setuptools import find_packages, setup

package_name = '{name}'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['tests', 'tests.*']),
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='李文扬',
    maintainer_email='liwenyang@moopet.local',
    description='{desc}',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={{
        'console_scripts': [
{entries}
        ],
    }},
)
'''

SETUP_CFG = '''[develop]
script_dir=$base/lib/{name}
[install]
install_scripts=$base/lib/{name}
'''


def make(name, desc, deps=(), entries=()):
    root = os.path.join(SRC, name)
    os.makedirs(os.path.join(root, 'resource'), exist_ok=True)
    os.makedirs(os.path.join(root, name), exist_ok=True)
    open(os.path.join(root, 'resource', name), 'w').close()
    dep_lines = ''.join(f'  <exec_depend>{d}</exec_depend>\n' for d in deps)
    entry_lines = ',\n'.join(f"            '{e}'" for e in entries)
    with open(os.path.join(root, 'package.xml'), 'w', encoding='utf-8') as fh:
        fh.write(PKG_XML.format(name=name, desc=desc, deps=dep_lines))
    with open(os.path.join(root, 'setup.py'), 'w', encoding='utf-8') as fh:
        fh.write(SETUP_PY.format(name=name, desc=desc, entries=entry_lines))
    with open(os.path.join(root, 'setup.cfg'), 'w', encoding='utf-8') as fh:
        fh.write(SETUP_CFG.format(name=name))
    init = os.path.join(root, name, '__init__.py')
    if not os.path.exists(init):
        open(init, 'w', encoding='utf-8').close()
    print(f'  生成 {name}: package.xml / setup.py / setup.cfg / resource / __init__.py')
    return root


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    name, desc = argv[0], argv[1]
    deps, entries = [], []
    rest = argv[2:]
    i = 0
    while i < len(rest):
        if rest[i] == '--dep':
            deps.append(rest[i + 1]); i += 2
        elif rest[i] == '--entry':
            entries.append(rest[i + 1]); i += 2
        else:
            i += 1
    make(name, desc, deps, entries)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
