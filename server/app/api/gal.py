# -*- coding: utf-8 -*-
"""剧情模式（gal）的存档同步。

用户要的是"**同账号下**存档同步"：换个设备、换个浏览器，只要登录的是同一个账号，
翻开册子就该接着上次读。

分工：
  · 存档的**物理位置**是浏览器的 IndexedDB（AVGPlus 引擎自己管的，
    库名 `AVGPLUS_ENGINE_COMMON_DB__g-v1-<hash>`，表 `AVGPLUS_ENGINE_ARCHIVE_DATA_TABLE`）；
  · 服务端这里只做**中转站**：整份 JSON 存下来、按账号取回去。
    **不解释**里面的结构 —— 那是引擎的格式，拆字段等于替别人做主，
    引擎一升级就全坏。

为什么要整份覆盖：同步的粒度本来就是"整份存档"，冲突时也只需要整份覆盖。
`saved_at` 是存档里引擎自己记的时间戳，用来判断哪边更新（前端传上来，
服务端不做解析，只在返回时带回去让前端比）。
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_current_account, get_db
from ..models import Account, GalSave

router = APIRouter(prefix='/api/gal', tags=['剧情模式'])


class SaveIn(BaseModel):
    # 存档本体：引擎那一整块 JSON，服务端不拆
    data: dict
    slot: str = 'main'
    saved_at: str = ''


def _out(row: GalSave | None) -> dict:
    if row is None:
        return {'exists': False, 'data': None, 'slot': 'main', 'saved_at': '',
                'updated_at': ''}
    return {
        'exists': True,
        'data': row.data or {},
        'slot': row.slot,
        'saved_at': row.saved_at or '',
        'updated_at': row.updated_at.isoformat() if row.updated_at else '',
    }


@router.get('/save', summary='取回这个账号的剧情存档')
def get_save(slot: str = 'main', account: Account = Depends(get_current_account),
             db: Session = Depends(get_db)):
    row = (db.query(GalSave)
             .filter(GalSave.account_id == account.id, GalSave.slot == slot).first())
    return _out(row)


@router.put('/save', summary='把这个账号的剧情存档存上来')
def put_save(body: SaveIn, account: Account = Depends(get_current_account),
             db: Session = Depends(get_db)):
    row = (db.query(GalSave)
             .filter(GalSave.account_id == account.id, GalSave.slot == body.slot).first())
    if row is None:
        row = GalSave(account_id=account.id, slot=body.slot)
        db.add(row)
    row.data = body.data or {}
    row.saved_at = (body.saved_at or '')[:40]
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {'ok': True, 'slot': row.slot,
            'updated_at': row.updated_at.isoformat() if row.updated_at else '',
            'bytes': len(str(row.data or {}))}


@router.delete('/save', summary='清掉这个账号的剧情存档')
def del_save(slot: str = 'main', account: Account = Depends(get_current_account),
             db: Session = Depends(get_db)):
    n = (db.query(GalSave)
           .filter(GalSave.account_id == account.id, GalSave.slot == slot)
           .delete(synchronize_session=False))
    db.commit()
    return {'ok': True, 'deleted': n}
