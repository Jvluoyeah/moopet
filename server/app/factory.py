"""应用工厂：`create_app()` 在这里；`app/main.py` 只是把它包成 uvicorn 要的 `app`。

这样拆分是为了**测试友好**：测试 import `app.factory` 不会顺带创建默认 app
（否则会写出一份真实数据库文件、还打印一堆部署告警）。
"""
import os

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from . import seeds
from .api import (auth, breeds, community, dogs, gal, leaderboard, match, quiz, tower,
                  training)
from .config import Settings
from .db import init_db, make_engine, make_session_factory
from .ws import authority_routes
from .ws import quiz_routes
from .ws import routes as ws_routes
from .ws import world_routes
from .ws.hub import MatchHub
from .ws.quiz_routes import QuizHub
from .ws.world_hub import WorldHub

__version__ = '0.1.0'


def create_app(settings=None, seed=True, warn=True):
    settings = settings or Settings.from_env()
    app = FastAPI(title='养成系机械狗 · 服务端', version=__version__,
                  description='账号 / 社群 / 开放世界 / 对战撮合 / 排行榜')

    engine = make_engine(settings.database_url, echo=settings.debug)
    init_db(engine)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    app.state.hub = MatchHub()
    app.state.world_hub = WorldHub()
    # 同问（好友对战）的房间：判分与计时都是服务端权威，见 ws/quiz_routes.py
    app.state.quiz_hub = QuizHub()
    # 权威对战的房间表（每个房间一个 Node 子进程承载引擎）
    from .rooms import RoomManager
    app.state.rooms = RoomManager()
    # room_code -> 这个房间的活跃连接（广播用）
    app.state.auth_conns = {}
    # room_code -> 这个房间的推进任务（每房一个，别每连接一个）
    app.state.auth_tasks = {}

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allow_origins,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
    )

    for r in (auth.router, breeds.router, dogs.router, community.router,
              leaderboard.router, match.router, training.router, ws_routes.router,
              world_routes.router, authority_routes.router, tower.router,
              quiz.router, quiz_routes.router, gal.router):
        app.include_router(r)

    meta = APIRouter(prefix='/api', tags=['服务信息'])

    @meta.get('/health', summary='健康检查')
    def health():
        return {'ok': True, 'version': __version__}

    @meta.get('/meta', summary='服务信息')
    def info():
        return {'name': 'moopet-server', 'version': __version__,
                'config': settings.describe(),
                'modules': ['账号', '品种', '狗狗档案', '社群', '开放世界',
                            '对战撮合与锁步转发', '排行榜'],
                'authority': {
                    'local': '养成数据（经验/等级/火花/日记）以狗本体为权威',
                    'cloud': '账号/社群/对战结果/排行以云端为权威',
                },
                'rooms': app.state.hub.stats(),
                'world': app.state.world_hub.snapshot()}

    app.include_router(meta)

    # 前端构建产物：web/dist 存在就一起托管，演示只要起一个进程、开一个地址。
    # **必须放在所有 API 路由之后**：Mount('/') 会兜住一切路径，
    # 注册晚了就会把 /api/* 也吃掉（这个坑踩过一次）。
    # ⚠️ 剧情模式的反向代理必须挂在**静态托管之前** —— 它也要在 Mount('/')
    #    兜底之前抢到 `/gal/*`，否则请求会被前端静态目录吃掉（变成 404）。
    _mount_gal_proxy(app)
    _mount_frontend(app)

    if seed:
        _seed_on_boot(app, settings)

    if warn:
        for w in settings.warnings():
            print(f'[moopet-server] ⚠️  {w}')

    return app


def _mount_gal_proxy(app):
    """剧情模式（gal）的**反向代理**：把 `/gal/*` 转给本机的 18080。

    为什么用代理而不是直接把 `w6/gal` 也挂成静态目录：
      · gal 是个**独立应用**（Vite/WebGL 那套，284 MB 资源），它有自己的一套
        运行方式，用户给定的跑法是 `cd w6/gal && python -m http.server 18080`；
      · 直接挂静态目录的话，`/assets/*` 会和**主前端**的 `/assets/index-*.js`
        正面撞车（主前端也是 Vite 产物，资源就在 `/assets/`）——
        当前端静态托管是 `Mount('/')`，两者只能有一个赢。
        代理挂在 `/gal/` 前缀下就完全没有这个问题。

    ⚠️ 三个前提，都对上才能工作：
      ① gal 那边**必须已经在跑**（`python -m http.server 18080`）；
         没跑的话这里不会报错，只会让 `/gal/*` 返回 502 —— 见下面的 detail；
      ② gal 的入口用的是**相对路径**（`./player-static/...`，我确认过 index.html），
         所以挂在任意前缀下都能跑；
      ③ 这个 mount 必须在 `_mount_frontend` **之前**注册（Mount('/') 会兜住一切）。

    用 httpx 流式转发：gal 的资源单个就有几十 MB，整包读进内存会把服务顶爆。
    """
    import httpx
    from starlette.responses import Response, StreamingResponse

    upstream = os.environ.get('MOOPET_GAL_UPSTREAM', 'http://127.0.0.1:18080')
    # 跳过的响应头：这些要么由 starlette 自己算，要么会把上游的编码状态带错
    SKIP = {'content-encoding', 'content-length', 'transfer-encoding', 'connection',
            'keep-alive', 'server', 'date'}

    @app.api_route('/gal/{path:path}', methods=['GET', 'HEAD'])
    async def gal_proxy(path: str, request: Request):
        url = f'{upstream.rstrip("/")}/{path}'
        if request.url.query:
            url += f'?{request.url.query}'
        try:
            client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=120.0))
            req = client.build_request(request.method, url,
                                       headers={'accept': request.headers.get('accept', '*/*')})
            up = await client.send(req, stream=True)
        except Exception as e:                       # noqa: BLE001
            return Response(
                f'剧情模式的服务没起来（{upstream}）：{e}\n'
                f'先在 w6/gal 下执行：python -m http.server 18080\n',
                status_code=502, media_type='text/plain; charset=utf-8')
        headers = {k: v for k, v in up.headers.items() if k.lower() not in SKIP}

        ctype = up.headers.get('content-type', '')
# ★ HTML 要**注入存档同步脚本**（用户要的"同账号存档同步"）。
# ⚠️ 只对 HTML 这么做，而且要**读完整份** —— HTML 很小（这个应用 718 字节），
# 但资源是几十 MB 的二进制，那种必须继续走流式，绝不能读进内存。
# ⚠️ 不修改 w6/gal 里的任何文件：注入发生在**代理这一层**，
# 上游文件保持原样（它有自己的构建流程，动它会被下次构建冲掉）。
        if 'text/html' in ctype.lower():
            raw = await up.aread()
            await up.aclose()
            await client.aclose()
            html = raw.decode('utf-8', errors='replace')
            tag = '<script src="/gal-sync.js" defer></script>'
            if tag not in html:
                html = (html.replace('</body>', tag + '\n</body>')
                        if '</body>' in html else html + tag)
            return Response(html, status_code=up.status_code,
                            media_type='text/html; charset=utf-8')

        async def body():
            try:
                async for chunk in up.aiter_raw():
                    yield chunk
            finally:
                await up.aclose()
                await client.aclose()

        return StreamingResponse(body(), status_code=up.status_code, headers=headers)

    # 同步脚本本身：放在 /gal-sync.js（不在 /gal/ 前缀下，免得和上游同名文件撞）
    _here = os.path.dirname(os.path.abspath(__file__))
    _sync_js = os.path.join(_here, '..', 'static', 'gal-sync.js')
    _sync_js = os.path.abspath(_sync_js)

    @app.get('/gal-sync.js')
    async def gal_sync_js():
        try:
            with open(_sync_js, encoding='utf-8') as f:
                return Response(f.read(), media_type='application/javascript; charset=utf-8')
        except OSError:
            return Response('// gal-sync.js 不在', status_code=404,
                            media_type='application/javascript; charset=utf-8')

    print(f'[moopet-server] 剧情模式代理：/gal/* -> {upstream}（HTML 会注入 /gal-sync.js）')
    return True


def _mount_frontend(app):
    """把前端构建产物挂到根路径（存在才挂）。

    前端路由用的是 hash（#/world 这种），所以不需要 history fallback ——
    所有页面都由 index.html 承载，静态托管天然就对。
    """
    from fastapi.staticfiles import StaticFiles
    dist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        '..', 'web', 'dist')
    dist = os.path.abspath(dist)
    index = os.path.join(dist, 'index.html')
    if not os.path.isfile(index):
        print('[moopet-server] 前端未构建（web/dist 不存在），只提供 API；'
              '要一起托管请先 cd ../web && npm run build')
        return False
    app.mount('/', StaticFiles(directory=dist, html=True), name='web')
    print(f'[moopet-server] 已托管前端：{dist}')
    return True


def _seed_on_boot(app, settings):
    """首次启动写入品种与公开社群；本地默认再补一批演示 NPC 狗。"""
    db = app.state.session_factory()
    try:
        seeds.seed_all(db)
        want_demo = os.environ.get('MOOPET_SEED_DEMO', '1').lower() in ('1', 'true', 'yes')
        if want_demo:
            seeds.seed_demo_dogs(db)
    except Exception as e:      # noqa: BLE001  种子失败不该让服务起不来
        print(f'[moopet-server] 种子数据写入失败：{e}')
    finally:
        db.close()


