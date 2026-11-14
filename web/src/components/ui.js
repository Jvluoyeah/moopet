/* 共享 UI 片段：纸页 / 提示 / 加载 / 四维 / 品种卡 / 狗肖像。
   页面只组合这些块，样式全在 styles/ 里。 */

import { h, fromHTML } from '../lib/dom.js';
import {tierOf} from '../lib/breedArt.js';
import { breedImage } from '../lib/breedAssets.js';
import { get } from '../lib/store.js';
import { hasSimpleText, simpleText } from '../lib/uiMode.js';

/** 可随界面模式切换的文本节点。
 *  只有登记过幼稚模式说法的整句才包 <span>；切模式时 refreshCopy() 直接换字，
 *  页面状态（题目、对局）不会被重置。 */
export function textNode(text) {
  if (!hasSimpleText(text)) return text;
  return h('span', { 'data-copy-standard': text }, simpleText(get().uiMode, text));
}

/** 老人模式的语音输入按钮。
 *  浏览器不支持语音识别时返回 null；元素本身在标准/幼稚模式下由 CSS 隐藏，
 *  这样切到老人模式不用重跑页面也能出现。 */
export function voiceButton(input, { lang = 'zh-CN', label = '语音输入' } = {}) {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!SR || !input) return null;
  let rec = null;
  const btn = h('button', {
    class: 'btn btn-ghost btn-sm voice-btn', type: 'button',
    title: label, 'aria-label': label,
    onclick: () => {
      if (rec) {
        try { rec.stop(); } catch (e) { /* 已经停了 */ }
        rec = null;
        btn.classList.remove('is-listening');
        return;
      }
      const r = new SR();
      rec = r;
      r.lang = lang;
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (e) => {
        const text = Array.from(e.results)
          .map((row) => row[0]?.transcript || '').join('').trim();
        if (!text) return;
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      r.onend = r.onerror = () => {
        if (rec === r) rec = null;
        btn.classList.remove('is-listening');
      };
      try {
        r.start();
        btn.classList.add('is-listening');
      } catch (e) {
        rec = null;
      }
    },
  },
    h('span', { 'aria-hidden': 'true' }, '🎙'),
    '语音');
  return btn;
}

export function sheet(...children) {
  return h('section', { class: 'sheet fade-in' }, ...children);
}

export function sheetHead(title, sub, ...right) {
  return h('header', { class: 'sheet-head' },
    h('div', null,
      h('h2', null, textNode(title)),
      sub ? h('div', { class: 'sub' }, textNode(sub)) : null),
    right.length ? h('div', { class: 'row' }, ...right) : null);
}

export function note(text, kind = '') {
  return h('div', { class: `note ${kind}` }, textNode(text));
}

export function loading(text = '读取中…') {
  return h('div', { class: 'loading' },
    h('div', { class: 'spinner' }), h('div', { class: 'small' }, text));
}

export function empty(title, hint, ...actions) {
  return h('div', { class: 'empty' },
    h('span', { class: 'hand' }, textNode(title)),
    hint ? h('div', { class: 'small' }, textNode(hint)) : null,
    actions.length ? h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } }, ...actions) : null);
}

export function errorBox(err, retry) {
  const msg = err?.message || String(err);
  return h('div', { class: 'note bad' },
    h('div', null,
      h('strong', null, '出错了：'),
      msg,
      retry ? h('div', { style: { marginTop: '8px' } },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: retry }, '重试')) : null));
}

/** 四维属性条 */
export function statBars(stats, { compact = false } = {}) {
  const rows = [
    ['体力', stats?.power],
    ['敏捷', stats?.agility],
    ['智力', stats?.wisdom],
    ['亲和', stats?.affinity],
  ].filter(([, v]) => v !== undefined && v !== null);
  return h('div', { class: `stats${compact ? ' stats-compact' : ''}` },
    ...rows.map(([name, val]) => h('div', { class: 'stat' },
      h('span', { class: 'stat-name' }, name),
      h('div', { class: 'bar' + (val >= 80 ? ' blue' : '') },
        h('i', { style: { width: Math.max(4, Math.min(100, val)) + '%' } })),
      h('span', { class: 'stat-val' }, String(val)))));
}

/** 狗肖像：优先用真实形象图（public/breeds/<code>/forms/sit.png），
 *  没有就退回程序生成的木刻 SVG。
 *
 *  两条路给的元素都带 dog-portrait 类，尺寸由 CSS 统一管，
 *  所以页面不用关心当前用的是哪一种。 */
export function dogPortrait(breed, level = 1, theme = null, form = 'sit') {
  const code = breed?.code;
  if (code) {
    /* ⚠️ 判据是"有没有品种码"，**不是**"图加载好了没"。
       原来写的是 `const img = breedImage(code, form); if (img) {...}` ——
       breedImage 在**还没预载完**的时候返回 null，于是退回程序生成的 SVG。
       结果是：真图明明存在、只是慢了一步，画面上却先闪出一只假的卡通狗
       （用户原话："莫名其妙就会跳出来"）。

       现在只要知道品种码就直接用 <img>：浏览器自己会加载，
       加载完成前那一格是空的 —— 空着比画一张假的强。 */
    return h('img', {
      class: 'dog-portrait', alt: breed.name || code,
      src: `breeds/${code}/forms/${form}.png`, draggable: 'false',
    });
  }
  // 连品种码都没有（数据还没到）→ 留个空位，**不画假的**
  return h('div', { class: 'dog-portrait is-empty' });
}

/** 图鉴卡：选品种时用 */
export function breedCard(breed, { picked = false, onPick } = {}) {
  const t = tierOf(1);
  return h('button', {
    class: `breed-card${picked ? ' is-picked' : ''}`,
    type: 'button',
    'data-breed': breed.code,
    onclick: () => onPick?.(breed),
  },
    h('div', { class: 'portrait' }, dogPortrait(breed, 1)),
    h('div', null,
      h('div', { class: 'between' },
        h('span', { class: 'breed-name' }, breed.name),
        h('span', { class: 'badge' }, breed.subtitle || '')),
      h('div', { class: 'breed-sub', style: { marginTop: '2px' } }, breed.description || '')),
    statBars(breed.stats, { compact: true }),
    h('div', { class: 'row-tight' },
      h('span', { class: 'badge', title: '等级 1 时的项圈档位' }, t.label),
      /* ⚠️ 这里原来印的是 `breed.asset_pack || breeds/${breed.code}` ——
         也就是**素材目录名**（界面上显示成 "breeds/samoyed"）。
         那是给我们自己看的路径，不是给玩家看的信息，而且在手机的小卡片上
         特别扎眼。形态包本来就是"这只狗长什么样"，用中文说一句就够了。 */
      h('span', { class: 'tiny muted' }, '形象包')));
}

/** 关键操作的二次确认（退出、注销、踢设备）。
 *  危险操作默认把焦点放在"取消"上，避免顺手回车把账号删了。
 *  没有 DOM 时返回 false，不抛错。 */
export function confirmDialog({
  title = '确认', body = '', confirmText = '确定', cancelText = '取消',
  danger = false, doc = globalThis.document,
} = {}) {
  if (!doc?.body) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(ok);
    };
    const cancel = h('button', {
      class: 'btn btn-ghost confirm-cancel', type: 'button',
      onclick: () => finish(false),
    }, cancelText);
    const ok = h('button', {
      class: `btn ${danger ? 'btn-danger' : 'btn-seal'} confirm-ok`, type: 'button',
      onclick: () => finish(true),
    }, confirmText);
    const dialog = h('dialog', {
      class: 'confirm-dialog', 'aria-labelledby': 'confirm-dialog-title',
    },
      h('h2', { id: 'confirm-dialog-title' }, title),
      body ? h('p', { class: 'small muted' }, body) : null,
      h('div', { class: 'row-tight confirm-actions' }, cancel, ok));
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
    dialog.addEventListener('close', () => finish(false));
    doc.body.appendChild(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    (danger ? cancel : ok).focus();
  });
}

/** 属性小徽章组 */
export function tags(...items) {
  return h('div', { class: 'row-tight' }, ...items.filter(Boolean));
}

export function kv(label, value) {
  return [h('dt', null, label), h('dd', null, value)];
}
