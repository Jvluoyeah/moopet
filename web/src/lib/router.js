/* hash 路由：路由表 → 页面工厂。
   用 hash 而不是 history：演示时直接开 file:// 或任意静态服务器都不会 404。 */

const routes = [];
let current = null;
let outlet = null;
let onBeforeEach = null;

export function define(pattern, factory, meta = {}) {
  // '/dogs/:id' → 正则 + 参数名
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:([A-Za-z_]\w*)/g, (_, n) => {
    names.push(n);
    return '([^/]+)';
  }) + '$');
  routes.push({ pattern, re, names, factory, meta });
}

export function beforeEach(fn) {
  onBeforeEach = fn;
}

/** 当前路径（不含查询串） */
export function path() {
  const raw = location.hash.replace(/^#/, '') || '/';
  return raw.split('?')[0] || '/';
}

/** 当前查询参数（#/card?id=5 里的 id） */
export function query() {
  const raw = location.hash.replace(/^#/, '');
  const i = raw.indexOf('?');
  return new URLSearchParams(i >= 0 ? raw.slice(i + 1) : '');
}

export function go(to, { replace = false } = {}) {
  const url = '#' + to;
  if (replace) location.replace(url);
  else location.hash = to;
}

export function start(outletEl) {
  outlet = outletEl;
  window.addEventListener('hashchange', render);
  render();
}

export async function render() {
  const p = path();
  let matched = null;
  let params = {};
  for (const r of routes) {
    const m = r.re.exec(p);
    if (m) {
      matched = r;
      params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      break;
    }
  }
  if (!matched) {
    matched = routes.find((r) => r.pattern === '/');
  }
  if (onBeforeEach) {
    const redirect = await onBeforeEach(matched, params, p);
    if (redirect) { go(redirect, { replace: true }); return; }
  }

  // 卸载上一页：页面可以把定时器/动画的清理函数挂到 view.__dispose 上
  if (outlet.firstChild && typeof outlet.firstChild.__dispose === 'function') {
    try { outlet.firstChild.__dispose(); } catch (e) { console.error('[router] 卸载失败', e); }
  }

  current = { route: matched, params, path: p };
  const view = await matched.factory(params);
  outlet.replaceChildren(view);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  document.dispatchEvent(new CustomEvent('route:rendered', { detail: current }));
  return view;
}

/**
 * 页面注册清理函数：页面返回根节点前调用它，路由会在切页时执行。
 * 有了它就不需要 MutationObserver 那种绕法。
 */
export function onDispose(node, fn) {
  node.__dispose = fn;
  return node;
}

export function currentRoute() {
  return current;
}
