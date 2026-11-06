#!/usr/bin/env bash
# 停止 start_demo.sh 拉起的全部 ROS 节点
set -u
WS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$WS_DIR/logs/.pids" ]; then
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    # 先停整个进程组再停进程：ros2 run 往往是"包装进程 + 子节点"两层，
    # 只 kill 包装进程在 Linux 上会留下真正的节点（没有子进程回收时尤其明显）
    kill -TERM -- "-$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null || true
  done < "$WS_DIR/logs/.pids"
  sleep 1
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    kill -KILL -- "-$p" 2>/dev/null || kill -KILL "$p" 2>/dev/null || true
  done < "$WS_DIR/logs/.pids"
  rm -f "$WS_DIR/logs/.pids"
fi
# 兜底：按命令行前缀匹配（`ros2 run moopet_...`），别用宽泛的 'ros2 run'，
# 免得把别人同一台机器上跑的其他 ROS 演示一起打掉。
pkill -f 'ros2 run moopet_' 2>/dev/null || true
pkill -f 'colcon build' 2>/dev/null || true
echo "==> 已停止所有 demo 节点"
