#!/usr/bin/env bash
# ============================================================
# 长夜月 · 机械狗 —— Linux 一键启动（等价于 Windows 的 start_web.ps1）
#
#   bash scripts/start_web.sh                 # 起主服务 + 剧情模式，然后（桌面环境里）打开浏览器
#   bash scripts/start_web.sh --foreground    # 前台运行，Ctrl+C 一起停（推荐在终端里用）
#   bash scripts/start_web.sh --no-gal        # 只起主服务（剧情入口会提示 502）
#   bash scripts/start_web.sh --no-browser    # 不自动开浏览器（服务器/无桌面环境）
#   bash scripts/start_web.sh --host 0.0.0.0  # 让局域网/手机也能访问
#   MOOPET_PORT=9000 bash scripts/start_web.sh
#
# 顺序和 Windows 版一致：**先保剧情模式，再看主服务**。
# 反过来的话，"主服务还活着、gal 挂了"时会直接开浏览器退出，剧情模式就永远起不来。
#
# 与 Windows 版的差别（Linux 特有）：
#   · 服务在**后台**（setsid + PID 文件 + 日志），关终端不会把服务带走
#   · 用 `bash scripts/stop_web.sh` 停；`--foreground` 则是当前终端的 Ctrl+C
#   · 浏览器只在有桌面时自动打开（$DISPLAY / $WAYLAND_DISPLAY），否则只打印地址
#   · WSL 下会额外提示"用 Windows 的浏览器直接开 127.0.0.1"
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${MOOPET_PORT:-8080}"
GAL_PORT="${MOOPET_GAL_PORT:-18080}"
HOST="${MOOPET_HOST:-127.0.0.1}"
URL="http://127.0.0.1:${PORT}/"
GAL_URL="${URL}gal/web/index.html"

MODE="background"     # background | foreground
WANT_GAL=1
WANT_BROWSER=1
for arg in "$@"; do
  case "$arg" in
    --foreground|-f) MODE="foreground" ;;
    --no-gal)        WANT_GAL=0 ;;
    --no-browser)    WANT_BROWSER=0 ;;
    --host)          echo "请用 --host=0.0.0.0 这种写法"; exit 2 ;;
    --host=*)        HOST="${arg#*=}" ;;
    -h|--help)       sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数：$arg（--foreground / --no-gal / --no-browser / --host=<ip>）"; exit 2 ;;
  esac
done

RUN_DIR="$ROOT/.runtime"
LOG_DIR="$RUN_DIR/logs"
mkdir -p "$LOG_DIR"
PY_PID="$RUN_DIR/server.pid"
GAL_PID="$RUN_DIR/gal.pid"

say()  { printf '\n\033[33m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m[OK]\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m[!]\033[0m %s\n' "$*"; }
info() { printf '  \033[36m[i]\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------- 基础工具 ----------------
# 检查端口是否有人监听：优先用 /dev/tcp（纯 bash，不依赖 ss/lsof/netstat）
port_open() {
  local p="$1"
  if command -v timeout >/dev/null 2>&1; then
    timeout 1 bash -c "exec 3<>/dev/tcp/127.0.0.1/$p" 2>/dev/null && return 0
  else
    (exec 3<>/dev/tcp/127.0.0.1/"$p") 2>/dev/null && return 0
  fi
  return 1
}

wait_port() {     # wait_port 端口 秒数 名称
  local p="$1" secs="$2" what="$3" i
  for ((i = 0; i < secs * 2; i++)); do
    port_open "$p" && return 0
    sleep 0.5
  done
  warn "$what 没能在 ${secs}s 内起来（端口 $p）"
  return 1
}

# 一个 PID 是不是还活着（`.runtime/*.pid` 里存的进程）
pid_alive() {
  local f="$1"
  [ -f "$f" ] || return 1
  local pid; pid="$(cat "$f" 2>/dev/null || true)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null
}

http_ok() {       # http_ok 地址  —— 只要拿到 HTTP 响应就算有人
  command -v curl >/dev/null 2>&1 || return 1
  curl -fsS -o /dev/null --max-time 3 "$1" 2>/dev/null
}

is_wsl() {
  [ -n "${WSL_DISTRO_NAME:-}" ] && return 0
  grep -qi microsoft /proc/version 2>/dev/null
}

open_browser() {
  local url="$1"
  if [ "$WANT_BROWSER" = "0" ]; then return 0; fi
  if is_wsl; then
    info "WSL 环境：直接在 Windows 浏览器里打开 $url"
    return 0
  fi
  if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
    info "没有图形桌面（\$DISPLAY/\$WAYLAND_DISPLAY 都为空），请手动打开：$url"
    return 0
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    (xdg-open "$url" >/dev/null 2>&1 &) || true
    return 0
  fi
  info "没找到 xdg-open（sudo apt install -y xdg-utils 可装），请手动打开：$url"
}

# ---------------- 0. 解释器 ----------------
# .env：可选的本地配置（已在 .gitignore 里，不会被提交）
# 只用简单 KEY=VALUE 行，不 source —— .env 不该能执行任意命令。
if [ -f "$ROOT/.env" ]; then
  while IFS='=' read -r key val; do
    case "$key" in
      ''|\#*) continue ;;
    esac
    key="${key#export }"; key="${key//[[:space:]]/}"
    # 不覆盖调用者显式给了的环境变量（命令行 > .env）
    if [ -z "$(eval "echo \${$key:-}")" ]; then
      val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
      export "$key=$val"
    fi
  done < "$ROOT/.env"
  # .env 里若改了端口，重新算一遍地址
  PORT="${MOOPET_PORT:-$PORT}"
  GAL_PORT="${MOOPET_GAL_PORT:-$GAL_PORT}"
  URL="http://127.0.0.1:${PORT}/"
  GAL_URL="${URL}gal/web/index.html"
fi

PY=""
if [ -x "$ROOT/.venv/bin/python" ]; then
  PY="$ROOT/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PY="$(command -v python3)"
else
  die "没有 Python。先跑：bash scripts/setup.sh"
fi

say "  长夜月·机械狗  本地启动"
echo "  ----------------------------------------"
echo "  项目：$ROOT"
echo "  服务：$URL    （绑定 $HOST:$PORT）"

if [ "$PY" != "$ROOT/.venv/bin/python" ]; then
  warn "没找到 .venv，将用系统 python3（$PY）。建议先跑 bash scripts/setup.sh 建虚拟环境。"
fi

# 依赖缺失时给准确指引（run_local.py 自己也会查一遍，这里提前拦住，避免后台日志里才发现）
if ! "$PY" -c 'import fastapi, uvicorn, sqlalchemy' >/dev/null 2>&1; then
  die "当前解释器缺依赖（fastapi/uvicorn/sqlalchemy）。
      先跑：bash scripts/setup.sh
      或手动：$PY -m pip install -r server/requirements.txt"
fi

# ---------------- 1. 剧情模式静态服务 ----------------
if [ "$WANT_GAL" = "1" ]; then
  GAL_DIR="$ROOT/gal"
  if [ ! -f "$GAL_DIR/web/index.html" ]; then
    warn "找不到 gal/web/index.html，剧情模式会打不开（游戏本体照常能玩）"
  fi
  if port_open "$GAL_PORT"; then
    info "[1] 剧情模式服务：已经在 $GAL_PORT 端口跑着"
  elif [ "$MODE" = "foreground" ]; then
    info "[1] 剧情模式服务：前台模式，起在 $GAL_PORT（日志 .runtime/logs/gal-http.log）"
    set -m   # 让后台子进程进入独立进程组，方便收尾时整组停掉
    "$PY" -m http.server "$GAL_PORT" --bind 127.0.0.1 --directory "$GAL_DIR" \
      >"$LOG_DIR/gal-http.log" 2>&1 &
    GAL_CHILD=$!
    set +m
    wait_port "$GAL_PORT" 10 "剧情模式服务" || true
  else
    info "[1] 剧情模式服务：正在启动（端口 $GAL_PORT）..."
    # --directory 直接指向 gal/，等价于 Windows 版"进 gal 目录再起 http.server"，
    # 但不会改变本脚本自己的工作目录（少一个 cd 回来的坑）
    setsid nohup "$PY" -m http.server "$GAL_PORT" --bind 127.0.0.1 --directory "$GAL_DIR" \
      >"$LOG_DIR/gal-http.log" 2>&1 < /dev/null &
    echo $! > "$GAL_PID"
    wait_port "$GAL_PORT" 15 "剧情模式服务" || die "剧情模式服务没起来，看 $LOG_DIR/gal-http.log"
    ok "剧情模式服务就绪（pid $(cat "$GAL_PID")）"
  fi
else
  info "[1] 剧情模式：已按 --no-gal 跳过"
fi

# ---------------- 已有主服务：只开浏览器 ----------------
if port_open "$PORT"; then
  info "[i] 主服务已经在 $PORT 端口跑着，直接开浏览器"
  ok "$URL"
  echo "    剧情模式：$GAL_URL"
  open_browser "$URL"
  exit 0
fi

# ---------------- 2. 前端构建产物 ----------------
if [ -f web/dist/index.html ]; then
  ok "[2] 前端构建产物：在（web/dist）"
else
  if command -v npm >/dev/null 2>&1; then
    info "[2] 前端构建产物：还没有，先构建（第一次会慢一点）..."
    ( cd web && npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1 )
    ( cd web && npm run build ) || die "npm run build 失败"
    ok "构建完成"
  else
    warn "[2] 没有 web/dist 也没有 npm：只提供 API。装好 Node 后 cd web && npm ci && npm run build"
  fi
fi

# ---------------- 3. 主服务 ----------------
export MOOPET_HOST="$HOST"
export MOOPET_PORT="$PORT"
# 数据库跟 Windows 版对齐：server/data/dev.db（可用 MOOPET_DATABASE_URL 覆盖）
if [ -z "${MOOPET_DATABASE_URL:-}" ]; then
  export MOOPET_DATABASE_URL="sqlite:///$ROOT/server/data/dev.db"
fi
# 日志/控制台统一 UTF-8：节点与服务端日志里中文很多，编码不对会乱码甚至抛 UnicodeEncodeError
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

if [ -z "${MOOPET_SECRET_KEY:-}" ]; then
  warn "MOOPET_SECRET_KEY 未设置：用开发默认密钥（本地演示没问题，**对外暴露前必须换**）"
  info "生成一个写进 .env（本脚本下次会自动读）："
  info "  M=\"\$(openssl rand -hex 32)\"; sed -i \"/^MOOPET_SECRET_KEY=/d\" .env 2>/dev/null; echo \"MOOPET_SECRET_KEY=\$M\" >> .env"
fi

SERVE_URL="http://127.0.0.1:$PORT/"
if [ "$MODE" = "foreground" ]; then
  say "[3] 主服务：前台运行（Ctrl+C 停止，会一并停掉剧情模式）"
  cleanup() {
    status=$?
    trap - EXIT INT TERM
    [ -n "${GAL_CHILD:-}" ] && kill "$GAL_CHILD" 2>/dev/null || true
    exit $status
  }
  trap cleanup EXIT INT TERM
  cd "$ROOT/server" && exec "$PY" run_local.py
fi

info "[3] 主服务：正在启动（端口 $PORT，日志 .runtime/logs/server.log）..."
setsid nohup "$PY" "$ROOT/server/run_local.py" >"$LOG_DIR/server.log" 2>&1 < /dev/null &
echo $! > "$PY_PID"

if ! wait_port "$PORT" 40 "主服务"; then
  tail -n 30 "$LOG_DIR/server.log" || true
  die "主服务没起来，完整日志：$LOG_DIR/server.log（可用 bash scripts/stop_web.sh 收尾）"
fi

if command -v curl >/dev/null 2>&1; then
  if http_ok "${SERVE_URL}api/health"; then ok "健康检查通过：${SERVE_URL}api/health"
  else warn "端口通了，但 /api/health 没返回 200，看 $LOG_DIR/server.log"; fi
fi

echo "  ----------------------------------------"
ok "起好了：$URL"
echo "    剧情模式：$GAL_URL"
if [ "$HOST" = "0.0.0.0" ] || [ "$HOST" = "::" ]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "${LAN_IP:-}" ] && echo "    局域网访问：http://$LAN_IP:$PORT/"
fi
echo "    服务日志：$LOG_DIR/server.log"
echo "    停止服务：bash scripts/stop_web.sh"
open_browser "$URL"
