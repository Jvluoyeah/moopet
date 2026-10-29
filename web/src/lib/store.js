/* 极简状态：一个对象 + 订阅。页面直接读，改动时 notify。 */

const state = {
  account: null,      // { id, username, role }
  dog: null,          // 我的狗（/api/dogs/mine 的第一只）
  card: null,         // 完整档案卡
  breeds: [],         // 品种图鉴（带 palette）
  community: null,
  scene: 'plaza',
  theme: localStorage.getItem('moopet.theme') || 'day',
  online: true,       // 服务端可达
};

const listeners = new Set();

export function get() {
  return state;
}

export function set(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => {
    try { fn(state); } catch (e) { console.error('[store] 订阅者出错', e); }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyTheme(theme = state.theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme === 'night' ? 'night' : 'day');
  localStorage.setItem('moopet.theme', theme);
}

export function toggleTheme() {
  applyTheme(state.theme === 'night' ? 'day' : 'night');
}

/** 品种查询：把 code 换成完整品种对象（含 palette） */
export function breedOf(code) {
  return state.breeds.find((b) => b.code === code) || { code, name: code, palette: {} };
}
