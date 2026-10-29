"""uvicorn 入口：`uvicorn app.main:app`。

真正干活的是 `app/factory.py:create_app()`；这里只负责把它实例化成模块级 `app`。
测试请直接 `from app.factory import create_app`，避免 import 本模块时创建默认 app。
"""
from .factory import create_app

app = create_app()

__all__ = ['app', 'create_app']
