#!/usr/bin/env python3
"""本地一键起服务（演示用）：python run_local.py

做的事：
  1. 检查依赖是否齐全（缺了直接告诉你装什么）
  2. 用本地 SQLite 与演示密钥起 uvicorn（单进程：对战房间在内存里）
  3. 打印几个能直接点的地址（文档 / 品种 / 广场）

云端部署不要用它——那边用 docker compose + 环境变量。
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

PORT = int(os.environ.get('MOOPET_PORT', '8080'))
HOST = os.environ.get('MOOPET_HOST', '0.0.0.0')

REQUIRED = [('fastapi', 'fastapi'), ('uvicorn', 'uvicorn[standard]'),
            ('sqlalchemy', 'sqlalchemy'), ('pydantic', 'pydantic'),
            ('jwt', 'PyJWT'), ('argon2', 'argon2-cffi')]


def check_deps():
    missing = []
    for module, pip_name in REQUIRED:
        try:
            __import__(module)
        except ImportError:
            missing.append(pip_name)
    if missing:
        print('缺少依赖：', ', '.join(missing))
        print('安装：pip install -r requirements.txt')
        return False
    return True


def main():
    if not check_deps():
        return 1
    os.environ.setdefault('MOOPET_SEED_DEMO', '1')
    os.environ.setdefault('MOOPET_DATABASE_URL',
                          'sqlite:///' + os.path.join(HERE, 'data', 'moopet.db'))
    print('=' * 62)
    print('养成系机械狗 · 服务端（本地演示档）')
    print('=' * 62)
    print(f'  接口文档   http://{HOST}:{PORT}/docs')
    print(f'  健康检查   http://{HOST}:{PORT}/api/health')
    print(f'  品种图鉴   http://{HOST}:{PORT}/api/breeds')
    print(f'  广场（世界）http://{HOST}:{PORT}/api/world?scene=plaza')
    print(f'  数据库     {os.environ["MOOPET_DATABASE_URL"]}')
    print('  停止：Ctrl+C')
    print('=' * 62)
    return subprocess.call([sys.executable, '-m', 'uvicorn', 'app.main:app',
                            '--host', HOST, '--port', str(PORT)],
                           cwd=HERE)


if __name__ == '__main__':
    sys.exit(main())
