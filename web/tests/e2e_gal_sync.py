# -*- coding: utf-8 -*-
"""验"代理注入的存档同步脚本"真的挂上去了、而且**没有把游戏搞坏**。

只验注入与降级，不冒充端到端同步（那需要真的玩到存档点，见注释末尾）：
  ① 走代理取到的 HTML 里多了一个 <script src="/gal-sync.js">；
  ② /gal-sync.js 本身 200 且是 JS；
  ③ 页面里 window.__galSync 在（脚本执行了）；
  ④ **没登录时不瞎同步**：state().hasToken === false；
  ⑤ 引擎照常启动（canvas > 0，无 JS 报错）；
  ⑥ **二进制资源仍然走流式**（favicon 1.45 MB 大小一致，没被注入逻辑吃掉）。

⚠️ "在剧情模式里存一次档 → 服务端拿到 → 清掉浏览器存储再打开 → 存档回来"
   这一条需要真的玩到能存档的地方（要过完序章才有存档点），
   脚本探针做不到，留给人工那一步。
"""
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


print('[① 注入]')
html = urllib.request.urlopen(BASE + '/gal/web/index.html', timeout=10).read().decode('utf-8')
check('HTML 里多了 /gal-sync.js', '/gal-sync.js' in html, html[-120:].replace('\n', ' '))
check('注入在 </body> 之前（不破坏结构）',
      html.find('/gal-sync.js') < html.find('</body>') or '</body>' not in html)

print('\n[② 脚本本身]')
with urllib.request.urlopen(BASE + '/gal-sync.js', timeout=10) as r:
    js = r.read().decode('utf-8')
    ctype = r.headers.get('content-type', '')
check('拿得到且是 JS', r.status == 200 and 'javascript' in ctype, ctype)
check('脚本里有那三件事（拉取/上行/钩子）',
      '/api/gal/save' in js and 'IDBObjectStore.prototype' in js and 'moopet.token' in js)

print('\n[③ 二进制没被读进内存]')
# ⚠️ 要和**上游直连**比，不能写死字节数 ——
#    我第一版把 1450328 手打成 1450308，于是"数字对不上"报红，
#    而其实转发得好好的（白查一轮）。直连 18080 拿真实大小来比。
UPSTREAM = 'http://127.0.0.1:18080/web/favicon.ico'
with urllib.request.urlopen(UPSTREAM, timeout=20) as r:
    up_size = len(r.read())
with urllib.request.urlopen(BASE + '/gal/web/favicon.ico', timeout=20) as r:
    n = len(r.read())
check('favicon 经代理后大小和上游一致（仍走流式）', n == up_size,
      '代理 %d / 上游 %d' % (n, up_size))

print('\n[④ 没登录时不许瞎同步]')
with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:160]))
    p.goto(BASE + '/gal/web/index.html', wait_until='networkidle')
    p.wait_for_timeout(5000)
    st = p.evaluate("() => (window.__galSync ? window.__galSync.state() : null)")
    check('同步脚本执行了（window.__galSync 在）', bool(st), st)
    check('没登录时 hasToken=false，不会去同步', bool(st) and st.get('hasToken') is False, st)
    ncanvas = p.evaluate("() => document.querySelectorAll('canvas').length")
    check('引擎照常启动（canvas > 0）', ncanvas > 0, ncanvas)
    check('没有 JS 报错（同步脚本没把游戏搞坏）', not errs, errs[:2])
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
