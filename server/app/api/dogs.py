"""狗狗档案：领养 / 我的狗 / 档案卡 / 镜像上报。

领养是最关键的一步——它一次性完成四件事：
  1. 建档（名字 + 品种）
  2. **自动加入公开社群**
  3. 建立开放世界在线状态（默认落在广场）
  4. 建立排行榜条目（等级/对战/社交三个榜）
这和需求里"注册机械狗账户时加入公开社群"完全对应。
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import world
from ..deps import get_current_account, get_current_dog, get_db
from ..models import (Account, Breed, CommunityMember, DogProfile,
                      LeaderboardEntry, Presence, Visit)
from ..schemas import (AdoptRequest, BreedStats, CommunityOut, DogCardOut,
                       DogOut, DogUpdateRequest)
from ..seeds import public_community

router = APIRouter(prefix='/api/dogs', tags=['狗狗档案'])

MAX_DOGS_PER_ACCOUNT = 3


def dog_out(dog: DogProfile, breed: Breed | None = None) -> DogOut:
    b = breed or dog.breed
    return DogOut(id=dog.id, name=dog.name, breed_code=dog.breed_code,
                  breed_name=b.name if b else '', level=dog.level,
                  total_exp=dog.total_exp, personality=dog.personality,
                  motto=dog.motto or '', appearance=dog.appearance or {},
                  achievements=list(dog.achievements or []))


@router.post('/adopt', response_model=DogCardOut,
             status_code=status.HTTP_201_CREATED, summary='领养机械狗并加入公开社群')
def adopt(body: AdoptRequest, account: Account = Depends(get_current_account),
          db: Session = Depends(get_db)):
    n = db.query(DogProfile).filter(DogProfile.account_id == account.id).count()
    if n >= MAX_DOGS_PER_ACCOUNT:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f'一个账号最多领养 {MAX_DOGS_PER_ACCOUNT} 只机械狗')
    breed = db.get(Breed, body.breed_code)
    if breed is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            f'没有这个品种：{body.breed_code}')
    dog = DogProfile(account_id=account.id, name=body.name.strip(),
                     breed_code=breed.code, motto=body.motto or '',
                     appearance={'palette': breed.palette or {}})
    db.add(dog)
    db.flush()                                  # 拿到 dog.id

    # 2) 自动加入公开社群
    comm = public_community(db)
    if comm is not None:
        db.add(CommunityMember(community_id=comm.id, dog_id=dog.id))
    # 3) 开放世界在线状态：新领养的狗出现在**广场出生点**
    #    （v1 这里用的是 position_for 的哈希位置，那时场地只有 1000×1000；
    #     v2 场地是 2200×1700 且位置由客户端权威，服务端不该再编一个位置出来）
    sx, sy = world.SCENES['plaza']['spawn']
    db.add(Presence(dog_id=dog.id, scene='plaza', x=int(sx), y=int(sy),
                    status='idle', bubble=world.bubble_for(dog.id, breed.code)))
    # 4) 排行榜条目
    for kind in ('level', 'match', 'social'):
        db.add(LeaderboardEntry(kind=kind, dog_id=dog.id, score=0))
    db.commit()
    db.refresh(dog)
    return build_card(db, dog, viewer=account)


@router.get('/mine', response_model=list[DogOut], summary='我的机械狗')
def my_dogs(account: Account = Depends(get_current_account),
            db: Session = Depends(get_db)):
    rows = (db.query(DogProfile).filter(DogProfile.account_id == account.id)
              .order_by(DogProfile.id).all())
    return [dog_out(d) for d in rows]


@router.patch('/mine', response_model=DogOut, summary='上报镜像数据（狗本体调用）')
def update_mine(body: DogUpdateRequest, dog: DogProfile = Depends(get_current_dog),
                db: Session = Depends(get_db)):
    """狗本体把本地权威数据镜像到云端，供社群/排行展示。

    注意方向：**只上行、不下行**。云端不反向下发等级/经验，避免和本地权威打架。
    """
    if body.level is not None:
        dog.level = body.level
    if body.total_exp is not None:
        dog.total_exp = body.total_exp
    if body.personality is not None:
        dog.personality = body.personality
    if body.appearance is not None:
        dog.appearance = body.appearance
    if body.achievements is not None:
        dog.achievements = list(body.achievements)
    if body.motto is not None:
        dog.motto = body.motto
    # 同步等级榜
    entry = (db.query(LeaderboardEntry)
               .filter(LeaderboardEntry.kind == 'level',
                       LeaderboardEntry.dog_id == dog.id).first())
    if entry is not None:
        entry.score = dog.level
    db.commit()
    db.refresh(dog)
    return dog_out(dog)


@router.get('/{dog_id}/card', response_model=DogCardOut, summary='狗狗档案卡（羊皮纸档案页）')
def card(dog_id: int, db: Session = Depends(get_db),
         account: Account = Depends(get_current_account)):
    dog = db.get(DogProfile, dog_id)
    if dog is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这只狗')
    return build_card(db, dog, viewer=account)


def build_card(db: Session, dog: DogProfile, viewer: Account | None = None) -> DogCardOut:
    breed = dog.breed
    owner = db.get(Account, dog.account_id)
    member = (db.query(CommunityMember)
                .filter(CommunityMember.dog_id == dog.id).first())
    comm = None
    social_level, friendship = 1, 0
    if member is not None:
        social_level = member.social_level
        friendship = member.friendship_points
        c = member.community_id
        from ..models import Community
        community = db.get(Community, c)
        if community is not None:
            count = (db.query(CommunityMember)
                       .filter(CommunityMember.community_id == c).count())
            comm = CommunityOut(id=community.id, code=community.code,
                                name=community.name, kind=community.kind,
                                description=community.description or '',
                                member_count=count)
    visits = db.query(Visit).filter(Visit.host_dog_id == dog.id).count()
    stats = None
    if breed is not None:
        stats = BreedStats(power=breed.power, agility=breed.agility,
                           wisdom=breed.wisdom, affinity=breed.affinity)
    return DogCardOut(dog=dog_out(dog, breed), owner=owner.username if owner else '',
                      community=comm, social_level=social_level,
                      friendship_points=friendship, visits_received=visits,
                      achievements=list(dog.achievements or []), stats=stats)


@router.delete('/{dog_id}', status_code=status.HTTP_204_NO_CONTENT, summary='送走（删除）')
def remove(dog_id: int, account: Account = Depends(get_current_account),
           db: Session = Depends(get_db)):
    dog = db.get(DogProfile, dog_id)
    if dog is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这只狗')
    if dog.account_id != account.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, '只能送走自己的狗')
    db.query(CommunityMember).filter(CommunityMember.dog_id == dog.id).delete()
    db.query(Presence).filter(Presence.dog_id == dog.id).delete()
    db.query(LeaderboardEntry).filter(LeaderboardEntry.dog_id == dog.id).delete()
    db.delete(dog)
    db.commit()
