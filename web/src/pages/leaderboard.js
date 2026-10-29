/* 排行榜：等级榜 / 对战榜 / 社交榜 */

import { h, replaceChildren } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { sheetHead, loading, errorBox, note } from '../components/ui.js';
import { set as setStore, get } from '../lib/store.js';
import { pageShell } from '../components/layout.js';

const KINDS = [
  { kind: 'level', label: '等级榜', desc: '按狗本体上报的等级排序', unit: 'LV' },
  { kind: 'match', label: '对战榜', desc: '胜 +3 / 平 +1', unit: '分' },
  { kind: 'social', label: '社交榜', desc: '串门与互动积累的友谊值', unit: '点' },
];

export function leaderboardPage() {
  let kind = new URLSearchParams(location.hash.split('?')[1] || '').get('kind') || 'level';
  const tabs = h('div', { class: 'row-tight' });
  const host = h('div');
  const { shell, pageEl } = pageShell({
    current: '/leaderboard',
    tips: ['未登录也能看榜', '赢一局对战 +3 分', '去广场串门能涨社交榜'],
  });

  function renderTabs() {
    tabs.replaceChildren(...KINDS.map((k) => h('button', {
      class: `btn btn-sm ${k.kind === kind ? '' : 'btn-ghost'}`,
      'data-kind': k.kind,
      onclick: () => { kind = k.kind; renderTabs(); load(host, kind); },
    }, k.label)));
  }

  renderTabs();
  load(host, kind);
  pageEl.replaceChildren(
    sheetHead('排行榜', '等级 / 对战 / 社交 三个榜。没登记也看得见',
      h('a', { class: 'btn btn-sm btn-ghost', href: '#/arena' }, '去打一局')),
    h('div', { style: { marginBottom: '14px' } }, tabs),
    host);
  return shell;
}

async function load(host, kind) {
  host.replaceChildren(loading('正在点数…'));
  try {
    const data = await api.leaderboard(kind, 20);
    const meta = KINDS.find((k) => k.kind === kind);
    if (!data.rows.length) {
      host.replaceChildren(h('div', { class: 'empty' },
        h('span', { class: 'hand' }, '榜单还是空的'),
        h('div', { class: 'small' }, '去打一局、或者去广场串个门，这里就有名字了。')));
      return;
    }
    const breeds = get().breeds;
    /* ⚠️ 用 lib/dom.js 的 replaceChildren（会过滤 null）：
       下面"你的名次"那张卡在没有名次时返回 null，
       原生 replaceChildren(null) 会把它当**文本**插进去 ——
       页面上就多出一个字面的 "null"（和首页那次是同一个病）。 */
    replaceChildren(host,
      note(`${meta.label}：${meta.desc}`, ''),
      h('table', { class: 'plate', id: 'leaderboard-table', style: { marginTop: '14px' } },
        h('thead', null, h('tr', null,
          h('th', { class: 'rank' }, '#'),
          h('th', null, '狗狗'),
          h('th', null, '品种'),
          h('th', null, '等级'),
          h('th', { style: { textAlign: 'right' } }, meta.unit))),
        h('tbody', null,
          ...data.rows.map((r) => h('tr', { class: r.is_me ? 'is-me' : '', 'data-dog': r.dog_id },
            h('td', { class: 'rank mono' }, String(r.rank)),
            h('td', null,
              h('a', { href: `#/card?id=${r.dog_id}` }, r.dog_name),
              r.is_me ? h('span', { class: 'badge signal', style: { marginLeft: '8px' } }, '我') : null),
            h('td', { class: 'muted' }, r.breed_name),
            h('td', { class: 'mono' }, `LV.${r.level}`),
            h('td', { class: 'mono right', style: { textAlign: 'right' } },
              kind === 'match' ? `${r.score}（${r.wins}胜${r.losses}负）` : String(r.score)))))),
      data.me && data.me.rank > data.rows.length
        ? h('div', { class: 'note-paper', style: { marginTop: '14px' } },
            h('div', { class: 'hand' }, `你的名次：第 ${data.me.rank} 名`),
            h('div', { class: 'small' }, `分数 ${data.me.score}，继续加油。`))
        : null);
  } catch (e) {
    host.replaceChildren(errorBox(e, () => load(host, kind)));
  }
}
