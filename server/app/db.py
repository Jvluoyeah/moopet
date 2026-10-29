"""数据库：SQLAlchemy 2.0 + 会话说。

本地 SQLite（WAL）与云端 PostgreSQL 用同一套模型；
`make_engine` 只在 SQLite 上做几处必要的 pragma/连接参数处理。
"""
import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(database_url, echo=False):
    kwargs = {'echo': echo, 'future': True}
    if database_url.startswith('sqlite'):
        # FastAPI 的线程池会跨线程用连接；SQLite 默认禁止，这里放开
        kwargs['connect_args'] = {'check_same_thread': False, 'timeout': 10.0}
        _ensure_sqlite_dir(database_url)
    engine = create_engine(database_url, **kwargs)
    if database_url.startswith('sqlite'):
        _tune_sqlite(engine)
    return engine


def _ensure_sqlite_dir(database_url):
    path = database_url.split('sqlite:///', 1)[-1]
    if path and path != ':memory:':
        d = os.path.dirname(os.path.abspath(path))
        if d:
            os.makedirs(d, exist_ok=True)


def _tune_sqlite(engine):
    @event.listens_for(engine, 'connect')
    def _set_pragmas(dbapi_conn, _rec):      # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute('PRAGMA journal_mode=WAL')       # 读写不互斥
        cur.execute('PRAGMA foreign_keys=ON')        # 外键真的生效
        cur.execute('PRAGMA busy_timeout=10000')     # 并发写等 10s 而不是立刻报错
        cur.close()


def make_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False,
                        future=True)


def init_db(engine):
    """建表 + 补列（演示阶段用 create_all；上云换 Alembic 迁移，见 README）。"""
    from . import models  # noqa: F401  触发模型注册
    Base.metadata.create_all(engine)
    ensure_columns(engine)
    return engine


# 后加的列。⚠️ `create_all` **只建缺失的表，不会给已有的表加列** ——
# 新库没问题，但**已经在跑的库**（比如 dev.db）会因为缺列直接查询报错。
# 这里用 SQLite/PostgreSQL 都支持的 `ALTER TABLE … ADD COLUMN` 补上，
# 幂等：已经有这一列就跳过。
# 加 NOT NULL 列必须带 DEFAULT，否则已有行没法填 —— 所以下面都给了。
_ADDED_COLUMNS = [
    ('account', 'nickname', "VARCHAR(32) NOT NULL DEFAULT ''"),
    ('account', 'token_version', 'INTEGER NOT NULL DEFAULT 0'),
]


def ensure_columns(engine):
    """给已有库补后加的列。上了 Alembic 之后这段就可以删掉。"""
    from sqlalchemy import inspect, text
    tables = set(inspect(engine).get_table_names())
    # ⚠️ 先把"缺哪些列"**全部查完再动手**：inspect() 的结果按表缓存，
    #    边改边查的话，同一张表的第二列会读到改之前的快照 → 重复 ALTER → 报错。
    todo = []
    for table, column, ddl in _ADDED_COLUMNS:
        if table not in tables:
            continue                          # 整张表都还没有，create_all 会建
        cols = {c['name'] for c in inspect(engine).get_columns(table)}
        if column not in cols:
            todo.append((table, column, ddl))
    with engine.begin() as conn:
        for table, column, ddl in todo:
            conn.execute(text('ALTER TABLE %s ADD COLUMN %s %s' % (table, column, ddl)))
    added = ['%s.%s' % (t, c) for t, c, _ in todo]
    if added:
        print('[db] 已给已有库补列: %s' % ', '.join(added))
    return added
