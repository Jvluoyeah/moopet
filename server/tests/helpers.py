#!/usr/bin/env python3
"""服务端测试共用工具：临时库 + TestClient + 便捷注册/领养。"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient      # noqa: E402

from app.config import Settings               # noqa: E402
from app.factory import create_app            # noqa: E402

_APPS = []


def make_client(seed=True, **kw):
    """建一个隔离的 app + client（每个测试一个临时库，互不干扰）。"""
    tmp = tempfile.TemporaryDirectory()
    settings = Settings(
        database_url='sqlite:///' + os.path.join(tmp.name, 'test.db'),
        secret_key='test-secret-key-with-enough-length-0123456789',
        **kw)
    app = create_app(settings, seed=seed, warn=False)
    client = TestClient(app)
    _APPS.append((app, tmp))
    return client, app


def cleanup_all():
    for app, tmp in reversed(_APPS):
        try:
            app.state.engine.dispose()
        except Exception:      # noqa: BLE001
            pass
        try:
            tmp.cleanup()
        except Exception:      # noqa: BLE001
            pass
    _APPS.clear()


def register(client, username='alice', password='pass1234', email=''):
    r = client.post('/api/auth/register',
                    json={'username': username, 'password': password, 'email': email})
    assert r.status_code == 201, r.text
    return r.json()


def auth_header(token):
    return {'Authorization': f'Bearer {token}'}


def adopt(client, token, name='小汪', breed='samoyed'):
    r = client.post('/api/dogs/adopt', json={'name': name, 'breed_code': breed},
                    headers=auth_header(token))
    assert r.status_code == 201, r.text
    return r.json()


def full_user(client, username='alice'):
    """注册 + 领养，返回 (token, card)。"""
    data = register(client, username=username)
    token = data['access_token']
    card = adopt(client, token, name=f'{username}的狗')
    return token, card
