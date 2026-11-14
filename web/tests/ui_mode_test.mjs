/* 界面模式单测：规范化、持久化、读取失败回退、导航文案。
   不依赖浏览器 —— applyUiMode 接受注入的 root/storage。 */

import assert from 'node:assert/strict';
import {
  UI_MODE_KEY,
  UI_SCALE_KEY,
  CHILD_PREFS_KEY,
  UI_MODES,
  normalizeUiMode,
  readUiMode,
  applyUiMode,
  UI_SCALES,
  normalizeUiScale,
  readUiScale,
  applyUiScale,
  DEFAULT_CHILD_PREFS,
  normalizeChildPrefs,
  readChildPrefs,
  writeChildPrefs,
  applyChildPrefs,
  childSoundEnabled,
  bottomNavFor,
  navCopyFor,
  galCopyFor,
  simpleText,
  hasSimpleText,
  refreshCopy,
} from '../src/lib/uiMode.js';
import {
  PARENT_PIN_KEY,
  PARENT_UNLOCK_MS,
  parentPinConfigured,
  setupParentPin,
  verifyParentPin,
  isParentUnlocked,
  markParentUnlocked,
  lockParent,
} from '../src/lib/parentGate.js';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function fakeRoot() {
  return {
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
  };
}

console.log('界面模式测试');

// 1. 三档齐全，顺序稳定（顶栏菜单直接按这个顺序渲染）
assert.deepEqual(UI_MODES.map((m) => m.id), ['standard', 'elder', 'child']);
assert.deepEqual(UI_MODES.map((m) => m.label), ['标准', '老人模式', '幼稚模式']);

// 2. 未知值 / 旧值 / 空值都回退到标准模式
assert.equal(normalizeUiMode('elder'), 'elder');
assert.equal(normalizeUiMode('child'), 'child');
assert.equal(normalizeUiMode('standard'), 'standard');
assert.equal(normalizeUiMode('huge'), 'standard');
assert.equal(normalizeUiMode(undefined), 'standard');
assert.equal(normalizeUiMode(null), 'standard');

// 3. 写入 <html> 与 localStorage，两处一致
const root = fakeRoot();
const storage = fakeStorage();
assert.equal(applyUiMode('elder', { root, storage }), 'elder');
assert.equal(root.attrs['data-ui-mode'], 'elder');
assert.equal(storage.getItem(UI_MODE_KEY), 'elder');
assert.equal(readUiMode(storage), 'elder');

// 4. 非法值落盘时也写成 standard，不把垃圾值留给下次启动
assert.equal(applyUiMode('nonsense', { root, storage }), 'standard');
assert.equal(root.attrs['data-ui-mode'], 'standard');
assert.equal(storage.getItem(UI_MODE_KEY), 'standard');

// 5. localStorage 被禁用（隐私模式）时：读回标准、写入不抛错
const blocked = {
  getItem() { throw new Error('storage blocked'); },
  setItem() { throw new Error('storage blocked'); },
};
assert.equal(readUiMode(blocked), 'standard');
assert.equal(applyUiMode('child', { root, storage: blocked }), 'child');
assert.equal(root.attrs['data-ui-mode'], 'child');

// 6. 幼稚模式换导航说法；老人/标准保持原页名
const page = { path: '/world', label: '开放世界', short: '世界', hint: '月下' };
assert.equal(navCopyFor('standard', page).label, '开放世界');
assert.equal(navCopyFor('elder', page).label, '开放世界');
assert.equal(navCopyFor('child', page).label, '出去玩');
assert.equal(navCopyFor('child', page).short, '出去玩');
assert.equal(navCopyFor('child', page).hint, '月下');

assert.equal(galCopyFor('child').label, '故事时间');
assert.equal(galCopyFor('standard').label, '剧情模式');
assert.equal(galCopyFor('elder').label, '剧情模式');

// 7. 幼稚模式的叙述换成短句；标准/老人与未登记句子保持原样
assert.equal(simpleText('child', '竞技场'), '比一比');
assert.equal(simpleText('standard', '竞技场'), '竞技场');
assert.equal(simpleText('elder', '竞技场'), '竞技场');
assert.equal(simpleText('child', '一句没有登记过的话'), '一句没有登记过的话');
assert.equal(hasSimpleText('竞技场'), true);
assert.equal(hasSimpleText('一句没有登记过的话'), false);

// 8. 切模式时就地刷新 [data-copy-standard]，不重建页面
const slots = [
  { text: '', attrs: { 'data-copy-standard': '竞技场' } },
  { text: '', attrs: { 'data-copy-standard': '训练记录' } },
  { text: '', attrs: { 'data-copy-standard': '一句没有登记过的话' } },
].map((slot) => ({
  ...slot,
  getAttribute(k) { return this.attrs[k] ?? null; },
  set textContent(v) { this.text = v; },
  get textContent() { return this.text; },
}));
const fakeDocument = { querySelectorAll: () => slots };
refreshCopy('child', fakeDocument);
assert.deepEqual(slots.map((s) => s.textContent), ['比一比', '闯关', '一句没有登记过的话']);
refreshCopy('standard', fakeDocument);
assert.deepEqual(slots.map((s) => s.textContent), ['竞技场', '训练记录', '一句没有登记过的话']);

// 9. 老人模式字号档：未知值回退正常档，写入两处一致
assert.deepEqual(UI_SCALES.map((s) => s.id), ['normal', 'large']);
assert.equal(normalizeUiScale('large'), 'large');
assert.equal(normalizeUiScale('huge'), 'normal');
const scaleRoot = fakeRoot();
const scaleStorage = fakeStorage();
assert.equal(applyUiScale('large', { root: scaleRoot, storage: scaleStorage }), 'large');
assert.equal(scaleRoot.attrs['data-ui-scale'], 'large');
assert.equal(scaleStorage.getItem(UI_SCALE_KEY), 'large');
assert.equal(readUiScale(scaleStorage), 'large');
assert.equal(applyUiScale('nonsense', { root: scaleRoot, storage: scaleStorage }), 'normal');
assert.equal(scaleRoot.attrs['data-ui-scale'], 'normal');

// 10. 幼稚模式反馈：默认都开，可单项关掉；坏 JSON 回退默认
const prefRoot = fakeRoot();
const prefStorage = fakeStorage();
assert.deepEqual(readChildPrefs(prefStorage), { ...DEFAULT_CHILD_PREFS });
assert.deepEqual(normalizeChildPrefs({ sound: 'yes', motion: 0 }),
  { sound: true, motion: true });
writeChildPrefs({ sound: false }, { root: prefRoot, storage: prefStorage });
assert.equal(prefRoot.attrs['data-child-sound'], 'off');
assert.equal(prefRoot.attrs['data-child-motion'], 'on');
assert.equal(readChildPrefs(prefStorage).sound, false);
assert.equal(childSoundEnabled('child', readChildPrefs(prefStorage)), false);
assert.equal(childSoundEnabled('elder', { sound: true, motion: true }), false);
assert.equal(childSoundEnabled('child', { sound: true, motion: true }), true);
prefStorage.setItem(CHILD_PREFS_KEY, 'not-json');
assert.deepEqual(readChildPrefs(prefStorage), { ...DEFAULT_CHILD_PREFS });
applyChildPrefs({ sound: true, motion: false }, prefRoot);
assert.equal(prefRoot.attrs['data-child-sound'], 'on');
assert.equal(prefRoot.attrs['data-child-motion'], 'off');

// 11. 底部导航：标准档没有；老人档三项；幼稚档四个主入口；游戏页都不画
assert.equal(bottomNavFor('standard', '/'), null);
assert.equal(bottomNavFor('elder', '/arena'), null);
assert.equal(bottomNavFor('child', '/world'), null);
assert.deepEqual(bottomNavFor('elder', '/').map((i) => i.id), ['back', 'home', 'scale']);
assert.deepEqual(bottomNavFor('child', '/').map((i) => i.path),
  ['/', '/world', '/arena', '/card']);
assert.equal(bottomNavFor('child', '/card').find((i) => i.path === '/card').current, true);

// 12. 家长锁：首次设置、错误/正确校验、解锁过期
const pinStore = fakeStorage();
const sess = fakeStorage();
assert.equal(parentPinConfigured(pinStore), false);
await setupParentPin('1234', { storage: pinStore, session: sess });
assert.equal(parentPinConfigured(pinStore), true);
assert.equal(JSON.parse(pinStore.getItem(PARENT_PIN_KEY)).hash.length > 0, true);
assert.equal(isParentUnlocked(sess), true);
lockParent(sess);
assert.equal(isParentUnlocked(sess), false);
let check = await verifyParentPin('9999', { storage: pinStore, session: sess });
assert.equal(check.ok, false);
check = await verifyParentPin('1234', { storage: pinStore, session: sess });
assert.equal(check.ok, true);
assert.equal(isParentUnlocked(sess), true);

const sess2 = fakeStorage();
markParentUnlocked(sess2, 1000);
assert.equal(isParentUnlocked(sess2, 1000 + PARENT_UNLOCK_MS - 1), true);
assert.equal(isParentUnlocked(sess2, 1000 + PARENT_UNLOCK_MS + 1), false);
await assert.rejects(() => setupParentPin('12', { storage: pinStore, session: sess2 }), /4 位/);

console.log('界面模式测试通过 ✅');
