#!/usr/bin/env bash
# W1 冒烟测试：编译 + T/S/A 往返（单机自检；W3 起校验 16 项接口）
set -euo pipefail
source /opt/ros/humble/setup.bash

WS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WS_DIR"
colcon build --symlink-install --packages-select \
  moopet_interfaces moopet_backpack moopet_dog || exit 1
source install/setup.bash

echo "==> 验证自定义接口是否生成（16 项，W3 新增 DecisionEventMsg）"
for iface in \
  moopet_interfaces/msg/EmotionMsg \
  moopet_interfaces/msg/AirQualityMsg \
  moopet_interfaces/msg/TouchEventMsg \
  moopet_interfaces/msg/IrCodeMsg \
  moopet_interfaces/msg/QuizMsg \
  moopet_interfaces/msg/QuizAnswerMsg \
  moopet_interfaces/msg/StreakMsg \
  moopet_interfaces/msg/HeartbeatMsg \
  moopet_interfaces/msg/OdomMsg \
  moopet_interfaces/msg/VoiceCmdMsg \
  moopet_interfaces/msg/VisionMsg \
  moopet_interfaces/msg/DogStateMsg \
  moopet_interfaces/msg/DecisionEventMsg \
  moopet_interfaces/srv/DogAction \
  moopet_interfaces/srv/DogCombo \
  moopet_interfaces/action/TtsSpeak ; do
  if ros2 interface show "$iface" >/dev/null 2>&1; then
    echo "  [OK] $iface"
  else
    echo "  [FAIL] $iface"
    exit 1
  fi
done

echo "==> 冒烟：T/S/A 往返（单机自检 both）"
ros2 run moopet_dog smoke_test_node --role both &
SMOKE_PID=$!
sleep 12
kill "$SMOKE_PID" 2>/dev/null || true
echo "==> 冒烟测试完成（查看上方日志确认 T/S/A 均成功）"
