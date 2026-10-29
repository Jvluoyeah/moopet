"""开放世界 WebSocket：/ws/world/{scene} 位置广播房间。

协议（JSON 文本帧）：

  客户端 → 服务端
    {"type":"move","x":820.5,"z":1010.2,"facing":1,"status":"run"}   10Hz 上报
    {"type":"action","action":"bark"}                                 打招呼/叫一声
    {"type":"chat","text":"..."}                                      场景内说话
    {"type":"ping","t":1712345678901}

  服务端 → 客户端
    {"type":"welcome","scene":"plaza","dog_id":7,"peers":[ ... ]}     进房快照
    {"type":"peer_join","peer":{...}}                                 有人进来
    {"type":"peer_move","dog_id":7,"x":..,"z":..,"facing":1,"status":"run","t":..}
    {"type":"peer_action","dog_id":7,"action":"bark"}
    {"type":"peer_chat","dog_id":7,"name":"雪团","text":"..."}
    {"type":"peer_leave","dog_id":7}
    {"type":"reject","detail":"too_fast"}                             位置被拒（客户端可以回滚）
    {"type":"pong","t":...}
    {"type":"error","detail":"..."}                                   然后 44xx 关闭

一条连接 = 一个场景。换场景就关掉重连——比在连接里做"搬家"简单得多，
而且客户端切场景本来就要重建整个 Three.js 场景树，省不下什么。
"""
import time

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..models import Account, DogProfile, Presence
from ..security import AuthError, account_id_from_token
from .world_hub import MOTION, Peer

router = APIRouter(tags=['开放世界'])


def _db_upsert_presence(factory, dog_id, scene, x, z, status):
    """把最后位置落库：离线之后世界接口还能显示"他最后在哪儿"。

    坐标存"格"（整数），和 `/api/world`、种子数据保持同一口径。
    写库节流到 presence_write_sec 一次——10Hz 全写会把 SQLite 打满。
    """
    db = factory()
    try:
        row = db.get(Presence, dog_id)
        if row is None:
            row = Presence(dog_id=dog_id)
            db.add(row)
        row.scene = scene
        row.x = int(round(x))
        row.y = int(round(z))
        row.status = (status or 'idle')[:16]
        db.commit()
    except Exception:      # noqa: BLE001  落库失败不该影响联机
        db.rollback()
    finally:
        db.close()


@router.websocket('/ws/world/{scene}')
async def world_ws(websocket: WebSocket, scene: str, token: str = Query(default='')):
    app = websocket.app
    settings = app.state.settings
    factory = app.state.session_factory
    hub = app.state.world_hub

    await websocket.accept()

    # ---- 鉴权 ----
    try:
        account_id = account_id_from_token(token, settings.secret_key)
    except AuthError as e:
        await websocket.send_json({'type': 'error', 'detail': str(e)})
        await websocket.close(code=4401)
        return

    # ---- 这个场景存在吗 ----
    room = hub.room(scene)
    if room is None:
        await websocket.send_json({'type': 'error', 'detail': f'没有这个场景：{scene}'})
        await websocket.close(code=4404)
        return

    # ---- 找我的狗 ----
    db = factory()
    try:
        dog = (db.query(DogProfile)
                 .filter(DogProfile.account_id == account_id)
                 .order_by(DogProfile.id).first())
        if dog is None:
            await websocket.send_json({'type': 'error', 'detail': '还没有领养机械狗'})
            await websocket.close(code=4404)
            return
        peer = Peer(dog.id, dog.name, websocket,
                    breed_code=dog.breed_code, level=dog.level or 1)
    finally:
        db.close()

    room, why = await hub.join(scene, peer)
    if why == 'full':
        await websocket.send_json({'type': 'error', 'detail': '这个场景人满了'})
        await websocket.close(code=4409)
        return
    if why:
        await websocket.send_json({'type': 'error', 'detail': why})
        await websocket.close(code=4404)
        return

    # 先用旧位置（上次离线的地方），没有就用出生点
    db = factory()
    try:
        row = db.get(Presence, peer.dog_id)
        if row is not None and row.scene == scene:
            peer.x, peer.z = float(row.x), float(row.y)
    finally:
        db.close()

    await websocket.send_json({
        'type': 'welcome', 'scene': scene, 'dog_id': peer.dog_id,
        'name': peer.name, 'me': peer.hello(),
        'peers': room.roster(exclude=peer.dog_id),
        'bounds': {'w': room.size[0], 'd': room.size[1]},
        'report_hz': MOTION['report_hz'],
        'server_t': int(time.time() * 1000),
    })
    await hub.broadcast(scene, {'type': 'peer_join', 'peer': peer.hello()},
                        exclude=peer.dog_id)

    try:
        while True:
            payload = await websocket.receive_json()
            kind = (payload or {}).get('type')

            if kind == 'ping':
                await websocket.send_json({'type': 'pong', 't': payload.get('t')})
                continue

            if not hub.check_rate(peer):
                await websocket.send_json({'type': 'error', 'detail': '发得太快了'})
                await websocket.close(code=4429)
                return

            if kind == 'move':
                ok, why = hub.validate_move(room, peer, payload.get('x'),
                                            payload.get('z'))
                if not ok:
                    peer.rejects += 1
                    if time.monotonic() - peer.reject_window > 10:
                        peer.reject_window = time.monotonic()
                        peer.rejects = 1
                    await websocket.send_json({'type': 'reject', 'detail': why,
                                               'x': round(peer.x, 1),
                                               'z': round(peer.z, 1)})
                    if peer.rejects > MOTION['reject_budget']:
                        await websocket.send_json(
                            {'type': 'error', 'detail': '位置持续异常，已断开'})
                        await websocket.close(code=4400)
                        return
                    continue
                hub.apply_move(peer, payload.get('x'), payload.get('z'),
                               payload.get('facing'), payload.get('status'))
                await hub.broadcast(scene, peer.move_msg(), exclude=peer.dog_id)
                now = time.monotonic()
                if now - peer.last_db_at > MOTION['presence_write_sec']:
                    peer.last_db_at = now
                    _db_upsert_presence(factory, peer.dog_id, scene,
                                        peer.x, peer.z, peer.status)
                continue

            if kind == 'action':
                action = str(payload.get('action') or '')[:24]
                if payload.get('bubble') is not None:
                    peer.bubble = str(payload.get('bubble'))[:24]
                await hub.broadcast(scene, {'type': 'peer_action',
                                            'dog_id': peer.dog_id,
                                            'action': action,
                                            'bubble': peer.bubble},
                                    exclude=peer.dog_id)
                continue

            if kind == 'chat':
                text = str(payload.get('text') or '').strip()[:120]
                if not text:
                    continue
                peer.bubble = text[:24]
                await hub.broadcast(scene, {'type': 'peer_chat',
                                            'dog_id': peer.dog_id,
                                            'name': peer.name, 'text': text},
                                    exclude=peer.dog_id)
                continue

            await websocket.send_json({'type': 'error',
                                       'detail': f'未知消息类型：{kind}'})
    except WebSocketDisconnect:
        pass
    except Exception:      # noqa: BLE001  任何异常都按断线处理，不能让房间卡住
        pass
    finally:
        await hub.leave(scene, peer.dog_id)
        _db_upsert_presence(factory, peer.dog_id, scene, peer.x, peer.z, 'offline')
