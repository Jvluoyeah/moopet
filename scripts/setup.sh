#!/usr/bin/env bash
# ============================================================
# 长夜月 · 机械狗 —— Linux（重点：Ubuntu 22.04）一键准备环境
#
#   bash scripts/setup.sh              # 安装依赖 + 构建前端（幂等，可反复跑）
#   bash scripts/setup.sh --skip-build  # 只装依赖，不构建前端
#   bash scripts/setup.sh --no-apt      # 不碰系统包（只用现成的 python3-venv / node）
#
# 它做的事：
#   1. 检查 python3 与 venv 模块（Ubuntu 22.04 的 python3-venv 默认**没装**）
#   2. 建虚拟环境 .venv —— Ubuntu 22.04 起是 PEP 668，往系统 Python 里 pip install
#      会被直接拒绝（externally-managed-environment），所以永远走 venv
#   3. 装 server/requirements.txt
#   4. 构建前端 web/dist（服务端会把它一并托管，之后只要起一个服务）
#   5. 打印运行时自检（scripts/probe_runtime.py）
#
# 关于 Node：Ubuntu 22.04 的 apt 源里 Node 太旧，脚本**不会替你换 apt 源**
# （那会动系统）。缺 Node 时给出 NodeSource / nvm 的确切命令，然后跳过前端构建。
# 没有 Node 也能玩单机/PVE，只是"服务端权威对战"和前端构建用不了。
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VENV="$ROOT/.venv"
DO_BUILD=1
USE_APT=1
PIP_ARGS=()          # 额外传给 pip 的参数（如 -i 镜像）
for arg in "$@"; do
  case "$arg" in
    --skip-build) DO_BUILD=0 ;;
    --no-apt)     USE_APT=0 ;;
    --index-url=*) PIP_ARGS+=(-i "${arg#*=}") ;;
    -h|--help)    sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数：$arg（可用：--skip-build / --no-apt / --index-url=<镜像>）"; exit 2 ;;
  esac
done

say()  { printf '\n\033[33m==> %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m[OK]\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else return 1
  fi
}

# 无人值守时 sudo 会卡在要密码上（甚至把整个脚本挂住）。先探一次：
# 有 sudo 但没免密，就不要自动装系统包，只把命令打出来让人自己跑。
SUDO_FREE=0
if [ "$(id -u)" -eq 0 ]; then SUDO_FREE=1
elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then SUDO_FREE=1
fi
APT_HINT="sudo apt update && sudo apt install -y python3-venv"

OS_ID="unknown"; OS_VER=""
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-unknown}"; OS_VER="${VERSION_ID:-}"
fi

say "长夜月 · 机械狗 / Linux 环境准备"
echo "  项目目录：$ROOT"
echo "  系统    ：$OS_ID $OS_VER（$(uname -m)）"

# ------------------------------------------------------------
# 1. Python 与 venv
# ------------------------------------------------------------
say "[1/4] Python"
command -v python3 >/dev/null 2>&1 || die "没有 python3。先装：sudo apt install -y python3 python3-venv"
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' \
  || die "Python 版本太低（$(python3 -V 2>&1)），需要 3.9+；Ubuntu 22.04 自带 3.10 可用"
ok "$(python3 -V 2>&1)"

has_ensurepip() { python3 -c 'import ensurepip' >/dev/null 2>&1; }

VENV_OK=0
if [ -x "$VENV/bin/python" ] && "$VENV/bin/python" -c 'import pip' >/dev/null 2>&1; then
  VENV_OK=1
  ok "虚拟环境就绪：$("$VENV/bin/python" -V 2>&1)（带 pip）"
else
  say "  创建虚拟环境 $VENV"
  rm -rf "$VENV"
  if has_ensurepip; then
    python3 -m venv "$VENV" || die "python3 -m venv 失败"
    VENV_OK=1
  else
    warn "系统 python3 没有 ensurepip：Ubuntu 22.04 默认没装 python3-venv"
    if [ "$USE_APT" = "1" ] && [ "$SUDO_FREE" = "1" ] && command -v apt-get >/dev/null 2>&1; then
      echo "     尝试：$APT_HINT"
      if as_root apt-get install -y python3-venv && has_ensurepip; then
        python3 -m venv "$VENV" && VENV_OK=1
      fi
    fi
    if [ "$VENV_OK" = "0" ]; then
      warn "装不上 python3-venv（没有 sudo 权限？）。退回 --without-pip 建环境，"
      warn "再尝试用 get-pip.py 引导 pip。"
      python3 -m venv --without-pip "$VENV" || die "连 --without-pip 都建不出来"
      RTMP="$(mktemp -d)"
      if command -v curl >/dev/null 2>&1 \
         && curl -fsSL -o "$RTMP/get-pip.py" https://bootstrap.pypa.io/get-pip.py; then
        # get-pip 默认装到用户 site-packages，再拷进 venv
        PIP_PREFIX="$RTMP/pip"
        python3 "$RTMP/get-pip.py" --prefix "$PIP_PREFIX" "${PIP_ARGS[@]}" >/dev/null 2>&1 || true
        SITE="$("$VENV/bin/python" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
        PY_TAG="$("$VENV/bin/python" -c 'import sys; print("python%d.%d" % sys.version_info[:2])')"
        if [ -d "$PIP_PREFIX/lib/$PY_TAG/site-packages/pip" ]; then
          cp -r "$PIP_PREFIX/lib/$PY_TAG/site-packages/." "$SITE/"
          VENV_OK=1
          ok "已用 get-pip.py 给虚拟环境补上 pip"
        fi
      fi
      rm -rf "$RTMP"
      if [ "$VENV_OK" = "0" ]; then
        cat >&2 <<EOF
[x] 建不出带 pip 的虚拟环境。请让有 sudo 权限的人执行一次：
      $APT_HINT
    然后重跑：bash scripts/setup.sh
EOF
        exit 1
      fi
    fi
    [ "$VENV_OK" = "1" ] && ok "虚拟环境就绪：$("$VENV/bin/python" -V 2>&1)"
  fi
fi

say "  安装服务端依赖（server/requirements.txt）"
"$VENV/bin/python" -m pip install --upgrade pip -q "${PIP_ARGS[@]}" \
  || warn "pip 自升级失败（不影响后续）"
if ! "$VENV/bin/python" -m pip install -r server/requirements.txt "${PIP_ARGS[@]}"; then
  die "依赖安装失败。若是网络问题，换镜像重跑：
      bash scripts/setup.sh --no-apt --skip-build --index-url=https://pypi.tuna.tsinghua.edu.cn/simple"
fi
"$VENV/bin/python" - <<'PY' || die "依赖装上了但导入失败，检查上面的报错"
import fastapi, uvicorn, sqlalchemy, pydantic, jwt, argon2, httpx
print('  [OK] 导入检查通过：fastapi %s / sqlalchemy %s' % (fastapi.__version__, sqlalchemy.__version__))
PY

# ------------------------------------------------------------
# 2. Node
# ------------------------------------------------------------
say "[2/4] Node / npm"
NODE_MAJOR=0
NODE_VER=""
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node --version 2>/dev/null || true)"
  NODE_MAJOR="$(echo "$NODE_VER" | sed -E 's/^v([0-9]+).*/\1/')"
  case "$NODE_MAJOR" in ''|*[!0-9]*) NODE_MAJOR=0 ;; esac
fi
if [ "$NODE_MAJOR" -ge 18 ]; then
  ok "node $NODE_VER / npm $(npm --version 2>/dev/null || echo '?')"
else
  if [ -n "$NODE_VER" ]; then
    warn "node $NODE_VER 太旧（需要 18+，本项目按 22 验证）"
  else
    warn "没有 node"
  fi
  warn "影响：前端构建、以及**服务端权威对战**（房间引擎用 node 子进程跑 JS 规则）。"
  warn "      单机 / PVE / 剧情模式 / API 都照样能跑。"
  case "$OS_ID" in
    ubuntu|debian)
      echo "     推荐（NodeSource 官方源，装 22.x）："
      echo "       curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
      echo "       sudo apt-get install -y nodejs" ;;
    *)
      echo "     推荐 nvm：curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
      echo "               nvm install 22" ;;
  esac
  echo "     已经装在别处（nvm/自解压目录）？起来时指定：export MOOPET_NODE=/path/to/node"
  [ "$DO_BUILD" = "1" ] && { warn "没有可用 Node，跳过前端构建"; DO_BUILD=0; }
fi

# ------------------------------------------------------------
# 3. 前端构建
# ------------------------------------------------------------
say "[3/4] 前端构建（web/dist）"
if [ "$DO_BUILD" = "1" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    warn "没有 npm，跳过。装好后手动：cd web && npm ci && npm run build"
  else
    if [ -f web/package-lock.json ]; then
      ( cd web && npm ci --no-audit --no-fund ) \
        || die "npm ci 失败（网络问题可换镜像：npm config set registry https://registry.npmmirror.com）"
    else
      ( cd web && npm install --no-audit --no-fund ) || die "npm install 失败"
    fi
    ( cd web && npm run build ) || die "npm run build 失败"
    [ -f web/dist/index.html ] || die "构建结束但没生成 web/dist/index.html"
    ok "前端已构建：web/dist（服务端会托管 http://<host>:8080/ ）"
  fi
else
  if [ -f web/dist/index.html ]; then ok "已有 web/dist（跳过构建）"
  else warn "没有 web/dist：服务端只提供 API，不带页面。装好 Node 后 cd web && npm ci && npm run build"; fi
fi

# ------------------------------------------------------------
# 4. 运行时探针
# ------------------------------------------------------------
say "[4/4] 运行时探针"
"$VENV/bin/python" scripts/probe_runtime.py || warn "探针报告了问题（不阻塞安装，按提示处理即可）"

say "准备完成"
cat <<EOF
  下一步：bash scripts/start_web.sh
        然后浏览器打开 http://127.0.0.1:8080/
  （只想手动起服务：source .venv/bin/activate && cd server && python run_local.py）
EOF
