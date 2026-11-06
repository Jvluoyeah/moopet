#!/usr/bin/env bash
# 边界用例合集（无需 ROS，Python 直接跑）
#
# W6 起测试分两侧：
#   core 侧（src/moopet_core/tests）—— 纯逻辑，本机可跑，CI 主力
#   link 侧（src/moopet_link/tests）—— 通信层，无需真实 ROS 也可跑（内存传输）
# 覆盖：W2 经验引擎 + W3 题库/答题/决策 + W4 情感决策 + W5 火花 +
#       W6 分层边界（core 零 ROS 依赖）+ 通信层（信封/心跳/重连/离线队列）
set -euo pipefail
WS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> [W6] 分层边界：moopet_core 必须零 ROS 依赖（大脑可搬家的地基）"
(cd "$WS_DIR/src/moopet_core" && python3 tests/test_layering.py)

echo
echo "==> [W2] 经验结算引擎边界用例"
(cd "$WS_DIR/src/moopet_core" && python3 tests/test_exp_engine.py)

echo
echo "==> [W3] 题库边界用例（等级解锁/判题/难度降档）"
(cd "$WS_DIR/src/moopet_core" && python3 tests/test_quiz_bank.py)

echo
echo "==> [W3] 答题结算边界用例（连击 5/10、周上限 200、连击豁免、成就）"
(cd "$WS_DIR/src/moopet_core" && python3 tests/test_quiz_exp.py)

echo
echo "==> [W3] 行为决策引擎路由用例"
(cd "$WS_DIR/src/moopet_core" && python3 tests/test_decision_engine.py)

echo
echo "==> [W4] 行为决策引擎完稿用例（性格/情感账户/主动关怀/仪式/纪念日/日记）"
(cd "$WS_DIR/src/moopet_core" && python3 tests/test_decision_w4.py)

echo
echo "==> [W5] 火花计划引擎用例（连续陪伴/提醒/任务/抽奖保底/里程碑）"
(cd "$WS_DIR/src/moopet_core" && python3 tests/test_spark_w5.py)

echo
echo "==> [W5] 决策引擎火花集成用例（双栈统一调度）"
(cd "$WS_DIR/src/moopet_core" && python3 tests/test_decision_w5.py)

if [ -d "$WS_DIR/src/moopet_link/tests" ]; then
  echo
  echo "==> [W6] 通信层用例（信封/心跳状态机/离线队列/重连/故障注入）"
  (cd "$WS_DIR/src/moopet_link" && python3 tests/run_all.py)
fi

if [ -d "$WS_DIR/tools/link_lab" ]; then
  echo
  echo "==> [W6] 测试台：接口契约 + 移植不变性（BRAIN=dog|backpack|sim 输出一致）"
  (cd "$WS_DIR" && python3 tools/link_lab/tests/run_all.py)
fi

echo
echo "全部边界用例通过 ✅"
