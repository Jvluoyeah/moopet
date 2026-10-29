# 长夜月 · 养成系机械狗（Moopet）

一个结合机械狗陪伴、成长养成与互动玩法的项目，包含 Web 应用、后端服务和 Python / ROS2 机械狗软件栈。

## 功能

- 账号注册、机械狗领养与成长档案。
- 开放世界、社群互动、竞技场对战与训练关卡。
- 答题、双人问答、签到、抽签、日记与剧情模式。
- 机械狗经验结算、行为决策、情感与火花机制，以及无硬件通信仿真。

## 技术栈

- 前端：Vite、原生 JavaScript、Three.js。
- 后端：FastAPI、SQLAlchemy、SQLite。
- 机械狗：Python、ROS2 Humble。

## 目录

```text
web/          Web 前端与游戏逻辑
server/       后端 API 与 WebSocket 服务
gal/          剧情播放器与资源
moopet_ws/    机械狗软件栈与仿真工具
data/         题库
shared/       场景配置
blender/      场景模型源文件
```

## 启动 Web 应用

需要 Python 3.11+、Node.js 22 和支持 WebGL 的浏览器。以下命令从仓库根目录执行：

```bash
python -m pip install -r server/requirements.txt
cd web
npm ci
npm run build
cd ../server
python run_local.py
```

打开 <http://127.0.0.1:8080/>，API 文档位于 <http://127.0.0.1:8080/docs>。

依赖安装完成后，Windows 也可双击根目录的 `start_web.bat` 启动主应用和剧情服务。

### 剧情模式

手动启动时，另开终端，从仓库根目录执行：

```bash
cd gal
python -m http.server 18080 --bind 127.0.0.1
```

通过 <http://127.0.0.1:8080/gal/web/index.html> 进入剧情。

## 无硬件仿真

无需安装 ROS2，从仓库根目录执行：

```bash
python moopet_ws/tools/link_lab/run_lab.py
```

[许可证](LICENSE) · [第三方声明](THIRD_PARTY_NOTICES.md)
