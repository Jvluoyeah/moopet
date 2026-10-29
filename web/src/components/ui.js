/* 共享 UI 片段：纸页 / 提示 / 加载 / 四维 / 品种卡 / 狗肖像。
   页面只组合这些块，样式全在 styles/ 里。 */

import { h, fromHTML } from '../lib/dom.js';
import {tierOf} from '../lib/breedArt.js';
import { breedImage } from '../lib/breedAssets.js';
import { get } from '../lib/store.js';

export function sheet(...children) {
  return h('section', { class: 'sheet fade-in' }, ...children);
}

export function sheetHead(title, sub, ...right) {
  return h('header', { class: 'sheet-head' },
    h('div', null,
      h('h2', null, title),
      sub ? h('div', { class: 'sub' }, sub) : null),
    right.length ? h('div', { class: 'row' }, ...right) : null);
}

export function note(text, kind = '') {
  return h('div', { class: `note ${kind}` }, text);
}

export function loading(text = '读取中…') {
  return h('div', { class: 'loading' },
    h('div', { class: 'spinner' }), h('div', { class: 'small' }, text));
}

export function empty(title, hint, ...actions) {
  return h('div', { class: 'empty' },
    h('span', { class: 'hand' }, title),
    hint ? h('div', { class: 'small' }, hint) : null,
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

/** 属性小徽章组 */
export function tags(...items) {
  return h('div', { class: 'row-tight' }, ...items.filter(Boolean));
}

export function kv(label, value) {
  return [h('dt', null, label), h('dd', null, value)];
}
