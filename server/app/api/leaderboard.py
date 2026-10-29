"""排行榜：等级榜 / 对战榜 / 社交榜（统一组件，对齐参考站做法）。"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..deps import get_db, get_optional_account
from ..models import Account, DogProfile, LeaderboardEntry
from ..schemas import LeaderboardOut, LeaderboardRow

router = APIRouter(prefix='/api/leaderboard', tags=['排行榜'])

KINDS = ('level', 'match', 'social')
KIND_LABEL = {'level': '等级榜', 'match': '对战榜', 'social': '社交榜'}


def _rows(db: Session, kind: str, limit: int, my_dog_id=None):
    q = (db.query(LeaderboardEntry, DogProfile)
           .join(DogProfile, DogProfile.id == LeaderboardEntry.dog_id)
           .filter(LeaderboardEntry.kind == kind)
           .order_by(LeaderboardEntry.score.desc(),
                     LeaderboardEntry.updated_at.asc(),
                     DogProfile.id.asc())
           .limit(limit))
    out = []
    for rank, (e, dog) in enumerate(q.all(), start=1):
        out.append(LeaderboardRow(
            rank=rank, dog_id=dog.id, dog_name=dog.name,
            breed_code=dog.breed_code,
            breed_name=dog.breed.name if dog.breed else '',
            level=dog.level, score=e.score or 0, wins=e.wins or 0,
            losses=e.losses or 0, is_me=(dog.id == my_dog_id)))
    return out


@router.get('', response_model=LeaderboardOut, summary='排行榜')
def leaderboard(kind: str = Query(default='level'),
                limit: int = Query(default=20, ge=1, le=100),
                db: Session = Depends(get_db),
                account: Account | None = Depends(get_optional_account)):
    if kind not in KINDS:
        kind = 'level'
    my_dog_id = None
    if account is not None:
        dog = (db.query(DogProfile)
                 .filter(DogProfile.account_id == account.id)
                 .order_by(DogProfile.id).first())
        my_dog_id = dog.id if dog else None
    rows = _rows(db, kind, limit, my_dog_id)
    me = next((r for r in rows if r.is_me), None)
    if me is None and my_dog_id is not None:
        # 没进前 N 也要能看到自己排第几
        entry = (db.query(LeaderboardEntry)
                   .filter(LeaderboardEntry.kind == kind,
                           LeaderboardEntry.dog_id == my_dog_id).first())
        if entry is not None:
            better = (db.query(LeaderboardEntry)
                        .filter(LeaderboardEntry.kind == kind,
                                LeaderboardEntry.score > (entry.score or 0))
                        .count())
            dog = db.get(DogProfile, my_dog_id)
            me = LeaderboardRow(rank=better + 1, dog_id=dog.id, dog_name=dog.name,
                                breed_code=dog.breed_code,
                                breed_name=dog.breed.name if dog.breed else '',
                                level=dog.level, score=entry.score or 0,
                                wins=entry.wins or 0, losses=entry.losses or 0,
                                is_me=True)
    return LeaderboardOut(kind=kind, rows=rows, me=me)


@router.get('/kinds', summary='榜单种类')
def kinds():
    return [{'kind': k, 'label': KIND_LABEL[k]} for k in KINDS]
