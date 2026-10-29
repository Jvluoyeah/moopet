"""FastAPI 依赖：会话、设置、当前账号、当前狗狗。

所有依赖都从 `app.state` 取，方便测试时用 `create_app(settings)` 注入临时库。
"""
from datetime import datetime

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from .models import Account, DogProfile, LoginSession
from .security import (AuthError, account_id_from_token, bearer_token,
                       claims_from_token)


def get_settings(request: Request):
    return request.app.state.settings


def get_session_factory(request: Request):
    return request.app.state.session_factory


def get_db(request: Request):
    factory = request.app.state.session_factory
    db: Session = factory()
    try:
        yield db
    finally:
        db.close()


def _unauthorized(detail):
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail,
                         headers={'WWW-Authenticate': 'Bearer'})


class AuthContext:
    """一次请求的认证上下文：账号 + 这次登录的编号（jti）。

    ⚠️ 单独抽出来是因为"退出这一台""这一台是不是当前设备"这类接口
       需要知道 **jti**，而 `get_current_account` 只返回账号。
    """

    __slots__ = ('account', 'jti')

    def __init__(self, account: Account, jti):
        self.account = account
        self.jti = jti


def get_auth_context(authorization: str = Header(default=None),
                     settings=Depends(get_settings),
                     db: Session = Depends(get_db)) -> AuthContext:
    try:
        token = bearer_token(authorization)
        account_id, jti, ver = claims_from_token(token, settings.secret_key)
    except AuthError as e:
        raise _unauthorized(str(e)) from e
    acc = db.get(Account, account_id)
    if acc is None or not acc.is_active:
        raise _unauthorized('账号不存在或已停用')
    # 版本对不上 = 改过密码 / 在别处点过"退出其他设备" → 这个 token 作废
    if ver != int(acc.token_version or 0):
        raise _unauthorized('登录已失效，请重新登录')
    # 这一台设备被单独踢过
    if jti and _session_revoked(db, jti):
        raise _unauthorized('这台设备的登录已被退出')
    if jti:
        _touch_session(db, jti)
    return AuthContext(acc, jti)


def get_current_account(ctx: AuthContext = Depends(get_auth_context)) -> Account:
    return ctx.account


def _session_revoked(db: Session, jti: str) -> bool:
    s = db.query(LoginSession).filter(LoginSession.jti == jti).first()
    # 查不到就当**没撤销**：老 token（升级前签的）没有会话记录，
    # 不能因为"表里没有"就把人踢出去。
    return bool(s is not None and s.revoked_at is not None)


def _touch_session(db: Session, jti: str):
    """更新"最后活跃时间"。**限流到每分钟一次** —— 每个请求都写库没必要。"""
    s = db.query(LoginSession).filter(LoginSession.jti == jti).first()
    if s is None or s.revoked_at is not None:
        return
    now = datetime.utcnow()
    if s.last_seen_at and (now - s.last_seen_at).total_seconds() < 60:
        return
    s.last_seen_at = now
    db.commit()


def get_current_dog(account: Account = Depends(get_current_account),
                    db: Session = Depends(get_db)) -> DogProfile:
    """取当前账号的狗；没领养过就提示先去领养。"""
    dog = (db.query(DogProfile)
             .filter(DogProfile.account_id == account.id)
             .order_by(DogProfile.id)
             .first())
    if dog is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail='还没有领养机械狗，请先选择品种完成领养')
    return dog


def get_optional_account(authorization: str = Header(default=None),
                         settings=Depends(get_settings),
                         db: Session = Depends(get_db)):
    """可选登录：排行榜这类接口未登录也能看，但登录了能标出"我"。"""
    if not authorization:
        return None
    try:
        token = bearer_token(authorization)
        account_id = account_id_from_token(token, settings.secret_key)
    except AuthError:
        return None
    return db.get(Account, account_id)
