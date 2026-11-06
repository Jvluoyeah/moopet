# 长夜月 · 养成系机械狗（Moopet）

一个结合机械狗陪伴、成长养成与互动玩法的全栈项目，包含 Web 应用与后端服务。

## 功能

- 账号注册、机械狗领养与成长档案。
- 开放世界、社群互动、竞技场对战与训练关卡。
- 答题、双人问答、签到、抽签、日记与剧情模式。

## 技术栈

- 前端：Vite、原生 JavaScript、Three.js。
- 后端：FastAPI、SQLAlchemy、SQLite。

## 目录

```text
web/          Web 前端与游戏逻辑（含运行所需美术、模型、字体）
server/       后端 API 与 WebSocket 服务
gal/          剧情播放器与资源
scripts/      Linux 一键脚本：setup.sh / start_web.sh / stop_web.sh / probe_runtime.py
data/         题库
shared/       场景配置
```

## 启动 Web 应用

需要 Python 3.9+（Ubuntu 22.04 自带 3.10 即可）、Node.js 18+（按 22 验证）和支持 WebGL 的浏览器。

**Linux / Ubuntu 22.04（一键）：**

```bash
bash scripts/setup.sh      # 建虚拟环境、装依赖、构建前端（幂等，可重复跑）
bash scripts/start_web.sh  # 起主服务 + 剧情模式，然后打开浏览器
bash scripts/stop_web.sh   # 停止
```

打开 <http://127.0.0.1:8080/>，API 文档 <http://127.0.0.1:8080/docs>，
剧情入口 <http://127.0.0.1:8080/gal/web/index.html>。
局域网访问用 `bash scripts/start_web.sh --host=0.0.0.0`。

**任意平台（手动分步，从仓库根目录执行）：**

```bash
python3 -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
python -m pip install -r server/requirements.txt
cd web && npm ci && npm run build && cd ..
cd server && python run_local.py
```

依赖安装完成后，Windows 也可双击根目录的 `start_web.bat` 启动主应用。

### 剧情模式

`start_web.sh` / `start_web.bat` 会自动带上。手动启动时，另开终端，从仓库根目录执行：

```bash
python -m http.server 18080 --bind 127.0.0.1 --directory gal
```

通过 <http://127.0.0.1:8080/gal/web/index.html> 进入剧情（依赖主服务的 `/gal/*` 代理）。

## 当前核验结果

最近一次在 **Ubuntu 22.04.5 / Python 3.10.12** 上的实际结果：

| 检查 | 结果 |
| --- | --- |
| `bash scripts/setup.sh`（含缺 `python3-venv` 的降级路径） | 通过 |
| `bash scripts/start_web.sh` → 页面 / API / `/docs` / 剧情代理 | 全部 200，重复启动可识别，`stop_web.sh` 停干净 |
| `web/` `npm test` + `npm run build` | 通过（Node 24 验证；锁定 Node 18+） |

未验证：Docker 镜像构建、PostgreSQL、systemd/Nginx 部署、完整浏览器 E2E。

[许可证](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)
