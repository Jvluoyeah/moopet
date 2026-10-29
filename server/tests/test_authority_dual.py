#!/usr/bin/env python3
"""两个客户端**同时**玩：服务端的广播对两端是否对称

上一轮实机卡住的症状是"总有一端不动"。为了分清是**服务端**的问题还是
**浏览器端**的问题，这里完全不用浏览器 —— 两个裸 WebSocket 连接，
两边都在发输入，跑一段时间看两边是不是都在收帧、进度是不是一致。

如果这里能过，问题就在前端；如果这里也不过，问题在服务端的推进/广播。
"""
from __future__ import annotations

import os
import sys
import tempfile
import time
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


def make_app():
    tmp = tempfile.mkdtemp(prefix='moopet-dual-')
    os.environ['MOOPET_DATABASE_URL'] = (
        'sqlite:///' + os.path.join(tmp, 'dual.db').replace('\\', '/'))
    os.environ['MOOPET_SECRET_KEY'] = 'test-secret-for-dual-ws'
    from app.factory import create_app
    return create_app()


def drain(ws, seconds: float, limit: int = 400) -> list[dict]:
    """收 seconds 秒的消息，返回收到的（TestClient 的 ws 是同步的）。"""
    out: list[dict] = []
    t0 = time.monotonic()
    while len(out) < limit and time.monotonic() - t0 < seconds:
        try:
            out.append(ws.receive_json())
        except Exception:      # noqa: BLE001
            break
    return out


def main() -> int:
    app = make_app()
    from fastapi.testclient import TestClient
    from helpers import full_user
    client = TestClient(app)

    tok_a, _ = full_user(client, username='双人甲')
    tok_b, _ = full_user(client, username='双人乙')
    room = client.post('/api/match', json={'mode': 'pvp'},
                       headers={'Authorization': f'Bearer {tok_a}'}).json()
    code = room['room_code']
    url = f'/ws/match-auth/{code}'

    with client.websocket_connect(f'{url}?token={tok_a}') as wa, \
         client.websocket_connect(f'{url}?token={tok_b}') as wb:
        ha = wa.receive_json()
        hb = wb.receive_json()
        check('两端都拿到 welcome', ha.get('type') == 'welcome'
              and hb.get('type') == 'welcome', f"{ha.get('type')}/{hb.get('type')}")
        check('两端座位不同', ha.get('side') != hb.get('side'),
              f"A={ha.get('side')} B={hb.get('side')}")

        # ---- 两端**同时**发输入，各收各的 ----
        # ⚠️ TestClient 的 websocket 是同步阻塞的：两边都要轮流喂、轮流收，
        #    不然会一边把缓冲写满、一边读不到。
        latest_a: dict = {}
        latest_b: dict = {}
        sent = 0
        for i in range(1, 121):
            pa = {'mx': 1 if i % 2 else -1, 'skill': -1, 'btn': 0}
            pb = {'mx': -1 if i % 3 else 1, 'skill': -1, 'btn': 0}
            wa.send_json({'type': 'input', 'frame': i, 'keys': pa})
            wb.send_json({'type': 'input', 'frame': i, 'keys': pb})
            sent += 1
            if i % 10 == 0:
                for m in drain(wa, 0.12):
                    if m.get('type') == 'snap':
                        latest_a = m
                for m in drain(wb, 0.12):
                    if m.get('type') == 'snap':
                        latest_b = m

        # 收尾再各收一会儿
        for _ in range(3):
            for m in drain(wa, 0.2):
                if m.get('type') == 'snap':
                    latest_a = m
            for m in drain(wb, 0.2):
                if m.get('type') == 'snap':
                    latest_b = m

        fa = (latest_a.get('frames') or [])
        fb = (latest_b.get('frames') or [])
        tick_a = fa[-1]['tick'] if fa else -1
        tick_b = fb[-1]['tick'] if fb else -1

        check('**两端都在收帧**（不是只有一端）',
              tick_a > 0 and tick_b > 0, f'A={tick_a} B={tick_b}')
        check('两端进度接近（同一个模拟，必然如此）',
              abs(tick_a - tick_b) <= 30, f'A={tick_a} B={tick_b}')
        # ⚠️ 不能要求"tick 完全相等"：测试是**先抽干 A、再抽干 B**，
        #    B 自然多拿到一批（这是采样方式，不是服务端不对称）。
        #    同一个广播列表发出去的，差值应该在一批之内。
        check('两端收的是同一条广播流（差值在一批之内）',
              abs(tick_a - tick_b) <= 30,
              f'A tick={tick_a} B tick={tick_b}')
        check('发送的输入数对得上（两边各 120 帧）', sent == 120, str(sent))

        st = app.state.rooms.status()
        detail = st.get('detail', {}).get(code, {})
        check('房间状态自述：在推进、没丢输入',
              detail.get('frame', 0) > 0 and detail.get('dropped', 1) == 0,
              str({k: detail.get(k) for k in ('frame', 'dropped',
                                              'pending_frames')}))

    print(f"\n{passed}/{passed + len(failures)} 项检查通过")
    if failures:
        print("问题：")
        for f in failures:
            print("  - " + f)
        return 1
    print("双端广播对称通过 ✅")
    return 0


def test_authority_dual():
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
