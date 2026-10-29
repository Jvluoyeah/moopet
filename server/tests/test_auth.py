#!/usr/bin/env python3
"""账号用例：注册 / 登录 / 鉴权 / 边界。"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from helpers import auth_header, cleanup_all, make_client, register  # noqa: E402


def test_health_and_meta():
    c, _ = make_client()
    assert c.get('/api/health').json()['ok'] is True
    meta = c.get('/api/meta').json()
    assert meta['name'] == 'moopet-server'
    assert 'local' in meta['authority'] and 'cloud' in meta['authority']


def test_register_returns_token_and_account():
    c, _ = make_client()
    data = register(c, username='alice')
    assert data['token_type'] == 'bearer'
    assert data['account']['username'] == 'alice'
    assert 'password' not in str(data)          # 不泄露密码字段


def test_duplicate_username_rejected():
    c, _ = make_client()
    register(c, username='alice')
    r = c.post('/api/auth/register', json={'username': 'alice', 'password': 'pass1234'})
    assert r.status_code == 409


def test_reserved_username_rejected():
    c, _ = make_client()
    r = c.post('/api/auth/register', json={'username': 'admin', 'password': 'pass1234'})
    assert r.status_code == 400


def test_short_password_rejected():
    c, _ = make_client()
    r = c.post('/api/auth/register', json={'username': 'bob', 'password': '123'})
    assert r.status_code == 422                  # pydantic 长度校验


def test_login_ok_and_wrong_password():
    c, _ = make_client()
    register(c, username='alice', password='pass1234')
    ok = c.post('/api/auth/login', json={'username': 'alice', 'password': 'pass1234'})
    assert ok.status_code == 200
    bad = c.post('/api/auth/login', json={'username': 'alice', 'password': 'nope1234'})
    assert bad.status_code == 401


def test_login_unknown_user_same_message():
    """账号不存在与密码错误必须同一句话，防止用户名枚举。"""
    c, _ = make_client()
    register(c, username='alice', password='pass1234')
    a = c.post('/api/auth/login', json={'username': 'alice', 'password': 'wrong123'})
    b = c.post('/api/auth/login', json={'username': 'ghost', 'password': 'wrong123'})
    assert a.status_code == b.status_code == 401
    assert a.json()['detail'] == b.json()['detail']


def test_me_requires_token():
    c, _ = make_client()
    assert c.get('/api/auth/me').status_code == 401


def test_me_with_token():
    c, _ = make_client()
    token = register(c, username='alice')['access_token']
    r = c.get('/api/auth/me', headers=auth_header(token))
    assert r.status_code == 200 and r.json()['username'] == 'alice'


def test_bad_token_rejected():
    c, _ = make_client()
    assert c.get('/api/auth/me', headers={'Authorization': 'Bearer not-a-token'}).status_code == 401
    assert c.get('/api/auth/me', headers={'Authorization': 'Token abc'}).status_code == 401
    assert c.get('/api/auth/me', headers={'Authorization': 'Bearer'}).status_code == 401


def test_password_hash_not_plaintext():
    """库里不能出现明文密码。"""
    c, app = make_client()
    register(c, username='alice', password='pass1234')
    from app.models import Account
    db = app.state.session_factory()
    try:
        acc = db.query(Account).filter(Account.username == 'alice').first()
        assert 'pass1234' not in acc.password_hash
        assert acc.password_hash.startswith('$argon2')
    finally:
        db.close()


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
    cleanup_all()
    sys.exit(1 if failed else 0)
