/* 月塔问询：出题、答题、给经验
   ============================================================
   世界观位置：月塔不只在记档，它也**考**。小说里那只机械狗会的东西不是天生，
   是一次次被问出来的。所以这里的说法是「问询」：月塔问一句，你答一句。

   规则（用户定的）：
     · 答对给经验，**答错不惩罚** —— 不扣经验、不扣别的，只是这一题没有；
     · 一天有上限（服务端判）；
     · **智力越高，提示浮得越早** —— 延迟由服务端按狗的智力算好给我们
       （公式在前端 src/game/growth.js 的 hintDelayMs，两边同一份口径）。

   两个入口共用这一页：网页端从目录进来，世界里那台终端也是 go('/quiz')。

   文案铁律：不出现"答题正确/获得奖励/任务完成"，问询就是问询 ——
   答上来是"答上来了"，没答上来是"看下一题"，不责备也不吹捧。
*/
import { h, withBusy } from '../lib/dom.js';
import { api, ApiError } from '../lib/api.js';
import { get, set } from '../lib/store.js';
import { sheetHead, note, loading, errorBox } from '../components/ui.js';
import { pageShell } from '../components/layout.js';
/* ★ 本地结算：答对的经验走和竞技场/训练关同一条链（applyExp → set → 上报镜像） */
import { applyExp } from '../lib/exp.js';

const STAGE_WORD = {
  小学: '启蒙', 初中: '进阶', 高中: '深水', 常识: '常识', 专业: '专门',
};
const DIFF_STARS = ['', '★', '★★', '★★★', '★★★★', '★★★★★'];

export async function quizPage() {
  const { shell, pageEl } = pageShell({ current: '/quiz' });
  const box = h('div', { class: 'stack-lg' });
  pageEl.replaceChildren(box);
  render(box);
  return shell;
}

/** 出题卡片 + 倒计时提示。
 *  倒计时到点自动把提示浮出来（智力越高等得越短，延迟由服务端给）。 */
function askCard(box, ask) {
  const q = ask.question;
  const msg = h('div');
  const hintBox = h('div', { class: 'hint-slip', id: 'quiz-hint' });
  const options = h('div', { class: 'stack-sm', id: 'quiz-options' });
  const meterWrap = h('div', { class: 'hint-meter' }, h('i', { id: 'quiz-meter' }));
  let answered = false;

  const lockAll = (pick) => {
    for (const b of options.querySelectorAll('button')) {
      b.disabled = true;
      if (pick !== null && Number(b.dataset.idx) === pick) b.classList.add('is-pick');
    }
  };

  const answer = async (choice) => {
    if (answered) return;
    answered = true;
    stopTimer();                    // ← 答完立刻停掉倒计时（上一版漏了这一步）
    lockAll(choice);
    try {
      const r = await api.quizAnswer(q.id, choice);
      // 答对：走本地结算那条链（和服务端镜像）
      let gain = null;
      if (r.correct && r.exp > 0) {
        const dog = get().dog;
        gain = applyExp(dog || {}, r.exp);
        if (dog) {
          set({ dog: { ...dog, level: gain.level, total_exp: gain.total_exp } });
          api.updateMine({ level: gain.level, total_exp: gain.total_exp }).catch(() => {});
        }
      }
      // 标出正确项（错的也标出来 —— 要让人看见正确答案是哪个）
      for (const b of options.querySelectorAll('button')) {
        const idx = Number(b.dataset.idx);
        if (idx === r.answer) b.classList.add('is-right');
        else if (idx === choice) b.classList.add('is-wrong');
      }
      msg.replaceChildren(h('div', { class: 'card tint rise-in' },
        h('div', { class: 'card-title' },
          h('span', { class: 'kicker' }, r.correct ? '答上来了' : '这回没答上来')),
        h('div', null, r.why),
        r.correct && r.exp > 0
          ? h('div', { class: 'small', style: { marginTop: '6px' } },
              `记下 ${r.exp} 点经验。` + (gain && gain.leveledUp
                ? ` 它又长大了一点：LV.${gain.from} → LV.${gain.level}` : ''))
          : h('div', { class: 'small muted', style: { marginTop: '6px' } },
              r.correct ? '这一题今天答过了，不再记经验。' : '答错不扣什么。'),
        h('div', { class: 'row-tight', style: { marginTop: '10px' } },
          h('button', { class: 'btn btn-seal', onclick: () => render(box) },
            r.left > 0 ? `下一题（还剩 ${r.left} 次）` : '今天的问询用完了'))));
    } catch (e) {
      answered = false;
      lockAll(null);
      for (const b of options.querySelectorAll('button')) b.disabled = false;
      msg.replaceChildren(note(
        e instanceof ApiError && e.status === 409 ? '今天的问询用完了。'
          : '月塔没接上，过会儿再试。', 'warn'));
    }
  };

  q.options.forEach((text, i) => {
    options.appendChild(h('button', {
      class: 'quiz-opt', 'data-idx': i, id: `quiz-opt-${i}`,
      onclick: () => answer(i),
    }, h('span', { class: 'quiz-key' }, 'ABCD'[i]), h('span', null, text)));
  });

  /* ★ 提示的冷却。
     延迟是服务端按**这只狗的智力**算好的（ask.hint_ms）——
     页面上不许再自己写 26000 这种数字，那样改一处漏一处。
     ⚠️ 行为按用户要求改过：提示**不自动弹出来**，而是
        "冷却走完之后**按钮变可点**，点了才展开"。
        自动弹等于替你决定"你现在需要提示"；让人自己点，才是他自己判断要不要。
     ⚠️ 答题之后**必须 clearInterval** —— 上一版没清，答完题进度条还在跑
        （用户在真机上看到的：答完结算都出来了，底下那条线还在走）。 */
  const hintBtn = h('button', {
    class: 'btn btn-ghost btn-sm', id: 'quiz-hint-btn', disabled: true,
  }, '先想一想…');
  hintBtn.addEventListener('click', () => {
    if (hintBtn.disabled) return;
    hintBox.classList.add('is-on');
    hintBox.replaceChildren(
      h('span', { class: 'kicker' }, '提示'),
      h('span', { style: { marginLeft: '8px' } }, q.hint));
    hintBtn.disabled = true;
    hintBtn.textContent = '看过提示了';
  });

  const t0 = Date.now();
  const timer = setInterval(() => {
    const el = document.getElementById('quiz-meter');
    if (!el) { clearInterval(timer); return; }
    const p = Math.min(1, (Date.now() - t0) / ask.hint_ms);
    el.style.width = `${(p * 100).toFixed(1)}%`;
    if (p >= 1) {
      clearInterval(timer);
      // 冷却走完：**解锁按钮**（不自动展开）
      hintBtn.disabled = false;
      hintBtn.textContent = '看提示';
      hintBtn.classList.add('btn-seal');
    }
  }, 100);
  // 答题时要把这个定时器停掉 —— 见上面那段说明
  const stopTimer = () => clearInterval(timer);

  const isLast = ask.left <= 0;
  return h('div', { class: 'stack', id: 'quiz-ask' },
    h('div', { class: 'between' },
      h('div', { class: 'row-tight' },
        h('span', { class: 'badge' }, STAGE_WORD[q.stage] || q.stage),
        h('span', { class: 'badge' }, q.subject),
        h('span', { class: 'tiny muted' }, DIFF_STARS[q.difficulty] || '')),
      h('span', { class: 'tiny muted mono' },
        `今天的问询还剩 ${ask.left} 次`)),
    h('div', { class: 'hand', style: { fontSize: '20px', margin: '10px 0 4px' } }, q.q),
    isLast ? h('div', { class: 'tiny muted' }, '这是今天最后一次。') : null,
    options,
    // 倒计时条：细线走到底，**提示按钮**才解锁。不写秒数 —— 写出来就成了催促，
    // 而提示本来是"帮人想起来"的东西。
    meterWrap,
    h('div', { class: 'row-tight', style: { marginTop: '8px' } }, hintBtn),
    hintBox,
    msg);
}

/** 模式切换：一个人问询 / 同问（抢答）。
 *  问询是同一个人一句一句答；同问是两个人抢同一道题（见 pages/duel.js）。
 *  两个模式共用"智力 → 提示冷却"这条机制，但**两套时间不一样**：
 *  一个人问询是 40 秒档（想清楚最重要），同问是 9 秒档（一回合只有 12 秒）。 */
function modeSwitch() {
  return h('div', { class: 'mode-row', id: 'quiz-modes' },
    h('a', { class: 'mode-tab is-current', href: '#/quiz', id: 'mode-solo' }, '一个人问询'),
    h('a', { class: 'mode-tab', href: '#/duel', id: 'mode-duel' }, '同问 · 抢答'),
    h('span', { class: 'tiny muted' }, '同问：同一道题，两个人同时答，看谁快'));
}

/** 难度基准：月塔拿哪一档来问。
 *  题量与星档都是**服务端按题库现算**的 —— 前端不许自己数题，
 *  数出来迟早和题库对不上（加了新批次就错）。
 *  每档都写着"给谁"，就是为了让人**一眼挑到自己那一档**。 */
function baselineStrip(bases, box) {
  if (!bases || !bases.list || !bases.list.length) return null;
  const row = h('div', { class: 'base-row', id: 'quiz-baselines' });
  const cur = bases.list.find((x) => x.current) || {};
  bases.list.forEach((b) => {
    row.appendChild(h('button', {
      class: 'base-chip' + (b.current ? ' is-cur' : ''),
      id: `quiz-base-${b.code}`, type: 'button', title: b.who,
      onclick: async () => {
        if (b.current) return;
        try {
          await api.quizSetBaseline(b.code);
          render(box);                 // 换档之后换一道题，让人立刻看到差别
        } catch (e) {
          console.error('[问询] 定档失败', e);
        }
      },
    },
      h('span', { class: 'base-label' }, b.label),
      h('span', { class: 'base-count tiny mono' }, `${b.count} 题`),
      h('span', { class: 'base-stars tiny muted' }, b.stars)));
  });
  return h('div', { class: 'card base-card', id: 'quiz-base-card' },
    h('div', { class: 'between' },
      h('span', { class: 'kicker' }, '月塔拿哪一档来问'),
      h('span', { class: 'tiny muted', id: 'quiz-base-now' },
        `现在是「${cur.label || ''}」· ${cur.count || 0} 题 · ${cur.stars || ''}`)),
    h('div', { class: 'small muted' }, '按自己的底子定一档，月塔就不拿超纲的题来问了。'),
    row,
    cur.who ? h('div', { class: 'tiny muted', id: 'quiz-base-who' }, cur.who) : null);
}

async function render(box) {
  const st = get();
  if (!st.account || !st.dog) {
    box.replaceChildren(
      sheetHead('月塔问询', '它问一句，你答一句'),
      h('div', { class: 'empty' },
        h('span', { class: 'hand' }, '月塔只问有编号的人。'),
        h('div', { class: 'small' }, '先去登记处领一只机械狗。'),
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
          h('a', { class: 'btn btn-seal', href: '#/adopt' }, '去领养'))));
    return;
  }
  box.replaceChildren(loading('正在接上月塔…'));
  let ask;
  let bases = null;
  try {
    // 档位拿不到不该挡住出题（那只是"挑一档"的功能），所以单独兜住
    [ask, bases] = await Promise.all([
      api.quizAsk(), api.quizBaselines().catch(() => null)]);
  } catch (e) {
    box.replaceChildren(sheetHead('月塔问询', '它问一句，你答一句'),
      errorBox(e instanceof ApiError ? e : e, () => render(box)));
    return;
  }

  const head = sheetHead('月塔问询', '它问一句，你答一句',
    h('a', { class: 'btn btn-ghost btn-sm', href: '#/tower' }, '去端口'));
  const modes = modeSwitch();
  const strip = baselineStrip(bases, box);

  if (!ask.question) {
    box.replaceChildren(h('div', { class: 'rise-in' }, head, modes, strip,
      h('div', { class: 'card' },
        h('div', { class: 'hand' }, '今天的问询用完了。'),
        h('div', { class: 'small muted', style: { marginTop: '6px' } },
          '月塔明天还会问。答对的经验已经记在它身上了。'),
        h('div', { class: 'row-tight', style: { marginTop: '12px' } },
          h('a', { class: 'btn btn-seal btn-sm', href: '#/duel' }, '去同问抢答')))));
    return;
  }
  box.replaceChildren(h('div', { class: 'rise-in' }, head, modes, strip,
    h('div', { class: 'card' }, askCard(box, ask))));
}
