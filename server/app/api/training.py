"""剧情关卡（「档案册」训练记录）：进度、掉落、通关榜。

边界说清楚（沿用"养成本地权威"的划分）：

  客户端负责          服务端负责
  ────────────────    ────────────────────────────
  关卡怎么打          首通奖励只能领一次（防刷）
  本地算经验/成长      进度与掉落流水落库
  算星级              通关榜（最快用时 / 最高星级）

关卡**内容**（关卡表）不在服务端：它在 web/src/game/levels.js。
理由和"服务端不跑对战模拟"是同一个——多一份数据就多一处会不一致。
服务端只认识 level_code 这个字符串，以及在 seed 表里登记一份关卡元信息用于校验。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..deps import get_current_dog, get_db
# 册子上的日记（动作点直接调，和 tower.py 里那套是一份）
from .tower import diary
from ..models import DogProfile, TrainingDrop, TrainingProgress
from ..schemas import TrainingClearRequest, TrainingLevelOut, TrainingBoardRow

router = APIRouter(prefix='/api/training', tags=['剧情关卡'])

# 关卡元信息（只用于**校验 level_code 合法**与给榜单配名字）。
# 真正的关卡数据在前端，这里刻意只放最小的一份，避免两边各写一套数值。
LEVELS = {
    'L1': {'name': '第一关 · 客厅沦陷', 'boss': '暴走的扫地机器人', 'rec_level': 1},
    'L2': {'name': '第二关 · 巷口的头目', 'boss': '邻居家的恶犬', 'rec_level': 5},
    'L3': {'name': '第三关 · 天台快递', 'boss': '失控的快递无人机', 'rec_level': 9},
    'L4': {'name': '第四关 · 毛线雪崩', 'boss': '巨型毛线球', 'rec_level': 14},
}

MAX_STARS = 3
# 用时下限：比这还快的上报一定不正常（第一关最快也要十来秒），
# 挡一下"直接上报 ticks=1 刷榜"
MIN_TICKS = {'L1': 240, 'L2': 300, 'L3': 330, 'L4': 360}


def _progress_row(db: Session, dog_id: int, code: str) -> TrainingProgress | None:
    return (db.query(TrainingProgress)
              .filter(TrainingProgress.dog_id == dog_id,
                      TrainingProgress.level_code == code).first())


@router.get('/levels', response_model=list[TrainingLevelOut], summary='关卡列表（含我的进度）')
def levels(dog: DogProfile = Depends(get_current_dog), db: Session = Depends(get_db)):
    rows = {p.level_code: p for p in
            db.query(TrainingProgress).filter(TrainingProgress.dog_id == dog.id).all()}
    out = []
    for code, meta in LEVELS.items():
        p = rows.get(code)
        out.append(TrainingLevelOut(
            code=code, name=meta['name'], boss=meta['boss'],
            rec_level=meta['rec_level'], max_stars=MAX_STARS,
            cleared=bool(p and p.cleared),
            stars=int(p.stars) if p else 0,
            best_ticks=int(p.best_ticks) if p else 0,
            attempts=int(p.attempts) if p else 0,
        ))
    return out


@router.post('/clear', summary='上报通关（首通给大奖，重复给少量经验）')
def clear(body: TrainingClearRequest,
          dog: DogProfile = Depends(get_current_dog),
          db: Session = Depends(get_db)):
    code = (body.level_code or '').upper()
    if code not in LEVELS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'没有这一关：{body.level_code}')

    ticks = max(0, int(body.ticks or 0))
    if ticks < MIN_TICKS.get(code, 240):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f'用时 {ticks} 帧快得不正常，这一关不可能这么快')
    stars = max(0, min(MAX_STARS, int(body.stars or 1)))

    row = _progress_row(db, dog.id, code)
    first = row is None or not row.cleared
    if row is None:
        row = TrainingProgress(dog_id=dog.id, level_code=code, attempts=0)
        db.add(row)
        db.flush()
    row.attempts = int(row.attempts or 0) + 1

    if first:
        row.cleared = True
        row.stars = stars
        row.best_ticks = ticks
        row.first_clear_at = datetime.utcnow()
        exp = 120 if code == 'L1' else (220 if code == 'L2' else (320 if code == 'L3' else 460))
        item = {'L1': '尘埃齿轮', 'L2': '磨牙绳结',
                'L3': '螺旋桨叶', 'L4': '褪色的毛线'}[code]
    else:
        # 重复通关：只更新"更好的成绩"，奖励走少量经验
        if stars > int(row.stars or 0):
            row.stars = stars
        if ticks and (not row.best_ticks or ticks < row.best_ticks):
            row.best_ticks = ticks
        exp = 25 if code == 'L1' else (40 if code == 'L2' else (55 if code == 'L3' else 70))
        item = ''

    db.add(TrainingDrop(dog_id=dog.id, level_code=code, item=item, exp=exp,
                        first_clear=first))
    # 册子上记一行：首通与重复通关的说法不一样（首通才是"翻过去了一页"）
    _name = {'L1': '第一关 · 客厅沦陷', 'L2': '第二关 · 巷口的头目',
             'L3': '第三关 · 天台快递', 'L4': '第四关 · 毛线雪崩'}.get(code, code)
    diary(db, dog.id, 'training',
          (f'{_name}翻过去了，册子上多了一页。这一关记下 {exp} 点经验。'
           if first else f'又打了一遍{_name}。这次是 {stars} 星。'),
          level=code, first=bool(first), stars=stars, exp=exp)
    db.commit()
    db.refresh(row)

    return {
        'level_code': code, 'first_clear': bool(first),
        # 经验由**本地** exp_engine 结算，这里只是"该给多少"的权威数字
        'exp': exp, 'item': item,
        'best_stars': int(row.stars or 0), 'best_ticks': int(row.best_ticks or 0),
        'attempts': int(row.attempts or 0),
    }


@router.get('/board', summary='通关榜（最快 / 最高星级）')
def board(level: str = Query(default='L1'),
          limit: int = Query(default=20, ge=1, le=100),
          db: Session = Depends(get_db)):
    code = (level or '').upper()
    if code not in LEVELS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'没有这一关：{level}')
    rows = (db.query(TrainingProgress, DogProfile)
              .join(DogProfile, DogProfile.id == TrainingProgress.dog_id)
              .filter(TrainingProgress.level_code == code,
                      TrainingProgress.cleared.is_(True))
              .order_by(TrainingProgress.stars.desc(),
                        TrainingProgress.best_ticks.asc())
              .limit(limit).all())
    return [TrainingBoardRow(
        rank=i + 1, dog_id=dog.id, dog_name=dog.name, breed_code=dog.breed_code,
        level=int(dog.level or 1), stars=int(p.stars or 0),
        ticks=int(p.best_ticks or 0),
        seconds=round(int(p.best_ticks or 0) / 30.0, 1),
    ) for i, (p, dog) in enumerate(rows)]


@router.get('/drops', summary='我的掉落流水')
def drops(limit: int = Query(default=30, ge=1, le=200),
          dog: DogProfile = Depends(get_current_dog), db: Session = Depends(get_db)):
    rows = (db.query(TrainingDrop)
              .filter(TrainingDrop.dog_id == dog.id)
              .order_by(TrainingDrop.id.desc()).limit(limit).all())
    return [{'level_code': r.level_code, 'item': r.item, 'exp': r.exp,
             'first_clear': bool(r.first_clear),
             'at': r.created_at.isoformat() if r.created_at else ''} for r in rows]
