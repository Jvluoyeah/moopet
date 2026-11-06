# Ubuntu / Linux 运行指南

面向 **Ubuntu 22.04（x86_64；arm64 如 RK3588 同理）**，其他常见发行版与 WSL2 也照此操作。
Windows 的流程见根 [README](../README.md) 的「启动 Web 应用」。

> 本页所有命令都在**仓库根目录**执行，除非另行说明。
> 下面标注 **【已实测】** 的步骤，是在真实的 Ubuntu 22.04.5 / Python 3.10.12 环境里跑通过的；
> 标注 **【未实测】** 的（ROS2、Docker、Nginx/TLS）在当前环境里不具备条件，请按步骤自行验证。

---

## 0. 一句话版本

```bash
bash scripts/setup.sh          # 装依赖 + 建虚拟环境 + 构建前端
bash scripts/start_web.sh      # 起主服务 + 剧情模式
# 浏览器打开 http://127.0.0.1:8080/
bash scripts/stop_web.sh       # 停
```

---

## 1. 这个项目在 Linux 上"由几块组成"

| 组成 | 语言/运行时 | 端口 | 不装它行不行 |
| --- | --- | --- | --- |
| 主服务（FastAPI：账号/社群/对战/静态托管） | Python 3.9+ | 8080 | 不行，核心 |
| 前端页面（`web/dist`，Vite 构建产物） | Node 18+（构建时） | 由主服务托管 | 构建好后运行不需要 Node |
| 服务端权威对战（引擎子进程） | **Node 18+（运行时）** | 同上 | 不玩联机对战可以不要 |
| 剧情模式（`gal/`，独立导出的 AVG 应用） | 纯静态文件 | 18080 | 可以不要，入口会 502 |
| 机械狗软件栈（`moopet_ws/`） | Python / ROS2 Humble | — | 不接机械狗可以整块跳过 |

**关键点：Node 是"运行时"依赖，不只是构建依赖。** 每局服务端权威对战都会起一个
`node web/tools/engine_host.mjs` 子进程跑格斗规则（见 `server/app/engine_host.py`）。
没装 Node 时，单机/PVE/剧情/API 都能用，只有"服务端权威对战"开不了房间。

---

## 2. 环境准备

### 2.1 系统包

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git curl
```

> **Ubuntu 22.04 的第一个坑：`python3-venv` 默认没装。**
> 不装它，`python3 -m venv` 会报 `ensurepip is not available`。
> `scripts/setup.sh` 会检测并给出提示；有 sudo 免密时会自动装。

> **第二个坑：PEP 668。** Ubuntu 22.04 起，往系统 Python 里 `pip install` 会被拒绝
> （`externally-managed-environment`）。所以本项目**一律用 `.venv`**，`setup.sh` 已经这么做。

### 2.2 Node 22（可选但推荐）

Ubuntu 22.04 自带的 apt 源里 Node 太旧（12.x），构建不了前端。**不要把系统源的 nodejs 当成够用**，
用官方 NodeSource 源：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version     # 应为 v22.x 或更高
```

不想动系统源（或用 nvm / conda 管 Node）时，只要让服务进程能找到 `node` 就行；
找不到 `PATH` 里的 node 时，用环境变量指定：

```bash
export MOOPET_NODE=/path/to/node        # 写进 .env 也行，start_web.sh 会读 .env
```

### 2.3 一键装依赖

```bash
bash scripts/setup.sh
```

它做的事（幂等，可重复跑）：

1. 检查 Python / venv，建立 `.venv`；
2. `pip install -r server/requirements.txt`；
3. 有 Node 就 `npm ci && npm run build` 生成 `web/dist`；
4. 打印一张运行时自检表（`scripts/probe_runtime.py`）。

常用参数：

```bash
bash scripts/setup.sh --skip-build                                  # 只装 Python 依赖
bash scripts/setup.sh --no-apt                                      # 不碰系统包
bash scripts/setup.sh --index-url=https://pypi.tuna.tsinghua.edu.cn/simple   # 国内镜像
```

**【已实测】** 在 Ubuntu 22.04.5 / Python 3.10.12 上：正常路径、缺 `python3-venv` 无 sudo 的降级路径、
纯 Node 构建均通过。

---

## 3. 启动

### 3.1 一键（推荐）

```bash
bash scripts/start_web.sh                    # 后台起主服务 + 剧情模式，并尝试打开浏览器
bash scripts/start_web.sh --foreground       # 前台跑，Ctrl+C 一起停（终端里调试推荐）
bash scripts/start_web.sh --no-gal           # 不起剧情模式
bash scripts/start_web.sh --no-browser       # 服务器/无桌面环境
bash scripts/start_web.sh --host=0.0.0.0     # 允许局域网/手机访问
MOOPET_PORT=9000 bash scripts/start_web.sh   # 换端口
bash scripts/stop_web.sh                     # 停止
```

行为说明（与 Windows 的 `start_web.ps1` 对齐）：

* **先保剧情模式、再看主服务**：主服务已经在跑时只开浏览器，不会重复拉起；
* 后台模式用 `setsid` 起，**关掉终端服务不会退出**；日志在 `.runtime/logs/`；
* 浏览器只在有桌面（`$DISPLAY`/`$WAYLAND_DISPLAY`）时自动打开，WSL 下会提示改用 Windows 浏览器；
* 端口占用、依赖缺失都会给出可执行的下一步，而不是抛 traceback。

**【已实测】** 启动 → 健康检查 → 页面/API/剧情代理全部 200；重复启动会被识别；
`--foreground` 下 Ctrl+C 能停干净；孤儿 uvicorn 子进程会被 `stop_web.sh` 一并清掉。

### 3.2 手动（分步）

```bash
source .venv/bin/activate

# 终端 1：剧情模式静态服务（可选）
python -m http.server 18080 --bind 127.0.0.1 --directory gal

# 终端 2：主服务（会顺带托管 web/dist）
cd server
MOOPET_HOST=127.0.0.1 python run_local.py
```

浏览器打开 <http://127.0.0.1:8080/>，接口文档 <http://127.0.0.1:8080/docs>，
剧情入口 <http://127.0.0.1:8080/gal/web/index.html>。

### 3.3 让局域网/手机访问

```bash
bash scripts/start_web.sh --host=0.0.0.0
# 或：MOOPET_HOST=0.0.0.0 python server/run_local.py
```

主服务默认只监听 `127.0.0.1`（演示服务不该默认暴露到局域网）。
要对外时放行 8080：

```bash
sudo ufw allow 8080/tcp
hostname -I          # 拿本机内网 IP
```

> 前端页面用的是 WebSocket 与页面同源（`ws://<当前 host>/ws/...`），所以**用哪个地址打开页面，
> 就用哪个地址连**，不需要额外配置。

---

## 4. `.env`（可选）

`start_web.sh` 会读取仓库根的 `.env`（已在 `.gitignore`，不会进版本库），
只解析简单的 `KEY=VALUE` 行，**不会执行**其中的内容。

```bash
cp .env.example .env       # 如果能提供模板就用，否则手动新建
```

常用变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `MOOPET_HOST` | `127.0.0.1` | 监听地址；`0.0.0.0` 允许局域网 |
| `MOOPET_PORT` | `8080` | 主服务端口 |
| `MOOPET_GAL_PORT` | `18080` | 剧情模式静态端口 |
| `MOOPET_DATABASE_URL` | `sqlite:///…/server/data/moopet.db` | 换 PostgreSQL 只改这一个 |
| `MOOPET_SECRET_KEY` | 开发默认值 | **对外前必须换**：`openssl rand -hex 32` |
| `MOOPET_ALLOW_ORIGINS` | `*` | 生产请限定域名 |
| `MOOPET_NODE` | 自动找 | 指定 node 可执行文件路径 |
| `MOOPET_OPEN_BROWSER` | 关 | 设 `1` 让 `run_local.py` 自己开浏览器 |

生成密钥：

```bash
M="$(openssl rand -hex 32)"; sed -i '/^MOOPET_SECRET_KEY=/d' .env 2>/dev/null; echo "MOOPET_SECRET_KEY=$M" >> .env
```

---

## 5. Docker（Linux 通用）

**【未实测】** 当前开发环境没有 Docker，下面的命令与镜像内容已按"仓库根为构建上下文"核对过，
但没有真正 `docker build`。你第一次跑时请留意 `docker compose build` 的输出。

镜像和原来的区别（原 Dockerfile **跑不起来**，不要再用旧命令）：

* 原 `context: ..` 只包含 `server/`，`COPY app ./app` 指向的路径在上下文里不存在；
* 原镜像里没有前端、没有 Node —— 起来之后 `/` 是 404，服务端权威对战也开不了房间；
* 现在用**两段构建**：Node 段构建 `web/dist`，最终镜像同时带 Python 和 Node（每局对战要起 node 子进程）。

```bash
cd server                                   # 构建上下文是仓库根，compose 里已经写好 ../..
docker compose up --build                   # → http://localhost:8080/
docker compose ps
docker compose logs -f api
docker compose down                         # 停
```

等价的裸构建：

```bash
docker build -f server/docker/Dockerfile -t moopet:latest .
docker run --rm -p 8080:8080 -v "$PWD/server/data:/data" moopet:latest
```

说明：

* SQLite 落在容器 `/data`，compose 已把它挂到 `server/data/`；
* `gal/` 有约 284 MB 素材，**默认不打进镜像**；容器里的 `/gal/*` 仍然会按
  `MOOPET_GAL_UPSTREAM`（默认 `http://127.0.0.1:18080`）去代理。需要在容器里跑剧情，就另起一个
  静态服务容器/宿主进程；
* 单进程运行：对战房间在进程内存里，**不要加 `--workers`**。

云端 PostgreSQL 档位：

```bash
cd server
export MOOPET_SECRET_KEY="$(openssl rand -hex 32)"
export MOOPET_DATABASE_URL='postgresql+psycopg://moopet:密码@db:5432/moopet'
docker compose --profile cloud up -d --build
```

---

## 6. 对外部署（systemd + Nginx）【未实测】

演示/内部使用用 `start_web.sh` 就够了。要长期挂在服务器上，建议交给 systemd 托管，
前面由 Nginx 终止 TLS 并升级 WebSocket。

### 6.1 systemd

`/etc/systemd/system/moopet.service`：

```ini
[Unit]
Description=Moopet server
After=network.target

[Service]
Type=simple
User=moopet
WorkingDirectory=/opt/moopet/server
EnvironmentFile=-/opt/moopet/.env
Environment=MOOPET_HOST=127.0.0.1
Environment=MOOPET_PORT=8080
Environment=PYTHONUTF8=1
Environment=LANG=C.UTF-8
ExecStart=/opt/moopet/.venv/bin/python /opt/moopet/server/run_local.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now moopet
sudo systemctl status moopet
journalctl -u moopet -f
```

> systemd 的 PATH 很短：node 用 nvm 装的话，**在 `.env` 里写 `MOOPET_NODE=/绝对路径/node`**，
> 否则服务端权威对战会报"找不到 node"。

### 6.2 Nginx

```nginx
server {
    listen 80;
    server_name moopet.example.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket（对战 / 世界 / 同问都用 ws）
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

TLS 用 certbot 一条命令：`sudo certbot --nginx -d moopet.example.com`。
部署后记得设 `MOOPET_ALLOW_ORIGINS=https://moopet.example.com` 与随机 `MOOPET_SECRET_KEY`。

---

## 7. 机械狗软件栈（ROS2 Humble）【未实测本环境】

这一块和 Web 应用相互独立，可以整块跳过。需要真机/仿真时：

```bash
# 装 ROS2 Humble（ros-base）+ colcon，见 moopet_ws/docs/部署文档.md
cd moopet_ws
source /opt/ros/humble/setup.bash
colcon build --symlink-install --packages-select moopet_interfaces moopet_backpack moopet_dog
source install/setup.bash
bash scripts/smoke_test.sh        # 16 项接口 + T/S/A 往返
bash scripts/start_demo.sh        # 全套 demo；Ctrl+C 或 stop_demo.sh 停
```

**不需要 ROS** 的部分（任何 Linux 都能跑，纯 Python）：

```bash
cd moopet_ws
bash scripts/boundary_test.sh                # core + link + 测试台全部用例
python tools/link_lab/run_lab.py             # 无硬件通信仿真
```

> `boundary_test.sh` 在 Ubuntu 22.04 上 **【已实测】** 全部通过（22/22 + 其余 core 用例）。
> `start_demo.sh` / `smoke_test.sh` 需要 ROS2，本环境没有装，未实测。

---

## 8. 验证清单

```bash
# 1. 运行时自检（不装任何东西）
bash scripts/setup.sh --skip-build          # 最后会打印自检表
#    或单独跑：
.venv/bin/python scripts/probe_runtime.py

# 2. 服务端单元/集成测试（用临时库，不动 server/data）
cd server && PYTHONIOENCODING=utf-8 ../.venv/bin/python tests/run_all.py
#    基线：101/103（已知失败是 test_community 的两个串门用例，与本指南改动无关）

# 3. 前端规则测试 + 构建
cd web && PATH=$HOME/.local/node/bin:$PATH npm test && npm run build

# 4. 真实服务冒烟（服务起着时跑）
cd server
python tests/single_url_check.py http://127.0.0.1:8080     # 单地址托管/静态资源
python tests/live_ws_check.py   http://127.0.0.1:8080      # 真 socket 联机（会写数据）
```

**【已实测】** 在 Ubuntu 22.04 上：`tests/run_all.py` 101/103（与 Windows 基线一致）、
`web: npm test` 全部通过、`npm run build` 通过、`scripts/start_web.sh` + `stop_web.sh` 全周期通过、
`moopet_ws/scripts/boundary_test.sh` 通过。

---

## 9. 已知问题与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `start_demo.sh: line 22: set: pipefail: invalid option name` | 脚本是 CRLF 换行（Windows 拷过来的） | 仓库已加 `.gitattributes` 强制 LF；老拷贝执行 `sed -i 's/\r$//' scripts/*.sh moopet_ws/scripts/*.sh`；或 `dos2unix` |
| `ensurepip is not available` | 没装 `python3-venv` | `sudo apt install -y python3-venv`，再跑 `bash scripts/setup.sh` |
| `error: externally-managed-environment` | PEP 668 保护系统 Python | 用 `.venv`（`setup.sh` 自动处理），别往系统环境装 |
| 页面 404，`/api/*` 正常 | `web/dist` 没构建 | `bash scripts/setup.sh`（或 `cd web && npm ci && npm run build`） |
| 对战开不了房间 / `找不到 node` | 服务进程 PATH 里没有 node | 装 Node 18+，或 `export MOOPET_NODE=/绝对路径/node` |
| 剧情入口 502 | 18080 的上游没起 | `bash scripts/start_web.sh`（会自动起）；或手动 `python -m http.server 18080 --directory gal` |
| 端口 8080 已被占用 | 上次没退干净 | `ss -lptn "sport = :8080"`；`bash scripts/stop_web.sh`；或 `MOOPET_PORT=8081` |
| 中文乱码 / `UnicodeEncodeError` | 终端或 locale 不是 UTF-8 | `export LANG=C.UTF-8 PYTHONUTF8=1`（`start_web.sh` 默认已设） |
| WSL 里浏览器打不开 `127.0.0.1:8080` | WSL2 端口映射未生效 | `wsl hostname -I` 拿 IP 访问；或确认 Windows 防火墙允许 WSL |

### 快速定位

```bash
bash scripts/stop_web.sh --quiet
.venv/bin/python scripts/probe_runtime.py        # 版本/端口/权限/资源一次看全
bash scripts/start_web.sh --foreground           # 前台跑，日志直接打在终端
```

---

## 10. 本次为 Linux 支持改了哪些文件

| 文件 | 改动 |
| --- | --- |
| `scripts/setup.sh` (新) | Linux 一键装依赖：venv/PEP 668/缺 ensurepip 的降级、Node 检测、前端构建、自检 |
| `scripts/start_web.sh` (新) | Linux 一键启动（对应 `start_web.ps1`）：后台 + PID/日志、剧情先行、端口占用识别、`.env`、WSL 提示 |
| `scripts/stop_web.sh` (新) | 停服务：按 PID 文件 + **整棵进程树**（含 uvicorn 子进程）+ 端口兜底扫描 |
| `scripts/probe_runtime.py` (新) | 运行时自检（Python/编码/Node/端口/可写/资源），`--json` 可机读 |
| `.gitattributes` (新) | `*.sh`/`*.py` 等强制 LF；`start_web.ps1` 固定 UTF-8 BOM + CRLF |
| `moopet_ws/scripts/*.sh` | CRLF → LF（原来在 Linux 上**根本无法执行**）；提示与清理更稳 |
| `server/run_local.py` | 默认只监听 `127.0.0.1`；端口占用前置检查；node 检测；UTF-8 兜底 |
| `server/app/engine_host.py` | 统一 `find_node()`（支持 `MOOPET_NODE`）；子进程强制 UTF-8；错误信息可操作 |
| `server/app/factory.py` | 启动告警打印不再因非 UTF-8 终端崩溃 |
| `server/docker/Dockerfile` | 重写：两段构建（前端 + 服务端），运行时装 Node，路径与上下文一致 |
| `server/docker-compose.yml` | 修正构建上下文与数据卷路径，健康检查改 curl |
| `README.md` | 增加 Linux 快速开始，修正 Python 版本要求 |
| `AGENT.md` | 验证矩阵与启动约定补充 Linux 一节 |
