#!/usr/bin/env python3
"""服务端冒烟：注册 → 领养（入社群）→ 世界 → 对战 → 排行 走一遍。

不启动网络服务，直接用 TestClient（因此可在无 uvicorn 的环境里跑）。
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient      # noqa: E402

from app.config import Settings               # noqa: E402
from app.main import create_app               # noqa: E402


def main():
    tmp = tempfile.TemporaryDirectory()
    settings = Settings(database_url='sqlite:///' + os.path.join(tmp.name, 's.db'),
                        secret_key='smoke-test-key')
    app = create_app(settings)
    c = TestClient(app)

    print('1) 健康检查      ', c.get('/api/health').json())
    print('2) 品种图鉴      ', len(c.get('/api/breeds').json()), '个品种')

    r = c.post('/api/auth/register', json={'username': 'smoke_user',
                                           'password': 'pass1234'})
    print('3) 注册          ', r.status_code, r.json().get('account'))
    token = r.json()['access_token']
    h = {'Authorization': f'Bearer {token}'}

    r = c.post('/api/dogs/adopt', json={'name': '冒烟汪', 'breed_code': 'samoyed'},
               headers=h)
    print('4) 领养          ', r.status_code, r.json()['dog']['name'],
          '| 社群:', (r.json().get('community') or {}).get('name'))

    r = c.get('/api/community/public')
    print('5) 公开社群      ', r.json()['name'], '成员', r.json()['member_count'])

    r = c.get('/api/world?scene=plaza')
    print('6) 广场在场      ', len(r.json()), '只狗')

    r = c.post('/api/match', json={'mode': 'ai'}, headers=h)
    room = r.json()['room_code']
    print('7) 开一局 AI     ', room, r.json()['status'])

    r = c.post(f'/api/match/{room}/result', json={'frames': 900, 'scores': [3, 1],
                                                  'winner_side': 0},
               headers=h)
    print('8) 结算          ', r.json()['result'].get('verdict'),
          '待领经验', r.json()['pending_exp'])

    r = c.post(f'/api/match/{room}/claim', headers=h)
    print('9) 领奖          ', r.json())

    r = c.get('/api/leaderboard?kind=match', headers=h)
    print('10) 对战榜       ', [(x['rank'], x['dog_name'], x['score'])
                                for x in r.json()['rows']])

    app.state.engine.dispose()      # 先放掉 SQLite 文件句柄，否则 Windows 删不掉
    tmp.cleanup()
    print('\n冒烟通过 ✅')


if __name__ == '__main__':
    main()
