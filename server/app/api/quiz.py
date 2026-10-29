# -*- coding: utf-8 -*-
"""月塔问询：出题、判分、给经验；外带**难度基准**与**同问（好友对战）**。

世界观位置：月塔不只在记档，它也**考**。小说里那只机械狗是被反复"校准"过的 ——
它会的东西不是天生，是一次次问出来的。所以这里的说法是「问询」：月塔问一句，
你答一句，答对了它记住。

规则（用户定的）：
  ① 答对给经验，**答错不惩罚** —— 不扣经验、不扣别的，只是这一题没有；
  ② 一天有上限（服务端判，和盖章/摸签一个口径）；
  ③ **智力越高，提示浮得越早** —— 提示冷却的映射在
     web/src/game/growth.js 的 hintDelayMs()，这里必须和它**同一个公式**
     （服务端要把这个时间告诉前端，前端再倒计时）。

本轮新加的两件：
  ★ **难度基准**：月塔问哪一档，由这只狗自己定（小学/初中/高中/杂问/随它）。
    为什么不按等级硬算：等级只说明养得久，不说明底子 —— 高二的人养了只一级的狗，
    照样不该被问小学题。基准是**人**定的，等级只是 auto 档的兜底。
  ★ **同问（好友对战）**：**同一道题，两个人同时答，看谁快**。一局 5 个回合，
    谁先答对谁拿这一回合；答错这一回合就被锁住（不然四个选项乱点总能蒙对）。
    **智力高的狗提示解锁得更早**（growth.js 的 duelHintMs），聪明的狗真好使。
    判分与计时全在服务端，见 ws/quiz_routes.py —— 这一页只管开房、发房间码、战绩。

为什么判分在服务端：题库里的 answer 不下发（GET 只给题干与选项），
否则打开控制台就能看答案，答对也没有意义。对战更是如此 ——
提示文本冷却没到**绝不下发**，否则"智力换先手"就成了一句空话。
"""
from __future__ import annotations

import json
import os
import random
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_current_dog, get_db
from ..models import (Breed, DogProfile, QuizAnswer, QuizDuel, QuizDuelAnswer,
                      QuizSetting)
from .tower import diary

router = APIRouter(prefix='/api/quiz', tags=['月塔问询'])

# 一天能答几题。定 10 是"够玩一会儿、但不会变成刷经验的地方"。
QUIZ_PER_DAY = 10
# 答对给多少经验，**必须和 web/src/game/growth.js 的 quizExpFor 一致**
EXP_BY_DIFF = {1: 12, 2: 18, 3: 26, 4: 36, 5: 50}
# 提示解锁时间：**必须和 growth.js 的 hintDelayMs 一致**
# （基础 40 秒、每点智力 -280ms、夹 12~40 秒；用户要求"设长一点"，
#  而且提示是**冷却结束后变得可点**，不是自动弹出来）
HINT_BASE_MS = 40000
HINT_PER_WISDOM_MS = 280
HINT_MIN_MS = 12000
HINT_MAX_MS = 40000
# 每级智力长多少（和 growth.js 的 perLevelBase + 出厂值/200 同口径，取整用）
WISDOM_PER_LEVEL = 0.65

# 同问：一局几个回合 / 一天能开几局
DUEL_SIZE = 5
DUEL_PER_DAY = 3

# ★ **对战里**提示多久解锁：必须和 web/src/game/growth.js 的 duelHintMs 一致。
#   为什么和上面那套（40 秒档）不是一份数：对战一回合只有 12 秒，
#   40 秒的冷却永远等不到，"智力换先手"就等于没有。
#   数值：基础 9 秒、每点智力 -45ms、夹 3~9 秒。
DUEL_HINT_BASE_MS = 9000
DUEL_HINT_PER_WISDOM_MS = 45
DUEL_HINT_MIN_MS = 3000
DUEL_HINT_MAX_MS = 9000


def duel_hint_ms(wisdom: float) -> int:
    v = DUEL_HINT_BASE_MS - float(wisdom or 50) * DUEL_HINT_PER_WISDOM_MS
    return int(round(max(DUEL_HINT_MIN_MS, min(DUEL_HINT_MAX_MS, v))))

# ---------------- 难度基准 ----------------
# 一档 = 一个"底子"。名字用册子里的说法（小学/初中/高中/常识/专业 → 启蒙/进阶/深水/杂问），
# 但**码是 ASCII**：它要进数据库、要出现在 URL 里，中文码迟早出编码事故。
# 题量与难度星档**从题库现算**（见 /baselines）—— 写死的话，
# 以后往题库里加题，界面上的数字就开始撒谎。
BASELINES = [
    dict(code='auto', label='随它', sub='让它照现在的等级问', stages=None,
         who='拿不定主意时就用它'),
    dict(code='primary', label='启蒙', sub='小学那几年', stages=['小学'],
         who='给还在念小学的'),
    dict(code='junior', label='进阶', sub='初中那几年', stages=['初中'],
         who='给念到初中的'),
    dict(code='senior', label='深水', sub='高中那几年', stages=['高中'],
         who='给念到高中的'),
    dict(code='mixed', label='杂问', sub='不按课本来的那些', stages=['常识', '专业'],
         who='给想被问课本之外的'),
]
BASELINE_CODES = [b['code'] for b in BASELINES]

_BANK_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data')
_BANK = None


def bank() -> list[dict]:
    """题库：把 data/questions*.json **全部**读进来合并。

    为什么要分批文件：第一批 70 题已经很长，继续往里堆会变成没法读的巨文件。
    分批之后每批一个文件，加载这边按前缀匹配，加新批次不用改代码。
    进程内缓存一次（这些是只读文件）。
    """
    global _BANK
    if _BANK is None:
        rows = []
        d = os.path.abspath(_BANK_DIR)
        for name in sorted(os.listdir(d)):
            if name.startswith('questions') and name.endswith('.json'):
                with open(os.path.join(d, name), encoding='utf-8') as f:
                    rows.extend(json.load(f).get('questions', []))
        _BANK = rows
    return _BANK


def hint_delay_ms(wisdom: float) -> int:
    v = HINT_BASE_MS - float(wisdom or 50) * HINT_PER_WISDOM_MS
    return int(round(max(HINT_MIN_MS, min(HINT_MAX_MS, v))))


def wisdom_of(db: Session, dog: DogProfile) -> float:
    """狗的智力。四维是**本地权威**，服务端只存品种与等级，
    所以这里按品种出厂值 + 等级推一个（和前端 growth.js 同一个口径）。"""
    breed = db.get(Breed, dog.breed_code) if dog.breed_code else None
    base = (breed.wisdom if breed is not None else 50) or 50
    return base + (int(dog.level or 1) - 1) * WISDOM_PER_LEVEL


def _baseline_meta(code: str) -> dict:
    return next((b for b in BASELINES if b['code'] == code), BASELINES[0])


def _pool_for(code: str, rows: list[dict]) -> list[dict]:
    """这一档的题。auto 档 = 全部（具体问什么由等级决定，见 ask）。"""
    stages = _baseline_meta(code)['stages']
    if not stages:
        return list(rows)
    p = [q for q in rows if q.get('stage') in stages]
    # 某一档万一空了，退回全部 —— 宁可问超纲的，也不能没题可问
    return p or list(rows)


def baseline_of(db: Session, dog: DogProfile) -> str:
    row = (db.query(QuizSetting)
             .filter(QuizSetting.dog_id == dog.id).first())
    code = (row.baseline if row is not None else 'auto') or 'auto'
    return code if code in BASELINE_CODES else 'auto'


def _stars(pool: list[dict]) -> str:
    """这一档的难度星档。从题里现算，不写死。"""
    ds = sorted({int(q.get('difficulty', 1)) for q in pool}) or [1]
    return '%d~%d★' % (ds[0], ds[-1]) if ds[0] != ds[-1] else '%d★' % ds[0]


def _right_today(db: Session, dog_id: int, question_id: str, today: str) -> bool:
    """今天这道题**已经答对过**吗。

    防刷必须跨两张表看：问询（quiz_answer）与同问（quiz_duel_answer）是分开存的，
    只看一边的话，一边答对、另一边再答一次就又能刷一份经验。
    答错过的题再答对**照样给**（那是真的学会了）。
    """
    a = (db.query(QuizAnswer)
           .filter(QuizAnswer.dog_id == dog_id, QuizAnswer.day == today,
                   QuizAnswer.question_id == question_id,
                   QuizAnswer.correct.is_(True)).first())
    if a is not None:
        return True
    return (db.query(QuizDuelAnswer)
              .filter(QuizDuelAnswer.dog_id == dog_id,
                      QuizDuelAnswer.question_id == question_id,
                      QuizDuelAnswer.correct.is_(True)).first()) is not None


class AnswerIn(BaseModel):
    question_id: str
    choice: int


class BaselineIn(BaseModel):
    baseline: str


class RoomIn(BaseModel):
    mode: str = 'friend'                 # friend / npc
    opponent_dog_id: int | None = None   # 指定对手（模拟体，或留给某位好友的座位）
    baseline: str | None = None          # 不填就用我的基准


def _today() -> str:
    return date.today().isoformat()


def _answered_today(db: Session, dog_id: int, today: str) -> int:
    return (db.query(QuizAnswer)
              .filter(QuizAnswer.dog_id == dog_id, QuizAnswer.day == today).count())


# ---------------- 出题 / 判分 ----------------
@router.get('/ask', summary='月塔问一句')
def ask(dog: DogProfile = Depends(get_current_dog), db: Session = Depends(get_db)):
    today = _today()
    used = _answered_today(db, dog.id, today)
    left = max(0, QUIZ_PER_DAY - used)
    wisdom = wisdom_of(db, dog)
    code = baseline_of(db, dog)
    meta = _baseline_meta(code)
    if left <= 0:
        return {'left': 0, 'hint_ms': hint_delay_ms(wisdom), 'question': None,
                'baseline': code, 'baseline_label': meta['label'],
                'text': '今天的问询用完了。明天月塔还会问。'}

    # 优先出今天没问过的；都问过就随便挑一题复习
    done = {r.question_id for r in db.query(QuizAnswer)
            .filter(QuizAnswer.dog_id == dog.id, QuizAnswer.day == today).all()}
    pool_all = _pool_for(code, bank())
    pool = [q for q in pool_all if q['id'] not in done] or pool_all
    # ★ auto 档才按等级挑难度。定了基准的人**不该再被等级覆盖** ——
    #   他明说了要哪一档，等级只说明养得久不久。
    if code == 'auto':
        lv = int(dog.level or 1)
        want = 1 if lv <= 2 else (2 if lv <= 5 else (3 if lv <= 9 else 4))
        near = [q for q in pool if abs(int(q.get('difficulty', 1)) - want) <= 1]
        pool = near or pool
    pick = random.choice(pool)

    # ⚠️ **不下发 answer**（也不下发 why，答完再给）
    return {
        'left': left,
        'hint_ms': hint_delay_ms(wisdom),
        'wisdom': round(wisdom, 1),
        'baseline': code,
        'baseline_label': meta['label'],
        'question': {k: pick[k] for k in ('id', 'stage', 'subject', 'difficulty', 'q', 'options', 'hint')},
    }


@router.post('/answer', summary='答一句')
def answer(body: AnswerIn, dog: DogProfile = Depends(get_current_dog),
           db: Session = Depends(get_db)):
    today = _today()
    used = _answered_today(db, dog.id, today)
    if used >= QUIZ_PER_DAY:
        raise HTTPException(status.HTTP_409_CONFLICT, '今天的问询用完了')

    q = next((x for x in bank() if x['id'] == body.question_id), None)
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这一题')
    if not isinstance(body.choice, int) or not (0 <= body.choice < len(q['options'])):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, '这个选项不存在')

    correct = body.choice == q['answer']
    # 答对给经验；**答错不惩罚** —— 不扣经验、不扣别的，exp 就是 0
    exp = EXP_BY_DIFF.get(int(q.get('difficulty', 1)), 12) if correct else 0
    # ★ 防刷：同一题**今天已经答对过**，再答对也不再给经验。
    #   没有这条的话，反复提交同一题的正确选项就能刷经验 ——
    #   一天 10 次的上限拦不住它（10 次全给同一题就行）。
    farmed = correct and _right_today(db, dog.id, q['id'], today)
    if farmed:
        exp = 0
    db.add(QuizAnswer(dog_id=dog.id, question_id=q['id'], correct=correct, day=today))
    if correct:
        # 和盖章一个口径：只动镜像，本地结算仍在前端 exp 引擎
        dog.total_exp = (dog.total_exp or 0) + exp
        diary(db, dog.id, 'quiz',
              f'月塔问了一道{ q["subject"] }题，答上来了。记下 {exp} 点经验。',
              subject=q['subject'], stage=q['stage'], correct=True)
    # 答错也记一行流水（用来算一天用了几次），但**不写进册子** ——
    # 册子记的是"发生过的事"，答错不算丢人，也没必要天天翻开看。
    db.commit()
    left = max(0, QUIZ_PER_DAY - (used + 1))
    return {
        'correct': correct,
        'answer': q['answer'],
        'why': q['why'],
        'exp': exp,
        'left': left,
        'text': ('这一题今天答过了 —— 换个说法也算你记得，但不再记经验。' if farmed
                 else ('答上来了。' if correct else '这回没答上来 —— 不扣什么，看下一题。')),
    }


@router.get('/state', summary='今天的问询还剩几次')
def state(dog: DogProfile = Depends(get_current_dog), db: Session = Depends(get_db)):
    today = _today()
    used = _answered_today(db, dog.id, today)
    rows = (db.query(QuizAnswer)
              .filter(QuizAnswer.dog_id == dog.id, QuizAnswer.day == today).all())
    wisdom = wisdom_of(db, dog)
    code = baseline_of(db, dog)
    return {
        'used': used, 'limit': QUIZ_PER_DAY, 'left': max(0, QUIZ_PER_DAY - used),
        'right_today': sum(1 for r in rows if r.correct),
        'hint_ms': hint_delay_ms(wisdom),
        'wisdom': round(wisdom, 1),
        'baseline': code,
        'baseline_label': _baseline_meta(code)['label'],
    }


# ---------------- 难度基准 ----------------
@router.get('/baselines', summary='月塔能拿哪几档来问')
def baselines(dog: DogProfile = Depends(get_current_dog), db: Session = Depends(get_db)):
    """每档带**真实题量**与难度星档。

    数字是给人挑档用的：题量太少的那一档（比如杂问 31 题）问几天就会绕回来，
    先看见这个数，就不会挑完才觉得"怎么老是这几道"。
    """
    cur = baseline_of(db, dog)
    rows = bank()
    out = []
    for b in BASELINES:
        pool = _pool_for(b['code'], rows)
        out.append(dict(code=b['code'], label=b['label'], sub=b['sub'],
                        who=b['who'], stages=b['stages'] or [],
                        count=len(pool), stars=_stars(pool),
                        current=(b['code'] == cur)))
    return {'current': cur, 'list': out}


@router.put('/baseline', summary='定一个基准')
def set_baseline(body: BaselineIn, dog: DogProfile = Depends(get_current_dog),
                 db: Session = Depends(get_db)):
    code = (body.baseline or '').strip()
    if code not in BASELINE_CODES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            '没有这一档（可选 %s）' % ', '.join(BASELINE_CODES))
    row = db.query(QuizSetting).filter(QuizSetting.dog_id == dog.id).first()
    if row is None:
        row = QuizSetting(dog_id=dog.id, baseline=code)
        db.add(row)
    else:
        row.baseline = code
    db.commit()
    meta = _baseline_meta(code)
    pool = _pool_for(code, bank())
    return {'ok': True, 'current': code, 'label': meta['label'],
            'count': len(pool), 'stars': _stars(pool)}


# ---------------- 同问（好友对战）：开房 / 进房 / 战绩 ----------------
# 房间码用的字母表：**去掉 I O 0 1** —— 这串码是要念给对面听的，
# "I 还是 1""O 还是 0"是必定会出的一次事故。
_ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def _new_room_code(db: Session) -> str:
    for _ in range(30):
        code = ''.join(random.choice(_ROOM_ALPHABET) for _ in range(5))
        if db.query(QuizDuel).filter(QuizDuel.room_code == code).first() is None:
            return code
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, '房间码排满了，过会儿再开')


def _duel_style(wisdom: float) -> str:
    """对手的"手感"档位。智力同时决定准头与出手快慢，所以一个词就够了。"""
    if wisdom < 40:
        return '慢吞吞'
    if wisdom < 60:
        return '一般'
    if wisdom < 80:
        return '机灵'
    return '很快'


def _foe_card(db: Session, dog: DogProfile) -> dict:
    w = wisdom_of(db, dog)
    return {'dog_id': dog.id, 'name': dog.name,
            'breed_name': (dog.breed.name if dog.breed else ''),
            'level': int(dog.level or 1), 'is_npc': bool(dog.is_npc),
            'wisdom': round(w, 1), 'style': _duel_style(w),
            # 提示冷却也一起给：前端**不自己算**这个数（同一条口径只留一处），
            # 而且"它 4.8 秒就能看提示"本来就是挑对手时要看的
            'hint_ms': duel_hint_ms(w)}


def _duel_view(db: Session, duel: QuizDuel) -> dict:
    """一局的基本信息（给开房/进房/战绩共用；具体对局过程在 WS 里）。"""
    ch = db.get(DogProfile, duel.challenger_dog_id)
    op = db.get(DogProfile, duel.opponent_dog_id) if duel.opponent_dog_id else None
    return {
        'id': duel.id, 'room': duel.room_code, 'mode': duel.mode,
        'status': duel.status, 'size': int(duel.size or DUEL_SIZE),
        'baseline': duel.baseline,
        'baseline_label': _baseline_meta(duel.baseline)['label'],
        'challenger': _foe_card(db, ch) if ch else None,
        'opponent': _foe_card(db, op) if op else None,
        'result': duel.result or None,
        'at': duel.created_at.isoformat() if duel.created_at else None,
    }


@router.get('/duel/opponents', summary='能找谁对一局')
def duel_opponents(dog: DogProfile = Depends(get_current_dog), db: Session = Depends(get_db),
                   limit: int = Query(default=8, ge=1, le=20)):
    """两栏：**模拟体**（点一下就能开打）与**真人**（开了房等他拿码进来）。

    模拟体这一栏把智力与手感亮出来 —— 挑一只脑子好使的就是挑难度。
    """
    npcs = (db.query(DogProfile)
              .filter(DogProfile.is_npc.is_(True), DogProfile.id != dog.id)
              .order_by(DogProfile.id.asc()).limit(limit * 3).all())
    # 挑出**智力拉开档**的几只：不然一列全是"一般"，挑难度这件事就没意义
    npcs = sorted(npcs, key=lambda d: wisdom_of(db, d))
    picked = []
    if npcs:
        step = max(1, len(npcs) // limit)
        picked = npcs[::step][:limit]
    friends = (db.query(DogProfile)
                 .filter(DogProfile.is_npc.is_(False), DogProfile.id != dog.id)
                 .order_by(DogProfile.id.desc()).limit(limit).all())
    invites = (db.query(QuizDuel)
                 .filter(QuizDuel.opponent_dog_id == dog.id,
                         QuizDuel.status == 'waiting')
                 .order_by(QuizDuel.id.desc()).limit(5).all())
    return {'npc': [_foe_card(db, d) for d in picked],
            'friends': [_foe_card(db, d) for d in friends],
            'invites': [_duel_view(db, x) for x in invites],
            # 我自己那张卡也带上：页面要显示"你的提示几秒解锁"
            'me': _foe_card(db, dog),
            'size': DUEL_SIZE}


@router.post('/duel/room', summary='开一间房等人（或直接和模拟体开打）')
def create_room(body: RoomIn, dog: DogProfile = Depends(get_current_dog),
                db: Session = Depends(get_db)):
    mode = (body.mode or 'friend').strip()
    if mode not in ('friend', 'npc'):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, '只有 friend / npc 两种')
    code = (body.baseline or '').strip() or baseline_of(db, dog)
    if code not in BASELINE_CODES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, '没有这一档')

    foe = None
    if body.opponent_dog_id:
        foe = db.get(DogProfile, body.opponent_dog_id)
        if foe is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这只狗')
        if foe.id == dog.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, '不能找自己对')
        if mode == 'npc' and not foe.is_npc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, '那不是模拟体')
    elif mode == 'npc':
        pool = (db.query(DogProfile).filter(DogProfile.is_npc.is_(True),
                                            DogProfile.id != dog.id).all())
        if not pool:
            raise HTTPException(status.HTTP_409_CONFLICT, '现在没有能对上的模拟体')
        foe = random.choice(pool)

    today = _today()
    used = (db.query(QuizDuel)
              .filter(QuizDuel.challenger_dog_id == dog.id, QuizDuel.day == today)
              .count())
    if used >= DUEL_PER_DAY:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            '今天开的局已经够多了（一天 %d 局）' % DUEL_PER_DAY)

    duel = QuizDuel(room_code=_new_room_code(db), mode=mode, status='waiting',
                    baseline=code, size=DUEL_SIZE, challenger_dog_id=dog.id,
                    opponent_dog_id=(foe.id if foe is not None else None),
                    day=today)
    db.add(duel)
    db.commit()
    db.refresh(duel)
    view = _duel_view(db, duel)
    view['my_side'] = 0
    view['size'] = DUEL_SIZE
    view['ws'] = '/ws/quiz/%s' % duel.room_code
    view['left'] = max(0, DUEL_PER_DAY - (used + 1))
    return view


@router.post('/duel/room/{room_code}/join', summary='拿房间码进房')
def join_room(room_code: str, dog: DogProfile = Depends(get_current_dog),
              db: Session = Depends(get_db)):
    code = (room_code or '').strip().upper()
    duel = db.query(QuizDuel).filter(QuizDuel.room_code == code).first()
    if duel is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这个房间，码对不对？')
    # ⚠️ 判据是"**位子还空着吗**"，不是"这局还没开始吗"。
    #    开房的人一连上 WS，服务端就认为这局在进行中（他要占着位子等对面）——
    #    原来这里写的是 `status != 'waiting'` 就拒，于是**对面永远进不来**
    #    （开房的人先连上 → 状态变 playing → 好友拿码进来被拒 409）。
    if duel.status in ('done', 'aborted'):
        raise HTTPException(status.HTTP_409_CONFLICT, '这一局已经打完了')
    if duel.challenger_dog_id == dog.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, '这是你自己开的房')
    if duel.opponent_dog_id and duel.opponent_dog_id != dog.id:
        raise HTTPException(status.HTTP_409_CONFLICT, '这间房是留给别人的')
    duel.opponent_dog_id = dog.id
    db.commit()
    db.refresh(duel)
    view = _duel_view(db, duel)
    view['my_side'] = 1
    view['ws'] = '/ws/quiz/%s' % duel.room_code
    return view


@router.get('/duel/room/{room_code}', summary='看看这间房')
def room_info(room_code: str, dog: DogProfile = Depends(get_current_dog),
              db: Session = Depends(get_db)):
    code = (room_code or '').strip().upper()
    duel = db.query(QuizDuel).filter(QuizDuel.room_code == code).first()
    if duel is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这个房间，码对不对？')
    view = _duel_view(db, duel)
    view['my_side'] = (0 if duel.challenger_dog_id == dog.id
                       else (1 if duel.opponent_dog_id == dog.id else None))
    view['ws'] = '/ws/quiz/%s' % duel.room_code
    return view


@router.get('/duel/record', summary='我的同问战绩')
def duel_record(dog: DogProfile = Depends(get_current_dog), db: Session = Depends(get_db),
                limit: int = Query(default=10, ge=1, le=40)):
    rows = (db.query(QuizDuel)
              .filter(QuizDuel.status == 'done',
                      (QuizDuel.challenger_dog_id == dog.id)
                      | (QuizDuel.opponent_dog_id == dog.id))
              .order_by(QuizDuel.id.desc()).limit(limit).all())
    wins = losses = draws = 0
    recent = []
    for x in rows:
        r = x.result or {}
        mine = int(r.get('score', {}).get(str(dog.id), 0))
        foe_id = (x.opponent_dog_id if x.challenger_dog_id == dog.id
                  else x.challenger_dog_id)
        theirs = int(r.get('score', {}).get(str(foe_id), 0))
        wid = int(r.get('winner_dog_id') or 0)
        if not wid:
            draws += 1
            verdict = 'draw'
        elif wid == dog.id:
            wins += 1
            verdict = 'win'
        else:
            losses += 1
            verdict = 'lose'
        foe = db.get(DogProfile, foe_id) if foe_id else None
        recent.append({'id': x.id, 'room': x.room_code, 'verdict': verdict,
                       'mine': mine, 'theirs': theirs, 'size': int(x.size or DUEL_SIZE),
                       'mode': x.mode, 'baseline_label':
                           _baseline_meta(x.baseline)['label'],
                       'foe': _foe_card(db, foe) if foe else None,
                       'at': (x.finished_at or x.created_at).isoformat()
                             if (x.finished_at or x.created_at) else None})
    used = (db.query(QuizDuel)
              .filter(QuizDuel.challenger_dog_id == dog.id, QuizDuel.day == _today())
              .count())
    return {'wins': wins, 'losses': losses, 'draws': draws, 'recent': recent,
            'opened_today': used, 'limit': DUEL_PER_DAY,
            'left': max(0, DUEL_PER_DAY - used), 'size': DUEL_SIZE}


@router.get('/duel/{duel_id}', summary='看一局的过程')
def duel_detail(duel_id: int, dog: DogProfile = Depends(get_current_dog),
                db: Session = Depends(get_db)):
    duel = db.get(QuizDuel, duel_id)
    if duel is None or dog.id not in (duel.challenger_dog_id, duel.opponent_dog_id or 0):
        raise HTTPException(status.HTTP_404_NOT_FOUND, '没有这一局')
    view = _duel_view(db, duel)
    qmap = {q['id']: q for q in bank()}
    view['rounds'] = [
        {**r, 'q': (qmap.get(r.get('question_id')) or {}).get('q', ''),
         'options': (qmap.get(r.get('question_id')) or {}).get('options', [])}
        for r in (duel.rounds or [])]
    return view
