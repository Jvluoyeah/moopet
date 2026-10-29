"""账号安全：argon2 密码哈希 + HS256 JWT。

选型理由：
  * argon2 是当前推荐的密码哈希（抗 GPU 爆破），argon2-cffi 有现成 wheel；
  * JWT 用对称密钥，演示阶段够用；上云时把 MOOPET_SECRET_KEY 换成强随机值即可。
"""
from datetime import datetime, timedelta, timezone
import uuid

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import (InvalidHashError, VerificationError,
                               VerifyMismatchError)

ALGORITHM = 'HS256'
_hasher = PasswordHasher()

MIN_PASSWORD_LEN = 6
MAX_PASSWORD_LEN = 128


class AuthError(Exception):
    """认证失败（由 API 层转成 401/400）。"""


def hash_password(password):
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LEN:
        raise AuthError(f'密码至少 {MIN_PASSWORD_LEN} 位')
    if len(password) > MAX_PASSWORD_LEN:
        raise AuthError(f'密码最长 {MAX_PASSWORD_LEN} 位')
    return _hasher.hash(password)


def verify_password(password, password_hash):
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    except Exception:      # noqa: BLE001  哈希串损坏也不能 500
        return False


def needs_rehash(password_hash):
    try:
        return _hasher.check_needs_rehash(password_hash)
    except Exception:      # noqa: BLE001
        return False


def make_token(account_id, secret_key, ttl_hours=72, extra=None):
    now = datetime.now(timezone.utc)
    payload = {
        'sub': str(account_id),
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(hours=ttl_hours)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, secret_key, algorithm=ALGORITHM)


def read_token(token, secret_key):
    """解析并校验 token，返回 payload；失败抛 AuthError。"""
    try:
        return jwt.decode(token, secret_key, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as e:
        raise AuthError('登录已过期，请重新登录') from e
    except jwt.InvalidTokenError as e:
        raise AuthError('登录凭证无效') from e


def account_id_from_token(token, secret_key):
    payload = read_token(token, secret_key)
    sub = payload.get('sub')
    if not sub or not str(sub).isdigit():
        raise AuthError('登录凭证缺少账号信息')
    return int(sub)


def new_jti():
    """给一次登录发一个唯一编号（登录会话表的主键是它）。

    为什么 JWT 之外还要这个：JWT 是**无状态**的，签出去就收不回来。
    "看看我都在哪些设备上登着""把那台踢下线"这两件事，
    必须靠服务端记一笔（见 models.LoginSession）。
    """
    return uuid.uuid4().hex


def make_session_token(account, secret_key, ttl_hours=72):
    """签发一个**带登录会话**的 token。

    载荷里多两样东西：
      jti —— 这次登录的编号，对应 login_session 里的一行
      ver —— 账号的 token 版本号。改密码 / 退出其他设备时会 +1，
             旧 token 的 ver 对不上就整体失效（不用逐个去撤销）。
    """
    return make_token(account.id, secret_key, ttl_hours,
                      extra={'jti': new_jti(), 'ver': int(account.token_version or 0)})


def claims_from_token(token, secret_key):
    """解析 token，返回 (account_id, jti, ver)。

    兼容老 token：没有 jti/ver 就当 (None, 0) —— 版本 0 正好是默认值，
    所以升级前签发的 token 不会被无故踢掉（只是不出现在设备列表里）。
    """
    payload = read_token(token, secret_key)
    sub = payload.get('sub')
    if not sub or not str(sub).isdigit():
        raise AuthError('登录凭证缺少账号信息')
    jti = payload.get('jti')
    ver = payload.get('ver', 0)
    try:
        ver = int(ver)
    except (TypeError, ValueError):
        ver = 0
    return int(sub), (str(jti) if jti else None), ver


def bearer_token(header_value):
    """从 `Authorization: Bearer xxx` 里取出 token。"""
    if not header_value:
        raise AuthError('缺少 Authorization 头')
    parts = header_value.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        raise AuthError('Authorization 头格式应为 "Bearer <token>"')
    return parts[1]
