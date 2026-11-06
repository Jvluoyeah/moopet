#!/usr/bin/env python3
"""运行时环境自检（不装任何东西，只报告 + 退出码）。

    python scripts/probe_runtime.py          # 人看的报告
    python scripts/probe_runtime.py --json   # 机读（CI / doctor 用）

检查项与"为什么值钱"：
  1. Python 版本、UTF-8 编码 —— 节点/服务端日志大量中文，编码不对就是乱码或崩溃
  2. Node / npm 版本 —— 前端构建 + 服务端权威对战的 Node 子进程
  3. 关键端口是否被占用（8080 主服务 / 18080 剧情 / 5173 前端开发）
  4. deploy 目录是否可写（SQLite 落库 / 引擎子进程 cwd）
  5. WSL / 容器 / 普通 Linux 的区分（给不同的"浏览器怎么打开"提示）

退出码：0 全部就绪；1 有阻塞项；2 只有警告。
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import socket
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTS = [(8080, '主服务'), (18080, '剧情模式静态服务'), (5173, '前端开发服务器')]

OK, WARN, FAIL = 'ok', 'warn', 'fail'


def _run(cmd: list[str], timeout: float = 5.0) -> str | None:
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=timeout, check=True)
        return out.stdout.decode('utf-8', 'replace').strip()
    except Exception:          # noqa: BLE001
        return None


def _major(version: str | None) -> int:
    if not version:
        return 0
    digits = version.lstrip('v').split('.')[0]
    return int(digits) if digits.isdigit() else 0


def check_python() -> dict:
    v = '%d.%d.%d' % sys.version_info[:3]
    ok = sys.version_info >= (3, 9)
    return {
        'id': 'python', 'status': OK if ok else FAIL,
        'detail': f'Python {v}（{sys.executable}）',
        'hint': '' if ok else 'Ubuntu 22.04 自带 3.10，够用；更老请升级',
    }


def check_encoding() -> dict:
    enc = (sys.stdout.encoding or '').lower()
    ok = enc in ('utf-8', 'utf8', 'utf-8-sig')
    return {
        'id': 'encoding', 'status': OK if ok else WARN,
        'detail': f'stdout 编码 {sys.stdout.encoding or "未知"} / 文件系统 {sys.getfilesystemencoding()}',
        'hint': '' if ok else (
            '中文日志可能乱码/中断。Linux 一般没问题；Windows 请设 PYTHONUTF8=1，'
            'Linux 请 export LANG=en_US.UTF-8 或 C.UTF-8'),
    }


def check_node() -> dict:
    node = shutil.which('node')
    npm = shutil.which('npm')
    nv = _run([node, '--version']) if node else None
    major = _major(nv)
    if not node:
        return {
            'id': 'node', 'status': WARN,
            'detail': '没有 node',
            'hint': ('前端构建与服务端权威对战（房间引擎）需要 Node 18+。'
                     'Ubuntu 22.04 apt 源太旧，见 README「Ubuntu 安装 Node」；'
                     '只玩单机/PVE 可以不管'),
        }
    status = OK if major >= 18 else WARN
    return {
        'id': 'node', 'status': status,
        'detail': f'node {nv}' + (f' / npm {_run([npm, "--version"])}' if npm else '（没有 npm，构建不了前端）'),
        'hint': '' if status == OK else 'Node 建议 18+（本项目按 22 验证过）',
    }


def _port_free(port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        s.bind(('127.0.0.1', port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def check_ports() -> list[dict]:
    out = []
    for port, what in PORTS:
        free = _port_free(port)
        out.append({
            'id': f'port:{port}', 'status': OK if free else WARN,
            'detail': f'{port}（{what}）：' + ('空闲' if free else '已被占用'),
            'hint': '' if free else (
                f'若已经在跑就没事（scripts/start_web.sh 会把已在跑的那个认下来）；'
                f'否则先停掉占用者：ss -lptn \'sport = :{port}\''),
        })
    return out


def check_writable() -> dict:
    targets = [os.path.join(ROOT, 'server', 'data'),
               os.path.join(ROOT, '.runtime')]
    bad = []
    for d in targets:
        try:
            os.makedirs(d, exist_ok=True)
            probe = os.path.join(d, '.write-probe')
            with open(probe, 'w', encoding='utf-8') as f:
                f.write('ok')
            os.remove(probe)
        except OSError as e:
            bad.append(f'{d}: {e}')
    return {
        'id': 'writable', 'status': OK if not bad else FAIL,
        'detail': '可写' if not bad else '；'.join(bad),
        'hint': '' if not bad else 'SQLite 数据库和运行时不落地就起不了服务，先解决目录权限',
    }


def check_env_kind() -> dict:
    if os.environ.get('WSL_DISTRO_NAME') or 'microsoft' in platform.release().lower():
        hint = ('这是 WSL：在 Windows 里用浏览器直接打开 http://127.0.0.1:8080/ 即可'
                '（WSL2 默认把端口映射到 Windows）。若打不开，用 wsl hostname -I 拿到的 IP 访问。')
        kind = 'WSL'
    elif os.path.exists('/.dockerenv'):
        kind = 'Docker 容器'
        hint = '容器内请用 --host 0.0.0.0 并映射端口，浏览器访问宿主机地址。'
    else:
        kind = 'Linux'
        hint = ''
    return {'id': 'env', 'status': OK, 'detail': f'{kind}：{platform.platform()}', 'hint': hint}


def check_assets() -> list[dict]:
    out = []
    dist = os.path.join(ROOT, 'web', 'dist', 'index.html')
    out.append({
        'id': 'web_dist', 'status': OK if os.path.isfile(dist) else WARN,
        'detail': 'web/dist 已构建' if os.path.isfile(dist) else 'web/dist 不存在',
        'hint': '' if os.path.isfile(dist) else 'cd web && npm ci && npm run build（服务端才有页面可托管）',
    })
    gal = os.path.join(ROOT, 'gal', 'web', 'index.html')
    out.append({
        'id': 'gal', 'status': OK if os.path.isfile(gal) else WARN,
        'detail': '剧情模式资源在' if os.path.isfile(gal) else '剧情模式资源缺失（gal/web/index.html）',
        'hint': '' if os.path.isfile(gal) else '剧本导出物没跟着仓库一起拿下来',
    })
    return out


def collect() -> list[dict]:
    items = [check_python(), check_encoding(), check_node(), check_env_kind()]
    items += check_ports()
    items.append(check_writable())
    items += check_assets()
    return items


def main(argv: list[str]) -> int:
    items = collect()
    if '--json' in argv:
        print(json.dumps(items, ensure_ascii=False, indent=2))
    else:
        for it in items:
            icon = {OK: '✓', WARN: '!', FAIL: 'x'}[it['status']]
            print(f'  [{icon}] {it["detail"]}')
            if it['hint']:
                print(f'      -> {it["hint"]}')
    worst = max((it['status'] for it in items), key=lambda s: (s == WARN) + 2 * (s == FAIL))
    return 0 if worst == OK else (2 if worst == WARN else 1)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
