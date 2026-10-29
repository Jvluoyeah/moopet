#!/usr/bin/env python3
"""验证"单地址演示"：服务端同时托管 API 与前端构建产物。

演示时只要起一个进程、开一个地址，不用再单独跑 Vite。
用法：先 python run_local.py（且已 npm run build），再跑本脚本。
"""
import json
import re
import sys
import time
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080').rstrip('/')
ok = 0
fails = []


def check(label, cond, detail=''):
    global ok
    if cond:
        ok += 1
        print(f'OK    {label}' + (f'  — {detail}' if detail else ''))
    else:
        fails.append(label)
        print(f'FAIL  {label}  {detail}')


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        return r.status, r.headers.get('Content-Type', ''), r.read()


def main():
    for _ in range(40):
        try:
            get('/api/health')
            break
        except Exception:
            time.sleep(0.5)

    s, ct, body = get('/api/health')
    check('API 可用（健康检查）', json.loads(body)['ok'] is True, f'{s} {ct}')

    s, ct, body = get('/')
    text = body.decode('utf-8', 'replace')
    check('根路径返回前端页面', s == 200 and '<div id="app">' in text, f'{s} {ct} {len(body)}B')
    check('页面引用了打包后的资源', bool(re.search(r'/assets/index-[\w-]+\.js', text)),
          (re.search(r'/assets/index-[\w-]+\.js', text) or [''])[0])

    m = re.search(r'/assets/(index-[\w-]+\.js)', text)
    if m:
        s2, ct2, body2 = get('/assets/' + m.group(1))
        check('打包 JS 能取到', s2 == 200 and len(body2) > 10000,
              f'{s2} {ct2} {len(body2)}B')

    m = re.search(r'/assets/(index-[\w-]+\.css)', text)
    if m:
        s3, ct3, body3 = get('/assets/' + m.group(1))
        check('打包 CSS 能取到', s3 == 200 and b'--paper' in body3,
              f'{s3} {len(body3)}B')

    s, _, body = get('/api/breeds')
    check('品种接口与静态托管不冲突', s == 200 and len(json.loads(body)) == 8, f'{s}')

    s, _, body = get('/api/world?scene=plaza')
    check('开放世界接口正常', s == 200 and len(json.loads(body)) >= 8, f'{s}')

    print(f'\n{ok}/{ok + len(fails)} 项检查通过')
    if fails:
        print('失败：', ', '.join(fails))
        return 1
    print('单地址演示验证通过 ✅  （一个进程、一个地址：打开 ' + BASE + ' 即可）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
