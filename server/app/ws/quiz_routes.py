# -*- coding: utf-8 -*-
"""同问（好友对战）的 WebSocket：**同一道题，两个人同时答，看谁快**。

和 `/ws/match` 那套锁步对战**不是一回事**，所以单独一个模块：

  · 锁步那边服务端只转发，模拟在客户端跑；
  · 同问这边**服务端是权威** —— 因为要判的东西恰好是"谁先到"：
      谁先答对、这一回合归谁、提示什么时候能看，全在这里算。
      交给客户端判的话，"我比他快"就成了客户端说了算。

一回合的过程：
    双方同时收到同一道题（不含答案、不含提示）
      → 各自可以答一次（答错**这一回合就锁住**，不然四个选项乱点总能蒙对）
      → 第一个答对的人拿下这一回合，回合立刻结束
      → 限时内没人答对（或两边都答错）→ 这一回合空着
      → 停 2.2 秒让人看清解析，再进下一回合
    一局 5 个回合，拿下的多的人赢。

★ **智力 → 提示解锁得早**（growth.js 的 duelHintMs，这里必须同一份数值）：
    智力 50 → 6.75 秒   智力 95（边牧）→ 4.73 秒   智力 140+ → 3 秒（下限）
  一回合 12 秒，所以聪明的狗能早两秒看见提示 —— 这两秒就是它的先手。
  提示文本**冷却没到绝不下发**：客户端说"我到了"不算数（改了前端就能提前看，
  那"智力换先手"就成了一句空话）。

模拟体对手：不用等人，发起方一进房它就开始答。它的**出手快慢与准头也看智力** ——
这补上了 community.py 里那句留白（"智力影响答题类互动"，当时答题还没做）。
"""
from __future__ import annotations

import asyncio
import random
import time
from datetime import date, datetime

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..api.quiz import (DUEL_HINT_MAX_MS, DUEL_HINT_MIN_MS, DUEL_SIZE, EXP_BY_DIFF,
                        _baseline_meta, _pool_for, bank, duel_hint_ms, wisdom_of)
from ..models import DogProfile, QuizDuel, QuizDuelAnswer, QuizAnswer
from ..security import AuthError, account_id_from_token

router = APIRouter(tags=['同问'])

# 一回合的限时与回合之间的停留（毫秒）
ROUND_MS = 12000
REVEAL_MS = 2200

# ★ "对战里提示多久解锁"的实现在 api/quiz.py（duel_hint_ms），因为**开房接口也要用它**
#   （对手卡上要写"它几秒能看提示"）。那边是唯一实现，这里只做引用，
#   免得两份公式各走各的 —— 数值本身又必须和 growth.js 的 duelHintMs 一致。
_ = (DUEL_HINT_MIN_MS, DUEL_HINT_MAX_MS)      # 留住导入，读的人知道这两个界也在那边

# 模拟体出手时刻：越快说明它越"聪明"（也要看题目难度，难题想得久一点）
NPC_BASE_MS = 5200
NPC_PER_WISDOM_MS = 35
NPC_PER_DIFF_MS = 260
NPC_MIN_MS = 1500
NPC_MAX_MS = 11000
NPC_JITTER_MS = 700

# 打完的房留多久再从内存里清掉（客户端可能还在读结果）
ROOM_TTL_S = 180


def npc_accuracy(wisdom: float) -> float:
    """模拟体的准头。智力 50 → 六成；95 → 八成二；下限四成（别让它显得在送）。"""
    return max(0.4, min(0.9, 0.35 + float(wisdom or 50) / 200.0))


def npc_answer_ms(wisdom: float, difficulty: int) -> int:
    v = (NPC_BASE_MS - float(wisdom or 50) * NPC_PER_WISDOM_MS
         + int(difficulty or 1) * NPC_PER_DIFF_MS
         + random.randint(-NPC_JITTER_MS, NPC_JITTER_MS))
    return int(max(NPC_MIN_MS, min(NPC_MAX_MS, v)))


def _right_today_excl(db, dog_id: int, qid: str, today: str, duel_id: int) -> bool:
    """今天这道题是不是已经答对过了（**不算这一局自己的流水**）。"""
    a = (db.query(QuizAnswer)
           .filter(QuizAnswer.dog_id == dog_id, QuizAnswer.day == today,
                   QuizAnswer.question_id == qid, QuizAnswer.correct.is_(True))
           .first())
    if a is not None:
        return True
    return (db.query(QuizDuelAnswer)
              .filter(QuizDuelAnswer.dog_id == dog_id,
                      QuizDuelAnswer.question_id == qid,
                      QuizDuelAnswer.correct.is_(True),
                      QuizDuelAnswer.duel_id != duel_id).first()) is not None


class QuizRoom:
    """一间同问房（内存态 + 结束时落库）。"""

    def __init__(self, code, factory, duel_id, size, baseline, seats, wisdoms,
                 names, levels, breeds, mode, npc_side=None):
        self.code = code
        self.factory = factory
        self.duel_id = duel_id
        self.size = int(size or DUEL_SIZE)
        self.baseline = baseline
        self.seats = dict(seats)          # side -> dog_id
        self.wisdoms = dict(wisdoms)      # side -> 智力
        self.names = dict(names)
        self.levels = dict(levels)
        self.breeds = dict(breeds)
        self.mode = mode
        self.npc_side = npc_side          # 模拟体坐哪一边（没有就是 None）
        self.sockets = {0: None, 1: None}

        self.i = -1                       # 当前回合下标
        self.q = None                     # 当前题
        self.used_ids = []                # 这一局问过的题（避免同一局重复问）
        self.answers = {}                 # side -> {'choice','correct','ms'}
        self.locked = set()               # 这一回合答错、锁住的 side
        self.hinted = set()
        self.scores = {0: 0, 1: 0}
        self.exp = {0: 0, 1: 0}
        self.rounds = []
        self.round_start = 0.0
        self.round_closed = True
        self.round_winner = None
        self.round_done = asyncio.Event()
        self.started = False
        self.over = False
        self.tasks = []
        self.lock = asyncio.Lock()
        self.created_at = time.time()

    # ---------- 发消息 ----------
    async def _send(self, side, payload):
        ws = self.sockets.get(side)
        if ws is None:
            return False
        try:
            await ws.send_json(payload)
            return True
        except Exception:      # noqa: BLE001  对端断了就算了
            return False

    async def _broadcast(self, payload, except_side=None):
        for s in (0, 1):
            if s != except_side:
                await self._send(s, payload)

    def _cancel_tasks(self):
        """掐掉这一回合挂着的定时任务。

        ⚠️ **不能取消"当前正在跑的这个 task"** —— 超时那条路是
           `_round_timeout` → `_close_round` → `_cancel_tasks`，
           把自己取消掉的话，取消会在 `_close_round` 里下一个 await 点生效，
           `round_end` 广播直接被掐断：**没人答的回合会把对局挂死**
           （两端都在等一个永远不来的回合结算）。
        """
        cur = asyncio.current_task()
        for t in self.tasks:
            if t is not None and t is not cur and not t.done():
                t.cancel()
        self.tasks = []

    # ---------- 进房 ----------
    async def attach(self, side, ws):
        async with self.lock:
            self.sockets[side] = ws
            await self._send(side, self._welcome(side))
            await self._send(1 - side, {'type': 'peer_joined', 'side': side,
                                        'name': self.names.get(side, ''),
                                        'foe': self._card(side)})
            # 一回合正打到一半时重连：把当前这一回合补给它（别让它对着空屏）
            if self.started and not self.over and not self.round_closed and self.q:
                left = max(400, int(ROUND_MS - (time.monotonic() - self.round_start) * 1000))
                await self._send(side, self._round_msg(side, left))
                if side in self.answers:
                    a = self.answers[side]
                    await self._send(side, {'type': 'took', 'side': side,
                                            'name': self.names.get(side, ''),
                                            'correct': a['correct'], 'ms': a['ms']})
            ready = (self.sockets[0] is not None and self.sockets[1] is not None) \
                if self.mode == 'friend' else (self.sockets[0] is not None)
            if ready and not self.started:
                self.started = True
                self._mark('playing')
                asyncio.create_task(self._run_match())

    def _mark(self, status):
        """把这一局的状态写回库里。

        ⚠️ "playing" 要等到**真的开局**（两边都进房了）才写。
           原来是在 WS 一连上就写，结果开房的人先连上 → 状态变 playing →
           好友拿码进来被 join 接口拒掉，两个人永远凑不齐。
        """
        db = self.factory()
        try:
            duel = db.get(QuizDuel, self.duel_id)
            if duel is not None and duel.status not in ('done', 'aborted'):
                duel.status = status
                db.commit()
        except Exception as e:            # noqa: BLE001
            print('[quiz-duel] 状态没写进去：%s' % e)
            db.rollback()
        finally:
            db.close()

    def _card(self, side) -> dict:
        w = float(self.wisdoms.get(side) or 50)
        return {'side': side, 'dog_id': self.seats.get(side) or 0,
                'name': self.names.get(side, ''), 'level': self.levels.get(side, 1),
                'breed_name': self.breeds.get(side, ''), 'is_npc': side == self.npc_side,
                'wisdom': round(w, 1), 'hint_ms': duel_hint_ms(w)}

    def _welcome(self, side) -> dict:
        return {'type': 'welcome', 'room': self.code, 'side': side, 'size': self.size,
                'baseline': self.baseline,
                'baseline_label': _baseline_meta(self.baseline)['label'],
                'mode': self.mode, 'started': self.started,
                'you': self._card(side), 'foe': self._card(1 - side),
                'scores': {str(k): v for k, v in self.scores.items()},
                'round_ms': ROUND_MS}

    # ---------- 一局 ----------
    async def _run_match(self):
        await self._broadcast({'type': 'go', 'size': self.size,
                               'scores': {str(k): v for k, v in self.scores.items()}})
        for i in range(self.size):
            if self.over:
                return
            # ⚠️ 等的是"**这一回合真的收尾了**"，不是睡满"限时 + 停留"。
            #    原来写成 `sleep(ROUND_MS + REVEAL_MS)`，于是抢答快的回合
            #    （3 秒就结束）也要再干等 11 秒才进下一题 —— 玩起来就是卡住。
            self.round_done = asyncio.Event()
            await self._begin_round(i)
            try:
                await asyncio.wait_for(self.round_done.wait(), timeout=ROUND_MS / 1000.0 + 3)
            except asyncio.TimeoutError:      # noqa: PERF203  兜底，正常不会走到
                pass
            await asyncio.sleep(REVEAL_MS / 1000.0)
        await self._finish()

    def _pick_question(self):
        pool = _pool_for(self.baseline, bank())
        left = [q for q in pool if q['id'] not in self.used_ids]
        pick = random.choice(left or pool)
        self.used_ids.append(pick['id'])
        return pick

    async def _begin_round(self, i):
        async with self.lock:
            if self.over:
                return
            self.i = i
            self.q = self._pick_question()
            self.answers = {}
            self.locked = set()
            self.hinted = set()
            self.round_closed = False
            self.round_start = time.monotonic()
            for s in (0, 1):
                await self._send(s, self._round_msg(s, ROUND_MS))
            self._cancel_tasks()
            self.tasks.append(asyncio.create_task(self._round_timeout(i)))
            if self.npc_side is not None:
                delay = npc_answer_ms(self.wisdoms.get(self.npc_side, 50),
                                      self.q.get('difficulty', 1))
                self.tasks.append(asyncio.create_task(self._npc_turn(i, delay)))

    def _round_msg(self, side, ms_left: int) -> dict:
        q = self.q or {}
        return {'type': 'round', 'i': self.i, 'total': self.size,
                'question': {k: q[k] for k in ('id', 'stage', 'subject', 'difficulty',
                                               'q', 'options')},
                'ms_left': ms_left,
                # 这一回合**你**的提示什么时候解锁（按你自己的智力算）
                'hint_ms': duel_hint_ms(self.wisdoms.get(side, 50)),
                'scores': {str(k): v for k, v in self.scores.items()},
                'you': self._card(side), 'foe': self._card(1 - side)}

    async def _round_timeout(self, i):
        try:
            await asyncio.sleep(ROUND_MS / 1000.0)
        except asyncio.CancelledError:
            return
        async with self.lock:
            if self.over or self.round_closed or self.i != i:
                return
            await self._close_round(None)

    async def _npc_turn(self, i, delay_ms):
        try:
            await asyncio.sleep(delay_ms / 1000.0)
        except asyncio.CancelledError:
            return
        side = self.npc_side
        async with self.lock:
            if (self.over or self.round_closed or self.i != i or side is None
                    or side in self.locked or side in self.answers):
                return
            if random.random() < npc_accuracy(self.wisdoms.get(side, 50)):
                choice = int(self.q['answer'])
            else:
                wrongs = [k for k in range(len(self.q['options']))
                          if k != int(self.q['answer'])]
                choice = random.choice(wrongs) if wrongs else int(self.q['answer'])
        # 交给和真人完全同一条路（判分、锁住、结束回合都在 _submit 里）
        await self.submit(side, i, choice, npc=True)

    # ---------- 作答 ----------
    async def submit(self, side, i, choice, npc=False):
        async with self.lock:
            if self.over or self.round_closed or self.q is None:
                # 回合已经收尾了：如果是被对面抢下的，就把话说清楚 ——
                # "慢了一步"比"这一回合已经过去了"有用得多（用户玩的时候想知道自己输在哪）
                if (self.round_closed and self.round_winner is not None
                        and self.round_winner != side):
                    await self._send(side, {'type': 'late', 'i': i,
                                            'text': '慢了一步 —— 这一回合归对面了。'})
                else:
                    await self._send(side, {'type': 'late', 'i': i,
                                            'text': '这一回合已经过去了。'})
                return
            if i != self.i:
                await self._send(side, {'type': 'late', 'i': i,
                                        'text': '这是上一回合的答案，不算。'})
                return
            if side in self.answers or side in self.locked:
                await self._send(side, {'type': 'late', 'i': i,
                                        'text': '这一回合你已经答过了。'})
                return
            ms = int((time.monotonic() - self.round_start) * 1000)
            q = self.q
            correct = int(choice) == int(q['answer'])
            self.answers[side] = {'choice': int(choice), 'correct': correct, 'ms': ms}
            exp = self._record(side, q, int(choice), correct, ms)
            self.exp[side] += exp
            await self._broadcast({'type': 'took', 'side': side, 'i': i,
                                   'name': self.names.get(side, ''),
                                   'correct': correct, 'ms': ms})
            if exp:
                await self._send(side, {'type': 'my_exp', 'exp': exp,
                                        'total': self.exp[side]})
            if correct:
                await self._close_round(side)
            else:
                self.locked.add(side)
                # 两边都答错了 → 这一回合空着，别干等到超时
                if len(self.locked) >= 2:
                    await self._close_round(None)

    def _record(self, side, q, choice, correct, ms) -> int:
        """落一行流水并算经验。**经验的口径和问询一样**：答对给、答错不给。"""
        dog_id = self.seats.get(side)
        if not dog_id or side == self.npc_side:
            return 0                      # 模拟体不记流水、不给经验
        exp = EXP_BY_DIFF.get(int(q.get('difficulty', 1)), 12) if correct else 0
        db = self.factory()
        try:
            today = date.today().isoformat()
            if correct and _right_today_excl(db, dog_id, q['id'], today, self.duel_id):
                exp = 0                   # 今天这题已经答对过，不再记第二遍
            db.add(QuizDuelAnswer(duel_id=self.duel_id, dog_id=dog_id,
                                  question_id=q['id'], round_index=self.i,
                                  choice=choice, correct=correct, ms=ms))
            if correct and exp:
                dog = db.get(DogProfile, dog_id)
                if dog is not None:
                    dog.total_exp = (dog.total_exp or 0) + exp
            db.commit()
            return exp
        except Exception as e:            # noqa: BLE001  记账失败不能把对局打断
            print('[quiz-duel] 记账失败：%s' % e)
            db.rollback()
            return 0
        finally:
            db.close()

    async def _close_round(self, winner_side):
        if self.round_closed:
            return
        self.round_closed = True
        self.round_winner = winner_side
        self._cancel_tasks()
        done = getattr(self, 'round_done', None)
        if done is not None:
            done.set()                    # 让 _run_match 立刻接着走下一回合
        if winner_side is not None:
            self.scores[winner_side] += 1
        detail = {str(s): self.answers.get(s) for s in (0, 1)}
        self.rounds.append({'i': self.i, 'question_id': (self.q or {}).get('id', ''),
                            'winner_side': winner_side, 'answers': detail})
        await self._broadcast({
            'type': 'round_end', 'i': self.i,
            'winner_side': winner_side,
            'winner_name': (self.names.get(winner_side, '') if winner_side is not None
                            else ''),
            'answer': (self.q or {}).get('answer'),
            'why': (self.q or {}).get('why'),
            'answers': detail,
            'scores': {str(k): v for k, v in self.scores.items()},
            'npc_side': self.npc_side,
        })

    # ---------- 提示 ----------
    async def ask_hint(self, side):
        async with self.lock:
            if self.over or self.round_closed or self.q is None:
                await self._send(side, {'type': 'hint_locked', 'in_ms': 0,
                                        'text': '这一回合已经过去了。'})
                return
            if side in self.answers or side in self.locked:
                await self._send(side, {'type': 'hint_locked', 'in_ms': 0,
                                        'text': '这一回合你已经答过了。'})
                return
            need = duel_hint_ms(self.wisdoms.get(side, 50))
            waited = int((time.monotonic() - self.round_start) * 1000)
            if waited < need:
                # ⚠️ 冷却没到，提示**一个字都不给** —— 客户端说自己到了不算数
                await self._send(side, {'type': 'hint_locked',
                                        'in_ms': max(0, need - waited)})
                return
            self.hinted.add(side)
            await self._send(side, {'type': 'hint', 'text': self.q.get('hint', ''),
                                    'waited_ms': waited, 'need_ms': need})

    # ---------- 结束 ----------
    async def _finish(self):
        async with self.lock:
            if self.over:
                return
            self.over = True
            self._cancel_tasks()
            a, b = self.scores.get(0, 0), self.scores.get(1, 0)
            winner = 0 if a > b else (1 if b > a else None)
            size = self.size
            result = {
                'size': size,
                'score': {str(self.seats.get(0) or 0): a, str(self.seats.get(1) or 0): b},
                'sides': {str(0): a, str(1): b},
                'winner_side': (winner if winner is not None else -1),
                'winner_dog_id': (self.seats.get(winner) or 0) if winner is not None else 0,
                'draw': winner is None,
                'names': {str(0): self.names.get(0, ''), str(1): self.names.get(1, '')},
                'npc_side': self.npc_side,
            }
            self._persist(result)
            for s in (0, 1):
                if self.sockets.get(s) is None:
                    continue
                mine, theirs = self.scores.get(s, 0), self.scores.get(1 - s, 0)
                if self.npc_side == s:
                    continue
                verdict = ('draw' if mine == theirs else ('win' if mine > theirs else 'lose'))
                tail = {'win': '这一局你赢了。', 'lose': '这一局它赢了。',
                        'draw': '两边打平。'}[verdict]
                await self._send(s, {
                    'type': 'over', 'my_side': s, 'verdict': verdict,
                    'mine': mine, 'theirs': theirs, 'size': size,
                    'scores': {str(k): v for k, v in self.scores.items()},
                    'exp': self.exp.get(s, 0), 'npc_side': self.npc_side,
                    'foe': self._card(1 - s),
                    'rounds': self.rounds,
                    'text': '%s %d : %d %s —— %s' % (
                        self.names.get(s, '你'), mine, theirs,
                        self.names.get(1 - s, '对面'), tail),
                })
            asyncio.create_task(self._reap_later())

    def _persist(self, result, status='done'):
        """把这一局落库。

        ⚠️ `status` 要能是 `aborted`：中途走人那局**不该进册子**，
           更不该记成"两边打平 0:0" —— 那是把没打完的局说成打完了。
        """
        db = self.factory()
        try:
            duel = db.get(QuizDuel, self.duel_id)
            if duel is None:
                return
            duel.status = status
            duel.question_ids = list(self.used_ids)
            duel.rounds = self.rounds
            duel.result = result
            duel.finished_at = datetime.utcnow()
            if duel.opponent_dog_id is None:
                duel.opponent_dog_id = self.seats.get(1)
            if status != 'done':
                db.commit()
                return
            # 册子上各记一行（模拟体不写 —— 它没有册子）
            from ..api.tower import diary
            today_names = {0: self.names.get(0, ''), 1: self.names.get(1, '')}
            for s in (0, 1):
                dog_id = self.seats.get(s)
                if not dog_id or s == self.npc_side:
                    continue
                mine, theirs = self.scores.get(s, 0), self.scores.get(1 - s, 0)
                diary(db, dog_id, 'duel',
                      '同问：和「%s」抢答了 %d 道题。你拿下 %d 个回合，对面 %d 个 —— %s'
                      % (today_names.get(1 - s, '对面'), self.size, mine, theirs,
                         '这一局你赢了。' if mine > theirs
                         else ('这一局它赢了。' if mine < theirs else '两边打平。')),
                      foe=today_names.get(1 - s, ''), mine=mine, foe_score=theirs,
                      size=self.size)
            db.commit()
        except Exception as e:            # noqa: BLE001
            print('[quiz-duel] 落库失败：%s' % e)
            db.rollback()
        finally:
            db.close()

    async def _reap_later(self):
        await asyncio.sleep(ROOM_TTL_S)
        hub = getattr(self, 'hub', None)
        if hub is not None:
            await hub.drop(self.code)

    # ---------- 掉线 ----------
    async def detach(self, side, reason=''):
        async with self.lock:
            self.sockets[side] = None
            if self.over:
                return
            other = 1 - side
            if self.sockets.get(other) is not None:
                await self._send(other, {
                    'type': 'peer_left', 'side': side,
                    'name': self.names.get(side, '对面'),
                    'text': '对面走了，这一局不算。' if not reason else reason})
            self.over = True
            self._cancel_tasks()
            self._persist({'aborted': True, 'by_side': side,
                           'score': {str(self.seats.get(0) or 0): self.scores.get(0, 0),
                                     str(self.seats.get(1) or 0): self.scores.get(1, 0)},
                           'sides': {str(0): self.scores.get(0, 0),
                                     str(1): self.scores.get(1, 0)},
                           'draw': True, 'winner_dog_id': 0, 'winner_side': -1,
                           'size': self.size,
                           'names': {str(0): self.names.get(0, ''),
                                     str(1): self.names.get(1, '')}},
                          status='aborted')


class QuizHub:
    """房间注册表。"""

    def __init__(self):
        self.rooms = {}
        self.lock = asyncio.Lock()

    async def put(self, room):
        room.hub = self
        async with self.lock:
            self.rooms[room.code] = room
        return room

    def get(self, code):
        return self.rooms.get(code.upper())

    async def drop(self, code):
        async with self.lock:
            self.rooms.pop(code.upper(), None)

    def stats(self):
        return {'quiz_rooms': len(self.rooms),
                'detail': [{'room': r.code, 'mode': r.mode, 'i': r.i,
                            'scores': r.scores, 'over': r.over}
                           for r in self.rooms.values()]}


def _seat_for(db, duel: QuizDuel, dog_id: int) -> int | None:
    """我坐哪一边。座位 1 空着、且房没留给别人 → 我就坐下（好友拿码进来就是这条路）。"""
    if duel.challenger_dog_id == dog_id:
        return 0
    if duel.opponent_dog_id == dog_id:
        return 1
    if duel.opponent_dog_id is None and duel.status == 'waiting':
        duel.opponent_dog_id = dog_id
        db.commit()
        return 1
    return None


@router.websocket('/ws/quiz/{room_code}')
async def quiz_ws(websocket: WebSocket, room_code: str, token: str = Query(default='')):
    app = websocket.app
    settings = app.state.settings
    factory = app.state.session_factory
    hub = app.state.quiz_hub

    code = (room_code or '').upper()
    await websocket.accept()
    try:
        account_id = account_id_from_token(token, settings.secret_key)
    except AuthError as e:
        await websocket.send_json({'type': 'error', 'detail': str(e)})
        await websocket.close(code=4401)
        return

    db = factory()
    try:
        duel = db.query(QuizDuel).filter(QuizDuel.room_code == code).first()
        if duel is None:
            await websocket.send_json({'type': 'error', 'detail': '没有这个房间'})
            await websocket.close(code=4404)
            return
        me = (db.query(DogProfile).filter(DogProfile.account_id == account_id)
                .order_by(DogProfile.id).first())
        if me is None:
            await websocket.send_json({'type': 'error', 'detail': '先领一只机械狗'})
            await websocket.close(code=4403)
            return
        side = _seat_for(db, duel, me.id)
        if side is None:
            await websocket.send_json({'type': 'error', 'detail': '这间房没有你的位子'})
            await websocket.close(code=4409)
            return
        ch = db.get(DogProfile, duel.challenger_dog_id)
        op = db.get(DogProfile, duel.opponent_dog_id) if duel.opponent_dog_id else None
        seats = {0: duel.challenger_dog_id, 1: (duel.opponent_dog_id or 0)}
        names = {0: ch.name if ch else '', 1: op.name if op else ''}
        wisdoms = {0: wisdom_of(db, ch) if ch else 50.0,
                   1: wisdom_of(db, op) if op else 50.0}
        levels = {0: int(ch.level or 1) if ch else 1, 1: int(op.level or 1) if op else 1}
        breeds = {0: (ch.breed.name if ch is not None and ch.breed else ''),
                  1: (op.breed.name if op is not None and op.breed else '')}
        npc_side = 1 if (op is not None and op.is_npc) else None
        # ⚠️ 这里**不写** status='playing' —— 那要等两边都进房（见 QuizRoom._mark）。
        #    一连上就写的话，好友拿码进来会被 join 接口当成"已经开了"拒掉。
        duel_id, size, baseline, mode = duel.id, duel.size, duel.baseline, duel.mode
    finally:
        db.close()

    room = hub.get(code)
    if room is None:
        room = await hub.put(QuizRoom(code, factory, duel_id, size, baseline,
                                      seats, wisdoms, names, levels, breeds,
                                      mode, npc_side=npc_side))
    else:
        # ⚠️ 房间是**开房的人**先连上时建的，那一刻对面还没进来（座位是空的）。
        #    好友拿码进来的这一下必须把座位信息补上 —— 不然开房那边永远显示
        #    "等对面 · 智力 50"，对面进来了也不会变（用户看到的就是对手信息不刷新）。
        for s in (0, 1):
            if seats.get(s):
                room.seats[s] = seats[s]
                room.names[s] = names.get(s, '')
                room.wisdoms[s] = wisdoms.get(s, 50.0)
                room.levels[s] = levels.get(s, 1)
                room.breeds[s] = breeds.get(s, '')
        room.npc_side = npc_side
    try:
        await room.attach(side, websocket)
        while True:
            payload = await websocket.receive_json()
            kind = (payload or {}).get('type')
            if kind == 'ping':
                await websocket.send_json({'type': 'pong', 't': payload.get('t')})
                continue
            if kind == 'answer':
                await room.submit(side, int(payload.get('i', -1)),
                                  int(payload.get('choice', -1)))
                continue
            if kind == 'hint':
                await room.ask_hint(side)
                continue
            if kind == 'leave':
                break
            await websocket.send_json({'type': 'error',
                                       'detail': '未知消息类型：%s' % kind})
    except WebSocketDisconnect:
        pass
    except Exception as e:                # noqa: BLE001  断了就断了，不能把房间卡死
        print('[quiz-duel] 连接出错：%s' % e)
    finally:
        await room.detach(side)
