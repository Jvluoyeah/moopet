/* 月塔端口：盖章 / 摸签 / 册子上的日记
   ============================================================
   世界观位置：月塔是那座吞吐整座城市数据的主机（小说序章）。它给每个记录员
   开了一个端口 —— 每天在册子上按一个印、摸一次签、翻自己那本册子上的日记。

   两个入口共用这一页：
     · 网页端直接从目录进来（不进游戏也能用）；
     · 世界里的「月塔端口」那个交互物也是 `go('/tower')` 到这一页。
   数据全在服务端（/api/tower/*），所以两边看到的永远是同一份。

   文案铁律：不出现"签到成功 / 打卡 / 领取 / 获得"，按印就是按印，是记录不是打卡。
*/
import { h, withBusy } from '../lib/dom.js';
import { api, ApiError } from '../lib/api.js';
import { get } from '../lib/store.js';
import { sheetHead, note, loading, errorBox } from '../components/ui.js';
import { pageShell } from '../components/layout.js';

/** 稀有一件给个说法，别只写"稀有" */
const RARITY = { common: '常见', rare: '少见' };
const KIND_WORD = {
  battle: '对拍', training: '关卡', visit: '串门',
  checkin: '盖章', draw: '摸签', level: '长大',
};

export async function towerPage() {
  const { shell, pageEl } = pageShell({ current: '/tower' });
  const box = h('div', { class: 'stack-lg' });
  pageEl.replaceChildren(box);
  render(box);
  return shell;
}

/**
 * 抽签的演出：摇筒 → 签条升起 → 翻面 → 出结果。
 *
 * 三条硬性要求（目标里定的）：
 *   · **能跳过** —— 演出中再点一下直接到终态，不让人干等；
 *   · **不重复触发** —— 请求由调用方保证只发一次（这里只管演）；
 *   · **不阻塞** —— 全程只动 transform/opacity，手机上也不掉帧。
 *
 * 结果**以服务端为准**：调用方先把奖拿回来，这里只负责把它演出来。
 */
function playDraw(host, r) {
  const rare = r.prize.rarity === 'rare' || r.from_pity;
  /* 签筒用纸片画（原来是 `🎋` emoji —— 违反风格铁律：全站是羊皮纸/墨线，
     一个彩色 emoji 会立刻跳出来）。筒身是纸+墨边+硬投影，筒口露三张签条的头。 */
  const tube = h('div', { class: 'draw-tube' },
    h('div', { class: 'tub' },
      h('div', { class: 'tub-slips' }, h('i'), h('i'), h('i')),
      h('div', { class: 'tub-body' }, '签')));
  const slip = h('div', { class: 'draw-card draw-slip', style: { marginTop: '10px' } },
    h('div', { class: 'draw-face' },
      h('div', { class: 'card tint', style: { padding: '14px 18px' } },
        h('div', { class: 'hand' }, '签上写着…'))),
    h('div', { class: 'draw-face draw-back' },
      h('div', { class: 'card tint', style: { padding: '14px 18px' } },
        h('div', { class: 'h2' }, r.prize.name),
        h('div', { class: 'small muted' },
          r.from_pity ? '这一签是攒够了的。' : `${RARITY[r.prize.rarity] || ''}`))));
  const burst = rare ? h('div', { class: 'draw-burst',
    style: { position: 'absolute', inset: '-40px', pointerEvents: 'none' } }) : null;
  const wrap = h('div', { class: 'card', id: 'tower-draw-stage',
    style: { position: 'relative', textAlign: 'center', cursor: 'pointer' } },
    h('div', { class: 'tiny muted' }, '签筒在手里晃了晃 —— 点一下可以跳过'),
    tube, burst, slip);

  host.replaceChildren(wrap);
  // 摇完再把签条推出来（和 keyframes 的时长对齐：摇 .46s → 升 .30s → 翻 .34s）
  const t1 = setTimeout(() => slip.classList.add('draw-rise'), 460);
  const t2 = setTimeout(() => {
    slip.classList.remove('draw-slip');
    slip.classList.add('draw-flip');
  }, 760);

  return new Promise((resolve) => {
    let done = false;
    const timers = [t1, t2];
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const t of timers) clearTimeout(t);
      wrap.onclick = null;
      resolve();
    };
    const timer = setTimeout(finish, 1150);
    // 点一下跳过：直接把终态摆出来
    wrap.onclick = () => {
      for (const t of timers) clearTimeout(t);
      slip.classList.remove('draw-slip');
      slip.classList.add('draw-flip');
      finish();
    };
  });
}

async function render(box, lastPrize = null) {
  box.replaceChildren(loading('正在接上月塔…'));
  const st = get();
  if (!st.account || !st.dog) {
    box.replaceChildren(
      sheetHead('月塔端口', '盖章 · 摸签 · 册子上的日记'),
      h('div', { class: 'empty' },
        h('span', { class: 'hand' }, '端口不认没有编号的人。'),
        h('div', { class: 'small' }, '先去登记处领一只机械狗，册子上有了编号，端口才开。'),
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
          h('a', { class: 'btn btn-seal', href: '#/adopt' }, '去领养'))));
    return;
  }

  let panel;
  try {
    panel = await api.towerPanel();
  } catch (e) {
    box.replaceChildren(
      sheetHead('月塔端口', '盖章 · 摸签 · 册子上的日记'),
      errorBox(e instanceof ApiError ? e : e, () => render(box)));
    return;
  }

  const msg = h('div');
  const stampBtn = h('button', { class: 'btn btn-seal', id: 'tower-checkin' },
    panel.checkin.done ? '今天已经按过了' : '按下今天的印');
  if (panel.checkin.done) stampBtn.disabled = true;

  const drawBtn = h('button', { class: 'btn', id: 'tower-draw' },
    panel.draw.left > 0 ? '摸一次签' : '今天已经摸过了');
  if (panel.draw.left <= 0) drawBtn.disabled = true;

  const prizeBox = h('div');
  /* 演完之后页面会重建一次（`render(box, r)`）—— 结果卡要跟着搬过来，
     否则动画演完、卡片一闪就没了。所以这里把上一抽的结果重新摆一遍
     （不再放动画：演过一次就够了，重建时再来一次是噪音）。 */
  if (lastPrize) {
    prizeBox.replaceChildren(
      h('div', { class: 'card tint rise-in', id: 'tower-prize' },
        h('div', { class: 'card-title' },
          h('span', { class: 'kicker' },
            `摸出的一件 · ${RARITY[lastPrize.prize.rarity] || ''}`)),
        h('div', { class: 'h2' }, lastPrize.prize.name),
        h('div', { class: 'small muted' },
          lastPrize.from_pity
            ? '这一签是攒够了的 —— 攒满就一定会出一件少见的。'
            : `离下一次必出还差 ${lastPrize.pity_left} 抽。`)));
  }

  stampBtn.addEventListener('click', () => withBusy(stampBtn, async () => {
    try {
      const r = await api.towerCheckin();
      /* 盖章的"物理感"：印章压下去 → 纸上留印（印泥晕开）。
         先把它演出来，再重建页面 —— 反过来 DOM 一重建，动画就没了。 */
      msg.replaceChildren(h('div', { style: { position: 'relative', minHeight: '64px' } },
        h('div', { class: 'stamp-mark',
          style: { fontFamily: 'var(--font-serif)', fontWeight: '700', fontSize: '34px',
                   color: 'var(--seal)', border: '3px solid var(--seal)',
                   width: '56px', height: '56px', display: 'grid', placeItems: 'center',
                   borderRadius: '4px', opacity: '.92' } }, '印'),
        h('div', { class: 'stamp-ink small', style: { marginTop: '6px' } }, r.text)));
      await new Promise((res) => setTimeout(res, 800));
      render(box);
    } catch (e) {
      msg.replaceChildren(note(
        e instanceof ApiError && e.status === 409 ? '今天已经按过了。' : '月塔没接上，过会儿再试。',
        'warn'));
      stampBtn.disabled = false;
    }
  }));

  /* 抽签：
     ⚠️ 顺序很重要 —— **先问月塔（结果以服务端为准），再演**。
        反过来（先演再问）会出现"演出说中了、服务端说没中"这种骗人的界面。
     演出期间按钮 disabled，且用 `drawing` 兜一层 —— 连点不会发第二次请求；
     演出中再点是**跳过**（目标里要求的），不是取消。 */
  let drawing = false;
  drawBtn.addEventListener('click', () => {
    if (drawing) return;                 // 演出中：由演出自己处理点击（跳过）
    drawing = true;
    drawBtn.disabled = true;
    withBusy(drawBtn, async () => {
      try {
        const r = await api.towerDraw();
        await playDraw(prizeBox, r);
        // 少见以上：整页轻轻震一下（牌子震是局部，这一下是"整本册子被拍了一下"）
        if (r.prize.rarity === 'rare' || r.from_pity) {
          box.classList.add('page-thump');
          setTimeout(() => box.classList.remove('page-thump'), 700);
        }
        // 演完再重建页面 —— 顺序颠倒的话 DOM 一重建，动画就被打断了
        render(box, r);
      } catch (e) {
        drawing = false;
        msg.replaceChildren(note(
          e instanceof ApiError && e.status === 409 ? '今天已经摸过了。' : '月塔没接上，过会儿再试。',
          'warn'));
        drawBtn.disabled = false;
      }
    });
  });

  /* 抽签的规矩写在明面上（用户要求：抽奖要有概率与保底说明）——
     不写"概率公示"这种法务话，就写签筒里有几件、各占多少。 */
  const total = panel.draw.pool.reduce((s, p) => s + p.weight, 0);
  const pool = h('ul', { class: 'small', style: { margin: '6px 0 0', paddingLeft: '18px' } },
    ...panel.draw.pool.map((p) => h('li', null,
      `${p.name} · ${RARITY[p.rarity] || ''} · ${Math.round(p.weight / total * 100)}%`)));

  /* 连续天数做成一排格子（比一行文字直观）：按过的格子有印，今天那格是虚线在闪。
     ⚠️ 只用 streak 这一个数字画 —— 服务端目前只返回连续天数，没有逐日流水，
        所以这里画的是"最近 7 天"的示意：断了就从今天重新数（和 streak 的算法一致）。 */
  const cells = h('div', { class: 'stamp-cells', id: 'stamp-cells' });
  const shown = Math.min(panel.checkin.streak, 7);
  for (let i = 0; i < 7; i += 1) {
    // 已按的格子靠右排（最近的在最右）；今天还没按就留最后一格给今天
    const isToday = i === 6;
    const on = panel.checkin.done ? i >= 7 - shown : i >= 7 - shown && !isToday;
    cells.appendChild(h('div', {
      class: 'stamp-cell' + (on ? ' is-on' : '') + (isToday && !panel.checkin.done ? ' is-today' : ''),
    }, on ? '印' : ''));
  }

  const diary = h('div', { class: 'stack-sm', id: 'tower-diary' },
    panel.diary.length
      ? h('div', null, ...panel.diary.map((d, i) => h('div',
          /* 逐行出现：每行错开 60ms —— 像翻页时一行行读下去。
             错开量写死（不做随机），截图和测试里每次都是同一个节奏。 */
          { class: 'between diary-row', style: { animationDelay: `${Math.min(i, 10) * 60}ms` } },
          h('div', null,
            h('span', { class: 'badge' }, KIND_WORD[d.kind] || '别的事'),
            h('span', { style: { marginLeft: '8px' } }, d.text)),
          h('span', { class: 'tiny muted mono' }, d.at))))
      : h('div', { class: 'small muted' }, '册子这一页还是空的。打过一局、通一关、串过门，这里就会多一行。'));

  box.replaceChildren(
    /* `.rise-in`：**页内**从"正在接上月塔…"换成内容的那一下原来也是硬切。
       页面级入场有 pageShell 的 fade-in 兜着，但页内重绘没有 ——
       加这一层之后 loading→内容、以及抽完签重建，都是轻轻升上来。 */
    h('div', { class: 'rise-in' },
      sheetHead('月塔端口', '盖章 · 摸签 · 册子上的日记',
        h('div', { class: 'row-tight' },
          // 世界里的端口落在这一页，所以这里要能拐去问询（两个入口互相可达）
          h('a', { class: 'btn btn-ghost btn-sm', href: '#/quiz' }, '去问询'),
          h('a', { class: 'btn btn-ghost btn-sm', href: '#/card' }, '看档案卡'))),
      msg,
      h('div', { class: 'grid-2' },
      h('div', { class: 'card' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '盖章')),
        h('div', { class: 'small muted' },
          panel.checkin.done
            ? `今天这一格已经按上了。连着第 ${panel.checkin.streak} 天。`
            : (panel.checkin.streak > 0
                ? `昨天按过，连着第 ${panel.checkin.streak} 天。今天按一下，就接上了。`
                : '册子上还没按过印。每天一格。')),
        h('div', { class: 'row-tight', style: { marginTop: '10px' } }, stampBtn),
        cells),
      h('div', { class: 'card' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '摸签')),
        h('div', { class: 'small muted' },
          `一天一次。签筒里就这几件，比例写在下面。攒满 ${panel.draw.pity_at} 抽，一定出一件少见的。`),
        pool,
        h('div', { class: 'row-tight', style: { marginTop: '10px' } }, drawBtn))),
      prizeBox,
      h('div', { class: 'card' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '册子上的日记')),
        h('div', { class: 'tiny muted', style: { marginBottom: '8px' } },
          '只有真发生过的事才会记在这里 —— 打过的局、通过的关、串过的门。'),
        diary)));
}
