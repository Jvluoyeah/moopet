#!/usr/bin/env bash
# ============================================================
# 停止 scripts/start_web.sh 在后台拉起的服务（主服务 + 剧情模式静态服务）
#
#   bash scripts/stop_web.sh            # 停 PID 文件里记的，并兜底清理占着 8080/18080 的
#   bash scripts/stop_web.sh --quiet    # 不打印过程
#
# 只认"自己起的"：优先用 .runtime/*.pid；PID 文件丢了才按端口找，
# 而且会先确认是不是本项目的进程（本项目目录 / run_local.py / http.server 端口对得上），
# 避免误杀别人的进程。
#
# ⚠️ 为什么要连"子孙进程"一起停：`run_local.py` 本身只是启动器，
#    真正监听端口的是它派生的 `python -m uvicorn app.main:app` 子进程。
#    只杀父进程的话，子进程会被 init 收养、继续占着 8080（这次实测踩到过：
#    停完之后 8080 还回 200，下一次启动就报端口被占用）。
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.runtime"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

say() { [ "$QUIET" = "1" ] || printf '%s\n' "$*"; }

# 收集 pid 的整棵进程树（广度优先）：父进程 → 子进程 → 孙进程…
tree_pids() {
  local root_pid="$1" frontier="$1" kids next
  while [ -n "$frontier" ]; do
    next=""
    for p in $frontier; do
      kids="$(pgrep -P "$p" 2>/dev/null || true)"
      next="$next $kids"
    done
    frontier="$(echo $next)"
    [ -n "$frontier" ] && root_pid="$root_pid $frontier"
  done
  echo "$root_pid"
}

# 优雅停：先 TERM（含整个进程组），等一会儿，没死就 KILL
kill_tree() {
  local root_pid="$1" pids p
  pids="$(tree_pids "$root_pid")"
  # 进程组（setsid 起的，pgid == pid）；组里可能还有启动器派生出来的其他进程
  kill -TERM -- "-$root_pid" 2>/dev/null || true
  for p in $pids; do kill -TERM "$p" 2>/dev/null || true; done
  for _ in $(seq 1 20); do
    local alive=0
    for p in $pids; do kill -0 "$p" 2>/dev/null && alive=1; done
    [ "$alive" = "0" ] && return 0
    sleep 0.25
  done
  kill -KILL -- "-$root_pid" 2>/dev/null || true
  for p in $pids; do kill -KILL "$p" 2>/dev/null || true; done
}

stop_pidfile() {
  local f="$1" what="$2" pid
  [ -f "$f" ] || return 0
  pid="$(tr -dc '0-9' < "$f" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill_tree "$pid"
    say "  [停止] $what（pid $pid 及其子进程）"
  fi
  rm -f "$f"
}

# 端口 → 监听进程 pid（去掉 WSL 等环境往 stderr 里塞的警告行）
port_pids() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lptnH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
  elif command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

# 这个 pid 是不是本项目的进程：命令行里带项目目录，或者是 run_local/http.server
looks_ours() {
  local pid="$1" port="$2" cmd
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  case "$cmd" in
    *"$ROOT"*) return 0 ;;
    *run_local.py*) return 0 ;;
    *http.server*"$port"*) return 0 ;;
  esac
  return 1
}

stop_pidfile "$RUN_DIR/server.pid" "主服务"
stop_pidfile "$RUN_DIR/gal.pid" "剧情模式服务"

# ---- 兜底：PID 文件丢了的场合，按端口找（uvicorn 子进程不读 PID 文件，这里正好补上）----
for pair in "${MOOPET_PORT:-8080}:主服务" "18080:剧情模式服务"; do
  port="${pair%%:*}"; what="${pair#*:}"
  for pid in $(port_pids "$port"); do
    if looks_ours "$pid" "$port"; then
      kill_tree "$pid"
      say "  [停止] 端口 $port 上的$what（pid $pid）"
    else
      say "  [跳过] 端口 $port 被别的程序占着（pid $pid）"
    fi
  done
done

rmdir "$RUN_DIR/logs" 2>/dev/null || true
say "完成"
