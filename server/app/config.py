"""服务端配置：全部从环境变量读，本地/云端同一套代码。

约定：
  * 本地开发    → SQLite 文件（默认 ./data/moopet.db）
  * 云端 Ubuntu → PostgreSQL（把 MOOPET_DATABASE_URL 换成 postgresql+psycopg://…）
两者只差一个环境变量，代码路径完全一致（这也是计划里"本地先跑、后上云"的落地方式）。
"""
import os

DEFAULT_DB = 'sqlite:///' + os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'moopet.db')

# 开发默认密钥：长度满足 HS256 建议的 32 字节以上（避免 PyJWT 告警）。
# 生产必须用 MOOPET_SECRET_KEY 覆盖，启动时会打印警告。
DEV_SECRET = 'moopet-dev-only-secret-change-me-in-production-32b'
_WEAK_SECRETS = {'dev-only-change-me', 'secret', 'change-me', 'moopet', ''}


class Settings:
    def __init__(self, database_url=None, secret_key=None, token_ttl_hours=72,
                 allow_origins=None, expiry_grace_days=1, debug=False):
        self.database_url = database_url or DEFAULT_DB
        self.secret_key = secret_key or DEV_SECRET
        self.token_ttl_hours = int(token_ttl_hours)
        self.allow_origins = list(allow_origins if allow_origins is not None
                                  else ['*'])
        self.expiry_grace_days = int(expiry_grace_days)
        self.debug = bool(debug)

    @property
    def uses_dev_secret(self):
        return self.secret_key == DEV_SECRET or self.secret_key in _WEAK_SECRETS

    @property
    def secret_is_too_short(self):
        return len(self.secret_key.encode('utf-8')) < 32

    @classmethod
    def from_env(cls, env=None):
        env = os.environ if env is None else env
        origins = env.get('MOOPET_ALLOW_ORIGINS')
        return cls(
            database_url=env.get('MOOPET_DATABASE_URL') or None,
            secret_key=env.get('MOOPET_SECRET_KEY') or None,
            token_ttl_hours=env.get('MOOPET_TOKEN_TTL_HOURS') or 72,
            allow_origins=[o.strip() for o in origins.split(',')] if origins else None,
            debug=str(env.get('MOOPET_DEBUG', '')).lower() in ('1', 'true', 'yes'),
        )

    @property
    def is_sqlite(self):
        return self.database_url.startswith('sqlite')

    def describe(self):
        url = self.database_url
        if '@' in url:                    # 不打印凭据
            url = url.split('@', 1)[0].split('://')[0] + '://***@' + url.split('@', 1)[1]
        return {'database': url, 'is_sqlite': self.is_sqlite,
                'token_ttl_hours': self.token_ttl_hours,
                'allow_origins': self.allow_origins, 'debug': self.debug,
                'using_dev_secret': self.uses_dev_secret}

    def warnings(self):
        """启动时该提醒的事情（生产部署前必须处理）。"""
        out = []
        if self.uses_dev_secret:
            out.append('正在使用开发默认密钥 MOOPET_SECRET_KEY，部署前必须替换为强随机值')
        elif self.secret_is_too_short:
            out.append('MOOPET_SECRET_KEY 短于 32 字节，建议加长（HS256 推荐 ≥32 字节）')
        if self.is_sqlite:
            out.append('当前使用 SQLite（本地开发档）；云端请设 MOOPET_DATABASE_URL 指向 PostgreSQL')
        if self.allow_origins == ['*']:
            out.append('CORS 允许所有来源；生产请用 MOOPET_ALLOW_ORIGINS 限定域名')
        return out
