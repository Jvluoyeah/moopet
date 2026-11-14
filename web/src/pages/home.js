/* 总览：我的狗 + 社群 + 入口。没有狗就把人引到领养页。 */

import { h, replaceChildren } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { get, breedOf } from '../lib/store.js';
import { sheet, sheetHead, note, dogPortrait, statBars, loading, errorBox, empty, textNode } from '../components/ui.js';
import { tierOf } from '../lib/breedArt.js';
import { pageShell } from '../components/layout.js';

const TIPS = [
  '左栏是册页目录，右栏是你的狗与便签',
  '去开放世界能看到别的狗，点它可以串门',
  '竞技场打一局有经验，由你本地的狗结算',
];

/* 幼稚模式只突出"今天先做一件事"：一张卡、一个按钮。
   其他册页照常可去，但不把十件事一起摆到孩子面前。 */
function childTask(st) {
  const hasDog = Boolean(st.dog);
  return h('div', { class: 'child-task card' },
    h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '今天先做一件事')),
    h('div', { class: 'h3' },
      hasDog ? '去打一局，赢了有经验' : '先养一只自己的狗'),
    h('div', { class: 'small muted' },
      hasDog ? '输了也没关系，它不会真的受伤。' : '挑一只喜欢的，它会陪着你。'),
    h('a', {
      class: 'btn btn-blue btn-block',
      href: hasDog ? '#/arena' : '#/adopt',
    }, hasDog ? '去比一比' : '去养一只狗'));
}

/* 幼稚模式的进度可视化：训练关的三颗星汇总成"收集星星"。
   星星数据本来就在训练关接口里，不另做一套成长数值。 */
function childStars(levels = []) {
  const total = levels.length * 3;
  const stars = levels.reduce((n, r) => n + (Number(r.stars) || 0), 0);
  const cleared = levels.filter((r) => r.cleared).length;
  return h('div', { class: 'child-stars card' },
    h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '星星收集')),
    h('div', { class: 'child-star-row', 'aria-label': `已收集 ${stars} 颗星，共 ${total || 12} 颗` },
      ...Array.from({ length: total || 12 }, (_, i) =>
        h('span', { class: i < stars ? 'is-on' : '', 'aria-hidden': 'true' },
          i < stars ? '★' : '☆'))),
    h('div', { class: 'small muted' },
      `已经拿到 ${stars} 颗星，通关 ${cleared} / ${levels.length || 4} 关。`),
    h('a', { class: 'btn btn-ghost btn-sm', href: '#/training' }, '去闯关拿星星'));
}

export function homePage() {
  const { shell, pageEl } = pageShell({ current: '/', tips: TIPS });
  const box = h('div', { class: 'stack-lg' });
  pageEl.replaceChildren(box);
  render(box);
  return shell;
}

async function render(box) {
  const st = get();
  if (!st.account) {
    box.replaceChildren(
      h('p', { class: 'kicker' }, 'MOOPET DOSSIER'),
      h('h1', { class: 'display' }, '长夜月 · 机械狗档案册'),
      h('p', { class: 'lede' }, textNode('先登录，再领养一只机械狗。它能记住你的陪伴，也会在开放世界里认识别的狗。')),
      h('div', { class: 'row' },
        h('a', { class: 'btn btn-blue', href: '#/login' }, '登录 / 注册'),
        h('a', { class: 'btn btn-ghost', href: '#/styleguide' }, '看看设计系统')));
    return;
  }
  if (!st.dog) {
    box.replaceChildren(
      // 这一句是小说序章登记处那场戏的最后一句原话
      sheetHead('册子是你的了。狗还没有。', '去图鉴里挑一只，它立刻会出现在广场上'),
      childTask(st),
      empty('档案册是空的', '领养之后这里会显示它的状态、社群和最近发生的事',
        h('a', { class: 'btn btn-seal', href: '#/adopt' }, '去领养')));
    return;
  }

  box.replaceChildren(loading('正在读取状态…'));
  const breed = breedOf(st.dog.breed_code);
  try {
    const [card, community, members, visits, levels] = await Promise.all([
      api.dogCard(st.dog.id), api.community(), api.members(6), api.visits(),
      /* 星星只影响幼稚模式的一张卡；接口失败不该拖垮整页。 */
      api.trainingLevels().catch(() => []),
    ]);

    /* ⚠️ 用 lib/dom.js 的 replaceChildren（会过滤 null），不是原生那个。
       原生 `replaceChildren(null)` 会把 null 当**文本**插进去 ——
       下面"最近来过"那张卡在没访客时返回 null，
       页面上就印出一个字面的 "null"（用户截图里就是这个）。 */
    replaceChildren(box,
      sheetHead('我的机械狗', `档案编号 #${String(st.dog.id).padStart(4, '0')}`,
        h('a', { class: 'btn btn-sm', href: '#/world' }, '去开放世界'),
        h('a', { class: 'btn btn-sm btn-blue', href: '#/arena' }, '进竞技场')),
      childTask(st),
      childStars(levels),

      h('div', { class: 'grid-2', style: { alignItems: 'start' } },
        h('div', { class: 'card' },
          h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '16px' } },
            h('div', { style: { width: '150px', flex: '0 0 auto' } },
              dogPortrait(breed, st.dog.level)),
            h('div', { style: { flex: 1, minWidth: '160px' } },
              h('div', { class: 'between' },
                h('span', { class: 'breed-name' }, st.dog.name),
                h('span', { class: 'badge' }, `LV.${st.dog.level}`)),
              h('div', { class: 'breed-sub' },
                `${st.dog.breed_name} · ${st.dog.personality} · ${tierOf(st.dog.level).label}`),
              st.dog.motto ? h('div', { class: 'hand', style: { marginTop: '6px' } }, `「${st.dog.motto}」`) : null,
              h('div', { style: { marginTop: '12px' } }, statBars(card.stats)),
              h('div', { class: 'row-tight', style: { marginTop: '12px' } },
                h('a', { class: 'btn btn-sm btn-ghost', href: '#/card' }, '完整档案卡'))))),

        h('div', { class: 'stack' },
          h('div', { class: 'card tint' },
            h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '所属社群')),
            h('div', { class: 'h3' }, community?.name || '—'),
            h('div', { class: 'small muted' }, community?.description || ''),
            h('div', { class: 'row-tight', style: { marginTop: '10px' } },
              /* ⚠️ 这里原来写的是 `在场 ${member_count} 只` —— member_count 是
                 **登记在册的总数**。用户看到「在场 272 只」就问"依据是什么"，
                 问得对：那是成员表的总行数，不是此刻在场。
                 现在分两个徽章：在场（10 分钟内有心跳的 + NPC）与登记在册。 */
              h('span', { class: 'badge dot moss' },
                `在场 ${community?.online_count ?? 0} 只`),
              h('span', { class: 'badge' },
                `登记在册 ${community?.member_count ?? 0} 只`),
              h('span', { class: 'badge' }, `社交等级 ${card.social_level}`),
              h('span', { class: 'badge' }, `访客 ${card.visits_received}`)),
            h('div', { style: { marginTop: '12px' } },
              h('a', { class: 'btn btn-sm btn-block btn-ghost', href: '#/world' }, '去广场看看'))),

          h('div', { class: 'card' },
            h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '社群里还有')),
            members.length
              ? h('div', { class: 'stack-sm' },
                  ...members.map((m) => h('div', { class: 'between' },
                    h('div', { class: 'row-tight' },
                      h('span', { class: m.online ? 'badge dot moss' : 'badge dot' }, m.dog_name),
                      h('span', { class: 'tiny muted' }, m.breed_name)),
                    h('span', { class: 'tiny mono muted' }, `LV.${m.level}`))))
              : h('div', { class: 'small muted' }, '社群里还没有别的狗。')))),

      visits.length
        ? h('div', { class: 'card' },
            h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '狗窝最近来过')),
            h('div', { class: 'stack-sm' },
              ...visits.slice(0, 5).map((v) => h('div', { class: 'between small' },
                h('span', null, v.visitor, v.message ? `：「${v.message}」` : ' 来串过门'),
                h('span', { class: 'tiny muted mono' }, (v.at || '').slice(0, 16))))))
        : null,

      h('div', { class: 'grid-2' },
        h('div', { class: 'card tint' },
          h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '下一步')),
          h('ul', { class: 'small', style: { margin: 0, paddingLeft: '18px' } },
            h('li', null, textNode('去开放世界走走，靠近别的狗按下 E 打招呼')),
            h('li', null, textNode('去竞技场打一局，赢了有经验')),
            h('li', null, textNode('打不过就进训练场练手——那里不会挨打')),
            h('li', null, textNode('看看排行榜上自己排第几')))),
        h('div', { class: 'note-paper' },
          h('div', { class: 'hand', style: { fontSize: '16px' } }, textNode('关于你的狗')),
          h('div', { class: 'small' },
            textNode('等级、经验、火花、日记都记在这只狗身上。断网也能继续养，联网之后自动同步。')))));
  } catch (e) {
    box.replaceChildren(errorBox(e, () => render(box)));
  }
}
