"""社群与开放世界：成员、场景、在场、串门。

开放世界的位置由 `app/world.py` 确定性生成；这里只负责"谁在场、在哪、在干嘛"。
NPC 狗（预置演示数据）在每次读取世界时被惰性刷新到当前时间片的位置，
所以广场看起来一直是活的，而服务端不需要后台任务。
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import world
from ..deps import (get_current_account, get_current_dog, get_db,
                    get_optional_account)
from ..models import (Account, Breed, Community, CommunityMember, DogProfile,
                      Friendship, LeaderboardEntry, Presence, Visit)
from ..schemas import (CommunityOut, MemberOut, MoveRequest, PresenceOut,
                       VisitRequest)
from ..seeds import public_community
# 册子上的日记（动作点直接调，和 tower.py 里那套是一份）
from .tower import diary

router = APIRouter(prefix='/api', tags=['社群与开放世界'])

ONLINE_WINDOW = timedelta(minutes=10)


def _online(p: Presence | None) -> bool:
    if p is None:
        return False
    return (datetime.utcnow() - p.last_seen) <= ONLINE_WINDOW


def refresh_npc_presence(db: Session, scene: str | None = None):
    """把 NPC 狗刷到当前时间片（廉价：只改内存 + 一次提交）。"""
    q = (db.query(Presence, DogProfile)
           .join(DogProfile, DogProfile.id == Presence.dog_id)
           .filter(DogProfile.is_npc.is_(True)))
    if scene:
        q = q.filter(Presence.scene == scene)
    changed = 0
    for p, dog in q.all():
        x, y = world.position_for(dog.id, scene=p.scene)
        if (p.x, p.y) != (x, y):
            p.x, p.y = x, y
            p.status = world.status_for(dog.id)
            p.bubble = world.bubble_for(dog.id, dog.breed_code)
            changed += 1
    if changed:
        db.commit()
    return changed


# ---------------- 社群 ----------------
@router.get('/community/public', response_model=CommunityOut, summary='公开社群信息')
def community_public(db: Session = Depends(get_db)):
    c = public_community(db)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '公开社群尚未初始化')
    count = db.query(CommunityMember).filter(
        CommunityMember.community_id == c.id).count()
    # ★ 真正的"在场"：10 分钟内有心跳的 + NPC（NPC 永远算在场，见 _online 的调用处）。
    #   ⚠️ 原来接口只返回 member_count，前端拿它配了「在场」这个标签 ——
    #      于是"登记在册 272 只"被显示成"在场 272 只"。数字没错，**语义错了**。
    #      用户看到的第一反应就是"这个依据是什么"，问得对。
    online = 0
    # ⚠️ `db.query(CommunityMember)` 返回的是**单个对象**，不是元组 ——
    #    我第一版写成 `for (m,) in ...`，运行期直接
    #    `TypeError: cannot unpack non-iterable CommunityMember object`，
    #    接口 500，首页/档案卡的社群那块整块挂住（用户那边看到的就是"炸了"）。
    #    只有 query 多个实体（query(A, B)）时才是元组。
    for m in (db.query(CommunityMember)
                .filter(CommunityMember.community_id == c.id).all()):
        p = db.get(Presence, m.dog_id)
        dog = db.get(DogProfile, m.dog_id)
        if p is not None and (_online(p) or bool(dog and dog.is_npc)):
            online += 1
    return CommunityOut(id=c.id, code=c.code, name=c.name, kind=c.kind,
                        description=c.description or '', member_count=count,
                        online_count=online)


@router.get('/community/members', response_model=list[MemberOut],
            summary='社群成员（按社交等级/友谊值排序）')
def members(limit: int = Query(default=50, ge=1, le=200),
            db: Session = Depends(get_db)):
    c = public_community(db)
    if c is None:
        return []
    rows = (db.query(CommunityMember, DogProfile)
              .join(DogProfile, DogProfile.id == CommunityMember.dog_id)
              .filter(CommunityMember.community_id == c.id)
              .order_by(CommunityMember.social_level.desc(),
                        CommunityMember.friendship_points.desc(),
                        DogProfile.id.asc())
              .limit(limit).all())
    out = []
    for m, dog in rows:
        p = db.get(Presence, dog.id)
        out.append(MemberOut(dog_id=dog.id, dog_name=dog.name,
                             breed_code=dog.breed_code,
                             breed_name=dog.breed.name if dog.breed else '',
                             level=dog.level, social_level=m.social_level,
                             friendship_points=m.friendship_points,
                             online=_online(p) or bool(dog.is_npc)))
    return out


@router.get('/community/scenes', summary='开放世界场景列表')
def scenes():
    return [dict(code=code, **info) for code, info in world.SCENES.items()]


# ---------------- 开放世界 ----------------
@router.get('/world', response_model=list[PresenceOut], summary='场景里的狗（含位置）')
def world_view(scene: str = Query(default='plaza'),
               limit: int = Query(default=40, ge=1, le=100),
               db: Session = Depends(get_db)):
    if scene not in world.SCENES:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            f'没有这个场景：{scene}（可选 {sorted(world.SCENES)}）')
    refresh_npc_presence(db, scene)
    rows = (db.query(Presence, DogProfile)
              .join(DogProfile, DogProfile.id == Presence.dog_id)
              .filter(Presence.scene == scene)
              .order_by(Presence.last_seen.desc())
              .limit(limit).all())
    out = []
    for p, dog in rows:
        if dog.is_npc:
            x, y = world.position_for(dog.id, scene=scene)
        else:
            x, y = p.x, p.y
        out.append(PresenceOut(dog_id=dog.id, dog_name=dog.name,
                               breed_code=dog.breed_code,
                               breed_name=dog.breed.name if dog.breed else '',
                               level=dog.level, scene=p.scene, x=x, y=y,
                               status=p.status or 'idle', bubble=p.bubble or ''))
    return out


@router.post('/world/move', response_model=PresenceOut, summary='更新我的位置/状态')
def move(body: MoveRequest, dog: DogProfile = Depends(get_current_dog),
         db: Session = Depends(get_db)):
    p = db.get(Presence, dog.id)
    if p is None:
        p = Presence(dog_id=dog.id)
        db.add(p)
    if body.scene is not None:
        if body.scene not in world.SCENES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f'没有这个场景：{body.scene}')
        p.scene = body.scene
    if body.x is not None:
        p.x = body.x
    if body.y is not None:
        p.y = body.y
    if body.status is not None:
        p.status = body.status
    if body.bubble is not None:
        p.bubble = body.bubble
    p.last_seen = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return PresenceOut(dog_id=dog.id, dog_name=dog.name,
                       breed_code=dog.breed_code,
                       breed_name=dog.breed.name if dog.breed else '',
                       level=dog.level, scene=p.scene, x=p.x, y=p.y,
                       status=p.status or 'idle', bubble=p.bubble or '')


# ---------------- 串门与互赠 ----------------
@router.post('/community/visit/{dog_id}', summary='去串门')
def visit(dog_id: int, body: VisitRequest = VisitRequest(),
          dog: DogProfile = Depends(get_current_dog),
          db: Session = Depends(get_db)):
    if dog_id == dog.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, '不用串自己家的门')
    host = db.get(DogProfile, dog_id)
    if host is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这只狗')
    db.add(Visit(visitor_dog_id=dog.id, host_dog_id=host.id,
                 message=body.message or ''))
    # 册子上记一行：串门是"真实发生过的事"，去的人那边记一笔
    diary(db, dog.id, 'visit',
          '去了「%s」家串门。%s' % (host.name,
                                    ('留了句话：' + body.message) if body.message else ''),
          host=host.name)
    # 串门加友谊值（单向：谁主动谁涨），并同步社交榜
    a, b = sorted((dog.id, host.id))
    fr = (db.query(Friendship)
            .filter(Friendship.dog_a == a, Friendship.dog_b == b).first())
    if fr is None:
        fr = Friendship(dog_a=a, dog_b=b, points=0)
        db.add(fr)
    # ★ 串门收益按**亲和**分档（原来是写死的 `+= 1` —— 亲和这个属性
    # 在社群里一次都没被用过，而 seeds.py 的注释里明明写着"亲和影响互动收益"）。
    # 口径和前端 src/game/growth.js 一致：亲和 50 是基准。
    # 亲和 ≤ 50 → 1 点
    # 51~70     → 2 点
    # 71~90     → 3 点
    # 91+       → 4 点
    # 为什么用分档而不是连续小数：友谊值是**给玩家看的整数**，
    # 分档好解释（"它亲和高，串一次门顶别人两次"），也不会出现 1.37 这种数。
    #
    # 智力在社群这边**目前没有落点** —— 种子注释里写的"智力影响答题类互动"
    # 对应的答题功能**还没做**（/community/* 下只有串门与位置）。
    # 这里不编一个假用途；等答题做出来再接。
    affinity = getattr(dog, 'affinity', None)
    if affinity is None:
        # 服务端不存四维（它们是本地权威），按品种出厂值算一次
        breed = db.get(Breed, dog.breed_code) if dog.breed_code else None
        affinity = (breed.affinity if breed is not None else 50) or 50
    level = int(dog.level or 1)
    # 等级让亲和长大一点（同一套成长口径：每级 +0.65 左右，这里取整用）
    affinity = affinity + (level - 1) * 0.65
    gain = 1 + (max(0, int(affinity) - 50) // 20)

    fr.points += gain
    mine = (db.query(CommunityMember)
              .filter(CommunityMember.dog_id == dog.id).first())
    if mine is not None:
        mine.friendship_points += gain
        mine.social_level = 1 + mine.friendship_points // 10
    entry = (db.query(LeaderboardEntry)
               .filter(LeaderboardEntry.kind == 'social',
                       LeaderboardEntry.dog_id == dog.id).first())
    if entry is not None:
        entry.score = mine.friendship_points if mine is not None else entry.score
    db.commit()
    return {'ok': True, 'host': host.name, 'friendship_points':
            mine.friendship_points if mine is not None else None,
            'visited_count': db.query(Visit)
                               .filter(Visit.host_dog_id == host.id).count()}


@router.get('/community/visits', summary='我的狗窝来过谁')
def visits(dog: DogProfile = Depends(get_current_dog), db: Session = Depends(get_db),
           limit: int = Query(default=20, ge=1, le=100)):
    rows = (db.query(Visit)
              .filter(Visit.host_dog_id == dog.id)
              .order_by(Visit.created_at.desc()).limit(limit).all())
    out = []
    for v in rows:
        visitor = db.get(DogProfile, v.visitor_dog_id)
        out.append({'visitor': visitor.name if visitor else '?',
                    'visitor_dog_id': v.visitor_dog_id,
                    'message': v.message or '',
                    'at': v.created_at.isoformat() if v.created_at else None})
    return out
