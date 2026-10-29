# -*- coding: utf-8 -*-
"""月塔端口：签到 / 抽签 / 册子上的日记。

世界观位置：这三件事都属于"月塔"——那座吞吐整座城市数据的主机（小说序章）。
它给每个记录员开了一个端口：每天在册子上按一个印（签到）、摸一次签（抽签）、
翻自己那本册子上的日记（由真实行为写成的）。

为什么在服务端：
  · 签到与抽签要**全局计时 + 防刷**（一天一次、保底计数）——
    交给客户端等于把日历交出去，改个系统时间就能无限签；
  · 日记是"本地权威、上行镜像"（见 models.py 开头的分工），
    这里存镜像，让网页端和游戏里看到同一份。

文案铁律（见 剧本/UI文案对照.md）：
  · 不用"玩家"，用"你"；不出现"道具 / 掉落 / 获得 / 选择"；
  · 服务器一律叫"月塔"，不出现"系统 / 后台"这类词；
  · 不做每日任务、不做签到奖励的成就口吻 —— 按印就是按印，是记录，不是打卡。
"""
from __future__ import annotations

import random
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..deps import get_current_dog, get_db
from ..models import Checkin, DiaryEntry, DogProfile, LotteryDraw

router = APIRouter(prefix='/api/tower', tags=['月塔端口'])

# ---------------- 数值（都在这里，方便以后调） ----------------

# 抽签奖池。**概率写在明面上**（用户要求：抽奖要有概率与保底说明）。
# 命名沿用训练关掉落那一族（尘埃齿轮 / 磨牙绳结 / 螺旋桨叶 / 褪色的毛线），
# 免得冒出一批和世界无关的新名词。
PRIZE_POOL = [
    dict(code='gear_dust', name='尘埃齿轮', rarity='common', weight=46),
    dict(code='rope_knot', name='磨牙绳结', rarity='common', weight=30),
    dict(code='old_cloth', name='旧布片', rarity='common', weight=14),
    dict(code='propeller', name='螺旋桨叶', rarity='rare', weight=7),
    dict(code='faded_yarn', name='褪色的毛线', rarity='rare', weight=3),
]
PITY_AT = 10          # 十抽之内必出一件 rare（保底）
DRAW_PER_DAY = 1      # 一天一次，不卖次数
CHECKIN_EXP = 20      # 盖章给的经验（和本地 exp 引擎一致：走 dog.total_exp 的镜像）

COMMON = [p for p in PRIZE_POOL if p['rarity'] == 'common']
RARE = [p for p in PRIZE_POOL if p['rarity'] == 'rare']


def _today() -> str:
    return date.today().isoformat()


def _weighted_common() -> dict:
    total = sum(p['weight'] for p in COMMON)
    r = random.uniform(0, total)
    acc = 0.0
    for p in COMMON:
        acc += p['weight']
        if r <= acc:
            return p
    return COMMON[-1]


def diary(db: Session, dog_id: int, kind: str, text: str, **extra) -> DiaryEntry:
    """记一行日记。各动作点直接调它（对战结算 / 通关 / 串门 / 盖章 / 抽签）。"""
    row = DiaryEntry(dog_id=dog_id, kind=kind, text=text[:200], extra=extra or {})
    db.add(row)
    return row


def _streak_of(db: Session, dog_id: int, today: str) -> tuple[int, bool]:
    """返回（连续天数, 今天是否已盖章）。"""
    rows = (db.query(Checkin).filter(Checkin.dog_id == dog_id)
              .order_by(Checkin.day.desc()).limit(2).all())
    if not rows:
        return 0, False
    if rows[0].day == today:
        return rows[0].streak, True
    y = (date.today() - timedelta(days=1)).isoformat()
    if rows[0].day == y:
        return rows[0].streak, False
    return 0, False      # 断签：今天重新开始数


@router.get('/panel', summary='月塔端口的状态：盖章 / 抽签 / 日记')
def panel(limit: int = Query(12, ge=1, le=50),
          dog: DogProfile = Depends(get_current_dog),
          db: Session = Depends(get_db)):
    today = _today()
    streak, done_today = _streak_of(db, dog.id, today)

    last = (db.query(LotteryDraw).filter(LotteryDraw.dog_id == dog.id)
              .order_by(LotteryDraw.id.desc()).first())
    drawn_today = bool(last and last.day == today)
    # 保底进度：上一抽之后 `pity` 就是"还差几抽必出"
    pity_left = PITY_AT - (last.pity if last else PITY_AT)
    if last is None:
        pity_left = PITY_AT

    entries = (db.query(DiaryEntry).filter(DiaryEntry.dog_id == dog.id)
                 .order_by(DiaryEntry.created_at.desc(), DiaryEntry.id.desc())
                 .limit(limit).all())

    return {
        'checkin': {'done': done_today, 'streak': streak, 'day': today},
        'draw': {
            'left': 0 if drawn_today else DRAW_PER_DAY,
            'pity_left': max(0, pity_left),
            'pity_at': PITY_AT,
            'pool': [{'name': p['name'], 'rarity': p['rarity'], 'weight': p['weight']}
                     for p in PRIZE_POOL],
        },
        'diary': [{'at': e.created_at.strftime('%m-%d %H:%M'), 'kind': e.kind,
                   'text': e.text} for e in entries],
        'level': dog.level,
        'total_exp': dog.total_exp,
    }


@router.post('/checkin', summary='在册子上按一个印')
def do_checkin(dog: DogProfile = Depends(get_current_dog),
               db: Session = Depends(get_db)):
    today = _today()
    if db.query(Checkin).filter(Checkin.dog_id == dog.id, Checkin.day == today).first():
        raise HTTPException(status.HTTP_409_CONFLICT, '今天已经按过了')
    streak, _ = _streak_of(db, dog.id, today)
    streak += 1
    db.add(Checkin(dog_id=dog.id, day=today, streak=streak))
    # 盖章也给经验：由本地结算，这里只动镜像（和 PATCH /api/dogs/mine 一个口径）
    dog.total_exp = (dog.total_exp or 0) + CHECKIN_EXP
    diary(db, dog.id, 'checkin', f'在册子上按了第 {streak} 个印', streak=streak)
    db.commit()
    return {'ok': True, 'streak': streak, 'exp': CHECKIN_EXP,
            'text': f'按下了今天的印。连着第 {streak} 天。'}


@router.post('/draw', summary='摸一次签')
def do_draw(dog: DogProfile = Depends(get_current_dog),
            db: Session = Depends(get_db)):
    today = _today()
    last = (db.query(LotteryDraw).filter(LotteryDraw.dog_id == dog.id)
              .order_by(LotteryDraw.id.desc()).first())
    if last and last.day == today:
        raise HTTPException(status.HTTP_409_CONFLICT, '今天已经摸过了')

    # 保底：距离上次出 rare 已经摸了几次
    since_rare = 0 if last is None else last.pity
    from_pity = since_rare + 1 >= PITY_AT
    if from_pity:
        prize = random.choice(RARE)
    else:
        # 稀有按权重自然出（合计 10% 上下），否则出常见
        rare_weight = sum(p['weight'] for p in RARE)
        total = rare_weight + sum(p['weight'] for p in COMMON)
        prize = random.choice(RARE) if random.uniform(0, total) <= rare_weight \
            else _weighted_common()

    pity = 0 if prize['rarity'] == 'rare' else since_rare + 1
    db.add(LotteryDraw(dog_id=dog.id, day=today, prize_code=prize['code'],
                       rarity=prize['rarity'], pity=pity, from_pity=from_pity))
    suffix = '（这一签是攒够了的）' if from_pity else ''
    diary(db, dog.id, 'draw', f'摸出一件：{prize["name"]}{suffix}', prize=prize['code'])
    db.commit()
    return {'ok': True, 'prize': prize, 'from_pity': from_pity,
            'pity_left': max(0, PITY_AT - pity),
            'text': f'签上写着：{prize["name"]}{suffix}'}


@router.get('/diary', summary='翻册子上的日记')
def read_diary(limit: int = Query(30, ge=1, le=100),
               dog: DogProfile = Depends(get_current_dog),
               db: Session = Depends(get_db)):
    rows = (db.query(DiaryEntry).filter(DiaryEntry.dog_id == dog.id)
              .order_by(DiaryEntry.created_at.desc(), DiaryEntry.id.desc())
              .limit(limit).all())
    return [{'at': e.created_at.strftime('%m-%d %H:%M'), 'kind': e.kind,
             'text': e.text, 'extra': e.extra or {}} for e in rows]
