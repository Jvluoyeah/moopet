# 养成系机械狗 · 服务端（FastAPI）

账号 / 品种 / 狗狗档案 / 公开社群 / 开放世界 / 对战撮合与锁步转发 / 排行榜。

对应《全栈计划_社群与对战.md》的第 ② 项。**本地先跑，后部署到云端 Ubuntu**，
两者只差一个环境变量。

---

## 一、快速开始

### 本地（SQLite，推荐先这样跑）

```bash
cd w6/server
pip install -r requirements.txt
python run_local.py            # → http://127.0.0.1:8080/docs
```

**如果前端已经构建过（`../web/dist` 存在），服务端会把它一起托管** ——
这样演示只要一个进程、一个地址：打开 `http://127.0.0.1:8080` 就是完整应用
（前端 + API + 对战 WebSocket 同源，没有跨域与代理问题）。

要先构建前端：`cd ../web && npm run build`。
没有 `dist` 也能跑，只是只提供 API（启动时会提示）。

或者用 docker：

```bash
cd w6/server
docker compose up --build      # → http://localhost:8080
```

> ⚠️ 本机未安装 Docker，`docker-compose.yml` 与 `docker/Dockerfile` 已写好但**未实际运行验证**；
> 上云前请先在一台装了 Docker 的机器上过一遍。

### 云端 Ubuntu（PostgreSQL）

```bash
export MOOPET_DATABASE_URL='postgresql+psycopg://moopet:密码@db:5432/moopet'
export MOOPET_SECRET_KEY="$(openssl rand -hex 32)"
export MOOPET_ALLOW_ORIGINS='https://你的域名'
docker compose --profile cloud up -d --build
```

前面再挂 Nginx（反代 + TLS + WebSocket 升级），见 `docs/部署文档.md`。

---

## 二、接口一览

| 分组 | 方法与路径 | 说明 |
|------|-----------|------|
| 服务 | `GET /api/health` · `GET /api/meta` | 健康检查 / 服务信息与权威边界 |
| 账号 | `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me` | argon2 哈希 + JWT |
| 品种 | `GET /api/breeds` · `GET /api/breeds/{code}` · `GET /api/breeds/{code}/population` | 8 个品种（分层 SVG 形象包，**不用 emoji**） |
| 档案 | `POST /api/dogs/adopt` · `GET /api/dogs/mine` · `PATCH /api/dogs/mine` · `GET /api/dogs/{id}/card` · `DELETE /api/dogs/{id}` | 领养即入社群；`card` 就是羊皮纸档案页的数据源 |
| 社群 | `GET /api/community/public` · `GET /api/community/members` · `GET /api/community/scenes` | 公开社群「长夜月广场」 |
| 世界 | `GET /api/world?scene=plaza` · `POST /api/world/move` | 开放世界在场与位置 |
| 互动 | `POST /api/community/visit/{dog_id}` · `GET /api/community/visits` | 串门、友谊值、访客记录 |
| 对战 | `POST /api/match` · `GET /api/match/{code}` · `POST /api/match/{code}/result` · `POST /api/match/{code}/claim` · `GET /api/match/{code}/replay` | 撮合 / 结算 / 领奖 / 回放 |
| 对战 WS | `WS /ws/match/{room_code}?token=…` | 锁步输入帧转发 |
| 排行 | `GET /api/leaderboard?kind=level|match|social` · `GET /api/leaderboard/kinds` | 等级榜 / 对战榜 / 社交榜 |

在线文档：`/docs`（Swagger）与 `/redoc`。

---

## 三、三条关键设计

### 1. 权威边界：养成本地权威，云端只管社群与对战

```
狗本体（本地 SQLite，权威）              云端（本服务）
  经验 / 等级 / 火花 / 日记        ──镜像──▶  dog_profile.level（只展示）
  周上限 / 衰减 / 成就规则                    不发下发等级经验
                                   ◀─奖励──   match.pending_exp（待领取）
```

* `PATCH /api/dogs/mine` 是**只上行**的镜像：云端不反向下发等级经验，避免两套权威打架。
* 对战奖励不直接加经验，只记 `pending_exp`；狗联网后 `claim` 领取，再由**本地** `exp_engine`
  结算（周上限、衰减、成就规则因此仍然只有一份实现）。
* 断网也能养狗 —— 这是产品底线，不是妥协。

### 2. 对战是"锁步中转站"，服务端不跑模拟

模拟只在客户端跑一次（`web/src/game/sim/`），服务端只做四件事：撮合、转发输入帧、
记录回放日志、掉线通知。原因见计划第十节：服务器权威要同时维护 Python 与 JS 两份模拟，
是 8 天工期里最容易翻车的地方。

* 掉线处理：一方断开 → 另一方立刻收到 `{"type":"peer_left","takeover":"ai"}` → 切 AI 接管，对局不卡死。
* 回放：`GET /api/match/{code}/replay` 返回 `seed + inputs`，客户端用同一份确定性模拟即可复现整局。

> ⚠️ 房间状态在**进程内存**里，所以演示阶段固定单进程（`uvicorn` 不加 `--workers`）。
> 要多进程/多机必须把房间与转发接到 Redis 上。

### 3. 开放世界用"确定性位置"而不是真同步

NPC 狗的位置由 `(dog_id, 时间片)` 哈希决定（`app/world.py`）：

* 服务端不需要后台任务或物理模拟，刷新就能看到狗在动；
* 同一时间片内所有客户端看到的位置一致，不会各看各的；
* 整数坐标（0~1000），避免浮点在不同端上产生差异。

---

## 四、测试

```bash
cd w6/server
python tests/run_all.py             # 全部（60 项）
python smoke.py                     # 端到端冒烟（注册→领养→入社群→对战→排行）
python tests/live_ws_check.py       # 真 socket 联机验证（需先起服务）
python tests/single_url_check.py    # 单地址演示验证（需已构建前端）
```

| 文件 | 覆盖 |
|------|------|
| `tests/test_auth.py` | 注册/登录/鉴权/用户名枚举防护/密码哈希 |
| `tests/test_dogs.py` | 领养入社群/档案卡/镜像上报/上限/删除权限 |
| `tests/test_community.py` | 公开社群/成员/场景/在场/串门/位置确定性 |
| `tests/test_match.py` | 撮合/结算（胜平负）/幂等/领奖一次/锁步 WS/掉线接管/排行 |
| `tests/live_ws_check.py` | 走真实 TCP：双向各 30 帧序号连续、回放日志落库 |
| `tests/single_url_check.py` | 静态托管与 `/api/*` 不冲突、打包资源可取 |

---

## 五、环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `MOOPET_DATABASE_URL` | `sqlite:///…/data/moopet.db` | 云端换 PostgreSQL |
| `MOOPET_SECRET_KEY` | 开发默认值 | **部署前必须换**（启动会告警） |
| `MOOPET_TOKEN_TTL_HOURS` | `72` | 登录有效期 |
| `MOOPET_ALLOW_ORIGINS` | `*` | 逗号分隔；生产限定域名 |
| `MOOPET_SEED_DEMO` | `1` | 是否写入 8 只演示 NPC 狗（广场才有人） |
| `MOOPET_DEBUG` | `0` | 打开 SQL 回显 |

---

## 六、目录

```
server/
  app/
    main.py         uvicorn 入口（只是包一层）
    factory.py      create_app()：装配应用（测试直接用它）
    config.py       环境变量 → Settings，含部署告警
    db.py           SQLAlchemy 引擎/会话（SQLite pragma 调优）
    models.py       11 张表
    schemas.py      请求/响应模型
    security.py     argon2 + JWT
    deps.py         依赖注入（当前账号/当前狗/可选登录）
    world.py        开放世界确定性位置与场景
    seeds.py        8 品种 + 公开社群 + 演示 NPC 狗
    api/            auth / breeds / dogs / community / leaderboard / match
    ws/             hub.py（房间与转发）· routes.py（WebSocket 端点）
  tests/            60 项用例 + 真 socket 联机脚本
  docker/           Dockerfile
  docker-compose.yml
```

---

## 七、上云前必做

- [ ] `MOOPET_SECRET_KEY` 换成 `openssl rand -hex 32`
- [ ] `MOOPET_ALLOW_ORIGINS` 限定为前端域名
- [ ] 数据库换 PostgreSQL，并改用 Alembic 迁移（当前用 `create_all`，演示够用）
- [ ] Nginx 反代时放行 WebSocket 升级头（`Upgrade` / `Connection`）
- [ ] 校验 `MOOPET_DATABASE_URL` 不含明文密码进日志（`config.describe()` 已做脱敏）
