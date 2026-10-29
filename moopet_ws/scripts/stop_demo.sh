#!/usr/bin/env bash
# 停止 start_demo.sh 拉起的全部 ROS 节点
set -u
WS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$WS_DIR/logs/.pids" ]; then
  while IFS= read -r p; do kill "$p" 2>/dev/null || true; done < "$WS_DIR/logs/.pids"
  rm -f "$WS_DIR/logs/.pids"
fi
pkill -f 'ros2 run' 2>/dev/null || true
pkill -f 'colcon build' 2>/dev/null || true
echo "==> 已停止所有 demo 节点"
