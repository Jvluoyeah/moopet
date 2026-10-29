"""权威模式的对战 WebSocket（服务端跑模拟）
============================================================
和 `routes.py`（锁步中转站）是**两条并存的路径**：

    锁步  /ws/match/{code}        —— 服务端只转发按键，两端各跑一份模拟
    权威  /ws/match-auth/{code}   —— 服务端跑唯一一份，客户端发输入、收快照

为什么并存而不是直接替换：锁步那条已经被 21 项 e2e 压着，
换引擎/换协议的风险要能**随时退回去对照**（和之前 `?engine=legacy` 一个思路）。

客户端 → 服务端
    {"type":"ready"}                            我准备好了
    {"type":"input","frame":12,"keys":[...]}    第 12 帧的输入
    {"type":"ping","t":...}

服务端 → 客户端
    {"type":"welcome","side":0,"seed":123,"room":"ABC123","tickHz":128}
    {"type":"start","seed":123,"frame":0}       双方就绪，开打
    {"type":"snap","frames":[...],"hash":...,"snap":{...}}
        一次一批帧 + 权威快照。**snap 是权威状态**，客户端拿它恢复。
        （第一阶段客户端不预测，所以每批都带快照；等加了预测会改成
          "每个快照间隔带一次"，省带宽。）
    {"type":"peer_left","side":1}
    {"type":"error","detail":"..."}
"""
from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..models import Account, Breed, DogProfile, Match, MatchPlayer
from ..security import AuthError, account_id_from_token

router = APIRouter(tags=['对战房间（权威）'])

# 一次快照最多带多少帧 —— 太大就变成"一帧一包"的网络抖动
SNAP_EVERY = 4



def _match_by_code(db, code):
    return db.query(Match).filter(Match.room_code == code.upper()).first()


@router.websocket('/ws/match-auth/{room_code}')
async def match_auth_ws(websocket: WebSocket, room_code: str,
                        token: str = Query(default='')):
    app = websocket.app
    settings = app.state.settings
    factory = app.state.session_factory
    mgr = app.state.rooms

    code = room_code.upper()
    await websocket.accept()

    # ---- 鉴权 ----
    try:
        account_id = account_id_from_token(token, settings.secret_key)
    except AuthError as e:
        await websocket.send_json({'type': 'error', 'detail': str(e)})
        await websocket.close(code=4401)
        return

    db = factory()
    try:
        m = _match_by_code(db, code)
        if m is None:
            await websocket.send_json({'type': 'error', 'detail': '没有这个房间'})
            await websocket.close(code=4404)
            return
        acc = db.get(Account, account_id)
        dog = (db.query(DogProfile)
                 .filter(DogProfile.account_id == account_id).first())
        if acc is None or dog is None:
            await websocket.send_json({'type': 'error',
                                       'detail': '先领养一只狗再来'})
            await websocket.close(code=4404)
            return
        # 座位：服务端说了算（和锁步那边一致）
        # ⚠️ MatchPlayer 是**独立的表**，不是 Match 上的关系属性 ——
        #    写成 `m.players` 会 AttributeError（第一版就是这么错的）。
        players = (db.query(MatchPlayer)
                     .filter(MatchPlayer.match_id == m.id)
                     .order_by(MatchPlayer.side)
                     .all())
        # ⚠️ 两个坑，都踩过：
        #    1) MatchPlayer 里**没有 account_id** —— 要靠"我那只狗的 id"认座位
        #    2) **没有"加入房间"的 HTTP 接口** —— 加入就是连这个 WS，
        #       座位由服务端现场分配（和锁步那条路一致）。
        seat = None
        for pl in players:
            if pl.dog_id is not None and pl.dog_id == dog.id:
                seat = pl.side
                break
        if seat is None:
            # ⚠️ 建房时**两个座位行就已经建好了**（空位的 dog_id 是 NULL），
            #    所以这里要**更新那一行**，不能新增 ——
            #    新增会撞 (match_id, side) 的唯一约束。
            #    （第一版就是 db.add(...)，直接 IntegrityError。）
            taken = {pl.side for pl in players if pl.dog_id is not None}
            empty = [pl for pl in players if pl.dog_id is None]
            free = [x for x in range(2) if x not in taken]
            if not free:
                await websocket.send_json({'type': 'error',
                                           'detail': '这局已经坐满了'})
                await websocket.close(code=4409)
                return
            seat = free[0]
            row = next((pl for pl in empty if pl.side == seat), None)
            if row is not None:
                row.dog_id = dog.id
                row.display_name = getattr(dog, 'name', '') or ''
            else:
                db.add(MatchPlayer(match_id=m.id, dog_id=dog.id, side=seat,
                                   display_name=getattr(dog, 'name', '') or ''))
            db.commit()
            players = (db.query(MatchPlayer)
                         .filter(MatchPlayer.match_id == m.id)
                         .order_by(MatchPlayer.side).all())
    finally:
        db.close()

    if seat is None:
        await websocket.send_json({'type': 'error', 'detail': '你不是这局的玩家'})
        await websocket.close(code=4403)
        return

    # ---- 开房（第一个进来的建，第二个进来复用）----
    breeds = _breeds_of(m, factory)
    room = mgr.create(code, seed=m.seed or 1, breeds=breeds)
    if not mgr.join(code, seat, account_id):
        await websocket.send_json({'type': 'error', 'detail': '这个座位有人了'})
        await websocket.close(code=4409)
        return

    await websocket.send_json({
        'type': 'welcome', 'side': seat, 'seed': m.seed or 1, 'room': code,
        'tickHz': room.host.tick_hz,
    })

    # 两边都到了就开打
    players = mgr.meta.get(code, {}).get('players', {})
    if len(players) >= 2:
        await websocket.send_json({'type': 'start', 'seed': m.seed or 1,
                                   'frame': room.next_frame})

    # ---- 加入广播列表 ----
    conns: list[WebSocket] = app.state.auth_conns.setdefault(code, [])
    conns.append(websocket)
    print(f'[authority] 连接加入 room={code} side={seat} '
          f'conns={len(conns)}', flush=True)

    # ---- 推进 + 广播：**每房一个后台任务** ----
       # ⚠️ 原来是"每个连接各跑一个循环"。那个设计有个致命问题：
          # 循环里任何一次异常都会让**这个连接的任务静默死掉**
          # （asyncio 里没被 await 的任务异常不会往上冒），
          # 而另一端还在跑，于是表现成"总有一端收不到帧"——
          # 我为此查了三轮。实测：A 收到 248 条后停、B 收到 15 条后停，
          # socket 都还 OPEN、服务端没有任何报错。
#
       # 现在：
         # · 一个房间**只有一个**推进任务（谁先连谁负责起，最后一个走才停）
         # · 整个循环体包在 try/except 里，出错**打日志并继续**，绝不静默死
         # · 每秒打一次心跳（帧号 / 广播了几批），下次再出问题一眼能看出来
    # 每个连接各跑一个推进 + 广播循环。
       # ⚠️ 之前为了排查"某端收不到帧"，我把它改成过"每房一个后台任务"。
          # 根因查出来之后（是输入格式不匹配导致 pump 抛异常、又被吞掉），
          # 那个改动就不必要了 —— 而且它引入了一个新问题：
          # 连接全断之后任务还挂着，把测试的事件循环拖住（test_authority_dual 卡死）。
          # **改动应当和它解决的问题相称**：根因在别处，就不该在这里加复杂度。
#
       # 保留下来的是这轮真正有价值的东西：
         # · 整个循环体包 try/except，出错**打完整栈并继续** ——
           # 绝不静默死掉（这条让我多花了三轮）
    async def pump_loop():
        batch = 0
        last_beat = time.monotonic()
        while True:
            try:
                await asyncio.sleep(1 / 128)
                if room.closed:
                    return
                frames = room.pump()
                if not frames:
                    continue
                batch += 1
                # frames 给渲染，inputs 给回滚重放（客户端要按权威用过的输入重演）
                msg = {'type': 'snap', 'frames': frames,
                       'inputs': room.last_inputs, 'hash': room.last_hash}
                if batch % SNAP_EVERY == 0:
                    msg['snap'] = room.snapshot()['snap']
                for ws in list(conns):
                    try:
                        await ws.send_json(msg)
                    except Exception as e:       # noqa: BLE001
                        print(f'[authority] 广播失败 room={code} '
                              f'err={type(e).__name__}: {e}', flush=True)
                now = time.monotonic()
                if now - last_beat >= 5.0:
                    last_beat = now
                    print(f'[authority] 心跳 room={code} frame={room.next_frame} '
                          f'广播={batch} 批 连接={len(conns)} 丢={room.dropped}',
                          flush=True)
            except asyncio.CancelledError:
                raise
            except Exception as e:                  # noqa: BLE001
                import traceback
                print(f'[authority] 推进出错（继续跑）room={code} '
                      f'{type(e).__name__}: {e}\n{traceback.format_exc()}',
                      flush=True)
                await asyncio.sleep(0.1)

    task = asyncio.create_task(pump_loop())
    try:
        while True:
            msg = await websocket.receive_json()
            t = msg.get('type')
            if t == 'input':
                # 客户端可能一次报多帧（补发），keys 也可以是单帧
                frames = msg.get('frames')
                if isinstance(frames, list):
                    for item in frames:
                        mgr.push_input(code, seat, int(item.get('frame', 0)),
                                       item.get('keys') or item.get('input') or {})
                else:
                    mgr.push_input(code, seat, int(msg.get('frame', 0)),
                                   msg.get('keys') or {})
            elif t == 'ping':
                await websocket.send_json({'type': 'pong', 't': msg.get('t')})
            elif t == 'snapshot':
                await websocket.send_json({'type': 'snap', **_snap_payload(mgr, code)})
    except WebSocketDisconnect:
        pass
    except Exception:                     # noqa: BLE001
        pass
    finally:
        task.cancel()
        try:
            conns.remove(websocket)
        except ValueError:
            pass
        if not conns:
            app.state.auth_conns.pop(code, None)
        # ⚠️ 这段清理要出声。房主建房时会 connectSocket 一次、
        #    对手来了又 connectSocket 一次（旧 socket 被 close）——
        #    旧连接的清理如果腾掉了座位、甚至关掉了房间，
        #    新房主连接就会"看着连上了但永远收不到快照"。
        print(f'[authority] 连接离开 room={code} side={seat} '
              f'剩余conns={len(conns)}', flush=True)
        mgr.join_left(code, seat)
        left = len(mgr.meta.get(code, {}).get('players', {}))
        print(f'[authority] 腾完座位剩 {left} 人 room={code}', flush=True)
        # 两个人都走了就关房（引擎是子进程，必须收掉）
        if left == 0:
            print(f'[authority] 房间没人了，关掉 room={code}', flush=True)
            mgr.close(code)


def _snap_payload(mgr, code: str) -> dict:
    room = mgr.get(code)
    if room is None:
        return {'frames': [], 'hash': '', 'snap': None}
    s = room.snapshot()
    return {'frames': [], 'hash': s['hash'], 'snap': s['snap']}


def _breeds_of(m, factory) -> list[dict]:
    """每局的品种（客户端要用同一份，否则两边跑的不是同一局）。
    座位空着（AI 或还没人坐）就给个空品种 —— 引擎那边会退回默认形象。

    ⚠️⚠️ 必须把**四维与等级**一起给出去。
    原来这里只塞了 `{'code': ...}` —— 引擎拿不到属性就按"四维全是 50"算，
    于是**所有人血量都是 400、速度 260、伤害 ×1**（用户报的"统一血线"），
    而且客户端本地是按**自己的真实四维**算 maxHp（比如 457），
    两边对不上 → 血条按权威数据画就是 400/457 = **一进场就缺一截**
    （用户报的"一进来就扣血"）。两个症状，同一个根因。
    """
    db = factory()
    try:
        rows = (db.query(MatchPlayer)
                  .filter(MatchPlayer.match_id == m.id)
                  .order_by(MatchPlayer.side)
                  .all())
        by_side = {r.side: r for r in rows}
        out = []
        for side in (0, 1):
            pl = by_side.get(side)
            dog = db.get(DogProfile, pl.dog_id) if pl and pl.dog_id else None
            if dog is None:
                out.append({'code': ''})
                continue
            breed = db.get(Breed, dog.breed_code) if dog.breed_code else None
            # 平铺给四维（引擎的 statsAt 两种形状都收）+ 等级（成长到哪一档）
            out.append({
                'code': dog.breed_code or '',
                'level': int(dog.level or 1),
                'power': breed.power if breed else 50,
                'agility': breed.agility if breed else 50,
                'wisdom': breed.wisdom if breed else 50,
                'affinity': breed.affinity if breed else 50,
            })
        return out
    finally:
        db.close()
