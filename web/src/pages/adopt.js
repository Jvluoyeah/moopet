/* 领养：从图鉴里挑一个品种 → 起名 → 领养（服务端会顺手把你加进公开社群） */

import { h, withBusy } from '../lib/dom.js';
import { api, ApiError } from '../lib/api.js';
import { go } from '../lib/router.js';
import { get, set, breedOf } from '../lib/store.js';
import { sheetHead, note, errorBox, breedCard, dogPortrait, statBars } from '../components/ui.js';
import { pageShell } from '../components/layout.js';

export function adoptPage() {
  const st = get();
  let picked = st.breeds[0]?.code || null;
  const grid = h('div', { class: 'grid-auto', id: 'breed-grid' });
  const detail = h('div', { class: 'card tint', id: 'breed-detail' });
  const nameInput = h('input', { class: 'input', id: 'dog-name', maxlength: '24',
                                 placeholder: '比如：雪团、阿牧、短腿' });
  const mottoInput = h('input', { class: 'input', id: 'dog-motto', maxlength: '64',
                                  placeholder: '比如：我们回家。（可留空）' });
  const msg = h('div');
  const submit = h('button', { class: 'btn btn-seal btn-block', id: 'adopt-submit' },
                   '领养它，并加入「长夜月广场」');

  /* ---- 名下已有的狗：先在这里挑一只带出门 ----
     ⚠️ 这一段是后加的。原来登录后直接落到"领养新狗"，而 set() 又写死取
     dogs[0] —— 账号里有几只狗的时候，用户既挑不了、又容易误领养新的。 */
  const mine = h('div', { id: 'my-dogs' });

  function renderMine(dogs) {
    if (!dogs || !dogs.length) { mine.replaceChildren(); return; }
    const cards = dogs.map((d) => {
      const b = breedOf(d.breed_code) || {};
      /* ⚠️ onclick 必须在**第二个参数**（props）里。
         `h(tag, props, ...children)` —— 写成第三个参数会被当成子节点，
         append() 会把对象 String() 成文本，页面上直接印出 "[object Object]"。
         （第一版就是这么写的，所以这里留一句。）另外别传 `withBusy(null, …)`：
         它的第一个参数是按钮元素，传 null 会在里面读 .disabled 崩掉。 */
      return h('div', {
        class: 'card flat',
        style: { cursor: 'pointer' },
        onclick: () => { set({ dog: d }); go('/'); },
      },
        h('div', { class: 'row', style: { alignItems: 'center', gap: '12px' } },
          h('div', { style: { width: '84px', flex: '0 0 auto' } }, dogPortrait(b, d.level || 1)),
          h('div', { style: { flex: 1, minWidth: '120px' } },
            h('div', { class: 'breed-name' }, d.name || '（没名字）'),
            h('div', { class: 'breed-sub' }, `${b.name || d.breed_code || ''} · LV.${d.level || 1}`),
            h('button', { class: 'btn btn-sm', style: { marginTop: '8px' } }, '带它出门'))));
    });
    mine.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '带哪只出门')),
        h('div', { class: 'grid-auto', style: { marginTop: '10px' } }, ...cards),
        h('div', { class: 'field-hint' },
          '点一只就换过来。想再养一只，用下面的品种图鉴。')));
  }

  function renderGrid() {
    grid.replaceChildren(...st.breeds.map((b) => breedCard(b, {
      picked: b.code === picked,
      onPick: (breed) => { picked = breed.code; renderGrid(); renderDetail(); },
    })));
  }

  function renderDetail() {
    const b = breedOf(picked);
    detail.replaceChildren(
      h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '已选品种')),
      h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '16px' } },
        h('div', { style: { width: '132px', flex: '0 0 auto' } }, dogPortrait(b, 1)),
        h('div', { style: { flex: 1, minWidth: '180px' } },
          h('div', { class: 'breed-name' }, b.name),
          h('div', { class: 'breed-sub' }, b.subtitle || ''),
          h('p', { class: 'small muted', style: { margin: '8px 0' } }, b.description || ''),
          statBars(b.stats, { compact: true }))),
      h('div', { class: 'note', style: { marginTop: '12px' } },
        '选好之后起个名字。名字和品种会一起写进档案卡，并出现在广场上。'));
  }

  submit.addEventListener('click', () => withBusy(submit, async () => {
    const name = nameInput.value.trim();
    if (!name) { msg.replaceChildren(note('先给狗起个名字。', 'warn')); return; }
    try {
      const card = await api.adopt(name, picked, mottoInput.value.trim());
      const dogs = await api.myDogs();
      set({ dog: dogs[0] || card.dog, card });
      go('/');
    } catch (e) {
      msg.replaceChildren(errorBox(e instanceof ApiError ? e : e));
    }
  }));

  const { shell, pageEl } = pageShell({
    current: '/adopt',
    tips: ['品种决定四维天赋与形象', '领养后自动加入公开社群', '一个账号最多 3 只'],
  });

  const body = h('div', { class: 'stack-lg' },
    /* 八个原型＝小说第一章『铭刻于虚无核心的八个灵魂』。
       "挑"这个说法也来自登记处那场戏（她只让你写名字，不让你挑）。 */
    sheetHead('领养一只机械狗', '铭刻于虚无核心的八个灵魂。挑一个，它会出现在广场上；你也会自动加入公开社群',
      h('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, '稍后再说')),
    mine,
    grid,
    h('div', { class: 'grid-2' },
      detail,
      h('div', { class: 'card' },
        /* 小说第一章：登记处的女人递给你**两张卡纸** —— 一张【名字】、
           一张【口头禅】。所以这张卡的标题就叫"两张卡纸"。
           两句提示也都是她的原话（"名字要短。你以后要喊它一辈子。"
           "写一句你以后打算天天跟它说的话。不用长，一句就行。"）。 */
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '两张卡纸')),
        h('div', { class: 'stack' },
          h('div', { class: 'field' },
            h('label', { for: 'dog-name' }, '名字'),
            nameInput,
            h('div', { class: 'field-hint' }, '名字要短。你以后要喊它一辈子。（1–24 个字）')),
          h('div', { class: 'field' },
            h('label', { for: 'dog-motto' }, '口头禅'),
            mottoInput,
            h('div', { class: 'field-hint' },
              '写一句你以后打算天天跟它说的话。不用长，一句就行。')),
          msg,
          submit,
          h('div', { class: 'field-hint' },
            '一个账号最多领养 3 只。领养后可在「狗狗档案」里翻到完整的那一页。')))));

  if (!st.breeds.length) {
    pageEl.replaceChildren(sheetHead('领养一只机械狗', '正在翻开图鉴……'),
      note('品种还没加载出来，请稍候或刷新。', 'warn'));
    return shell;
  }

  renderGrid();
  renderDetail();
  pageEl.replaceChildren(body);
  /* 拉一次名下的狗。失败就算了（没登录/网络问题）—— 品种图鉴照常能用，
     不要把整页卡住。 */
  api.myDogs().then((dogs) => {
    renderMine(dogs);
    if (dogs && dogs.length >= 3) {
      // 已经满 3 只：图鉴和"起个名字"那一段收起来，避免误领养
      grid.replaceChildren();
      submit.disabled = true;
      msg.replaceChildren(note('一个账号最多 3 只。上面挑一只带出门就好。', 'warn'));
    }
  }).catch(() => {});
  return shell;
}
