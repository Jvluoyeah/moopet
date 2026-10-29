#!/usr/bin/env python3
"""权威模拟宿主（Python 侧）的验收

验四件事，都是"服务端权威"能不能落地的前提：
  ① Python 能把引擎进程拉起来、按协议驱动它
  ② **两个独立进程 + 同种子同输入 → 同一个指纹**
     （这是"权威"的前提：服务端算的和客户端算的必须是同一个结果）
  ③ 快照能过 JSON（将来要经 WebSocket 发给客户端做回滚）
  ④ 进程用完能干净退出，不留僵尸
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.engine_host import EngineHost, engine_available  # noqa: E402

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


BREEDS = [{"code": "samoyed"}, {"code": "husky"}]


def script(n: int, seed: int) -> list[list[dict]]:
    """确定性的输入脚本"""
    s = seed & 0xFFFFFFFF
    out = []
    for _ in range(n):
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        r1 = s / 4294967296
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        r2 = s / 4294967296
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        r3 = s / 4294967296
        out.append([
            {"mx": int(r1 * 3) - 1, "skill": int(r2 * 6) if r3 < 0.25 else -1},
            {"mx": int(r2 * 3) - 1},
        ])
    return out


def main() -> int:
    if not engine_available():
        check("Node 和引擎脚本都在", False, "环境缺 Node 或 engine_host.mjs")
        print(f"\n{passed}/{passed + len(failures)} 项检查通过")
        return 1
    check("Node 和引擎脚本都在", True)

    # ---------- ① 能拉起来并驱动 ----------
    h1 = EngineHost(seed=12345, breeds=BREEDS)
    check("Python 能把引擎进程拉起来", h1.tick_hz == 128, f"tickHz={h1.tick_hz}")

    ins = script(300, 3)
    frames = h1.step(ins)
    check("能推进 300 帧", len(frames) == 300, f"{len(frames)} 帧")
    last = frames[-1]
    check("帧里带客户端渲染要的字段",
          isinstance(last.get("units"), list) and len(last["units"]) == 2
          and "x" in last["units"][0],
          f"tick={last.get('tick')}")
    h1_hash = h1.hash()

    # ---------- ② 两个进程，同种子同输入 → 同指纹 ----------
    h2 = EngineHost(seed=12345, breeds=BREEDS)
    h2.step(script(300, 3))
    check("两个独立进程 + 同种子同输入 → **同一个指纹**",
          h2.hash() == h1_hash, f"{h1_hash} vs {h2.hash()}")

    # ---------- ③ 快照能过 JSON ----------
    snap = h1.snapshot()
    blob = json.dumps(snap, ensure_ascii=False)
    check("快照能序列化成 JSON（要经 WebSocket 发出去）",
          len(blob) > 200, f"{len(blob)} 字节")
    h1.step(script(40, 77))
    back = h1.restore(json.loads(blob))
    check("从 JSON 反序列化后能回滚到那一刻", back == h1_hash,
          f"{back} vs {h1_hash}")

    h2.close()

    # ---------- ④ 干净退出 ----------
    h1.close()
    check("用完能干净退出（没有僵尸进程）",
          h1.proc.poll() is not None, f"returncode={h1.proc.returncode}")

    # ---------- ⑤ 坏输入会报错而不是崩 ----------
    h3 = EngineHost(seed=1, breeds=BREEDS)
    try:
        h3.step([[]] * 3)          # 空输入
        check("坏输入不会让进程崩", h3.proc.poll() is None)
    except Exception as e:          # noqa: BLE001
        check("坏输入不会让进程崩", h3.proc.poll() is None, str(e)[:60])
    try:
        h3.restore({"tick": "乱写的"})
        check("坏快照会报错而不是崩", h3.proc.poll() is None)
    except Exception:               # noqa: BLE001
        check("坏快照会报错而不是崩", h3.proc.poll() is None)
    h3.close()

    print(f"\n{passed}/{passed + len(failures)} 项检查通过")
    if failures:
        print("问题：")
        for f in failures:
            print("  - " + f)
        return 1
    print("权威模拟宿主（Python 侧）通过 ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())


# ---------------- 给 tests/run_all.py 用的入口 ----------------
# run_all 收集的是"名字以 test_ 开头的函数"，而这个文件是脚本式的
# （main() 里 print + sys.exit）。包一层就好，不用改写测试本身。
def test_engine_host():
    rc = 0
    try:
        rc = main()
    except BaseException as e:      # noqa: BLE001
        raise AssertionError(f"{type(e).__name__}: {e}") from e
    if rc:
        raise AssertionError("见上方 FAIL 行")
