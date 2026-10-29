"""品种：图鉴列表与详情（注册领养页要用）。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..deps import get_db
from ..models import Breed, DogProfile
from ..schemas import BreedOut, BreedStats

router = APIRouter(prefix='/api/breeds', tags=['品种'])


def to_out(b: Breed, owned: int = 0) -> BreedOut:
    return BreedOut(
        code=b.code, name=b.name, subtitle=b.subtitle or '',
        stats=BreedStats(power=b.power, agility=b.agility, wisdom=b.wisdom,
                         affinity=b.affinity),
        asset_pack=b.asset_pack or f'breeds/{b.code}', palette=b.palette or {},
        description=b.description or '')


@router.get('', response_model=list[BreedOut], summary='品种图鉴')
def list_breeds(db: Session = Depends(get_db)):
    rows = db.query(Breed).order_by(Breed.sort_order, Breed.code).all()
    return [to_out(b) for b in rows]


@router.get('/{code}', response_model=BreedOut, summary='品种详情')
def get_breed(code: str, db: Session = Depends(get_db)):
    b = db.get(Breed, code)
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'没有这个品种：{code}')
    return to_out(b)


@router.get('/{code}/population', summary='该品种在社群里的数量（图鉴页展示用）')
def population(code: str, db: Session = Depends(get_db)):
    if db.get(Breed, code) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'没有这个品种：{code}')
    n = db.query(DogProfile).filter(DogProfile.breed_code == code).count()
    return {'breed_code': code, 'population': n}
