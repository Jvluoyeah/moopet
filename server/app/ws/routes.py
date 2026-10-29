"""对战 WebSocket：锁步中转站。

客户端协议（JSON 文本帧）：

  客户端 → 服务端
    {"type":"ready"}                          我准备好了
    {"type":"input","frame":12,"keys":[1,0,2]} 第 12 帧的输入
    {"type":"ping","t":...}
    {"type":"result","scores":[3,1]}           本局结果（双方会互相核对）

  服务端 → 客户端
    {"type":"welcome","side":0,"seed":123,"room":"ABC123","peers":[...]}
    {"type":"peer_joined","side":1,"name":"阿牧"}
    {"type":"peer_left","side":1,"takeover":"ai"}   对手掉线 → 客户端切 AI 接管
    {"type":"start","seed":123,"frame":0}           双方就绪，开打
    {"type":"input","side":1,"frame":12,"keys":[...]}  转发对手输入
    {"type":"pong","t":...}

服务端**不解释输入**，只转发与记录 —— 这正是锁步方案最省事也最难出错的地方。
"""
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..models import Account, DogProfile, Match, MatchPlayer
from ..security import AuthError, account_id_from_token

router = APIRouter(tags=['对战房间'])


def _match_by_code(db, code):
    return db.query(Match).filter(Match.room_code == code.upper()).first()


@router.websocket('/ws/match/{room_code}')
async def match_ws(websocket: WebSocket, room_code: str, token: str = Query(default='')):
    app = websocket.app
    settings = app.state.settings
    factory = app.state.session_factory
    hub = app.state.hub

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
        my_dog = (db.query(DogProfile)
                    .filter(DogProfile.account_id == account_id)
                    .order_by(DogProfile.id).first()) if acc else None
        players = (db.query(MatchPlayer).filter(MatchPlayer.match_id == m.id)
                     .order_by(MatchPlayer.side).all())
        # 找座位：优先自己已占的座位，其次空座位
        side = None
        for p in players:
            if my_dog is not None and p.dog_id == my_dog.id:
                side = p.side
                break
        if side is None:
            for p in players:
                if p.dog_id is None and not p.is_ai:
                    side = p.side
                    p.dog_id = my_dog.id if my_dog else None
                    p.display_name = my_dog.name if my_dog else '访客'
                    break
        if side is None:
            await websocket.send_json({'type': 'error', 'detail': '这局没有空位了'})
            await websocket.close(code=4409)
            return
        my_name = my_dog.name if my_dog else f'账号{account_id}'
        m.status = 'playing'
        seed = m.seed
        db.commit()
        peers = [{'side': p.side, 'name': p.display_name, 'is_ai': bool(p.is_ai)}
                 for p in players]
    finally:
        db.close()

    room = await hub.join(code, side, websocket, match_id=m.id, seed=seed, name=my_name)
    await websocket.send_json({'type': 'welcome', 'room': code, 'side': side,
                               'seed': seed, 'name': my_name, 'peers': peers})
    await hub.relay(code, side, {'type': 'peer_joined', 'side': side, 'name': my_name})
    if len(room.ready) >= 2 or (room.is_full() and len(room.ready) >= 2):
        await hub.broadcast(code, {'type': 'start', 'seed': seed, 'frame': 0})

    try:
        while True:
            payload = await websocket.receive_json()
            kind = (payload or {}).get('type')
            if kind == 'ping':
                await websocket.send_json({'type': 'pong', 't': payload.get('t')})
                continue
            if kind == 'ready':
                await hub.relay(code, side, {'type': 'ready', 'side': side})
                room = hub.get(code)
                if room is not None and room.started:
                    await hub.broadcast(code, {'type': 'start', 'seed': room.seed,
                                               'frame': room.frame})
                continue
            if kind in ('input', 'result', 'chat', 'emote'):
                await hub.relay(code, side, payload)
                continue
            await websocket.send_json({'type': 'error',
                                       'detail': f'未知消息类型：{kind}'})
    except WebSocketDisconnect:
        pass
    except Exception:      # noqa: BLE001  任何异常都按断线处理，不能让房间卡住
        pass
    finally:
        await hub.leave(code, side)
        db = factory()
        try:
            mm = _match_by_code(db, code)
            if mm is not None and mm.status == 'playing':
                room = hub.get(code)
                if room is not None:
                    mm.frames = room.frame
                    mm.input_log = list(room.input_log)
                db.commit()
        finally:
            db.close()
