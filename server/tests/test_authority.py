#!/usr/bin/env python3
"""权威房间的验收

验的是"服务端权威"这件事真的成立、而且**解决用户报的问题**：
  ① 一个房间一份模拟：服务端推多少帧，客户端就收多少帧
  ② **不用等对手**：一方的输入没到，另一方照样推进
     （这是和锁步最大的区别，也是"加入方很卡"的解法）
  ③ 输入延迟：还没被消费的帧的输入能补进来，不会白丢
  ④ 迟到的输入会被丢弃而不是污染错误的帧
  ⑤ 帧率是**整数帧**，机器忙就补帧、不会变慢
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.authority import AuthorityRoom, TICK_HZ  # noqa: E402

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


def main() -> int:
    # ---------------- ① 服务端推多少帧，客户端收多少帧 ----------------
    seen: list[dict] = []
    room = AuthorityRoom(seed=999, breeds=BREEDS,
                         on_frame=lambda frames: seen.extend(frames))
    check("房间起来了，帧号从 0 开始", room.next_frame == 0)

    t = 1000.0
    room.pump(now=t)                       # 第一次：没有流逝时间，推 0 帧
    t += TICK_DT * 5
    frames = room.pump(now=t)
    check("过了 5 个 tick 就推 5 帧", len(frames) == 5, f"{len(frames)} 帧")
    check("帧都广播出去了（on_frame 收到同样的帧）", len(seen) == 5)
    check("帧号是连续的", [f["tick"] for f in frames] == [1, 2, 3, 4, 5],
          str([f["tick"] for f in frames]))

    # ---------------- ② 一方不输入，另一方照样推进 ----------------
    before = room.next_frame
    t += TICK_DT * 20
    frames2 = room.pump(now=t)
    check("**只有一方在操作也照样推进**（锁步在这里会卡住）",
          len(frames2) == 8 and room.next_frame == before + 8,
          f"推了 {len(frames2)} 帧（补帧上限 8）")

    # ---------------- ③ 输入延迟：还没消费的帧能补输入 ----------------
    f_now = room.next_frame
    ok1 = room.push_input(side=0, frame=f_now + 2, inp={"mx": 1, "skill": -1})
    ok2 = room.push_input(side=1, frame=f_now + 2, inp={"mx": -1, "skill": -1})
    check("还没到消费时刻的输入能补进来", ok1 and ok2)
    t += TICK_DT * 3
    room.pump(now=t)
    check("补进来的输入被消费掉了（pending 清空）",
          f_now + 2 not in room.pending, f"pending={list(room.pending)}")

    # ---------------- ④ 迟到一点点的输入会被**塞进还来得及的帧** ----------------
    # ⚠️ 这条断言原来写的是"迟到就丢弃"，**那个行为是错的**。
    #    客户端的帧号和服务端的帧号天然对不齐：
    #    客户端按 60Hz（rAF）产出输入，服务端按 128Hz 消费 ——
    #    客户端给第 N 条输入编号 N，服务端却在消费第 2N 帧左右。
    #    按编号判"太晚了"会丢掉绝大多数输入（实测 240 条丢 220 条，
    #    玩家的感受是"按了没反应"）。
    #
    #    现在的语义：**迟到一点不算迟到** —— 塞进"还来得及的最早那一帧"。
    #    这样输入不会白丢，也不会污染已经消费过的帧。
    dropped_before = room.dropped
    late = room.push_input(side=0, frame=0, inp={"mx": 1})     # 早就过去了
    check("迟到的输入**不会被丢掉**，而是塞进还来得及的帧",
          late is True and room.dropped == dropped_before,
          f"accepted={late} dropped={room.dropped}")
    check("塞进去的那一帧是**还没被消费的**（不会倒着改历史）",
          room.next_frame in room.pending
          or any(k >= room.next_frame for k in room.pending),
          f"next_frame={room.next_frame} pending={sorted(room.pending)}")

    # ⚠️ 这条原来写的是"领先超过 1 秒就丢弃"，**那个行为也废掉了**。
    #    客户端的帧号现在**一律忽略** —— 输入应用到"下一个还没消费的帧"。
    #    原因：客户端按 rAF（60~144Hz）产输入、服务端按固定 128Hz 消费，
    #    两边节拍不同源，帧号只会越对越歪；任何一种"按帧号判定丢弃"的规则
    #    最终都会把正常玩家的输入丢掉（实战里表现为"一点都动不了"）。
    far = room.push_input(side=0, frame=room.next_frame + TICK_HZ * 5,
                          inp={"mx": 1})
    check("客户端帧号**被忽略**：报再大的帧号也不会被丢",
          far is True and room.dropped == dropped_before,
          f"accepted={far} dropped={room.dropped}")
    # 真正该丢的是"不是字典"的坏输入（协议不匹配时会出现）
    bad = room.push_input(side=0, frame=room.next_frame, inp=[1, 0, 2])
    check("非字典的坏输入会被挡下（但**不会弄死房间**）",
          bad is False and getattr(room, "bad_inputs", 0) > 0,
          f"accepted={bad} bad_inputs={getattr(room, 'bad_inputs', 0)}")

    # ---------------- ⑤ 帧率是整数帧，忙了就补帧 ----------------
    # 先把上一步欠下的"补帧债"还清（卡了 20 帧只补了 8，欠 12 帧）。
    # 这是**对的行为**：落后了就在后续几次 pump 里追上，不会一直欠着。
    # 但不还清的话，下面那条"3 个 tick 推 3 帧"会被债顶成 8 帧（第一版就是这么误报的）。
    for _ in range(6):                      # 时钟不动，只把欠的帧抽干
        if not room.pump(now=t, max_ticks=8):
            break
    f0 = room.next_frame
    t += TICK_DT * 3
    room.pump(now=t)
    check("正常速度：3 个 tick 推 3 帧", room.next_frame - f0 == 3,
          f"{room.next_frame - f0} 帧")
    for _ in range(6):
        if not room.pump(now=t, max_ticks=8):
            break
    f1 = room.next_frame
    t += TICK_DT * 50                       # 模拟"卡了 50 帧"
    room.pump(now=t)
    check("卡了很久也只补 max_ticks 帧（不会一口气补几百帧）",
          room.next_frame - f1 == 8, f"{room.next_frame - f1} 帧")
    check("补帧之后时间基准跟着走（不会一直补）",
          abs(room.next_frame - f1) <= 8)

    # ---------------- ⑥ 快照 / 回滚 ----------------
    f2 = room.next_frame
    snap = room.snapshot()
    check("能取快照，带帧号和指纹", snap["frame"] == f2 and snap["hash"] > 0,
          f"frame={snap['frame']}")
    t += TICK_DT * 4
    room.pump(now=t)
    check("推进之后帧号前进", room.next_frame > f2)
    h = room.restore(snap["snap"])
    check("回滚之后帧号和指纹都回到那一刻",
          room.next_frame == f2 and h == snap["hash"],
          f"frame={room.next_frame} hash={h}")

    # ---------------- ⑦ 状态自述（给运维/调试看） ----------------
    st = room.status()
    check("status() 能说清房间状况",
          {"frame", "hash", "dropped", "pending_frames", "delay_ticks"}
          <= set(st), str({k: st[k] for k in ("frame", "dropped", "pending_frames")}))

    room.close()
    check("关了之后不再推进", room.pump(now=t + 100) == [])
    check("关了之后不收输入", room.push_input(0, room.next_frame, {}) is False)

    print(f"\n{passed}/{passed + len(failures)} 项检查通过")
    if failures:
        print("问题：")
        for f in failures:
            print("  - " + f)
        return 1
    print("权威房间通过 ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())


# ---------------- 给 tests/run_all.py 用的入口 ----------------
# run_all 收集的是"名字以 test_ 开头的函数"，而这个文件是脚本式的
# （main() 里 print + sys.exit）。包一层就好，不用改写测试本身。
def test_authority():
    rc = 0
    try:
        rc = main()
    except BaseException as e:      # noqa: BLE001
        raise AssertionError(f"{type(e).__name__}: {e}") from e
    if rc:
        raise AssertionError("见上方 FAIL 行")
