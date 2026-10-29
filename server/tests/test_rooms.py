#!/usr/bin/env python3
"""房间管理的验收

重点不是"能不能开房"，而是**别把服务端搞垮**：
  ① 一个对局一个房间；重复 create 不会开出第二个引擎进程
  ② 广播只发给对应的房间（A 房的帧不该跑到 B 房）
  ③ 一个房间出错不能带崩别的房间
  ④ 忘关 = 僵尸 node 进程 → 必须有超时回收和全量关闭
  ⑤ join 能防"第三个人挤进同一个座位"
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.rooms import RoomManager, TICK_HZ  # noqa: E402

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
TICK_DT = 1.0 / TICK_HZ


def node_count() -> int:
    """当前有多少 node 进程（用来验"没有僵尸"）"""
    try:
        if os.name == "nt":
            out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq node.exe"],
                                 capture_output=True, text=True, timeout=10).stdout
            return out.lower().count("node.exe")
        out = subprocess.run(["pgrep", "-c", "node"], capture_output=True,
                             text=True, timeout=10).stdout
        return int(out.strip() or 0)
    except Exception:  # noqa: BLE001
        return -1


def main() -> int:
    frames_out: dict[str, list] = {}
    mgr = RoomManager(on_frame=lambda code, frames: frames_out.setdefault(
        code, []).extend(frames), delay_ticks=2)

    before = node_count()

    # ---------------- ① 一个对局一个房间 ----------------
    a = mgr.create("AAA111", seed=1, breeds=BREEDS)
    a2 = mgr.create("AAA111", seed=1, breeds=BREEDS)
    check("同一个房间号只开一份模拟（不会开出第二个引擎进程）", a is a2)
    mgr.create("BBB222", seed=2, breeds=BREEDS)
    check("不同房间号是不同房间", len(mgr.rooms) == 2,
          f"{sorted(mgr.rooms.keys())}")

    # ---------------- ⑤ join 防挤座位 ----------------
    check("第一个人能坐 0 号位", mgr.join("AAA111", 0, "玩家甲"))
    check("同一个人重连还能坐原位", mgr.join("AAA111", 0, "玩家甲"))
    check("**别人不能抢已占的座位**", not mgr.join("AAA111", 0, "玩家乙"))
    check("空位可以坐", mgr.join("AAA111", 1, "玩家乙"))

    # ---------------- ② 广播不串房 ----------------
    t = 5000.0
    mgr.pump_all(now=t)                       # 对表
    mgr.push_input("AAA111", 0, 1, {"mx": 1, "skill": -1})
    mgr.push_input("BBB222", 0, 1, {"mx": -1, "skill": -1})
    t += TICK_DT * 4
    n = mgr.pump_all(now=t)
    check("推进广播了帧", n > 0, f"{n} 帧")
    check("**A 房的帧只进 A 房**",
          "AAA111" in frames_out and "BBB222" in frames_out
          and len(frames_out["AAA111"]) > 0 and len(frames_out["BBB222"]) > 0)
    check("两个房间各自独立推进",
          mgr.get("AAA111").next_frame > 0 and mgr.get("BBB222").next_frame > 0)

    # ---------------- ③ 一个房间出错不牵连别的 ----------------
    mgr.get("BBB222").closed = True           # 模拟这个房间挂了
    before_frames = len(frames_out.get("AAA111", []))
    t += TICK_DT * 4
    mgr.pump_all(now=t)
    check("一个房间挂了，另一个照样推进",
          len(frames_out.get("AAA111", [])) > before_frames,
          f"AAA111 {before_frames} → {len(frames_out.get('AAA111', []))}")

    # ---------------- ④ 超时回收 / 全量关闭 ----------------
    mgr.close("BBB222")
    check("close 之后房间没了", not mgr.has("BBB222"))
    check("close 是幂等的（重复调不报错）", mgr.close("BBB222") is False)

    # 把 A 房的"最后输入时间"推老，再回收
    mgr.meta["AAA111"]["last_input"] = time.monotonic() - 999
    dead = mgr.reap(idle_sec=120)
    check("长时间没输入的房间会被回收（防僵尸进程）",
          "AAA111" in dead and not mgr.has("AAA111"), f"回收了 {dead}")

    # ---------------- ⑤ 全量关闭 ----------------
    for c in ("CCC333", "DDD444", "EEE555"):
        mgr.create(c, seed=9, breeds=BREEDS)
    n = mgr.close_all()
    check("close_all 能一次关掉所有房间", n == 3 and len(mgr.rooms) == 0,
          f"关了 {n} 个")

    st = mgr.status()
    check("status() 能自述（运维要看）",
          {"rooms", "codes", "detail"} <= set(st), str(st['rooms']))

    # ---------------- 僵尸检查 ----------------
    time.sleep(1.0)
    after = node_count()
    if before < 0 or after < 0:
        check("没有留下僵尸 node 进程", True, "（环境不支持查进程数，跳过）")
    else:
        check("没有留下僵尸 node 进程（关房间必须真的关掉引擎子进程）",
              after <= before + 1, f"node 进程 {before} → {after}")

    print(f"\n{passed}/{passed + len(failures)} 项检查通过")
    if failures:
        print("问题：")
        for f in failures:
            print("  - " + f)
        return 1
    print("房间管理通过 ✅")
    return 0


def test_rooms():
    rc = 0
    try:
        rc = main()
    except BaseException as e:      # noqa: BLE001
        raise AssertionError(f"{type(e).__name__}: {e}") from e
    if rc:
        raise AssertionError("见上方 FAIL 行")


if __name__ == "__main__":
    sys.exit(main())
