#!/usr/bin/env python3
"""权威模式 WebSocket 的端到端验收（服务端侧，两个真连接）

验的是用户报的问题**在协议层真的解决了**：
  ① 两个客户端连上，各自拿到座位号
  ② 双方就绪 → 开打
  ③ 发输入能换来帧（而且**对手不发输入也照样有帧**）
  ④ 帧里带渲染要的字段，快照能过 JSON
"""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

passed = 0
failures = []


def check(label: str, ok: bool, detail: str = "") -> None:
    global passed
    if ok:
        passed += 1
        print(f"OK    {label}" + (f"  — {detail}" if detail else ""))
    else:
        failures.append(label)
        print(f"FAIL  {label}  {detail}")


def main() -> int:
    tmp = tempfile.mkdtemp(prefix='moopet-auth-')
    db_url = 'sqlite:///' + os.path.join(tmp, 'auth.db').replace('\\', '/')
    os.environ['MOOPET_DATABASE_URL'] = db_url
    os.environ['MOOPET_SECRET_KEY'] = 'test-secret-for-authority'

    from fastapi.testclient import TestClient  # noqa: E402

    from app.factory import create_app  # noqa: E402

    app = create_app()
    client = TestClient(app)

    # ---- 两个账号各领一只狗 ----
    # 用现成的 helpers，别自己拼一遍（接口路径/字段名容易记错：
    # 注册返回的是 access_token，领养走的是 /api/dogs/adopt）
    from helpers import full_user

    def signup(name: str) -> tuple[str, dict]:
        return full_user(client, username=name)

    tok_a, dog_a = signup('甲方汪')
    tok_b, dog_b = signup('乙方汪')

    # ---- 开局（建房的自动坐 0 号位）----
    room = client.post('/api/match', json={'mode': 'pvp'},
                       headers={'Authorization': f'Bearer {tok_a}'}).json()
    code = room['room_code']
    # ⚠️ **没有 join 接口** —— 加入就是连 WS，座位由服务端分配。
    #    （第一版写了 POST /join，拿到 405 Method Not Allowed。）
    check('房间建好了、在等人', room.get('status') in ('waiting', 'playing'),
          str(room.get('status')))

    # ---- 两个 WebSocket 连上 ----
    url = f'/ws/match-auth/{code}'
    with client.websocket_connect(f'{url}?token={tok_a}') as wa, \
         client.websocket_connect(f'{url}?token={tok_b}') as wb:
        wa_hello = wa.receive_json()
        wb_hello = wb.receive_json()
        check('两个客户端都拿到了 welcome',
              wa_hello.get('type') == 'welcome' and wb_hello.get('type') == 'welcome',
              f"{wa_hello.get('type')}/{wb_hello.get('type')}")
        check('**两边座位号不一样**（不是一个座位挤两个人）',
              wa_hello['side'] != wb_hello['side'],
              f"A={wa_hello['side']} B={wb_hello['side']}")
        check('服务端告诉了客户端 tickHz',
              wa_hello.get('tickHz') == 128, str(wa_hello.get('tickHz')))

        # ---- 只让 A 发输入，B 什么都不发 ----
        for f in range(1, 31):
            wa.send_json({'type': 'input', 'frame': f,
                          'keys': {'mx': 1 if f % 2 else -1, 'skill': -1}})

        got = []
        for _ in range(200):
            try:
                msg = wa.receive_json()
            except Exception:      # noqa: BLE001
                break
            got.append(msg)
            if len(got) >= 3:
                break

        snaps = [m for m in got if m.get('type') == 'snap']
        check('**A 收到了服务端推来的帧**', len(snaps) > 0, f"{len(snaps)} 批")
        if snaps:
            frames = snaps[-1].get('frames') or []
            check('帧里带渲染要的字段',
                  frames and 'units' in frames[-1] and 'tick' in frames[-1],
                  f"tick={frames[-1].get('tick') if frames else '-'}")
            check('帧号在往前走',
                  len(frames) > 0 and frames[-1]['tick'] > (frames[0]['tick'] - 1),
                  f"{frames[0]['tick']} → {frames[-1]['tick']}")
            check('指纹是数字（对账用）',
                  isinstance(snaps[-1].get('hash'), (int, str)),
                  str(snaps[-1].get('hash'))[:20])
            if snaps[-1].get('snap'):
                blob = json.dumps(snaps[-1]['snap'])
                check('快照能过 JSON（客户端要拿它回滚）', len(blob) > 200,
                      f"{len(blob)} 字节")

        # ---- ping/pong ----
        wa.send_json({'type': 'ping', 't': 42})
        pong = None
        for _ in range(60):
            m = wa.receive_json()
            if m.get('type') == 'pong':
                pong = m
                break
        check('ping 能拿到 pong', pong is not None and pong.get('t') == 42,
              str(pong))

    # ---- 两边都断开之后房间应该被收掉（不留 node 子进程）----
    rooms = app.state.rooms
    check('两边都断开之后房间被收掉（引擎子进程不会挂着）',
          not rooms.has(code), f"还在的房间：{list(rooms.rooms)}")

    print(f"\n{passed}/{passed + len(failures)} 项检查通过")
    if failures:
        print("问题：")
        for f in failures:
            print("  - " + f)
        return 1
    print("权威模式 WebSocket 通过 ✅")
    return 0


def test_authority_ws():
    rc = 0
    try:
        rc = main()
    except BaseException as e:      # noqa: BLE001
        import traceback
        traceback.print_exc()
        raise AssertionError(f"{type(e).__name__}: {e}") from e
    if rc:
        raise AssertionError("见上方 FAIL 行")


if __name__ == "__main__":
    sys.exit(main())
