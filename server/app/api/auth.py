"""账号：注册 / 登录 / 我是谁 / 改昵称 / 改密码 / 登录设备 / 注销。

四项设置能力（用户 2026-09-13 要求"改密码、多设备、昵称、注销…都要做"）：

  · **昵称**      PATCH  /api/auth/me            —— username 是登录名、不能改
  · **改密码**    POST   /api/auth/me/password   —— 验旧密码；改完**其他设备全部失效**
  · **多设备**    GET    /api/auth/me/sessions   —— 看都在哪些设备上登着
                  POST   /api/auth/me/sessions/{id}/revoke      —— 踢掉某一台
                  POST   /api/auth/me/sessions/revoke-others    —— 退出其他所有设备
                  POST   /api/auth/logout                       —— 退出这一台
  · **注销**      DELETE /api/auth/me            —— 要再验一次密码（不可逆）

"多设备"为什么需要服务端记东西：JWT 是**无状态**的，签出去就收不回来。
所以每次登录在 `login_session` 里落一行（jti），撤销就是给那一行盖时间戳；
改密码 / 退出其他设备则把账号的 `token_version` +1，所有旧 token 一起作废。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..deps import (AuthContext, get_auth_context, get_current_account, get_db,
                    get_settings)
from ..models import (Account, CommunityMember, DogProfile, Friendship,
                      LeaderboardEntry, LoginSession, MatchPlayer, Presence,
                      TrainingDrop, TrainingProgress, Visit)
from ..schemas import (AccountOut, LoginRequest, PasswordChange, PasswordConfirm,
                       ProfileUpdate, RegisterRequest, SessionOut, TokenOut)
from ..security import (AuthError, hash_password, make_token, new_jti,
                        verify_password)

router = APIRouter(prefix='/api/auth', tags=['账号'])

RESERVED = {'admin', 'root', 'system', 'moopet', '官方', '管理员'}

# 登录设备列表最多返回多少条（不重要的老会话不必翻到底）
MAX_SESSIONS = 20


def _client_info(request: Request):
    ua = (request.headers.get('user-agent') or '')[:255]
    ip = ''
    if request.client is not None:
        ip = (request.client.host or '')[:64]
    return ua, ip


def _start_session(db: Session, request: Request, token_jti: str, account: Account):
    """把这次登录记进设备表。token 里已经带了 jti，这里存那一行。"""
    ua, ip = _client_info(request)
    db.add(LoginSession(account_id=account.id, jti=token_jti, user_agent=ua, ip=ip))
    db.commit()


def _issue(db: Session, request: Request, account: Account, settings):
    """签发 token 并登记这次登录。

    ⚠️ 不用 security.make_session_token：那个函数内部生成 jti 就丢了，
       而登记设备表**需要 jti**，所以这里自己拼一次。
    """
    jti = new_jti()
    token = make_token(account.id, settings.secret_key, settings.token_ttl_hours,
                       extra={'jti': jti, 'ver': int(account.token_version or 0)})
    _start_session(db, request, jti, account)
    return TokenOut(access_token=token, expires_in_hours=settings.token_ttl_hours,
                    account=AccountOut.model_validate(account))


@router.post('/register', response_model=TokenOut,
             status_code=status.HTTP_201_CREATED, summary='注册账号')
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db),
             settings=Depends(get_settings)):
    username = body.username.strip()
    if username.lower() in RESERVED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, '该用户名为系统保留，请换一个')
    exists = db.query(Account).filter(Account.username == username).first()
    if exists is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, '用户名已被占用')
    try:
        pwd_hash = hash_password(body.password)
    except AuthError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    acc = Account(username=username, email=body.email or '', password_hash=pwd_hash)
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return _issue(db, request, acc, settings)


@router.post('/login', response_model=TokenOut, summary='登录')
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db),
          settings=Depends(get_settings)):
    acc = db.query(Account).filter(Account.username == body.username.strip()).first()
    # 账号不存在与密码错误返回同一句话，避免被用来枚举用户名
    if acc is None or not verify_password(body.password, acc.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, '用户名或密码不正确')
    if not acc.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, '账号已停用')
    return _issue(db, request, acc, settings)


@router.get('/me', response_model=AccountOut, summary='当前账号')
def me(account: Account = Depends(get_current_account)):
    return AccountOut.model_validate(account)


# ---------------- 昵称 ----------------
@router.patch('/me', response_model=AccountOut, summary='改昵称')
def update_me(body: ProfileUpdate, account: Account = Depends(get_current_account),
              db: Session = Depends(get_db)):
    account.nickname = body.nickname.strip()
    db.commit()
    db.refresh(account)
    return AccountOut.model_validate(account)


# ---------------- 改密码 ----------------
@router.post('/me/password', response_model=TokenOut, summary='改密码')
def change_password(body: PasswordChange, request: Request,
                    ctx: AuthContext = Depends(get_auth_context),
                    db: Session = Depends(get_db), settings=Depends(get_settings)):
    acc = ctx.account
    if not verify_password(body.old_password, acc.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, '原密码不正确')
    if body.old_password == body.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, '新密码和原密码一样')
    try:
        acc.password_hash = hash_password(body.new_password)
    except AuthError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    # 改密码 = 把**其他设备**全部踢下线：
    #   ① 版本号 +1 → 所有旧 token 的 ver 对不上，整体失效
    #   ② 顺手把其他会话标记撤销，设备列表里也就看不到了
    acc.token_version = int(acc.token_version or 0) + 1
    _revoke_others(db, acc, keep=ctx.jti, commit=False)
    db.commit()
    db.refresh(acc)
    # 当前这台要继续能用，所以**重新签一个**（带着新的版本号）
    return _issue(db, request, acc, settings)


# ---------------- 登录设备（多设备）----------------
@router.get('/me/sessions', response_model=list[SessionOut], summary='登录着的设备')
def list_sessions(ctx: AuthContext = Depends(get_auth_context),
                  db: Session = Depends(get_db)):
    rows = (db.query(LoginSession)
              .filter(LoginSession.account_id == ctx.account.id,
                      LoginSession.revoked_at.is_(None))
              .order_by(LoginSession.last_seen_at.desc())
              .limit(MAX_SESSIONS).all())
    out = []
    for s in rows:
        item = SessionOut.model_validate(s)
        item.current = bool(ctx.jti and s.jti == ctx.jti)
        out.append(item)
    return out


@router.post('/me/sessions/{sid}/revoke', summary='退出某一台设备')
def revoke_session(sid: int, ctx: AuthContext = Depends(get_auth_context),
                   db: Session = Depends(get_db)):
    s = (db.query(LoginSession)
           .filter(LoginSession.id == sid,
                   LoginSession.account_id == ctx.account.id).first())
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '这台设备不在你的登录列表里')
    if ctx.jti and s.jti == ctx.jti:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            '这一台就是当前设备，用"退出登录"')
    s.revoked_at = datetime.utcnow()
    db.commit()
    return {'ok': True}


@router.post('/me/sessions/revoke-others', summary='退出其他所有设备')
def revoke_others(ctx: AuthContext = Depends(get_auth_context),
                  db: Session = Depends(get_db)):
    n = _revoke_others(db, ctx.account, keep=ctx.jti, commit=True)
    return {'ok': True, 'revoked': n}


@router.post('/logout', summary='退出这一台')
def logout(ctx: AuthContext = Depends(get_auth_context),
           db: Session = Depends(get_db)):
    if ctx.jti:
        s = db.query(LoginSession).filter(LoginSession.jti == ctx.jti).first()
        if s is not None:
            s.revoked_at = datetime.utcnow()
            db.commit()
    return {'ok': True}


# ---------------- 注销账号 ----------------
@router.delete('/me', summary='注销账号（不可逆）')
def delete_me(body: PasswordConfirm, account: Account = Depends(get_current_account),
              db: Session = Depends(get_db)):
    if not verify_password(body.password, account.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, '密码不正确')
    _purge_account(db, account)
    return {'ok': True}


def _purge_account(db: Session, account: Account) -> dict:
    """把账号**连着它的狗**一起删干净。

    ⚠️ 这里不能只删 account 和 dog_profile。SQLite/PostgreSQL 都开着外键，
    下面这些表都引用 `dog_profile.id`，漏一张就 `FOREIGN KEY constraint failed`
    （第一次就是这么 500 的）：
        community_member / presence / friendship / visit /
        match_player / leaderboard_entry / training_progress / training_drop
    其中 friendship 和 visit 各有**两个**指向狗的外键，两边都要匹配。

    保留 `match` 本身：那是一局的记录，对手那边还要看（只删自己那一行座位）。
    """
    dog_ids = [d.id for d in db.query(DogProfile).filter(
        DogProfile.account_id == account.id).all()]

    counts = {'dogs': len(dog_ids)}
    if dog_ids:
        # 单外键的表：直接按 dog_id 批删
        for model in (Presence, CommunityMember, LeaderboardEntry,
                      TrainingProgress, TrainingDrop):
            n = (db.query(model)
                   .filter(model.dog_id.in_(dog_ids))
                   .delete(synchronize_session=False))
            counts[model.__tablename__] = n
        # 双外键的表：两边都要匹配
        n = (db.query(Friendship)
               .filter(Friendship.dog_a.in_(dog_ids) | Friendship.dog_b.in_(dog_ids))
               .delete(synchronize_session=False))
        counts['friendship'] = n
        n = (db.query(Visit)
               .filter(Visit.visitor_dog_id.in_(dog_ids)
                       | Visit.host_dog_id.in_(dog_ids))
               .delete(synchronize_session=False))
        counts['visit'] = n
        # match_player.dog_id 可以是 NULL（AI 座位），in_() 不会碰到那些行
        n = (db.query(MatchPlayer)
               .filter(MatchPlayer.dog_id.in_(dog_ids))
               .delete(synchronize_session=False))
        counts['match_player'] = n

    counts['login_session'] = (db.query(LoginSession)
                                 .filter(LoginSession.account_id == account.id)
                                 .delete(synchronize_session=False))
    counts['dogs_deleted'] = (db.query(DogProfile)
                                .filter(DogProfile.account_id == account.id)
                                .delete(synchronize_session=False))
    db.delete(account)
    db.commit()
    return counts


def _revoke_others(db: Session, account: Account, keep, commit=True) -> int:
    """把账号下**除 keep 之外**的会话全部标记撤销，返回条数。"""
    q = db.query(LoginSession).filter(LoginSession.account_id == account.id,
                                      LoginSession.revoked_at.is_(None))
    if keep:
        q = q.filter(LoginSession.jti != keep)
    rows = q.all()
    now = datetime.utcnow()
    for s in rows:
        s.revoked_at = now
    if commit:
        db.commit()
    return len(rows)
