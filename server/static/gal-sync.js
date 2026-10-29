/* 剧情模式的**同账号存档同步**（由反向代理注入，不改 w6/gal 里的任何文件）
   ============================================================
   背景：剧情模式是独立应用（AVGPlus 引擎），存档按引擎的设计放在浏览器的
   IndexedDB 里 —— 换台设备、换个浏览器就没了。用户要的是"同账号下同步"。

   做法（三个刻意的选择）：

   ① **整表 dump / 整表还原，不解释内容。**
      引擎的存档是它自己的格式（键名、版本、嵌套全是它说了算）。
      我只做一件事：把几张表里的 (key, value) 原样搬走、原样搬回。
      这样引擎升级、改字段都不会波及这里 —— 拆字段才是自找麻烦。

   ② **库名要动态发现。**
      库名是 `AVGPLUS_ENGINE_COMMON_DB__g-v1-<hash>`，那个 hash 会随构建变，
      写死一定会失效。用 `indexedDB.databases()` 按前缀找。

   ③ **同步失败绝不许影响游戏。**
      这是附加能力：拿不到 token、请求失败、库还没建 —— 全都静默跳过，
      只在控制台留一行 info。宁可不同步，也不能把册子卡住。

   触发方式：
     · 打开页面 → 拉一次（把云端的存档还原进本地）
     · 本地写入 → 打标记 → 防抖 3 秒后上行（引擎存一次档会连着写好几张表，
       不防抖就会把同一个存档来回传十几遍）
*/
(function () {
  'use strict';

  var TOKEN_KEY = 'moopet.token';          // 和主应用同一个键（同源，读得到）
  var DB_PREFIX = 'AVGPLUS_ENGINE_COMMON_DB__';
  // 要同步的表：存档是本命，其余几张是"顺带"（读过的内容、设置、图鉴）
  var TABLES = [
    'AVGPLUS_ENGINE_ARCHIVE_DATA_TABLE',
    'AVGPLUS_ENGINE_GAME_SETTINGS_TABLE',
    'AVGPLUS_ENGINE_READ_CONTENT_TABLE',
    'AVGPLUS_ENGINE_GALLERY_DATA_TABLE',
  ];
  var API = '/api/gal/save';
  var PUSH_DELAY_MS = 3000;
  var VER = 'gal-sync/1';

  function log() {
    try { console.info.apply(console, ['[gal-sync]'].concat([].slice.call(arguments))); }
    catch (e) { /* 控制台都没有就算了 */ }
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  /* ---------- IndexedDB：找库、dump、还原 ---------- */

  function findDbName() {
    return new Promise(function (res) {
      if (!indexedDB.databases) { res(null); return; }
      indexedDB.databases().then(function (list) {
        var hit = (list || []).map(function (d) { return d.name; })
          .filter(function (n) { return n && n.indexOf(DB_PREFIX) === 0; })[0];
        res(hit || null);
      }).catch(function () { res(null); });
    });
  }

  function openDb(name) {
    return new Promise(function (res, rej) {
      var req = indexedDB.open(name);
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function txDone(tx) {
    return new Promise(function (res, rej) {
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
      tx.onabort = function () { rej(tx.error); };
    });
  }

  /** 把 TABLES 里存在的表整表读出来 → { 表名: [[key, value], ...] } */
  function dump(db) {
    var names = TABLES.filter(function (n) { return db.objectStoreNames.contains(n); });
    var out = {};
    return names.reduce(function (chain, name) {
      return chain.then(function () {
        var tx = db.transaction(name, 'readonly');
        var st = tx.objectStore(name);
        var keysReq = st.getAllKeys();
        var valsReq = st.getAll();
        return txDone(tx).then(function () {
          var rows = [];
          for (var i = 0; i < keysReq.result.length; i += 1) {
            rows.push([keysReq.result[i], valsReq.result[i]]);
          }
          out[name] = rows;
        });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  /** 整表还原：先清后写（**整份覆盖**，不合并 —— 合并会让两边越滚越乱）
   *
   *  ⚠️⚠️ 这里的 `put` 有两种写法，**必须按表的键类型分开**：
   *    · 用**内联键**（`keyPath`）的表：只能 `put(value)`，
   *      多传一个 key 参数会直接抛
   *      "The object store uses in-line keys and the key parameter was provided"；
   *    · 用**外键**（out-of-line）的表：才需要 `put(value, key)`。
   *  引擎那张 `AVGPLUS_ENGINE_ARCHIVE_DATA_TABLE` 就是内联键 ——
   *  我第一版一律传 key，于是**还原从来没成功过**（错误只在控制台里，
   *  页面看着一切正常，属于最阴的那种）。
   *  从 `store.keyPath` 判断，不猜。 */
  function putOne(st, key, value) {
    if (st.keyPath !== null && st.keyPath !== undefined && st.keyPath !== '') {
      st.put(value);                    // 内联键：键在 value 里面
    } else if (key === undefined) {
      st.put(value);
    } else {
      st.put(value, key);               // 外键：键单独给
    }
  }

  function restore(db, data) {
    var names = Object.keys(data || {})
      .filter(function (n) { return db.objectStoreNames.contains(n); });
    return names.reduce(function (chain, name) {
      return chain.then(function () {
        var tx = db.transaction(name, 'readwrite');
        var st = tx.objectStore(name);
        st.clear();
        (data[name] || []).forEach(function (pair) {
          // 值原样写回；键按表的类型决定给不给
          putOne(st, pair[0], pair[1]);
        });
        return txDone(tx);
      });
    }, Promise.resolve());
  }

  /* ---------- 与服务端往返 ---------- */

  function pull() {
    var t = token();
    if (!t) { log('没登录，跳过同步'); return Promise.resolve(false); }
    return fetch(API, { headers: { Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.exists || !j.data || !j.data.tables) {
          log('云端还没有存档（这边先玩）');
          return false;
        }
        return findDbName().then(function (name) {
          if (!name) { log('本地还没建库，先不动'); return false; }
          return openDb(name).then(function (db) {
            return restore(db, j.data.tables).then(function () {
              db.close();
              log('已把云端的存档还原到本地');
              return true;
            });
          });
        });
      })
      .catch(function (e) { log('拉取失败（不影响游戏）', String(e).slice(0, 80)); return false; });
  }

  function push(db) {
    var t = token();
    if (!t) return Promise.resolve(false);
    return dump(db).then(function (tables) {
      var body = JSON.stringify({
        data: { tables: tables, ver: VER },
        slot: 'main',
        saved_at: new Date().toISOString(),
      });
      return fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: body,
      }).then(function (r) {
        log('上行完成', r.status, body.length + ' 字节');
        return r.ok;
      });
    }).catch(function (e) { log('上行失败（不影响游戏）', String(e).slice(0, 80)); return false; });
  }

  /* ---------- 本地一写就打个标记，防抖上行 ---------- */

  var dirty = false;
  var timer = null;

  function markDirty() {
    if (!token()) return;
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      if (!dirty) return;
      dirty = false;
      findDbName().then(function (name) {
        if (!name) return;
        return openDb(name).then(function (db) {
          return push(db).then(function () { db.close(); });
        });
      }).catch(function () { /* 静默 */ });
    }, PUSH_DELAY_MS);
  }

  /* 钩住写入：引擎存档时一定会走 put/add/delete/clear 其中之一。
     ⚠️ 只打标记，**不做任何搬运** —— 钩子里做重活会拖慢引擎自己的存档。 */
  try {
    ['put', 'add', 'delete', 'clear'].forEach(function (m) {
      var orig = IDBObjectStore.prototype[m];
      if (!orig) return;
      IDBObjectStore.prototype[m] = function () {
        try {
          if (TABLES.indexOf(this.name) >= 0) markDirty();
        } catch (e) { /* 静默 */ }
        return orig.apply(this, arguments);
      };
    });
    log('已挂上写入钩子');
  } catch (e) { log('挂钩子失败（只影响上行）', String(e).slice(0, 60)); }

  /* 页面打开时拉一次。
     时机说明：引擎是在**点开"读取存档"**时去读 IndexedDB 的，不是启动瞬间 ——
     所以这里在 DOMContentLoaded 之后拉就来得及；万一慢了，
     引擎读到的还是本地旧档，下次进来会补上（同步是最终一致的）。 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { pull(); });
  } else {
    pull();
  }

  // 给排查用：在控制台里 `__galSync.pull()` / `.pushNow()` 能手动触发
  window.__galSync = {
    pull: pull,
    pushNow: function () {
      return findDbName().then(function (n) {
        return n ? openDb(n).then(function (db) {
          return push(db).then(function (r) { db.close(); return r; });
        }) : false;
      });
    },
    state: function () { return { hasToken: !!token(), dirty: dirty, ver: VER }; },
  };
}());
