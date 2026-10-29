# 长夜月 · 养成系机械狗（Moopet）

项目仓库：[Jvluoyeah/moopet](https://github.com/Jvluoyeah/moopet)。

机械狗陪伴与成长项目：包含浏览器端养成/社群/对战应用、FastAPI 服务端，以及可脱离真实硬件验证的 Python / ROS2 机械狗软件栈。

本仓库是多子项目工作目录，不是一个统一打包的应用。**想先体验界面，从 Web 快速开始；想开发机械狗逻辑，从无 ROS 联调台开始。** 当前代码保留了 W1–W6 开发历史，历史汇报中的计划、完成度和测试数量不等于当前版本状态。

> 发布状态：本项目采用 [Moopet · 非商业学习交流许可 1.0](LICENSE)，允许非商业查看、运行、修改和协作分享，禁止商业使用；这是**公开源码项目，不是 OSI 意义上的开源项目**。第三方及其衍生部分继续遵守各自许可，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。根许可不授予额外的素材再分发权，新增内容或再次分发前仍须完成[上传检查](#github-上传检查)。

## 程序内容

| 子系统 | 当前内容 | 入口 / 关键位置 |
| --- | --- | --- |
| Web 应用 | 注册登录、领养与档案、开放世界与社群互动、竞技场与训练关、问询/同问、月塔签到抽签日记、剧情入口 | `web/src/main.js`、`web/src/pages/` |
| Web 游戏逻辑 | 确定性对战模拟、AI、锁步会话、权威模式的预测与回滚、关卡与成长规则 | `web/src/game/`、`web/tools/engine_host.mjs` |
| 服务端 | HTTP API、JWT 账号认证、SQLAlchemy 持久化、世界/对战/同问 WebSocket、剧情代理与账号存档 | `server/app/factory.py`、`server/app/api/`、`server/app/ws/` |
| 机械狗纯逻辑 | 经验结算、答题、行为决策、性格与情感、火花、日记与互动 | `moopet_ws/src/moopet_core/` |
| 机械狗通信与部署 | 通信信封、心跳、离线队列与故障注入，以及大脑放在狗端/背包端/模拟端的验证 | `moopet_ws/src/moopet_link/`、`moopet_ws/src/moopet_deploy/`、`moopet_ws/tools/link_lab/` |
| ROS2 与硬件接口 | 自定义接口、狗端节点、背包仿真感知与 TTS、硬件抽象 | `moopet_ws/src/moopet_interfaces/`、`moopet_dog/`、`moopet_backpack/`、`moopet_hal/` |
| 剧情资源 | 独立的静态剧情播放器及其素材，由主服务代理接入 | `gal/web/index.html`、`gal/assets/` |

### 目录导航

```text
.
├── web/                 Vite + 原生 ES 模块 + Three.js；含测试、场景与素材工具
├── server/              FastAPI + SQLAlchemy + SQLite；含 API、WebSocket 与测试
├── moopet_ws/           机械狗 Python / ROS2 工作区、通信联调台、历史汇报
├── gal/                 独立剧情播放器与音视频/角色等素材
├── data/                Web 服务端问询题库 JSON（应提交，不是本地数据库）
├── shared/              服务端读取的世界场景配置；前端仍有独立定义
├── blender/             Blender 场景源文件
├── docs/                世界观、文字游戏规范、开发历程
├── start_web.bat         Windows 双击入口
├── start_web.ps1         构建检查 + 主服务/剧情服务启动
├── README.md            项目入口与发布说明
├── AGENT.md             人工及 AI 协作者开发指南
├── THIRD_PARTY_NOTICES.md 第三方来源、原始许可与修改说明
└── LICENSE              原创代码及技术文档的非商业学习交流许可
```

## Web 快速开始

### 环境准备

- Python：建议 3.11 或更新版本；本次核验使用 3.13.7。ROS2 Humble 环境请使用其配套 Python，不要直接照搬本机版本。
- Node.js：建议 22 LTS，附带 npm；本次核验使用 Node.js 22.20.0 / npm 10.9.3。**服务端权威对战也需要 `node` 在 PATH 中**。
- 浏览器：支持 WebGL 的现代浏览器。
- 以下命令从仓库根目录开始；使用 PowerShell，或按注释切换虚拟环境激活命令。

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
# Linux / macOS：source .venv/bin/activate
python -m pip install -r server/requirements.txt

cd web
npm ci
npm run build
cd ..
```

PowerShell 若不允许执行激活脚本，可直接使用 `.\.venv\Scripts\python.exe` 安装依赖和运行程序，无需更改全局执行策略。项目目前读取**进程环境变量**，没有自动加载 `.env` 的配置。

### 方式 A：一个地址访问主应用（推荐）

```powershell
cd server
$env:MOOPET_HOST = "127.0.0.1"
python run_local.py
```

Linux / macOS 对应：`MOOPET_HOST=127.0.0.1 python run_local.py`。

- 应用：<http://127.0.0.1:8080/>
- API 文档：<http://127.0.0.1:8080/docs>
- 健康检查：<http://127.0.0.1:8080/api/health>
- 操作顺序：注册账号 → 领养机械狗 → 打开世界、档案、问询或竞技场。
- 停止：`Ctrl+C`。默认数据会保存在 `server/data/moopet.db`；首次启动创建表并写入品种、社群和演示 NPC。
- 只有启动时已存在 `web/dist/index.html`，服务端才托管前端；修改前端后须重新构建。

`run_local.py` 默认监听 `0.0.0.0`，上面的配置将本地演示限制在回环地址。开发密钥和宽松 CORS 不适合直接暴露到公网。

### 方式 B：前端热更新开发

先按方式 A 启动后端；另开一个终端，从仓库根目录执行：

```powershell
cd web
npm run dev
```

打开 <http://localhost:5173/>。Vite 将 `/api` 和 `/ws` 代理到 `http://127.0.0.1:8080`，见 `web/vite.config.js`。如后端地址不同，在启动 Vite **之前**设置：

```powershell
$env:MOOPET_BACKEND = "http://127.0.0.1:8081"
npm run dev
```

只有 Vite 而没有后端时，账号、社群等功能不可用。`vite preview` 不是完整后端，也没有开发服务器的 API 代理。

### 可选：接入剧情模式

另开终端，从仓库根目录执行：

```powershell
cd gal
python -m http.server 18080 --bind 127.0.0.1
```

通过主服务访问 <http://127.0.0.1:8080/gal/web/index.html>。后端把 `/gal/*` 代理到 18080，并注入 `server/static/gal-sync.js`，实现已登录账号的剧情存档同步。上游未启动时，剧情请求返回 502，不影响主 API 启动。

Vite 开发代理目前只配置 `/api` 和 `/ws`；验证剧情和存档同步应使用 **8080 主服务地址**，不要把直接访问 18080 等同于账号同步已接通。

### Windows 双击启动

依赖安装完成后，可双击根目录 `start_web.bat`，它会调用 `start_web.ps1`：

- 检查并启动 18080 剧情静态服务，再检查主服务 8080。
- `web/dist` 不存在时运行构建，但**不会安装 npm 或 Python 依赖**。
- 使用 `server/data/dev.db`，与手动启动默认的 `moopet.db` 不是同一份数据。
- 已有构建不会自动重建；已有端口只检查 TCP 连通，不核对是否为本项目服务。
- 在最小化的独立窗口中运行服务；关闭相应窗口停止服务。
- 脚本本身没有限制服务仅监听回环地址；只做本机演示时，启动前设置 `MOOPET_HOST=127.0.0.1`，剧情服务宜改用上面的手动绑定命令。

## 机械狗：无硬件运行与 ROS2

### 无 ROS 联调台（当前推荐入口）

从仓库根目录执行，无需真实机械狗：

```powershell
cd moopet_ws
python tools/link_lab/run_lab.py
```

该命令验证接口契约、`BRAIN=dog/backpack/sim` 三种大脑摆放、弱网/断链可复现性及断连自治。本次运行输出 `16/16` 通过；这是内存通信仿真，不是硬件或真实 ROS 网络验收。

核心互动测试未包含在下文的边界集合中，可额外运行 `python src/moopet_core/tests/test_interaction.py`（工作目录为 `moopet_ws/`）。

### ROS2 分布式演示

目标环境为 Ubuntu 22.04 + ROS2 Humble + colcon；先按 [部署文档](moopet_ws/docs/部署文档.md) 安装依赖并加载 ROS 环境，再在 `moopet_ws/` 执行 `bash scripts/start_demo.sh`，停止使用 `bash scripts/stop_demo.sh`。本次未验证 ROS 节点、真实传感器、机械动作或 TTS 发声。

旧 `standalone_demo*.py` 是历史入口。已实跑的 `standalone_demo_w5.py --fast` 因仍从 `moopet_dog.decision` 导入而失败；纯逻辑现位于 `moopet_core`。不要将旧 README 的“只装 Python 即可演示”当作当前可用保证。

### 两套养成逻辑的边界

Web 演示和机械狗核心并未统一成完整的端云同步产品。服务元信息描述了本地养成、云端社群/对战的权威划分，但 Web 的训练、问询、月塔接口也会写入服务端档案。修改前应以具体调用链为准。

例如：`server/app/api/tower.py` 的 Web 抽签是十抽 rare 保底；`moopet_core` 火花抽奖有 200 次超级大奖保底。不能默认两者规则相同，也不要为了“统一”擅自覆盖现有数据或规则。

## 测试与当前核验结果

| 检查 | 命令与工作目录 | 本次结果 |
| --- | --- | --- |
| 前端默认测试链 | `web/`：`npm test` | 通过；不代表全部浏览器 E2E 已执行 |
| 前端构建 | `web/`：`npm run build` | 通过 |
| 服务端测试 | `server/`：`python tests/run_all.py` | **101/103**；两项串门用例失败 |
| 单地址 HTTP 冒烟 | 先构建并启动服务；`server/`：`python tests/single_url_check.py [服务地址]` | **7/7** 通过 |
| 真 WebSocket 联机 | 服务运行后；`server/`：`python tests/live_ws_check.py [服务地址]` | 双端各收 30 帧，60 条输入回放通过 |
| 剧情代理 HTTP | 启动剧情上游后访问 `/gal/web/index.html` 与 `/gal-sync.js` | 返回 200，确认同步脚本注入；未验证完整剧情播放/跨设备存档 |
| 无 ROS 边界集合 | `moopet_ws/`：`bash scripts/boundary_test.sh` | 通过；含核心、通信和联调台测试，不包含所有测试文件 |
| 核心互动用例 | `moopet_ws/`：`python src/moopet_core/tests/test_interaction.py` | **16/16** 通过 |
| 无 ROS 联调入口 | `moopet_ws/`：`python tools/link_lab/run_lab.py` | **16/16** 通过 |
| 旧 W5 独立演示 | `moopet_ws/`：`python standalone_demo_w5.py --fast` | **失败**：旧导入路径失效 |

服务端失败项为 `server/tests/test_community.py` 中的 `test_visit_adds_friendship_and_records` 和 `test_visit_social_leaderboard_moves`；本次未修改业务代码或测试掩盖失败。部分测试使用短测试密钥，会出现 JWT 密钥长度警告，不应把这些密钥用于部署。

真实网络脚本会注册测试账号、领养并写入对局记录，请使用独立数据库，不要指向线上数据。本次网络冒烟使用临时 SQLite，检查后已清理。

浏览器 E2E 位于 `web/tests/e2e_*.py`，依赖另行安装的 Python Playwright 与 Chromium，以及对应的服务/素材；默认 `npm test` 不运行它们。逐项阅读脚本的地址、端口和启动逻辑后再执行。本次未验证浏览器视觉效果、完整 E2E、Docker、PostgreSQL 或 ROS2 部署。

## 配置与部署限制

| 环境变量 | 默认值 / 用途 |
| --- | --- |
| `MOOPET_HOST` / `MOOPET_PORT` | `run_local.py` 监听地址 `0.0.0.0` / 端口 `8080` |
| `MOOPET_DATABASE_URL` | 默认 SQLite：`server/data/moopet.db` |
| `MOOPET_SECRET_KEY` | 代码内置开发密钥；生产必须替换为至少 32 字节的强随机值 |
| `MOOPET_ALLOW_ORIGINS` | 默认 `*`；生产限定可信来源，逗号分隔 |
| `MOOPET_TOKEN_TTL_HOURS` | 默认 `72` |
| `MOOPET_SEED_DEMO` | 默认 `1`，控制演示 NPC 数据 |
| `MOOPET_DEBUG` | 默认关闭；开启 SQL 日志前注意数据泄露风险 |
| `MOOPET_BACKEND` | Vite 开发代理目标，默认 `http://127.0.0.1:8080` |
| `MOOPET_GAL_UPSTREAM` | 剧情代理上游，默认 `http://127.0.0.1:18080` |

- 当前同时存在锁步转发与 Node 宿主权威对战两条路径；后者复用 `web/src/game/` 的 JS 模拟，并非 Python 重写规则。
- 世界、同问及对战房间使用进程内状态，演示保持单进程，不能直接加多个 uvicorn worker。
- `server/docker-compose.yml` / `server/docker/Dockerfile` 是待复核配置，不是完整发布方案：当前构建上下文与 COPY 路径不匹配，镜像也未包含 Node 与 Web 引擎/静态资源；PostgreSQL 驱动未列入现有 requirements。不要将 `docker compose up` 描述为已验证的全功能部署。
- 公网部署还需要 HTTPS、可信 CORS、独立密钥、数据库备份/迁移及 WebSocket 反代配置；本次没有替项目完成生产加固。
- `shared/world_scenes.json` 与前端场景 JS 尚非同一来源，部分场景尺寸/出生点有偏差；不能认为前后端世界边界已完全统一。

## 协作开发

开发前阅读 [AGENT.md](AGENT.md)，按改动范围选择模块，不要同时重排历史文件和修改业务。建议一个分支/PR 解决一个明确问题。

Issue 请说明模块、操作步骤、预期/实际结果、运行环境和去敏后的日志。PR 请说明改动目的、数据/API/协议影响、执行过的验证及已知失败；界面改动附截图，新增素材注明来源和授权。不要上传账号数据库、token 或带个人信息的调试截图。

可优先协作的问题：服务端两项串门回归、旧 standalone 演示迁移、容器部署配置、Web 与机械狗规则边界梳理、第三方素材授权核验。它们是当前已知缺口，不是本次文档整理已完成的功能。

`web/public/pv/` 与 `pv2/` 另含宣传播放页面及其资源，不是主程序启动必需项，也不是可随意删除的构建产物。离线视频导出工具为 `web/tools/pv_render.py`，导出另需 Playwright、Pillow 和 ffmpeg；输出位于 `web/render/`，不随源码提交。

### 继续阅读

- [服务端说明](server/README.md)、[前端说明](web/README.md)：包含早期设计；“服务端不跑模拟”等描述已不能代表全部当前路径。
- [机械狗工作区说明](moopet_ws/README.md)、[Ubuntu 交接](moopet_ws/docs/UBUNTU_AGENT_HANDOFF.md)、[接口规范](moopet_ws/docs/interface_spec.md)。
- [世界观设定](docs/世界观设定.md)、[文字游戏规范](docs/文字游戏规范.md)、[开发历程汇总](docs/开发历程汇总.md)。
- [场景编辑指南](web/docs/场景编辑指南.md)、[形象包规范](web/docs/形象包规范.md)。

## GitHub 上传检查

根 `.gitignore` 已排除虚拟环境、Node 依赖、构建产物、SQLite 及其日志/备份、测试截图、ROS 构建输出、密钥与 Blender 自动备份；保留题库 JSON、源模型及现有素材。**忽略规则不会清除已跟踪文件或 Git 历史中的敏感数据。**

维护者已确认本次完整上传范围中的现有素材及历史资料可公开。该确认不代替第三方原始许可，也不构成独立法律审计；以下清单继续适用于新增内容及后续分发。

首次公开前必须完成：

- [ ] 审核 `server/data/` 等运行数据不在暂存区或历史中；已有数据库不能作为“演示素材”公开。
- [ ] 检查 API 密钥、密码、token、内网地址、个人信息；若凭据曾提交，撤销/轮换后再处理历史。
- [ ] 确认所有贡献者有权以根非商业学习交流许可授权其原创代码及技术文档；版权以 `Moopet contributors` 集体署名，第三方版权保持原样。
- [ ] 分发格斗代码或构建包时，一并保留 [abstract-brawl 原始许可证](web/src/game/ab/LICENSE)、[原始素材声明](web/src/game/ab/ASSET_NOTICE.md) 与 [本仓库修改说明](THIRD_PARTY_NOTICES.md)。上游代码及其衍生部分继续受原始非商业条款约束，不限于 `ab/` 目录。
- [ ] 核实 `gal/` 的剧情、音视频、角色及播放器许可，保留并遵守 [Spine Runtimes License](gal/web/SPINE-RUNTIMES-LICENSE.txt)；根非商业许可不替代其条款或 Spine Editor 许可要求。
- [ ] 核实 `web/public/`、`moopet_ws/fonts/`、汇报模板/截图等第三方资源的来源、许可证及再分发条件；历史文档的引用声明不能替代授权证明。
- [ ] 确认历史 PPT、成员任务单和讲稿中的姓名及其他个人信息可公开。
- [ ] 审核仓库体积：现有 `gal/` 约 284.5 MiB，其中一个视频约 59.3 MiB；数据库及备份约数百 MiB，必须排除。大素材视需要采用 Git LFS 或独立分发，但不在本次整理中迁移或删除。

目标仓库为 [Jvluoyeah/moopet](https://github.com/Jvluoyeah/moopet)。提交前应审查实际选中的文件，确保数据库、凭据、依赖及构建产物没有被跟踪；推送不得强制覆盖已有远端历史。不要把 `.gitignore` 或维护者的上传确认当作完整授权及安全审计结论。

## 许可

本仓库贡献者有权授权、且未另行声明的原创代码及技术文档，采用 [Moopet · 非商业学习交流许可 1.0](LICENSE)：允许非商业学习、研究、修改和协作分享；再发布须保留许可、署名、第三方声明并说明修改；禁止售卖、付费访问、内购、广告变现或集成进商业产品/收费服务。商业用途必须另行取得所有相关权利人的许可。

来自 `abstract-brawl` 的代码及其衍生部分继续受[上游原始许可](web/src/game/ab/LICENSE)约束；其他第三方代码、字体、模型、图片、音视频、剧情及运行时遵守各自条款。具体来源与修改范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。根许可不会重新授予这些内容的权利，也不追溯撤销此前已合法授出的许可。

非商业限制不符合 OSI 开源定义，因此本项目应称为“公开源码、允许非商业修改和协作分享”，不得宣称整体采用 MIT 或可自由商用。维护者已确认本次上传范围可公开；后续新增或再次分发第三方内容时，仍须核对适用许可及必要授权。
