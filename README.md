# 长夜月 · 养成系机械狗（Moopet）

Moopet 是一个在浏览器里养机械狗的项目。领养后可以训练、答题、对战，也可以进入世界场景或游玩剧情。前端和后端都在这个仓库中。

## 功能

- 账号注册、机械狗领养与成长档案。
- 开放世界、社群互动、竞技场对战与训练关卡。
- 答题、双人问答、签到、抽签、日记与剧情模式。
- 标准、老人和幼稚三种界面模式，设置只保存在当前浏览器。
  - 老人模式提供大字、高对比、底部导航和领养草稿保存；浏览器支持时可用语音输入。
  - 幼稚模式提供简化入口、星星收集，以及可关闭的音效和动画。
  - 幼稚模式的家长锁使用本机四位密码，限制离开模式、账号设置等操作。它只用于防误触，不是账号安全保护。

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

需要 Python 3.9+、Node.js 18+ 和支持 WebGL 的浏览器。Node.js 也用于后端对战引擎，构建前端后仍需保留。

**Linux / Ubuntu 22.04：**

```bash
bash scripts/setup.sh      # 创建虚拟环境、安装依赖并构建前端
bash scripts/start_web.sh  # 启动主应用和剧情服务，打开浏览器
bash scripts/stop_web.sh   # 停止服务
```

打开 <http://127.0.0.1:8080/>，API 文档 <http://127.0.0.1:8080/docs>，
剧情入口 <http://127.0.0.1:8080/gal/web/index.html>。
局域网访问用 `bash scripts/start_web.sh --host=0.0.0.0`。

**手动启动（从仓库根目录执行）：**

先创建并激活虚拟环境。Linux / macOS：

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

然后安装依赖、构建前端并启动：

```bash
python -m pip install -r server/requirements.txt
cd web && npm ci && npm run build && cd ..
cd server && python run_local.py
```

依赖安装完成后，Windows 也可双击根目录的 `start_web.bat` 启动主应用。

### 剧情模式

启动脚本会同时启动剧情服务。手动启动时，另开终端，从仓库根目录执行：

```bash
python -m http.server 18080 --bind 127.0.0.1 --directory gal
```

通过 <http://127.0.0.1:8080/gal/web/index.html> 进入剧情（依赖主服务的 `/gal/*` 代理）。

## 开发与限制

在 `web/` 目录运行现有测试和构建：

```bash
npm test
npm run build
```

这些检查不覆盖完整浏览器操作。修改页面后还需实际操作相关功能；剧情播放与存档同步也需单独检查。
Docker、PostgreSQL、systemd/Nginx 部署和移动端真机仍需验证，不作为已验证的部署方式。

参与修改前请阅读 [AGENT.md](AGENT.md)，其中列出了代码入口、验证方式，以及文档和提交说明的写法。
README 只保留使用说明和已知限制；每次改动的验证记录放在对应 PR 或提交说明中。

[许可证](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)
