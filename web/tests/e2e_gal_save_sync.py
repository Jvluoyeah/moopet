# -*- coding: utf-8 -*-
"""剧情模式存档同步 · **端到端**验收（这是唯一能证明"能同步"的一条）

链路：登录（拿到 moopet.token）→ 打开剧情模式 → 往引擎那张表里写一行存档
      → 等防抖上行 → **服务端真的拿到了** → 清空浏览器存储（模拟换台设备）
      → 重新打开 → 脚本把云端那份**还原回本地** → 那一行回来了。

⚠️ 关于"存一次档"：这里不是去点它的游戏菜单（那是 UI 的事，而且要先玩过序章），
   而是**直接往引擎存档用的那张表写一行** —— 引擎自己存档时写的就是这张表，
   所以对"同步链路"来说这是等价的一次存档。写清楚，免得看着像"模拟出来的通过"。
"""
import json
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
GAL = BASE + '/gal/web/index.html'
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


def api(path, token=None):
    req = urllib.request.Request(BASE + path)
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


MARK = '端到端-' + time.strftime('%H%M%S')

# 往引擎那张表里写一行 —— **不等返回值**
# ⚠️ 第一版返回 Promise 让 Playwright 等，结果报
#    "Execution context was destroyed, most likely because of a navigation"：
#    写进去之后引擎自己会重载页面（它检测到新存档），evaluate 的 Promise 就断了。
#    所以这里 fire-and-forget，写入是否成功从**服务端**去验（那才是要证明的事）。
WRITE = """(mark) => {
    const PREFIX = 'AVGPLUS_ENGINE_COMMON_DB__';
    const TABLE = 'AVGPLUS_ENGINE_ARCHIVE_DATA_TABLE';
    indexedDB.databases().then((list) => {
        const name = (list || []).map((d) => d.name)
            .filter((n) => n && n.indexOf(PREFIX) === 0)[0];
        if (!name) return;
        const req = indexedDB.open(name);
        req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(TABLE)) { db.close(); return; }
            const tx = db.transaction(TABLE, 'readwrite');
            const st = tx.objectStore(TABLE);
            // ⚠️ 这张表用**内联键**（keyPath），多传一个 key 参数会抛
            //    "The object store uses in-line keys and the key parameter was provided"。
            //    所以要先把 keyPath 读出来，把键写进 value 里。
            const kp = st.keyPath;
            const val = { probe: mark, at: Date.now() };
            if (kp) val[kp] = 'probe-' + mark;
            if (kp) st.put(val); else st.put(val, 'probe-' + mark);
            tx.oncomplete = () => db.close();
        };
    }).catch(() => {});
    return true;
}"""

READ = """(mark) => new Promise((res) => {
    const PREFIX = 'AVGPLUS_ENGINE_COMMON_DB__';
    const TABLE = 'AVGPLUS_ENGINE_ARCHIVE_DATA_TABLE';
    indexedDB.databases().then((list) => {
        const name = (list || []).map((d) => d.name)
            .filter((n) => n && n.indexOf(PREFIX) === 0)[0];
        if (!name) { res(null); return; }
        const req = indexedDB.open(name);
        req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(TABLE)) { db.close(); res(false); return; }
            const g = db.transaction(TABLE, 'readonly').objectStore(TABLE).get('probe-' + mark);
            g.onsuccess = () => { const v = g.result; db.close(); res(v || false); };
            g.onerror = () => { db.close(); res(false); };
        };
        req.onerror = () => res(null);
    }).catch(() => res(null));
})"""

WIPE = """() => new Promise((res) => {
    indexedDB.databases().then((list) => {
        const names = (list || []).map((d) => d.name)
            .filter((n) => n && n.indexOf('AVGPLUS_ENGINE_COMMON_DB__') === 0);
        let left = names.length;
        if (!left) { res('none'); return; }
        names.forEach((n) => {
            const r = indexedDB.deleteDatabase(n);
            r.onsuccess = r.onerror = r.onblocked = () => { left -= 1; if (!left) res('ok'); };
        });
    }).catch(() => res('err'));
})"""

with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:160]))
    s = time.strftime('%H%M%S')

    print('\n[准备：注册 + 领狗（这样 localStorage 里有 moopet.token）]')
    p.goto(BASE + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'sync_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '同步汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)
    tok = p.evaluate("() => localStorage.getItem('moopet.token') || ''")
    check('登录后拿到 token（同源，剧情模式读得到）', bool(tok), tok[:12] + '…')

    print('\n[打开剧情模式：脚本应该先拉一次]')
    p.goto(GAL, wait_until='networkidle')
    p.wait_for_timeout(5000)
    st = p.evaluate("() => (window.__galSync ? window.__galSync.state() : null)")
    check('同步脚本在，而且认到已登录', bool(st) and st.get('hasToken') is True, st)
    check('引擎照常起来（canvas>0）',
          p.evaluate("() => document.querySelectorAll('canvas').length") > 0)

    print('\n[① 存一次档（往引擎那张表写一行）]')
    p.evaluate(WRITE, MARK)
    p.wait_for_timeout(600)

    print('\n[② 服务端拿到了（等防抖上行 3 秒 + 余量）]')
    got = None
    for _ in range(12):
        p.wait_for_timeout(1500)
        j = api('/api/gal/save', tok)
        if j.get('exists') and MARK in json.dumps(j.get('data', {}), ensure_ascii=False):
            got = j
            break
    check('服务端真的存下了这一份存档', bool(got),
          ('slot=%s bytes=%d' % (got.get('slot'), len(json.dumps(got.get('data'))))
           if got else '没等到'))
    if got:
        tables = (got['data'] or {}).get('tables', {})
        check('存档里带着那张表、而且是整块搬走的',
              'AVGPLUS_ENGINE_ARCHIVE_DATA_TABLE' in tables,
              list(tables.keys()))

    print('\n[③ 清掉浏览器存储 = 换台设备]')
    p.evaluate("() => localStorage.setItem('moopet.keep', '1')")   # 只清 IDB，token 留着
    w2 = p.evaluate(WIPE)
    check('库已删掉', w2 in ('ok', 'none'), w2)
    p.wait_for_timeout(400)

    print('\n[④ 重新打开：脚本应该把它还原回来]')
    p.goto(GAL, wait_until='networkidle')
    p.wait_for_timeout(6000)
    back = None
    for _ in range(10):
        back = p.evaluate(READ, MARK)
        if back:
            break
        p.wait_for_timeout(1200)
    check('存档**从云端回来了**（那一行又在了）', bool(back), back if back else '没回来')
    if back:
        check('内容也是原样的（probe 标记对得上）',
              isinstance(back, dict) and back.get('probe') == MARK, back)

    print('\n  页面报错:', errs[:2] if errs else '无')
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
