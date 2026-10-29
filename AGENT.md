# AGENT.md · Moopet 开发协作指南

供人工开发者和 AI 编码助手使用。文件名按本项目约定为单数 `AGENT.md`；若你的工具不会自动读取，请在开始任务时显式加载。项目入口、安装和已执行的验证见 [README.md](README.md)。

## 1. 工作范围与事实来源

- 这是 Web、服务端、机械狗工作区和剧情导出资源组成的多子项目仓库，没有统一根构建命令。
- 先明确本次修改影响哪一侧，再阅读入口、调用者、配置和已有测试；不要只依据历史汇报或文件头的完成度声明。
- 当前代码和可复现结果优先于旧 README、W1–W6 汇报、排期和任务清单。保留历史材料，不把历史目标写成已经实现的功能。
- 根 README 的“当前核验结果”是整理时的基线，不是永久保证；修改相关模块后补充本次真实结果和未验证范围。
- 不擅自搬目录、批量改名、统一两套规则或删除素材。代码、协议、数据兼容性和授权范围发生变化时先说明影响；产品规则无法从代码/规范确定时询问维护者。

## 2. 按任务找入口

| 修改内容 | 优先阅读 |
| --- | --- |
| 页面、路由与页面状态 | `web/src/main.js`、`web/src/lib/router.js`、`store.js`、`web/src/pages/` |
| API 调用、认证与会话 | `web/src/lib/api.js`、`web/src/lib/ws.js`；`server/app/api/auth.py`、`deps.py`、`security.py` |
| UI 组件与主题 | `web/src/components/layout.js`、`ui.js`、`web/src/styles/`；复用现有样式变量与组件 |
| 世界与场景 | `web/src/pages/world.js`、`web/src/world/`、`shared/world_scenes.json`、`server/app/ws/world_hub.py` |
| 格斗模拟与联机 | `web/src/game/simAB.js`、`fx.js`、`rules.js`、`match.js`、`net.js`、`authority.js`（含预测与回滚） |
| 服务端权威引擎 | `web/tools/engine_host.mjs`、`server/app/engine_host.py`、`authority.py`、`rooms.py`、`ws/authority_routes.py` |
| 训练与成长 | `web/src/game/levels.js`、`growth.js`、`web/src/lib/exp.js`；`server/app/api/training.py` |
| Web 问询/同问、签到/抽签/日记 | `server/app/api/quiz.py`、`tower.py`、`server/app/ws/quiz_routes.py`；对应 `web/src/pages/quiz.js`、`duel.js`、`tower.js` |
| 后端装配与数据库 | `server/app/factory.py`、`config.py`、`db.py`、`models.py`、`schemas.py`、`seeds.py` |
| 剧情代理与存档 | `server/app/factory.py`、`server/static/gal-sync.js`、`server/app/api/gal.py`；`gal/web/config.json` |
| 机械狗经验/答题/决策 | `moopet_ws/src/moopet_core/moopet_core/` 与相邻 `tests/` |
| 通信、故障及大脑位置切换 | `moopet_ws/src/moopet_link/`、`moopet_deploy/`、`tools/link_lab/` |
| ROS2 节点与接口 | `moopet_ws/src/moopet_dog/`、`moopet_backpack/`、`moopet_interfaces/`、`moopet_hal/`；`moopet_ws/docs/interface_spec.md` |

## 3. Web 与服务端约定

### 页面和连接生命周期

- 保持原生 ES 模块 + Vite + Three.js 的现有结构，不为局部改动引入新框架。
- 路由是 hash 路由。复用 `onDispose(node, fn)` / 页面 `__dispose` 约定，切页释放动画循环、事件监听、定时器、WebSocket 和渲染资源。
- HTTP 默认同源 `/api/*`；WebSocket 使用当前页面 host 与 `ws:` / `wss:`。Vite 通过 `MOOPET_BACKEND` 代理 `/api`、`/ws`。
- `?api=` 只覆盖 HTTP 基址，不会同步改变 WebSocket 目标；不能将它描述为全协议远程连接配置。
- 主站 localStorage 保存 token、账号缓存与主题，不是完整养成数据库。退出账号、切账号和删除狗时不得沿用另一账号的内存状态或剧情存档。
- 用户可见术语先对照 `docs/文字游戏规范.md`、世界观以及页面现有文案；不要把调试内部术语直接显示给用户。

### 对战不变量

- 实际运行的格斗核心是 `simAB.js`；`web/src/game/ab/` 是上游参考引擎（oracle），不要修改它来让回归通过。
- 定点 Q8（`SCALE=256`）、128Hz；规则层不得引入 DOM、实时时钟、`Math.random()` 或依赖跨引擎浮点超越函数的结果。规则随机与表现随机分开。
- 同 seed、初始档案、座位与输入序列应得到相同状态指纹。品种/等级按服务端座位顺序组织，不能两端都按 `[自己, 对手]` 初始化。
- 修改状态字段或状态机时同时检查快照、恢复、哈希、回放和回滚，保留数组/对象共享关系；不能只更新渲染对象。
- 服务端权威路径通过 Node 子进程复用同一份 JS 引擎，不在 Python 再写一份格斗规则。每房间引擎在关闭/异常路径中必须释放。
- 锁步与服务端权威是两条实际存在的路径，不把一条路径的等待输入/掉线/判胜规则机械套到另一条。
- 不用 `node tests/ab_golden_test.mjs --write` 等改写基准的方式“修复”回归；确需改变规则时，在 PR 中解释轨迹变化及独立验证证据。

### 数据、权威与协议

- `create_app()` 位于 `server/app/factory.py`；测试优先使用它和 `server/tests/helpers.py` 的隔离工厂。导入 `app.main` 会创建默认应用并初始化默认数据库，不用于隔离测试搭建。
- 所有 API/WS 路由及 `/gal/*` 代理必须先于根静态 `Mount('/')` 注册，否则静态目录会吞掉请求。
- 房间/连接状态位于单进程内存，不宣称支持多 worker、跨进程或重启恢复。
- 数据库当前使用启动建表和已有的字段兼容处理，不等于有完整迁移体系。改表先考虑既有 SQLite 数据，禁止靠删除用户数据库解决迁移问题。
- `PATCH /api/dogs/mine`、对局结果/领奖、训练和问询的写入边界逐条核对。既不能把客户端档案全部当可信，也不能把“本地权威”概括成云端绝不写成长数据。
- 问询答案不随出题下发；同问判分/计时与提示解锁在服务端，不能提前把冷却中的提示发给客户端。
- Web 的 `growth.js` 与 `api/quiz.py` / `ws/quiz_routes.py` 中提示延迟、答题经验等存在跨语言对应公式；修改时同步核对两侧取整、上下界和时序。
- `shared/world_scenes.json` 是服务端读取的场景边界配置，前端仍有独立 JS 场景定义，当前部分尺寸/出生点不一致。修改要核对两侧，不能声称它已是唯一来源；坐标转换按目标场景约定处理。
- 根 `data/questions*.json` 是 Web 题库，必须保留；机械狗核心另有自己的包内数据。不要误用数据库忽略规则排除题库或默认两边自动同步。

### 剧情应用

- `gal/` 是已有导出物；本仓库调查范围内没有它的完整源码构建入口，`npm run build` 只构建主 Web。
- 通过主服务 `/gal/*` 访问才有同源脚本注入与账号同步。5173 的 Vite 配置没有剧情代理；直接访问 18080 与主站是不同 origin。
- 保留大型二进制流式转发；只对 HTML 注入同步脚本，不把视频/音频整体读入内存，不直接修改压缩剧情 bundle 来绕过代理问题。
- 剧情存档本地在 IndexedDB，云端按账号和 slot 保存整份 JSON。当前 PUT 为覆盖，不是冲突合并；不能擅自解释或拆解第三方存档结构。
- 没登录、数据库尚未建立或浏览器缺少 `indexedDB.databases()` 等情况会影响同步。新增同步逻辑需实际验证首次进入、换账号和较新存档覆盖边界，不以 HTTP 200 代替播放/同步验收。

## 4. 机械狗分层约定

- `moopet_core` 是不依赖 ROS2 的领域逻辑；不得导入 `rclpy`、ROS 消息或上层节点/部署模块。
- ROS 节点负责转换输入/输出，成长与决策规则在 core 中维护，不把它们复制回 `moopet_dog` / `moopet_backpack`。
- 通信与部署分别放在 `moopet_link`、`moopet_deploy`；修改跨端事件、消息或参数时对照 `interface_spec.md`、`moopet_interfaces` 与 `tools/link_lab/contract.py`。
- 大脑位置切换保持同一业务输入下的输出语义；弱网、断连、恢复和离线队列行为由已有通信层处理，不在每个节点重复设计一套。
- 核心经验引擎有来源周上限、总周上限、等级上限、衰减下限和部分奖励豁免。火花涉及日期、续火/熄灭/恢复、提醒去重、每日任务与抽奖保底；改动要覆盖相应边界，不绕过统一结算直接改累计经验。
- Web 月塔抽签与机器人火花抽奖不是同一实现，数值也不相同。未经明确产品决定，不合并概率、保底、经验口径，也不承诺完整端云同步。
- 旧 `standalone_demo*.py` 与历史说明有迁移欠账；已验证 W5 入口导入失败。当前无 ROS 入口优先用 `python tools/link_lab/run_lab.py`，不要为文档临时添加旧路径兼容 shim。
- 硬件抽象/模拟感知、LED/外观占位数据或日志 TTS 不等于真实硬件已驱动；交付时明确仿真与实机验证的边界。

## 5. 验证矩阵

先做针对性验证，再按改动范围运行现有集合。对实际启动路径做冒烟；测试全绿不代替浏览器或真实服务验证。

| 改动范围 | 建议检查（在对应目录运行） |
| --- | --- |
| 前端一般改动 | `web/`：`npm test`、`npm run build`；界面改动通过真实浏览器操作并观察控制台与网络 |
| 格斗规则/预测/回滚 | `web/`：相关 `test:fx`、`test:rules`、`test:ab`、`test:repro`、`test:rollback`、`test:predict`、`test:netauth`；完成后默认测试链 |
| 后端接口/持久化 | `server/`：`python tests/run_all.py`；使用临时 SQLite，实际访问受影响 HTTP/WS 路径 |
| 静态托管/代理/启动 | 构建并启动真实服务后，在 `server/` 运行 `python tests/single_url_check.py [服务地址]`；剧情路径另起上游并实测 |
| 实时转发 | 服务运行后，在 `server/` 运行 `python tests/live_ws_check.py [服务地址]`；该脚本会写入数据 |
| core / link / deploy | `moopet_ws/`：`bash scripts/boundary_test.sh` 与 `python tools/link_lab/run_lab.py`；额外运行受影响而未纳入集合的测试 |
| ROS 接口与节点 | Ubuntu + ROS2 环境编译后，运行相关节点和 `scripts/smoke_test.sh`；有硬件变化再做实机验证 |

- 无 Bash 的 Windows 环境可按 `scripts/boundary_test.sh` 列出的顺序，在各包目录使用 `python` 执行测试脚本；不要假定已有 `python3`。
- 浏览器 E2E 需要 Playwright / Chromium；各脚本启动方式和地址不完全一致，先阅读脚本，不能把一个 E2E 的端口假设套到全部。
- 后端现有基线为 `101/103`，失败是 `test_community.py` 中两项串门测试；旧 W5 standalone 也失败。不要删除/弱化断言或无关改规则掩盖基线，若任务恰好修复这些问题才更新状态。
- 使用临时数据库/独立演示账号；Windows 上先关引擎、SQLite 连接和子进程再清理临时文件。严禁在 `server/data/dev.db` 等现有用户数据上做破坏性验证。
- 本次整理已实际验证的范围以根 README 为准；未运行的 Docker、PostgreSQL、ROS2、完整浏览器 E2E 不得写成通过。

## 6. 资源、发布与变更交付

- 有权授权且未另行声明的原创代码及技术文档，遵守根《Moopet · 非商业学习交流许可 1.0》；允许非商业学习、修改和协作分享，禁止商业使用。不要将本项目标为 MIT、可自由商用或 OSI 意义的开源项目，也不要擅自添加不适用的标准 SPDX 标识。
- 第三方及其衍生部分继续遵守原始条款，详见 `THIRD_PARTY_NOTICES.md`。发布格斗相关源码或构建包须保留 `web/src/game/ab/LICENSE`、`ASSET_NOTICE.md`、上游署名及本仓库修改说明；这些要求不限于 `ab/` 目录，不能将移植版重新声明为项目独创或仅附根许可。
- 保留 `gal/web/SPINE-RUNTIMES-LICENSE.txt`；字体、模型、角色、背景、音视频及历史汇报模板分别核权，不把来源链接或提示词当作可再分发证明。
- `web/public/pv/`、`pv2/` 是宣传播放页及资源，属于现有交付物，应保留；`web/render/` 是导出视频/帧的生成目录。勿用忽略全部 `public` 的方式控制仓库体积。
- 场景编辑先读 `web/docs/场景编辑指南.md`；字体由 `web/tools/vendor_font.mjs` 管理，修改生成物前先查其来源及许可证，避免下次生成覆盖人工修补。
- 不提交 `.env`、真实凭据、SQLite/备份、虚拟环境、node_modules、dist、ROS 构建目录、调试截图或日志。`.gitignore` 不会移除已入 Git 的文件；发现历史凭据先通知维护者并轮换。
- 不擅自删除用户的历史 PPT、个人文件或本地数据库；公开前核实成员姓名与其他个人信息可披露。
- 修改 Windows 启动脚本时保留 `start_web.ps1` 的 UTF-8 BOM + CRLF 要求，并核对虚拟环境、固定端口、数据库选择、已有服务及已有 dist 的行为。
- PR 交付写清：修改目的、影响文件/API/消息/数据、验证命令与观察结果、已知失败及未验证边界；行为或启动契约变化同步更新文档。不得自动提交、推送、建远程仓库或迁移大素材，除非维护者明确要求。
