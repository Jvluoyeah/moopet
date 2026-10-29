/* 档案卡：一只狗的完整档案（羊皮纸册页）。
   自己看 = 我的档案；别人的狗也能看（从世界/排行榜点进来）。 */

import { h, fmtTime } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { get, breedOf } from '../lib/store.js';
import { query } from '../lib/router.js';
import { note, loading, errorBox, dogPortrait, statBars } from '../components/ui.js';
import { tierOf } from '../lib/breedArt.js';
import { pageShell } from '../components/layout.js';
/* ★ 成长口径的唯一真源：等级 → 四维、四维 → 战斗参数。
   档案卡要显示"当前等级下"的四维（而不是出厂值），就靠它算。 */
import { STAT_LABEL, combatAt, growthAt, statsAt } from '../game/growth.js';

/* 四维成长那一段单独成函数。
   为什么从内联 IIFE 里搬出来：嵌三层箭头函数时括号极难数对，
   我连着改坏过三次（missing ) / unexpected ) 来回跳），
   搬出来之后结构一眼可见，调试钩子也有了个正经地方放。 */
function growthBlock(card, breed, level) {
  /* ⚠️ 要喂**接口给的那份** stats：
     · `/api/breeds` 与 `/api/dogs/{id}/card` 返回的四维是**嵌套**在 `.stats` 里的；
     · 按平铺读会四项全 undefined → 一起落到默认 50 →
       31 级显示成"四维全是 68"（用户截图："每只狗的这些属性维度不可能完全一样的"）。
     growth.js 现在两种形状都收，这里再显式挑一次，双保险。 */
  const base = (card && card.stats) || (breed && breed.stats) || breed || {};
  // 调试钩子：把**真正喂进去的东西**留在页面上，探针直接读（比对源码猜快得多）
  window.__cardDebug = {
    base, level,
    out: statsAt(base, level),
    cardStats: card && card.stats,
    breedStats: breed && breed.stats,
  };
  const g = growthAt(base, Math.max(2, level));
  const parts = Object.entries(g.delta).filter(([, v]) => v > 0)
    .map(([k, v]) => `${STAT_LABEL[k]} +${v}`);
  const cb = combatAt(base, level);
  return h('div', null,
    statBars(statsAt(base, level)),
    parts.length
      ? h('div', { class: 'tiny muted', style: { marginTop: '6px' } },
          `每升一级：${parts.join(' · ')}`)
      : null,
    h('div', { class: 'tiny muted', style: { marginTop: '4px' } },
      `上阵时的样子：血量 ${cb.hpMax} · 速度 ${cb.speed} · 伤害 ×${cb.damageMul} · 招式冷却 ×${cb.cdMul}`));
}

export function cardPage() {
  const id = query().get('id');
  const { shell, pageEl } = pageShell({
    current: '/card',
    /* ⚠️ 这三句原来是**给开发者看的解释**：
         "档案卡上的等级与经验是镜像值 / 真实权威数据在你本地的狗身上 /
          成就由狗本体解锁后镜像上来"
       —— "镜像值""权威数据""狗本体"都是实现细节，用户不需要知道，
       而且"成就"撞 UI 层禁令第 4 条。改成册子上的口气。 */
    tips: ['册子上的字，是照着它身上那本抄下来的',
           '等级和项圈的颜色，会跟着它一起走',
           '它做成的事，会一件一件记上去'],
  });
  const host = h('div');
  pageEl.replaceChildren(host);
  load(host, id);
  return shell;
}

async function load(host, id) {
  host.replaceChildren(loading('正在调取档案…'));
  const st = get();
  try {
    const targetId = id || st.dog?.id;
    if (!targetId) {
      host.replaceChildren(
        h('div', { class: 'empty' },
          h('span', { class: 'hand' }, '这一页还是空的。'),
          h('div', { class: 'small' }, '册子发下来了，编号那行还空着。'),
          h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
            h('a', { class: 'btn btn-seal', href: '#/adopt' }, '去领养'))));
      return;
    }
    const card = await api.dogCard(targetId);
    const d = card.dog;
    const breed = breedOf(d.breed_code);
    const isMine = st.dog && st.dog.id === d.id;
    const tier = tierOf(d.level);

    host.replaceChildren(
      h('header', { class: 'sheet-head' },
        h('div', null,
          h('p', { class: 'kicker' }, isMine ? '我的档案卡' : '社群档案卡'),
          h('h1', null, d.name),
          h('div', { class: 'sub' },
            `档案编号 #${String(d.id).padStart(4, '0')} · 建档 ${fmtTime(d.created_at)}`)),
        h('div', { class: 'row' },
          h('span', { class: 'seal' }, tier.label),
          isMine ? h('a', { class: 'btn btn-sm btn-ghost', href: '#/world' }, '去开放世界') : null,
          h('a', { class: 'btn btn-sm btn-ghost', href: '#/leaderboard' }, '看排行'))),
      h('div', { class: 'dossier' },
        h('div', { class: 'photo' },
          dogPortrait(breed, d.level),
          h('div', { class: 'center' },
            h('div', { style: { fontWeight: 750 } }, d.breed_name),
            h('div', { class: 'tiny muted' }, breed.subtitle || '')),
          d.motto ? h('div', { class: 'hand center small' }, `「${d.motto}」`) : null),
        h('div', { class: 'stack' },
          h('dl', null,
            h('dt', null, '主人'), h('dd', null, card.owner),
            h('dt', null, '品种'), h('dd', null, d.breed_name),
            h('dt', null, '等级'),
            h('dd', null, h('span', { class: 'mono' }, `LV.${d.level}`),
              h('span', { class: 'muted small' }, ` · 累计 ${d.total_exp} 经验`)),
            h('dt', null, '性格'), h('dd', null, d.personality),
            // 在场看 online_count（10 分钟内有心跳的 + NPC），登记在册才是 member_count
            h('dt', null, '社群'),
            h('dd', null, card.community
              ? `${card.community.name}（在场 ${card.community.online_count ?? 0} 只`
                + ` · 登记在册 ${card.community.member_count} 只）`
              : '未加入'),
            h('dt', null, '社交等级'),
            h('dd', null, h('span', { class: 'mono' }, `Lv.${card.social_level}`),
              h('span', { class: 'muted small' }, ` · 友谊值 ${card.friendship_points}`)),
            h('dt', null, '被串门'),
            h('dd', null, h('span', { class: 'mono' }, `${card.visits_received} 次`))),
          h('div', { class: 'rule' }, h('span', null, `四维 · LV.${d.level}`)),
          growthBlock(card, breed, d.level))));
  } catch (e) {
    host.replaceChildren(errorBox(e, () => load(host, id)));
  }
}
