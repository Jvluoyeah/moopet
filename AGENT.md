# AGENT.md · Moopet 开发协作指南

供开发者和编码 Agent 使用。本项目使用单数文件名 `AGENT.md`；工具不会自动读取时，开始任务前显式加载。项目介绍和安装步骤见 [README.md](README.md)。

## 1. 工作范围与事实来源

- 这是 Web、服务端和剧情导出资源组成的多子项目仓库，没有统一根构建命令。
- 先明确本次修改影响哪一侧，再阅读入口、调用者、配置和已有测试；不要只依据历史汇报或文件头的完成度声明。
- 当前代码和可复现结果优先于旧 README、W1–W6 汇报、排期和任务清单；保留历史材料，不把历史目标写成已经实现的功能。Linux（尤其 Ubuntu 22.04）的安装、启动与排错见本页 §4.1 的「Linux 启动约定」。
- README 面向使用者，保留功能、安装步骤和已知限制。验证命令、环境和结果写在对应 PR 或提交说明中，不把一次通过写成长期保证。
- 不擅自搬目录、批量改名、统一两套规则或删除素材。代码、协议、数据兼容性和授权范围发生变化时先说明影响；产品规则无法从代码/规范确定时询问维护者。

## 2. 按任务找入口

| 修改内容 | 优先阅读 |
| --- | --- |
| 页面、路由与页面状态 | `web/src/main.js`、`web/src/lib/router.js`、`store.js`、`web/src/pages/` |
| API 调用、认证与会话 | `web/src/lib/api.js`、`web/src/lib/ws.js`；`server/app/api/auth.py`、`deps.py`、`security.py` |
| UI 组件与主题 | `web/src/components/layout.js`、`ui.js`、`web/src/styles/`；复用现有样式变量与组件。界面三档见 `web/src/lib/uiMode.js`、`web/src/styles/modes.css`（只写本机 localStorage 与 `<html data-ui-mode/data-ui-scale/data-child-*>`）；老人/幼稚底部导航在 `layout.js` 的 `bottomBar`；家长密码在 `web/src/lib/parentGate.js`（本机门闩，不是安全边界）；幼稚点击音效在 `web/src/lib/childFx.js` |
| 世界与场景 | `web/src/pages/world.js`、`web/src/world/`、`shared/world_scenes.json`、`server/app/ws/world_hub.py` |
| 格斗模拟与联机 | `web/src/game/simAB.js`、`fx.js`、`rules.js`、`match.js`、`net.js`、`authority.js`（含预测与回滚） |
| 服务端权威引擎 | `web/tools/engine_host.mjs`、`server/app/engine_host.py`、`authority.py`、`rooms.py`、`ws/authority_routes.py` |
| 训练与成长 | `web/src/game/levels.js`、`growth.js`、`web/src/lib/exp.js`；`server/app/api/training.py` |
| Web 问询/同问、签到/抽签/日记 | `server/app/api/quiz.py`、`tower.py`、`server/app/ws/quiz_routes.py`；对应 `web/src/pages/quiz.js`、`duel.js`、`tower.js` |
| 后端装配与数据库 | `server/app/factory.py`、`config.py`、`db.py`、`models.py`、`schemas.py`、`seeds.py` |
| Linux 安装、启动与部署 | `scripts/setup.sh`、`start_web.sh`、`stop_web.sh`、`probe_runtime.py`、`server/run_local.py`、`server/docker/Dockerfile` |
| 启动/运行环境问题（端口、编码、Node） | `server/app/engine_host.py`（`find_node`）、`server/app/factory.py`（启动打印）、`scripts/probe_runtime.py` |
| 剧情代理与存档 | `server/app/factory.py`、`server/static/gal-sync.js`、`server/app/api/gal.py`；`gal/web/config.json` |

## 3. Web 与服务端约定

### 页面和连接生命周期

- 保持原生 ES 模块 + Vite + Three.js 的现有结构，不为局部改动引入新框架。
- 路由是 hash 路由。复用 `onDispose(node, fn)` / 页面 `__dispose` 约定，切页释放动画循环、事件监听、定时器、WebSocket 和渲染资源。
- HTTP 默认同源 `/api/*`；WebSocket 使用当前页面 host 与 `ws:` / `wss:`。Vite 通过 `MOOPET_BACKEND` 代理 `/api`、`/ws`。
- `?api=` 只覆盖 HTTP 基址，不会同步改变 WebSocket 目标；不能将它描述为全协议远程连接配置。
- 主站 localStorage 保存 token、账号缓存与主题，不是完整养成数据库。退出账号、切账号和删除狗时不得沿用另一账号的内存状态或剧情存档。
- 用户可见术语先对照页面现有文案；不要把调试内部术语直接显示给用户。

### 对战不变量

- 实际运行的格斗核心是 `simAB.js`；`web/src/game/ab/` 是上游参考引擎（oracle），不要修改它来让回归通过。
- 定点 Q8（`SCALE=256`）、128Hz；规则层不得引入 DOM、实时时钟、`Math.random()` 或依赖跨引擎浮点超越函数的结果。规则随机与表现随机分开。
- 同 seed、初始档案、座位与输入序列应得到相同状态指纹。品种/等级按服务端座位顺序组织，不能两端都按 `[自己, 对手]` 初始化。
- 修改状态字段或状态机时同时检查快照、恢复、哈希、回放和回滚，保留数组/对象共享关系；不能只更新渲染对象。
- 服务端权威路径通过 Node 子进程复用同一份 JS 引擎，不在 Python 再写一份格斗规则。每房间引擎在关闭/异常路径中必须释放。
- 锁步与服务端权威是两条实际存在的路径，不把一条路径的等待输入/掉线/判胜规则机械套到另一条。
- 不用 `node tests/ab_golden_test.mjs --write` 等改写基准的方式“修复”回归；确需改变规则时，在 PR 中解释轨迹变化及独立验证证据。

### 数据、权威与协议

- `create_app()` 位于 `server/app/factory.py`；手工验证优先用它配合临时 SQLite。导入 `app.main` 会创建默认应用并初始化默认数据库，不用于隔离验证。
- 所有 API/WS 路由及 `/gal/*` 代理必须先于根静态 `Mount('/')` 注册，否则静态目录会吞掉请求。
- 房间/连接状态位于单进程内存，不宣称支持多 worker、跨进程或重启恢复。
- 数据库当前使用启动建表和已有的字段兼容处理，不等于有完整迁移体系。改表先考虑既有 SQLite 数据，禁止靠删除用户数据库解决迁移问题。
- `PATCH /api/dogs/mine`、对局结果/领奖、训练和问询的写入边界逐条核对。既不能把客户端档案全部当可信，也不能把“本地权威”概括成云端绝不写成长数据。
- 问询答案不随出题下发；同问判分/计时与提示解锁在服务端，不能提前把冷却中的提示发给客户端。
- Web 的 `growth.js` 与 `api/quiz.py` / `ws/quiz_routes.py` 中提示延迟、答题经验等存在跨语言对应公式；修改时同步核对两侧取整、上下界和时序。
- `shared/world_scenes.json` 是服务端读取的场景边界配置，前端仍有独立 JS 场景定义，当前部分尺寸/出生点不一致。修改要核对两侧，不能声称它已是唯一来源；坐标转换按目标场景约定处理。
- 根 `data/questions*.json` 是 Web 题库，必须保留。不要误用数据库忽略规则排除题库。

### 剧情应用

- `gal/` 是已有导出物；本仓库调查范围内没有它的完整源码构建入口，`npm run build` 只构建主 Web。
- 通过主服务 `/gal/*` 访问才有同源脚本注入与账号同步。5173 的 Vite 配置没有剧情代理；直接访问 18080 与主站是不同 origin。
- 保留大型二进制流式转发；只对 HTML 注入同步脚本，不把视频/音频整体读入内存，不直接修改压缩剧情 bundle 来绕过代理问题。
- 剧情存档本地在 IndexedDB，云端按账号和 slot 保存整份 JSON。当前 PUT 为覆盖，不是冲突合并；不能擅自解释或拆解第三方存档结构。
- 没登录、数据库尚未建立或浏览器缺少 `indexedDB.databases()` 等情况会影响同步。新增同步逻辑需实际验证首次进入、换账号和较新存档覆盖边界，不以 HTTP 200 代替播放/同步验收。

## 4. 验证矩阵

先做针对性验证，再按改动范围运行现有集合。对实际启动路径做冒烟；测试全绿不代替浏览器或真实服务验证。

| 改动范围 | 建议检查（在对应目录运行） |
| --- | --- |
| 前端一般改动 | `web/`：`npm test`、`npm run build`；界面改动通过真实浏览器操作并观察控制台与网络。界面模式专项：`npm run test:uimode`，并至少检查标准/老人/幼稚三档、320/412/1280 宽度、底部栏与家长锁 |
| 格斗规则/预测/回滚 | `web/`：相关 `test:fx`、`test:rules`、`test:ab`、`test:repro`、`test:rollback`、`test:predict`、`test:netauth`；完成后默认测试链 |
| 后端接口/持久化 | 启动 `server/run_local.py` 后实际访问受影响 HTTP/WS 路径；使用临时 SQLite，不碰 `server/data/dev.db` |
| 静态托管/代理/启动 | 构建并启动真实服务后访问页面、`/docs`、`/api/health` 与 `/gal/*`；剧情路径另起上游并实测 |
| 实时转发 | 服务运行后，用浏览器或 WS 客户端实际收发受影响消息；写入前确认用的是临时数据 |
| Linux 启动脚本（根 `scripts/`） | `bash scripts/setup.sh --skip-build`、`bash scripts/start_web.sh --no-browser`、`bash scripts/stop_web.sh`；`bash -n` 做语法检查 |

- 无 Bash 的 Windows 环境不要假定已有 `python3`，用 `python` 执行对应脚本。
- Linux 上跑 Python 前确认 `PYTHONIOENCODING=utf-8`（或 `PYTHONUTF8=1`），否则部分输出会 `UnicodeEncodeError`。
- 浏览器 E2E 需要 Playwright / Chromium；各脚本启动方式和地址不完全一致，先阅读脚本，不能把一个 E2E 的端口假设套到全部。
- 使用临时数据库/独立演示账号；Windows 上先关引擎、SQLite 连接和子进程再清理临时文件。严禁在 `server/data/dev.db` 等现有用户数据上做破坏性验证。
- 交付时区分本次实际运行、历史记录和未验证范围；没有执行的检查不得写成通过。仅改文档时检查链接、路径和命令说明，不必为了写“测试通过”运行无关测试。

## 4.1 Linux（Ubuntu）启动约定

- 仓库里 `.sh` 必须保存在 **LF**（`.gitattributes` 已钉死）。CRLF 会让 `set -euo pipefail` 报
  `pipefail: invalid option name`，在 Linux 上等于整个脚本不能用。Windows 上编辑后先确认换行再提交。
- `start_web.ps1` 与之对应的是根 `scripts/start_web.sh`：**同样遵守"先剧情模式、再看主服务"**的顺序，
  以及固定端口（8080 / 18080）、数据库选择、已有服务识别和已有 `dist` 的行为；改一侧要对照另一侧。
- 后台服务用 `setsid` + `.runtime/*.pid` 管理；`run_local.py` 只是启动器，真正的监听进程是它派生的
  `python -m uvicorn` 子进程，**停服务必须连进程树一起停**（`stop_web.sh` 已处理；端口兜底扫描只杀本项目进程）。
- `run_local.py` 默认只监听 `127.0.0.1`；对外暴露必须显式 `MOOPET_HOST=0.0.0.0`，并同时换掉
  `MOOPET_SECRET_KEY`、限定 `MOOPET_ALLOW_ORIGINS`。
- Node 是**运行时**依赖（服务端权威对战的引擎子进程），不只是前端构建依赖；新增"起 node 子进程"的代码
  统一用 `app.engine_host.find_node()`（支持 `MOOPET_NODE`），不要直接写 `"node"`。
- 容器档（`server/docker/Dockerfile`）的构建上下文是**仓库根**：需要 `web/`（前端产物 + 引擎脚本与规则）。
  改动目录结构时同步核对 Dockerfile 的 `COPY` 与 `server/docker-compose.yml` 的 `context`。
- 涉及 Python 版本要求的改动，以 Ubuntu 22.04 自带的 3.10 为下限验证（不要引入 3.11+ 专属语法），
  除非同时更新 README 与 `server/run_local.py` 的版本提示。

## 5. 资源、发布与变更交付

- 有权授权且未另行声明的原创代码及技术文档，遵守根《Moopet · 非商业学习交流许可 1.0》；允许非商业学习、修改和协作分享，禁止商业使用。不要将本项目标为 MIT、可自由商用或 OSI 意义的开源项目，也不要擅自添加不适用的标准 SPDX 标识。
- 第三方及其衍生部分继续遵守原始条款，详见 `THIRD_PARTY_NOTICES.md`。发布格斗相关源码或构建包须保留 `web/src/game/ab/LICENSE`、`ASSET_NOTICE.md`、上游署名及本仓库修改说明；这些要求不限于 `ab/` 目录，不能将移植版重新声明为项目独创或仅附根许可。
- 保留 `gal/web/SPINE-RUNTIMES-LICENSE.txt`；字体、模型、角色、背景、音视频分别核权，不把来源链接或提示词当作可再分发证明。
- `web/public/breeds/`、`web/public/models/`、`web/public/fonts/`、`web/public/backdrops/` 是运行必需资产，删除前必须确认对应页面/场景的降级行为。
- 字体由 `web/tools/vendor_font.mjs` 管理，修改生成物前先查其来源及许可证，避免下次生成覆盖人工修补。
- 不提交 `.env`、真实凭据、SQLite/备份、虚拟环境、node_modules、dist、构建目录、调试截图或日志。`.gitignore` 不会移除已入 Git 的文件；发现历史凭据先通知维护者并轮换。
- 不擅自删除用户的历史 PPT、个人文件或本地数据库；公开前核实成员姓名与其他个人信息可披露。
- 修改 Windows 启动脚本时保留 `start_web.ps1` 的 UTF-8 BOM + CRLF 要求，并核对虚拟环境、固定端口、数据库选择、已有服务及已有 dist 的行为。
- 修改 Linux 启动脚本（根 `scripts/`）时保留：脚本为 LF、幂等、失败信息可执行（告诉用户下一步命令），
  且不把服务端默认监听改回 `0.0.0.0`。
- PR 交付写清：修改目的、影响文件/API/消息/数据、验证命令与观察结果、已知失败及未验证边界；行为或启动契约变化同步更新文档。不得自动提交、推送、建远程仓库或迁移大素材，除非维护者明确要求。

## 6. 文案与提交说明

### 编辑前后

- 编辑前检查工作区，保留维护者未提交的修改。只改本次任务涉及的文件，不顺手整理目录、格式化全仓库或清理历史材料。
- 文档里的功能、命令和限制要能对应到当前代码。拿不准就核对，不用“已全面支持”“完整可用”等措辞补足证据。
- 功能、启动步骤或接口发生变化时同步修改对应说明；只改文案时不改运行逻辑。
- 完成后说明改了什么、做了哪些检查、还有哪些未验证。不要复制整段 diff，也不要把交付汇报不断追加到 README。

### README 与用户可见文案

- 默认使用自然、直接的中文，保留必要的代码名和技术术语。先写用户能做什么，再写操作方法和限制。
- 删除不提供信息的修饰和套话，例如“全面赋能”“开箱即用”“端到端闭环”“优雅实现”。需要描述能力时写清具体行为和适用条件。
- 不堆叠完成清单、验收表、表情符号或加粗标语；列表用于并列事项，不把一句话拆成多层标题。
- 使用页面已有名称，不为了文风擅自更名。保留安全边界、兼容性限制、许可证和第三方署名，不以“精简”为由删掉这些内容。
- 不虚构验证结果、用户反馈或人工参与；减少模板化措辞不等于隐瞒工具使用，也不删除已有的作者和协作署名。

### Git 提交与 GitHub

- 提交标题沿用 `类型(范围): 具体改动`，默认中文；范围可省略。类型使用现有的 `feat`、`fix`、`docs`、`chore` 等。
- 标题写实际变化，不写工作过程或自评。例如 `docs: 精简项目介绍并补充 Agent 编辑规范`、`fix(linux): 修正启动脚本的换行符`。避免 `update files`、`完善项目`、`全面优化` 等无法判断内容的标题。
- 一次提交围绕一个目的；不要为了让 GitHub 文件列表显示新文案，触碰无关文件或制造空提交。列表中的说明来自各文件的最近一次提交，同一句话出现在多行是正常现象。
- 复杂改动的正文补充原因、兼容性影响和实际验证结果；简单文案修改不套用长篇模板。提交标题与正文必须和实际 diff 一致。
- 不自行执行提交或推送。维护者要求提交时只暂存本次相关文件；要求更新 GitHub 时再推送到明确的目标分支。
- 默认保留已发布历史。修改旧提交标题会改变哈希，必须先说明受影响分支、协作同步和强制推送风险，取得明确许可并保留备份；不能用新提交假装旧标题已经修改。

## 7. PR 与合并前检查

### 提交 PR

- 从最新目标分支创建工作分支，默认向 `main` 提 PR；一个 PR 解决一个问题。无关重构、依赖升级和素材调整分开提交。
- PR 标题采用 §6 的提交标题格式，说明实际变化。使用仓库的 [PR 模板](.github/pull_request_template.md)，写清原因、行为变化、影响范围与验证证据；不适用的项目写明原因，不勾选未完成项。
- 未完成实现、缺少关键验证或仍有待定方案时保持 Draft。关联已有 issue；没有 issue 不必为填模板创建一个。
- 验证记录包含执行命令或操作步骤、环境、结果和被验证的提交 SHA。界面变化附截图或操作记录，注意遮盖账号、token 和个人信息；截图不能代替功能验证。
- 涉及 API、WebSocket、数据库、存档或配置兼容性时，说明旧客户端/旧数据的行为、升级步骤和回退方式。数据库变化不能只写“回退代码即可”。

### 合并前由审查者逐项确认

1. **范围与基线**：确认目标分支和 PR 最新 head SHA，阅读相对目标分支的完整 diff，包括删除、锁文件、生成物和工作流。检查意外文件、凭据、用户数据、许可证和资源引用；不只读 PR 摘要。
2. **行为与风险**：按 §3 检查本次涉及的不变量。重点核对认证/账号隔离、服务端写入权限、输入校验、异常清理及旧数据兼容；不涉及的项目注明原因。
3. **验证证据**：按 §4 选择检查，先运行直接覆盖改动的场景，再执行对应测试集合。前端行为改动需测试与构建，UI 需浏览器操作；后端需受影响的 HTTP/WS 与临时数据库验证；启动改动需真实启动/停止。纯文档变更检查链接、路径和命令说明即可。
4. **合并结果**：确认无冲突，并在临时分支、独立 worktree 或 CI 的合并结果上检查与最新目标分支的集成。记录 head SHA 与目标分支 SHA；不在维护者有未提交修改的工作区试合并。
5. **审查结论**：阻塞意见已修复并复查，讨论已解决，验证记录与当前代码一致。由有合并权限的维护者确认；有其他维护者可审查时，至少一名非作者审查。单人维护时记录自审，不把 Agent 自检冒充独立批准。
6. **最终标题与正文**：合并提交说明应准确概括实际改动，不直接照搬整份 PR 模板。默认用 squash 合并同一目的的零散修订；需要保留独立提交时，由维护者选择普通 merge。

### 阻止合并的情况

- 测试、构建或必需 CI 检查失败、等待中、被取消，或关键行为尚未验证。没有 CI 不代表已通过，必须提供手动检查证据。
- 存在未解决的正确性、安全、数据丢失、兼容性或授权问题，或 PR 描述与实际 diff 不符。
- 通过跳过测试、放宽断言、改写基准或移除检查来掩盖失败。确认是无关的既有失败时，记录复现、影响和维护者处理决定；必需检查仍不得绕过。
- 验证后追加了影响行为的提交、解决了冲突，或目标分支变化影响集成结果：重新检查受影响路径，并更新 SHA 与结果。纯文案追加也要复查 diff，不能直接沿用旧批准。

### Agent 与仓库设置

- Agent 在合并前报告：目标分支、head/base SHA、审查发现、实际检查及结果、未验证范围、是否存在阻塞项。不能只回复“可以合并”。
- 未明确授权，不执行 merge、启用自动合并、直接推送 `main`，也不修改分支保护。获得合并授权后，若 head/base 已变更或有阻塞项，先重新检查，不使用管理员绕过。
- 建议维护者为 `main` 配置 GitHub ruleset：要求 PR、解决审查讨论、禁止强制推送和删除；多人维护时要求至少一名审查者，并使新增提交后的旧批准失效。已有稳定 CI 时，将真实存在的检查设为必需并要求基于最新目标分支验证。
- PR 模板和本文件只是流程约定，不会自动启用上述 GitHub 设置，也不能替代 CI。没有实际配置与验证，不得声称已启用合并保护。
