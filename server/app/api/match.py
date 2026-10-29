"""对战：撮合 / 房间 / 结果结算 / 奖励领取。

奖励设计（对齐"养成数据以狗本地为权威"的边界）：
  服务端**不直接改**狗的等级经验，只把本局应得经验记在 `match.pending_exp`；
  狗本体联网时调 `/api/match/{code}/claim` 领取，再由**本地** exp_engine 结算
  （因此周上限、衰减、成就这些规则仍然只有一份实现）。
"""
import random
import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..deps import (get_current_account, get_current_dog, get_db,
                    get_optional_account)
from ..models import Account, DogProfile, LeaderboardEntry, Match, MatchPlayer
# 册子上的日记：各动作点直接调（对战结算 / 训练通关 / 串门 / 盖章 / 摸签）
from .tower import diary
from ..schemas import (MatchCreateRequest, MatchOut, MatchPlayerOut,
                       MatchResultRequest)

router = APIRouter(prefix='/api/match', tags=['对战'])

MODE_AI = 'ai'
MODE_SHADOW = 'shadow'
MODE_PVP = 'pvp'
MODES = (MODE_AI, MODE_SHADOW, MODE_PVP)

WIN_EXP = 60          # 胜
DRAW_EXP = 35         # 平
LOSE_EXP = 20         # 负（参与就有，避免"打不过就不打"）
MAX_PENDING_EXP = 200 # 单局上限，防止异常数据刷经验

MATCH_WIN_SCORE = 3   # 对战榜：胜 +3 / 平 +1


def new_room_code():
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(6))


def match_out(db: Session, m: Match) -> MatchOut:
    rows = (db.query(MatchPlayer).filter(MatchPlayer.match_id == m.id)
              .order_by(MatchPlayer.side).all())
    players = [MatchPlayerOut(side=p.side, dog_id=p.dog_id,
                              display_name=p.display_name, score=p.score,
                              is_ai=p.is_ai) for p in rows]
    return MatchOut(id=m.id, room_code=m.room_code, mode=m.mode, status=m.status,
                    seed=m.seed, frames=m.frames or 0, result=m.result or {},
                    pending_exp=m.pending_exp or 0, players=players)


def _display(db: Session, dog_id):
    if dog_id is None:
        return 'AI 对手'
    dog = db.get(DogProfile, dog_id)
    return dog.name if dog else f'狗#{dog_id}'


@router.post('', response_model=MatchOut, status_code=status.HTTP_201_CREATED,
             summary='开一局（ai / shadow / pvp）')
def create(body: MatchCreateRequest, dog: DogProfile = Depends(get_current_dog),
           db: Session = Depends(get_db)):
    if body.mode not in MODES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f'mode 只能是 {MODES}')
    seed = random.randint(1, 2 ** 31 - 1)
    m = Match(room_code=new_room_code(), mode=body.mode,
              status='waiting' if body.mode == MODE_PVP else 'playing',
              seed=seed, input_log=[])
    db.add(m)
    db.flush()

    db.add(MatchPlayer(match_id=m.id, dog_id=dog.id, side=0,
                       display_name=dog.name, is_ai=False))
    if body.mode == MODE_AI:
        db.add(MatchPlayer(match_id=m.id, dog_id=None, side=1,
                           display_name='AI 陪练', is_ai=True))
    elif body.mode == MODE_SHADOW:
        foe = None
        if body.opponent_dog_id is not None:
            foe = db.get(DogProfile, body.opponent_dog_id)
            if foe is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这只对手狗')
        else:                                  # 没指定就随机抓一只（影子对战）
            foe = (db.query(DogProfile)
                     .filter(DogProfile.id != dog.id)
                     .order_by(DogProfile.id).first())
        if foe is None:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                '社群里还没有别的狗可以打，先等等或换 AI 模式')
        db.add(MatchPlayer(match_id=m.id, dog_id=foe.id, side=1,
                           display_name=foe.name, is_ai=False))
        m.result = {'shadow_of': foe.id, 'shadow_level': foe.level}
    else:                                       # pvp：等第二个真人进来
        db.add(MatchPlayer(match_id=m.id, side=1, display_name='等待对手',
                           is_ai=False))
    db.commit()
    db.refresh(m)
    return match_out(db, m)


@router.get('/{room_code}', response_model=MatchOut, summary='查询对局')
def get_match(room_code: str, db: Session = Depends(get_db)):
    m = db.query(Match).filter(Match.room_code == room_code.upper()).first()
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这个房间')
    return match_out(db, m)


@router.post('/{room_code}/result', response_model=MatchOut, summary='上报并结算本局')
def report(room_code: str, body: MatchResultRequest,
           dog: DogProfile = Depends(get_current_dog), db: Session = Depends(get_db)):
    m = db.query(Match).filter(Match.room_code == room_code.upper()).first()
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这个房间')
    if m.status == 'done':
        return match_out(db, m)                  # 幂等：重复上报不重复发奖

    players = (db.query(MatchPlayer).filter(MatchPlayer.match_id == m.id)
                 .order_by(MatchPlayer.side).all())
    for p, sc in zip(players, body.scores or []):
        p.score = int(sc)

    winner = body.winner_side
    if winner is None and len(players) == 2 and players[0].score != players[1].score:
        winner = 0 if players[0].score > players[1].score else 1

    my_side = next((p.side for p in players if p.dog_id == dog.id), 0)
    if winner is None:
        reward = DRAW_EXP
        verdict = 'draw'
    elif winner == my_side:
        reward = WIN_EXP
        verdict = 'win'
    else:
        reward = LOSE_EXP
        verdict = 'lose'

    m.frames = body.frames
    m.status = 'done'
    m.finished_at = __import__('datetime').datetime.utcnow()
    m.pending_exp = min(MAX_PENDING_EXP, max(0, reward))
    m.result = {**(m.result or {}), 'verdict': verdict, 'winner_side': winner,
                'duration_ms': body.duration_ms,
                'scores': [p.score for p in players]}

    # 对战榜：胜 +3 / 平 +1（只给真人计分）
    mine = next((p for p in players if p.side == my_side), None)
    if mine is not None and mine.dog_id is not None:
        entry = (db.query(LeaderboardEntry)
                   .filter(LeaderboardEntry.kind == 'match',
                           LeaderboardEntry.dog_id == mine.dog_id).first())
        if entry is None:
            entry = LeaderboardEntry(kind='match', dog_id=mine.dog_id, score=0)
            db.add(entry)
        if verdict == 'win':
            entry.score += MATCH_WIN_SCORE
            entry.wins += 1
        elif verdict == 'draw':
            entry.score += 1
        else:
            entry.losses += 1
    db.commit()
    db.refresh(m)
    return match_out(db, m)


@router.post('/{room_code}/claim', summary='领取本局奖励（狗本体调用，本地结算）')
def claim(room_code: str, dog: DogProfile = Depends(get_current_dog),
          db: Session = Depends(get_db)):
    m = db.query(Match).filter(Match.room_code == room_code.upper()).first()
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这个房间')
    if m.status != 'done':
        raise HTTPException(status.HTTP_409_CONFLICT, '这一局还没结束')
    me = (db.query(MatchPlayer)
            .filter(MatchPlayer.match_id == m.id, MatchPlayer.dog_id == dog.id).first())
    if me is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, '你不在这局里')
    if me.claimed:
        return {'ok': True, 'exp': 0, 'already_claimed': True,
                'note': '本局奖励已领取过'}
    me.claimed = True
    exp = int(m.pending_exp or 0)
    # 册子上记一行：只有真的打过这一局才有（不做每日任务那套，只有发生过的事）
    verdict = (m.result or {}).get('verdict')
    word = {'win': '赢', 'lose': '输', 'draw': '平'}.get(verdict, '打完')
    diary(db, dog.id, 'battle',
          f'在月光竞技场打了一局，{word}了。这一局记下 {exp} 点经验。',
          room=m.room_code, verdict=verdict, exp=exp)
    db.commit()
    return {'ok': True, 'exp': exp, 'already_claimed': False,
            'verdict': verdict,
            'note': '请由狗本体本地 exp_engine 结算（周上限/衰减规则只在本地一份）'}


@router.get('/{room_code}/replay', summary='取回放用的输入日志')
def replay(room_code: str, db: Session = Depends(get_db),
           limit: int = Query(default=5000, ge=1, le=50000)):
    m = db.query(Match).filter(Match.room_code == room_code.upper()).first()
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这个房间')
    log = (m.input_log or [])[:limit]
    return {'room_code': m.room_code, 'seed': m.seed, 'frames': m.frames,
            'mode': m.mode, 'result': m.result or {}, 'inputs': log,
            'note': '把 inputs 与 seed 交给客户端同一个确定性模拟，即可复现整局'}


@router.get('/{room_code}/reward', summary='查询待领取奖励')
def reward(room_code: str, db: Session = Depends(get_db)):
    m = db.query(Match).filter(Match.room_code == room_code.upper()).first()
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这个房间')
    return {'room_code': m.room_code, 'status': m.status,
            'pending_exp': m.pending_exp or 0}
