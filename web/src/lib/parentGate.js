/* 家长锁：幼稚模式里的设置、退出与外链先过一道 4 位数字确认。
   ------------------------------------------------------------
   ⚠️ 这是**本机的一把门闩**，不是安全边界：
      PIN 只存在 localStorage，任何人清掉站点数据就能重设。
      它要挡的是"小朋友随手点进设置/退出/外链"，不是防破解。
      也正因为如此，这里不接服务端、不上传、不留明文。

   两个存储：
     localStorage   `moopet.parentPin`        { v, alg, hash }
     sessionStorage `moopet.parentUnlockedUntil` / `moopet.parentTries`
   解锁只活在这个标签页的会话里，15 分钟后自动失效。 */

import { h } from './dom.js';

export const PARENT_PIN_KEY = 'moopet.parentPin';
export const PARENT_UNLOCK_KEY = 'moopet.parentUnlockedUntil';
export const PARENT_TRIES_KEY = 'moopet.parentTries';
export const PARENT_UNLOCK_MS = 15 * 60 * 1000;
export const PARENT_MAX_TRIES = 5;
export const PARENT_LOCKOUT_MS = 30 * 1000;
export const PARENT_PIN_LENGTH = 4;

const SALT = 'moopet-parent-v1';

function storeOf(storage, fallback) {
  if (storage !== undefined) return storage;
  try {
    return fallback;
  } catch (e) {
    return null;
  }
}

function localStorageOf(storage) {
  return storeOf(storage, globalThis.localStorage);
}

function sessionStorageOf(storage) {
  return storeOf(storage, globalThis.sessionStorage);
}

function readJson(store, key) {
  try {
    return JSON.parse(store?.getItem(key) || 'null');
  } catch (e) {
    return null;
  }
}

function writeJson(store, key, value) {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* 存储不可用：家长锁退化成"这次会话有效" */
  }
}

function hasSubtle() {
  return Boolean(globalThis.crypto?.subtle && globalThis.TextEncoder);
}

function fnvHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 'fnv:' + (hash >>> 0).toString(16).padStart(8, '0');
}

/** SHA-256 优先；没有 Web Crypto 的环境退回非加密散列（只挡误触）。 */
export async function hashParentPin(pin, alg = hasSubtle() ? 'sha256' : 'fnv') {
  const text = `${SALT}:${pin}`;
  if (alg === 'sha256' && hasSubtle()) {
    const buf = await globalThis.crypto.subtle.digest(
      'SHA-256', new globalThis.TextEncoder().encode(text));
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return fnvHash(text);
}

export function isValidParentPin(pin) {
  return typeof pin === 'string'
    && new RegExp(`^\\d{${PARENT_PIN_LENGTH}}$`).test(pin);
}

export function readParentPinRecord(storage) {
  const rec = readJson(localStorageOf(storage), PARENT_PIN_KEY);
  if (!rec || typeof rec !== 'object') return null;
  if (typeof rec.hash !== 'string' || !rec.hash) return null;
  return rec;
}

export function parentPinConfigured(storage) {
  return Boolean(readParentPinRecord(storage)?.hash);
}

export async function setupParentPin(pin, { storage, session } = {}) {
  if (!isValidParentPin(pin)) throw new Error('家长密码要 4 位数字。');
  const alg = hasSubtle() ? 'sha256' : 'fnv';
  const hash = await hashParentPin(pin, alg);
  writeJson(localStorageOf(storage), PARENT_PIN_KEY, { v: 1, alg, hash, at: Date.now() });
  clearParentTries(session);
  markParentUnlocked(session);
  return true;
}

/** 校验并记录失败次数。返回 { ok, retryAfter? , error? }。 */
export async function verifyParentPin(pin, {
  storage, session, now = Date.now(),
} = {}) {
  const rec = readParentPinRecord(storage);
  if (!rec?.hash) return { ok: false, error: '还没有设置家长密码。' };

  const tries = readParentTries(session);
  if (tries.until > now) {
    return {
      ok: false,
      retryAfter: tries.until - now,
      error: `试错次数太多了，${Math.ceil((tries.until - now) / 1000)} 秒后再试。`,
    };
  }

  const hash = await hashParentPin(String(pin ?? ''), rec.alg || 'fnv');
  if (hash === rec.hash) {
    clearParentTries(session);
    markParentUnlocked(session, now);
    return { ok: true };
  }

  const count = (tries.count || 0) + 1;
  const until = count >= PARENT_MAX_TRIES ? now + PARENT_LOCKOUT_MS : 0;
  writeJson(sessionStorageOf(session), PARENT_TRIES_KEY, { count, until });
  return {
    ok: false,
    error: until
      ? `试错次数太多了，${Math.ceil(PARENT_LOCKOUT_MS / 1000)} 秒后再试。`
      : `家长密码不对。还可以试 ${PARENT_MAX_TRIES - count} 次。`,
  };
}

export function readParentTries(session) {
  const rec = readJson(sessionStorageOf(session), PARENT_TRIES_KEY);
  return {
    count: Number(rec?.count) || 0,
    until: Number(rec?.until) || 0,
  };
}

export function clearParentTries(session) {
  writeJson(sessionStorageOf(session), PARENT_TRIES_KEY, null);
}

export function isParentUnlocked(session, now = Date.now()) {
  const until = Number(readJson(sessionStorageOf(session), PARENT_UNLOCK_KEY)?.until) || 0;
  return until > now;
}

export function markParentUnlocked(session, now = Date.now()) {
  writeJson(sessionStorageOf(session), PARENT_UNLOCK_KEY, { until: now + PARENT_UNLOCK_MS });
}

export function lockParent(session) {
  writeJson(sessionStorageOf(session), PARENT_UNLOCK_KEY, null);
  clearParentTries(session);
}

/**
 * 需要家长确认的动作入口。
 * @returns {Promise<boolean>} 用户取消或解锁失败时为 false。
 * 已经解锁的会话直接放行，不重复弹窗。
 */
export async function requireParent(reason = '家长确认', opts = {}) {
  if (isParentUnlocked(opts.session)) return true;
  return openParentGate({ ...opts, reason });
}

/* 同一时刻只允许一个家长确认框：家长入口、路由守卫和外链可能同时触发，
   叠两个模态对话框会让取消键按到下面那一层。 */
let activeGate = null;

/**
 * 打开家长确认对话框。没有 PIN 时先进入"设置 4 位密码"流程。
 * 没有 DOM（Node 测试）时返回 false，不抛错。
 */
export function openParentGate(opts = {}) {
  if (activeGate) return activeGate;
  activeGate = openParentGateOnce(opts);
  activeGate.finally(() => { activeGate = null; });
  return activeGate;
}

function openParentGateOnce({
  reason = '家长确认', storage, session, doc = globalThis.document,
} = {}) {
  if (!doc?.body) return Promise.resolve(false);

  const configured = parentPinConfigured(storage);
  const titleText = configured ? '家长确认' : '设置家长密码';

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(ok);
    };

    const error = h('div', { class: 'field-error', role: 'alert', 'aria-live': 'polite' });
    const inputProps = {
      type: 'password', inputmode: 'numeric', maxlength: String(PARENT_PIN_LENGTH),
      autocomplete: 'off', required: true,
    };
    const pinInput = h('input', {
      ...inputProps, class: 'input', id: 'parent-pin',
      'aria-label': configured ? '家长密码' : '设置 4 位家长密码',
    });
    const pinAgain = configured ? null : h('input', {
      ...inputProps, class: 'input', id: 'parent-pin-again',
      'aria-label': '再输一次家长密码',
    });

    const confirm = h('button', { class: 'btn btn-seal', type: 'submit', id: 'parent-confirm' },
      configured ? '确认' : '保存密码');
    const cancel = h('button', { class: 'btn btn-ghost', type: 'button', id: 'parent-cancel' },
      '取消');

    async function submit() {
      const pin = pinInput.value.trim();
      if (!configured) {
        if (!isValidParentPin(pin)) { error.textContent = '请设置 4 位数字。'; return; }
        if (pinAgain.value.trim() !== pin) { error.textContent = '两次输入不一样。'; return; }
        await setupParentPin(pin, { storage, session });
        if (settled) return;
        finish(true);
        return;
      }
      const r = await verifyParentPin(pin, { storage, session });
      if (settled) return;
      if (r.ok) { finish(true); return; }
      error.textContent = r.error || '家长密码不对。';
      pinInput.value = '';
      pinInput.focus();
    }

    const form = h('form', {
      class: 'parent-gate-form',
      onsubmit: (e) => { e.preventDefault(); submit(); },
    },
      h('div', { class: 'parent-gate-fields' },
        h('label', { for: 'parent-pin' }, configured ? '家长密码（4 位数字）' : '设置 4 位家长密码'),
        pinInput,
        configured ? null : h('label', { for: 'parent-pin-again' }, '再输一次'),
        pinAgain),
      error,
      h('div', { class: 'row-tight parent-gate-actions' }, cancel, confirm));

    const dialog = h('dialog', {
      class: 'confirm-dialog parent-gate',
      'aria-labelledby': 'parent-gate-title',
    },
      h('h2', { id: 'parent-gate-title' }, titleText),
      h('p', { class: 'small muted' },
        configured
          ? `${reason}需要家长确认。`
          : '第一次使用家长入口，请先记下 4 位数字密码。'),
      form);

    cancel.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
    dialog.addEventListener('close', () => finish(false));
    doc.body.appendChild(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    pinInput.focus();
  });
}
