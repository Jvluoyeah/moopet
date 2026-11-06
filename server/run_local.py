#!/usr/bin/env python3
"""本地一键起服务（演示用）：python run_local.py

做的事：
  1. 检查依赖是否齐全（缺了直接告诉你装什么）
  2. 检查 node 在不在（缺了说明"对战走服务端权威"会不可用，但不拦着起服务）
  3. 用本地 SQLite 与演示密钥起 uvicorn（单进程：对战房间在内存里）
  4. 打印几个能直接点的地址（文档 / 品种 / 广场）

环境变量（Linux 与 Windows 一致）：
  MOOPET_HOST          默认 127.0.0.1。**换成 0.0.0.0 才允许局域网/手机访问**
                       （以前默认 0.0.0.0，会被 Windows 防火墙拦弹窗、也不适合随手起的本地服务）
  MOOPET_PORT          默认 8080
  MOOPET_DATABASE_URL  默认 sqlite:///<server>/data/moopet.db
  MOOPET_OPEN_BROWSER  设 1 时，服务起来后尝试打开浏览器（默认不自动开；
                       scripts/start_web.sh 会自己做这件事）

云端部署不要用它——那边用 docker compose + 环境变量。
"""
import errno
import os
import shutil
import socket
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

PORT = int(os.environ.get('MOOPET_PORT', '8080'))
# 默认只听本机：Linux 上 0.0.0.0 会暴露到局域网，对一个演示服务不合适
HOST = os.environ.get('MOOPET_HOST', '127.0.0.1')

REQUIRED = [('fastapi', 'fastapi'), ('uvicorn', 'uvicorn[standard]'),
            ('sqlalchemy', 'sqlalchemy'), ('pydantic', 'pydantic'),
            ('jwt', 'PyJWT'), ('argon2', 'argon2-cffi')]


def _say(tag, msg):
    print(f'[{tag}] {msg}')


def check_deps():
    missing = []
    for module, pip_name in REQUIRED:
        try:
            __import__(module)
        except ImportError:
            missing.append(pip_name)
    if missing:
        print('缺少依赖：', ', '.join(missing))
        # Ubuntu 22.04 起是 PEP 668：直接 pip install 到系统会被拒绝（externally-managed-environment）
        print('安装（推荐虚拟环境）：')
        print('  python3 -m venv .venv && . .venv/bin/activate')
        print('  python -m pip install -r requirements.txt')
        print('或者直接跑仓库根目录的：bash scripts/setup.sh')
        return False
    return True


def check_node():
    """Node 在不在。不在不影响"能起服务"，但服务端权威对战与前端构建要靠它。"""
    node = os.environ.get('MOOPET_NODE') or shutil.which('node')
    if node:
        try:
            ver = subprocess.run([node, '--version'], capture_output=True,
                                 timeout=5, check=True).stdout.decode().strip()
            _say('ok', f'node {ver}（服务端权威对战的引擎子进程用它）')
            return True
        except Exception:            # noqa: BLE001
            pass
    _say('!', '没找到 node：服务端 API 与页面照常，但**服务端权威对战**开不了房间'
              '（引擎是 Node 子进程），前端也构建不了。')
    _say('!', '  Ubuntu 22.04：curl -fsSL https://deb.nodesource.com/setup_22.x | '
              'sudo -E bash - && sudo apt-get install -y nodejs')
    _say('!', '  已装在非 PATH 位置：export MOOPET_NODE=/path/to/node')
    return False


def port_in_use(host, port):
    """端口已经被别人占了就尽早报错，而不是让 uvicorn 抛一大段 traceback。"""
    probe_host = '127.0.0.1' if host in ('0.0.0.0', '::') else host
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.settimeout(0.5)
        return s.connect_ex((probe_host, port)) == 0
    finally:
        s.close()


def _ensure_stdout_utf8():
    """Windows 控制台默认 GBK，中文日志/emoji 会 UnicodeEncodeError（测试里也踩过）。
    Linux 终端平时是 UTF-8，但 cron/systemd 里不一定，统一兜一下。

    ⚠️ 只 reconfigure 当前进程不够：真正的服务是子进程 `python -m uvicorn`，
    子进程的编码是另算的。所以同时设 PYTHONUTF8，让子进程也走 UTF-8。
    """
    os.environ.setdefault('PYTHONUTF8', '1')
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')  # type: ignore[attr-defined]
        except Exception:            # noqa: BLE001  老版本/被重定向的流
            pass


def main():
    _ensure_stdout_utf8()
    if not check_deps():
        return 1
    check_node()

    if port_in_use(HOST, PORT):
        _say('x', f'端口 {PORT} 已经被占用（可能是上一次的服务没退，或者别的程序）。')
        if os.name == 'nt':
            _say('x', f'  查看占用：netstat -ano | findstr :{PORT}   '
                      f'（再用 tasklist /FI "PID eq <pid>" 对上是哪个程序）')
        else:
            _say('x', f'  查看占用：ss -lptn "sport = :{PORT}"   /   '
                      f'lsof -iTCP:{PORT} -sTCP:LISTEN')
        _say('x', f'  或者换个端口：MOOPET_PORT=8081 python run_local.py')
        return 1

    os.environ.setdefault('MOOPET_SEED_DEMO', '1')
    os.environ.setdefault('MOOPET_DATABASE_URL',
                          'sqlite:///' + os.path.join(HERE, 'data', 'moopet.db'))

    # 打印用的地址：0.0.0.0 不是能点的地址，换成 127.0.0.1
    shown_host = '127.0.0.1' if HOST in ('0.0.0.0', '::') else HOST
    base = f'http://{shown_host}:{PORT}'

    print('=' * 62)
    print('养成系机械狗 · 服务端（本地演示档）')
    print('=' * 62)
    print(f'  主页       {base}/')
    print(f'  接口文档   {base}/docs')
    print(f'  健康检查   {base}/api/health')
    print(f'  品种图鉴   {base}/api/breeds')
    print(f'  广场（世界）{base}/api/world?scene=plaza')
    print(f'  剧情模式   {base}/gal/web/index.html'
          '（需另起 18080：scripts/start_web.sh 会自动带上）')
    print(f'  监听地址   {HOST}:{PORT}'
          + ('' if HOST not in ('127.0.0.1', 'localhost') else
             '（仅本机；要让局域网访问用 MOOPET_HOST=0.0.0.0）'))
    print(f'  数据库     {os.environ["MOOPET_DATABASE_URL"]}')
    print('  停止：Ctrl+C')
    print('=' * 62)

    if os.environ.get('MOOPET_OPEN_BROWSER', '').lower() in ('1', 'true', 'yes'):
        import threading
        import webbrowser
        threading.Timer(2.5, lambda: webbrowser.open(base + '/')).start()

    return subprocess.call([sys.executable, '-m', 'uvicorn', 'app.main:app',
                            '--host', HOST, '--port', str(PORT)],
                           cwd=HERE)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
    except OSError as e:
        if e.errno in (errno.EADDRINUSE, 98, 10048):
            _say('x', f'端口 {PORT} 起不来（被占用）')
        raise
