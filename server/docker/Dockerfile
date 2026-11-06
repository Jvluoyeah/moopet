# 长夜月 · 机械狗 —— 服务端镜像（Linux 通用；Ubuntu 22.04 与其他发行版都能跑）
#
# 为什么分两段构建：
#   · 前端（web/）需要 Node 构建成 web/dist，服务端启动时把它挂到根路径，
#     这样容器里就是"一个进程、一个端口"的完整应用；
#   · 但**运行时也需要 Node**：服务端权威对战的每局模拟是 `node web/tools/engine_host.mjs`
#     子进程（见 server/app/engine_host.py）。所以最终镜像要带 Node 运行时，
#     不能只留一个 Python。
#
# 构建上下文必须是**仓库根目录**（要看得到 web/、server/、gal/）：
#     docker build -f server/docker/Dockerfile -t moopet:latest .
# 或者直接用 server/docker-compose.yml（context 已经配好了）。
#
# ⚠️ gal/ 有 284MB 素材，默认**不打进镜像**：容器里剧情模式只有入口没有资源
#    （/gal/* 仍会按 MOOPET_GAL_UPSTREAM 去代理）。需要的话加 --build-arg INCLUDE_GAL=1。

# ---------------- 第一段：构建前端 ----------------
FROM node:22-bookworm-slim AS webbuild
WORKDIR /build/web
# 依赖先拷：改业务代码不会让 npm 层全量重来
COPY web/package.json web/package-lock.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else npm install --no-audit --no-fund; fi
COPY web/ ./
RUN npm run build && test -f dist/index.html

# ---------------- 第二段：运行时 ----------------
FROM python:3.11-slim

ARG INCLUDE_GAL=0

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONUTF8=1 \
    PYTHONIOENCODING=utf-8 \
    LANG=C.UTF-8 \
    MOOPET_HOST=0.0.0.0 \
    MOOPET_PORT=8080 \
    MOOPET_DATABASE_URL=sqlite:////data/moopet.db

# 运行时要 Node（权威对战的引擎子进程）+ curl（健康检查/排障）
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && apt-get purge -y --auto-remove gnupg \
 && rm -rf /var/lib/apt/lists/* /etc/apt/sources.list.d/nodesource.list \
 && node --version

WORKDIR /app

# 服务端依赖单独一层
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r /app/server/requirements.txt

# 服务端代码 + 构建好的前端 + 引擎脚本与规则（引擎在 web/tools、web/src 下）
COPY server/ /app/server/
COPY --from=webbuild /build/web/dist /app/web/dist
COPY web/tools/ /app/web/tools/
COPY web/src/ /app/web/src/
COPY web/package.json /app/web/package.json

# 数据卷：SQLite 落在这里（挂载出来才能持久化）
RUN mkdir -p /data && useradd -m -u 10001 moopet && chown -R moopet:moopet /data /app
USER moopet

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

# 单进程启动：对战房间在进程内存里（多 worker 会各管各的房间）
CMD ["python", "server/run_local.py"]
