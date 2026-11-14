/* 极简状态：一个对象 + 订阅。页面直接读，改动时 notify。 */

import {
  applyUiMode, applyUiScale, readUiMode, readUiScale,
  readChildPrefs, writeChildPrefs,
} from './uiMode.js';

const state = {
  account: null,      // { id, username, role }
  dog: null,          // 我的狗（/api/dogs/mine 的第一只）
  card: null,         // 完整档案卡
  breeds: [],         // 品种图鉴（带 palette）
  community: null,
  scene: 'plaza',
  theme: localStorage.getItem('moopet.theme') || 'day',
  uiMode: readUiMode(),   // standard | elder | child（只影响本机显示）
  uiScale: readUiScale(), // normal | large（只对老人模式生效）
  childPrefs: readChildPrefs(), // { sound, motion }
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

/** 切换界面模式：写 <html data-ui-mode>、存本地、通知订阅者与顶栏。 */
export function setUiMode(mode) {
  const id = applyUiMode(mode);
  if (state.uiMode === id) return id;
  set({ uiMode: id });
  document.dispatchEvent(new CustomEvent('ui-mode:changed', { detail: { mode: id } }));
  return id;
}

/** 老人模式第二档字号：normal | large。 */
export function setUiScale(scale) {
  const id = applyUiScale(scale);
  if (state.uiScale === id) return id;
  set({ uiScale: id });
  document.dispatchEvent(new CustomEvent('ui-scale:changed', { detail: { scale: id } }));
  return id;
}

/** 幼稚模式的点击音效 / 按钮动画开关。 */
export function setChildPref(key, value) {
  const next = writeChildPrefs({ [key]: Boolean(value) });
  set({ childPrefs: next });
  document.dispatchEvent(new CustomEvent('child-prefs:changed', { detail: next }));
  return next;
}

/** 品种查询：把 code 换成完整品种对象（含 palette） */
export function breedOf(code) {
  return state.breeds.find((b) => b.code === code) || { code, name: code, palette: {} };
}
