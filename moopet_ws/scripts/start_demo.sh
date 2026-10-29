#!/usr/bin/env bash
# ============================================================
# W5 全套 demo 一键启动（Ubuntu 22.04 + ROS2 Humble）
#   - 模拟狗(moopet_dog) + 背包盒子(moopet_backpack) 全部节点
#   - 4 个仿真感知节点(demo 模式) + 心跳 + 里程 + 经验结算
#   - W3：quiz_node(答题/连击/难度降档/决策事件) + decision_engine_node
#   - W4：backpack TTS 节点(决策→语音播报) + 决策引擎定时主动检查
#         （长沉默主动关怀 / 早安晚安 / 纪念日 / 性格播报 / 成长日记）
#   - W5：火花计划（连续陪伴续火/熄灭/挽回 + 三档提醒 18/21/23 + 每日任务
#         签到抽奖 + 里程碑解锁 LED/肤位占位），统一并入决策引擎 on_tick 调度
#
# 用法：
#   ./start_demo.sh                # 单机全自动 demo（默认）
#   ./start_demo.sh --machine dog  # 双机联调：本机只起狗侧
#   ./start_demo.sh --machine backpack   # 双机联调：本机只起背包侧
#   ./start_demo.sh --no-build     # 跳过 colcon build
#   ./start_demo.sh --no-demo      # 不起仿真节点的 demo 脚本（手动触发）
#   DB_PATH=/tmp/moopet.db ./start_demo.sh   # 指定数据库（经验库+日记库+火花库共用）
#
# 停止：Ctrl+C 自动清理；或另开终端执行 ./stop_demo.sh
# ============================================================
set -euo pipefail

export PYTHONIOENCODING=utf-8

WS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$WS_DIR/logs"
DB_PATH="${DB_PATH:-$HOME/.moopet/moopet.db}"
MACHINE=all
DO_BUILD=1
DO_DEMO=1

for arg in "$@"; do
  case "$arg" in
    --no-build) DO_BUILD=0 ;;
    --no-demo)  DO_DEMO=0 ;;
    --machine)  echo "请用 --machine=dog|backpack|all" ; exit 1 ;;
    --machine=*) MACHINE="${arg#*=}" ;;
    *) echo "未知参数: $arg"; exit 1 ;;
  esac
done

if [ ! -f /opt/ros/humble/setup.bash ]; then
  echo "[错误] 未找到 ROS2 Humble：/opt/ros/humble/setup.bash"
  echo "请先按 docs/部署文档.md 安装 ROS2 Humble"
  exit 1
fi
source /opt/ros/humble/setup.bash

mkdir -p "$LOG_DIR"

if [ "$DO_BUILD" = 1 ]; then
  echo "==> 编译工作空间（moopet_interfaces / moopet_backpack / moopet_dog）"
  cd "$WS_DIR"
  colcon build --symlink-install --packages-select \
    moopet_interfaces moopet_backpack moopet_dog || {
      echo "[错误] colcon build 失败"; exit 1; }
fi

source "$WS_DIR/install/setup.bash"

echo "=============================================="
echo " 养成系机械狗 · W5 火花计划 + 综合 全套 demo"
echo " 机器: $MACHINE   数据库: $DB_PATH"
echo "=============================================="

PID_FILE="$LOG_DIR/.pids"
: > "$PID_FILE"

# 预建日志文件，避免 tail -F 竞态
for f in backpack_heartbeat backpack_audio backpack_vision backpack_env \
         backpack_touch backpack_tts dog_odom dog_exp_engine dog_state_mgr \
         dog_quiz dog_decision_engine; do
  : > "$LOG_DIR/$f.log"
done

start_node() {
  local name="$1"; shift
  nohup ros2 run "$@" > "$LOG_DIR/$name.log" 2>&1 &
  echo "$!" >> "$PID_FILE"
  echo "  [启动] $name -> logs/$name.log"
}

cleanup() {
  echo
  echo "==> 正在停止所有节点..."
  if [ -f "$PID_FILE" ]; then
    while IFS= read -r p; do kill "$p" 2>/dev/null || true; done < "$PID_FILE"
  fi
  pkill -f 'ros2 run' 2>/dev/null || true
  echo "==> 已清理，退出"
}
trap cleanup EXIT INT TERM

# ---------------- 背包盒子（仿真感知 + 心跳） ----------------
if [ "$MACHINE" = all ] || [ "$MACHINE" = backpack ]; then
  start_node backpack_heartbeat moopet_backpack heartbeat_node
  # W4：背包 TTS 节点——接住决策引擎的播报目标（demo 模式打印播报内容）
  if [ "$DO_DEMO" = 1 ]; then
    start_node backpack_tts      moopet_backpack tts_node      --demo
  else
    start_node backpack_tts      moopet_backpack tts_node
  fi
  if [ "$DO_DEMO" = 1 ]; then
    start_node backpack_audio    moopet_backpack audio_node    --demo --demo-delay 0.5
    start_node backpack_vision   moopet_backpack vision_node   --demo --demo-delay 1.0
    start_node backpack_env      moopet_backpack env_node      --demo --demo-delay 0.8
    start_node backpack_touch    moopet_backpack touch_node    --demo --demo-delay 1.2
  else
    start_node backpack_audio    moopet_backpack audio_node
    start_node backpack_vision   moopet_backpack vision_node
    start_node backpack_env      moopet_backpack env_node
    start_node backpack_touch    moopet_backpack touch_node
  fi
fi

# ---------------- 狗本体（里程 / 经验结算 / 状态） ----------------
if [ "$MACHINE" = all ] || [ "$MACHINE" = dog ]; then
  if [ "$DO_DEMO" = 1 ]; then
    start_node dog_odom          moopet_dog odom_node        --demo --demo-delay 2.0
  else
    start_node dog_odom          moopet_dog odom_node
  fi
  start_node dog_exp_engine  moopet_dog exp_engine_node --ros-args -p db_path:="$DB_PATH"
  start_node dog_state_mgr   moopet_dog state_mgr_node
  # W3：答题节点（demo 自动问答，等 LV.3 解锁题库后开始）+ 决策引擎入口
  if [ "$DO_DEMO" = 1 ]; then
    start_node dog_quiz          moopet_dog quiz_node           --demo --demo-delay 6.0
  else
    start_node dog_quiz          moopet_dog quiz_node
  fi
  start_node dog_decision_engine moopet_dog decision_engine_node
fi

echo
echo "==> 节点已全部拉起，等待 3s 进入 demo 场景..."
sleep 3

# ---------------- demo 场景：动作加点 ----------------
if [ "$MACHINE" = all ] && [ "$DO_DEMO" = 1 ]; then
  echo "==> [场景] 调用 /dog/action：投影 +10 经验"
  ros2 service call /dog/action moopet_interfaces/srv/DogAction \
    "{action_type: projector}" || echo "  (投影调用失败，可手动重试)"
  sleep 1
  echo "==> [场景] 调用 /dog/action：通讯 +10 经验"
  ros2 service call /dog/action moopet_interfaces/srv/DogAction \
    "{action_type: communication}" || echo "  (通讯调用失败，可手动重试)"
  sleep 1
  echo "==> [场景] 调用 /dog/action：握手 +10 经验"
  ros2 service call /dog/action moopet_interfaces/srv/DogAction \
    "{action_type: handshake}" || echo "  (握手调用失败，可手动重试)"
  sleep 1
  echo "==> [场景] 桥接判题：调用 /dog/combo（连击结算服务，web 后端同款接口）"
  ros2 service call /dog/combo moopet_interfaces/srv/DogCombo \
    "{combo_count: 1, category: 数学}" || echo "  (/dog/combo 调用失败，可手动重试)"
fi

echo
echo "==> demo 进行中，实时跟踪日志（决策引擎每 60s 做一次主动检查："
echo "    长沉默主动关怀 / 早安晚安 / 纪念日 / 火花三档提醒；"
echo "    跨日自动写成长日记 / 火花断档熄灭结算）"
echo "    dog_decision 日志     : logs/dog_decision_engine.log"
echo "    backpack_tts 日志     : logs/backpack_tts.log"
echo "    dog_exp_engine 日志   : logs/dog_exp_engine.log"
echo "    dog_quiz 日志         : logs/dog_quiz.log"
echo "    状态卡日志            : logs/dog_state_mgr.log"
echo "    各感知节点日志        : logs/backpack_*.log"
echo "------------------------------------------------------------"
tail -n +1 -F "$LOG_DIR/dog_decision_engine.log" "$LOG_DIR/backpack_tts.log" \
  "$LOG_DIR/dog_exp_engine.log" "$LOG_DIR/dog_quiz.log" \
  "$LOG_DIR/dog_state_mgr.log" "$LOG_DIR/backpack_audio.log" \
  "$LOG_DIR/backpack_vision.log" "$LOG_DIR/backpack_env.log" \
  "$LOG_DIR/backpack_touch.log" "$LOG_DIR/backpack_heartbeat.log" \
  "$LOG_DIR/dog_odom.log"
