/* 同问 · 好友对战：同一道题，两个人同时答，看谁快
   ============================================================
   世界观位置：月塔不只问你一个。同一句问话会**同时**递给两只狗 ——
   谁先答上来，这一回合就记在谁头上。所以这里的说法是「同问」。

   规则（用户定的）：
     · 两个人**同时**拿到同一道题（不是轮流各答各的）；
     · **谁先答对，这一回合归谁** —— 慢的那个即使答对也不算；
     · 答错这一回合就锁住（不然四个选项乱点总能蒙对）；
     · 一局 5 个回合，拿下的多的人赢；
     · **智力高的狗提示解锁得更早**（growth.js 的 duelHintMs）——
       那一两秒就是它的先手，这是"聪明"在对局里的落点。

   ⚠️ 判分、计时、提示冷却**全在服务端**（server/app/ws/quiz_routes.py）：
      前端说"是我先到的"不算数；提示也是**向服务端要**的 —— 冷却没到只会
      拿到一句"还差几秒"。所以这一页**不许自己判胜负**，
      它只负责把服务端说的话画出来（连提示还剩几秒都是服务端给的数）。

   文案铁律：不出现"玩家/选择/道具/服务器"；对面一律叫"对面"。
*/
import { h } from '../lib/dom.js';
import { api, ApiError, token } from '../lib/api.js';
import { get, set } from '../lib/store.js';
import { sheetHead, note, loading, errorBox } from '../components/ui.js';
import { pageShell } from '../components/layout.js';
/* ★ 经验走和问询/竞技场同一条链（applyExp → 本地结算 → 上报镜像） */
import { applyExp } from '../lib/exp.js';
import * as router from '../lib/router.js';

const LETTERS = 'ABCD';

/** 毫秒 → "4.7 秒"。提示冷却要念给人听，所以统一走这里。 */
const sec = (ms) => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} 秒`;
const numify = (o) => ({ 0: Number((o || {})['0'] || 0), 1: Number((o || {})['1'] || 0) });

export async function duelPage() {
  const { shell, pageEl } = pageShell({ current: '/duel' });
  const box = h('div', { class: 'stack-lg' });
  pageEl.replaceChildren(box);

  const st0 = get();
  if (!st0.account || !st0.dog) {
    box.replaceChildren(
      sheetHead('同问', '同一道题，两个人同时答'),
      h('div', { class: 'empty' },
        h('span', { class: 'hand' }, '月塔只把问话递给有编号的人。'),
        h('div', { class: 'small' }, '先去登记处领一只机械狗。'),
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
          h('a', { class: 'btn btn-seal', href: '#/adopt' }, '去领养'))));
    return shell;
  }

  /* 这一页只有一个状态源：服务端发来的消息改 S，改完重画。 */
  const S = {
    phase: 'lobby',        // lobby | waiting | playing | done | gone
    room: '', side: 0, size: 5, total: 5,
    you: null, foe: null, scores: { 0: 0, 1: 0 },
    i: -1, q: null, msLeft: 0, deadline: 0,
    hintNeedMs: 0, hintAt: 0, hintText: '', hintWaitMs: 0,
    myPick: null, locked: false, took: null, roundEnd: null,
    over: null, note: '', left: null, limit: null,
    // 这一局累计的经验与"长大了一点"那一下（和训练/竞技场/问询同一套说法）
    exp: 0, levelUp: null,
  };
  let ws = null;
  let tick = null;
  let disposed = false;

  const send = (obj) => {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch (e) { /* 断了就算了 */ }
    }
  };

  const stopTick = () => { if (tick) { clearInterval(tick); tick = null; } };

  const closeWs = (say) => {
    stopTick();
    if (ws) {
      try { ws.send(JSON.stringify({ type: 'leave' })); } catch (e) { /* 已经断了 */ }
      try { ws.close(); } catch (e) { /* 已经断了 */ }
      ws = null;
    }
    if (say) S.note = say;
  };
  // 切页要把连接收掉：不然房间那边会一直挂着一个人
  router.onDispose(shell, () => { disposed = true; closeWs(); });

  /* ---------------- 画 ---------------- */
  const head = () => sheetHead('同问', '同一道题，两个人同时答 —— 谁先答对，这一回合归谁',
    h('a', { class: 'btn btn-ghost btn-sm', href: '#/quiz' }, '一个人问询'),
    h('a', { class: 'btn btn-ghost btn-sm', href: '#/tower' }, '去端口'));

  const sideCard = (who, me) => h('div', { class: 'duel-side' + (me ? ' is-me' : '') },
    h('div', { class: 'duel-name' }, (who && who.name) || (me ? '你' : '等对面')),
    h('div', { class: 'tiny muted' },
      who
        ? `智力 ${who.wisdom} · 提示 ${sec(who.hint_ms)}`
        : '还没进来'),
    h('div', { class: 'duel-num', id: me ? 'duel-my-score' : 'duel-foe-score' },
      String(S.scores[me ? S.side : 1 - S.side] || 0)));

  const meter = () => h('div', { class: 'hint-meter' }, h('i', { id: 'duel-meter' }));

  const hintBox = () => h('div', { class: 'hint-slip' + (S.hintText ? ' is-on' : ''), id: 'duel-hint' },
    S.hintText ? h('span', { class: 'kicker' }, '提示') : null,
    S.hintText ? h('span', { style: { marginLeft: '8px' } }, S.hintText) : null);

  /** 要提示：**向服务端要**，不是自己摊开。
   *  冷却没到的话服务端只会回一句"还差几秒" —— 所以这个按钮点了不一定有提示，
   *  这是故意的：改前端也偷不到提示，智力换来的那几秒才值钱。 */
  const askHint = () => {
    if (!S.q || S.roundEnd || S.myPick !== null) return;
    send({ type: 'hint' });
  };

  const hintBtn = () => {
    const answered = S.myPick !== null;
    return h('button', {
      class: 'btn btn-ghost btn-sm', id: 'duel-hint-btn',
      disabled: true,                      // 解锁由 tick 按服务端给的冷却控制
      'data-answered': answered ? '1' : '0',
      onclick: askHint,
    }, answered ? '这一回合答过了' : '先想一想…');
  };

  const questionView = () => {
    const opts = h('div', { class: 'stack-sm', id: 'duel-options' });
    (S.q.options || []).forEach((text, i) => {
      opts.appendChild(h('button', {
        class: 'quiz-opt' + (S.myPick === i ? ' is-pick' : ''),
        'data-idx': i, id: `duel-opt-${i}`,
        disabled: S.myPick !== null,
        onclick: () => answer(i),
      }, h('span', { class: 'quiz-key' }, LETTERS[i]), h('span', null, text)));
    });
    return h('div', { class: 'card stack', id: 'duel-question' },
      h('div', { class: 'between' },
        h('div', { class: 'row-tight' },
          h('span', { class: 'badge' }, S.q.subject || ''),
          h('span', { class: 'badge' }, S.q.stage || ''),
          h('span', { class: 'tiny muted' }, '★'.repeat(Number(S.q.difficulty) || 1))),
        h('span', { class: 'tiny muted mono', id: 'duel-round' },
          `第 ${S.i + 1} / ${S.total} 回合`)),
      h('div', { class: 'hand', style: { fontSize: '20px', margin: '6px 0 2px' } }, S.q.q),
      opts,
      meter(),
      h('div', { class: 'row-tight', style: { marginTop: '8px' } }, hintBtn()),
      hintBox());
  };

  const roundEndView = () => {
    const re = S.roundEnd || {};
    const ans = re.answers || {};
    // ⚠️ 不能写 `ans[side] || {}` 再判真假 —— **空对象在 JS 里是真值**，
    //    于是"这一回合没作答"会被画成"答错了 · 0.0 秒"（我第一版就是这样，
    //    页面上凭空出现一个不存在的对手作答）。判据要落到字段上。
    const pick = (a) => (a && typeof a.ms === 'number' ? a : null);
    const mine = pick(ans[String(S.side)]);
    const theirs = pick(ans[String(1 - S.side)]);
    const won = re.winner_side === S.side;
    const lost = re.winner_side !== null && re.winner_side !== S.side;
    const line = (who, a) => a
      ? `${who}：${a.correct ? '答对了' : '答错了'} · ${sec(a.ms)}`
      : `${who}：没赶上`;
    return h('div', { class: 'card stack rise-in', id: 'duel-round-end' },
      h('div', { class: 'card-title' },
        h('span', { class: 'kicker' },
          won ? '这一回合归你' : (lost ? '这一回合归对面' : '这一回合谁也没拿到'))),
      h('div', { class: 'small mono muted' },
        line('你', mine) + '　|　' + line('对面', theirs)),
      h('div', { style: { marginTop: '6px' } },
        h('span', { class: 'kicker' }, '答案'),
        h('span', { style: { marginLeft: '6px' } },
          LETTERS[re.answer] != null ? `${LETTERS[re.answer]}．${(S.q.options || [])[re.answer] || ''}` : '')),
      re.why ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, re.why) : null,
      h('div', { class: 'tiny muted', style: { marginTop: '8px' } }, '下一题马上来…'));
  };

  const resultView = () => {
    const o = S.over || {};
    const verdict = o.verdict === 'win' ? '这一局你赢了' : (o.verdict === 'lose' ? '这一局它赢了' : '两边打平');
    return h('div', { class: 'card stack rise-in', id: 'duel-result' },
      h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, verdict)),
      h('div', { class: 'hand', style: { fontSize: '22px' } }, `${o.mine} : ${o.theirs}`),
      h('div', { class: 'small muted' }, o.text || ''),
      o.exp > 0 ? h('div', { class: 'small' }, `这一局记下 ${o.exp} 点经验。`) : null,
      S.levelUp
        ? h('div', { class: 'small', id: 'duel-levelup' },
            `它又长大了一点。LV.${S.levelUp.from} → LV.${S.levelUp.level}`)
        : null,
      h('div', { class: 'duel-rounds' },
        ...(o.rounds || []).map((r) => {
          const a = (r.answers || {})[String(S.side)] || {};
          const b = (r.answers || {})[String(1 - S.side)] || {};
          const w = r.winner_side === S.side ? '你' : (r.winner_side === null ? '都没拿到' : '对面');
          return h('div', { class: 'duel-round-line tiny' },
            `第 ${r.i + 1} 回合：${w}` +
            (a.ms ? `（你 ${sec(a.ms)}${a.correct ? ' 答对' : ' 答错'}｜对面 ${b.ms ? sec(b.ms) : '—'}）` : ''));
        })),
      h('div', { class: 'row-tight', style: { marginTop: '12px' } },
        h('button', { class: 'btn btn-seal', id: 'duel-again', onclick: () => renderLobby() }, '再来一局'),
        h('a', { class: 'btn btn-ghost', href: '#/quiz' }, '去一个人问询')));
  };

  const statusLine = () => {
    if (S.note) return S.note;
    if (S.phase === 'waiting') {
      // ⚠️ 这里是"房间已经开好了、正在等人"，不是"正在进房" ——
      //    房一开就该把码亮出来念给对面，等对面的时候人是要盯着这串码的。
      return S.room ? `房间 ${S.room} —— 把这串码念给对面。` : '正在进房…';
    }
    if (S.phase === 'playing') return `第 ${S.i + 1} / ${S.total} 回合 —— 谁先答对，这一回合归谁`;
    if (S.phase === 'done') return '这一局打完了。';
    if (S.phase === 'gone') return '这一局散了。';
    return '';
  };

  const matchView = () => h('div', { class: 'stack', id: 'duel-match' },
    h('div', { class: 'duel-board' },
      sideCard(S.you, true),
      h('div', { class: 'duel-vs' },
        h('div', { class: 'duel-vs-word' }, '同问'),
        S.room ? h('div', { class: 'duel-room tiny mono', id: 'duel-room-code' }, S.room) : null),
      sideCard(S.foe, false)),
    h('div', { class: 'small mono muted', id: 'duel-status' }, statusLine()),
    S.over ? resultView()
      : (S.roundEnd ? roundEndView()
        : (S.q ? questionView()
          : h('div', { class: 'empty' },
              h('span', { class: 'hand' },
                S.phase === 'waiting' ? '等对面进来…' : '等月塔递题…'),
              h('div', { class: 'small' },
                S.phase === 'waiting' ? '对面在它自己的册子上输这串码就能进来。' : '')))),
    h('div', { class: 'row-tight' },
      S.phase === 'waiting' || S.phase === 'playing'
        ? h('button', { class: 'btn btn-ghost btn-sm', id: 'duel-cancel',
            onclick: () => { closeWs(); S.room = ''; S.q = null; renderLobby(); } }, '不打了')
        : null,
      S.phase === 'gone' || S.phase === 'done'
        ? h('button', { class: 'btn btn-seal btn-sm', id: 'duel-back',
            onclick: () => renderLobby() }, '回到选择')
        : null));

  const paintMatch = () => {
    if (disposed || S.phase === 'lobby') return;
    box.replaceChildren(h('div', { class: 'rise-in' }, head(), matchView()));
    startTick();
  };

  /** 倒计时线 + 提示解锁。两者都**只按服务端给的数**走。 */
  const startTick = () => {
    stopTick();
    tick = setInterval(() => {
      const el = document.getElementById('duel-meter');
      if (!el) return;
      if (!S.deadline || S.roundEnd) { el.style.width = S.roundEnd ? '100%' : '0%'; return; }
      const left = S.deadline - performance.now();
      el.style.width = `${Math.min(100, Math.max(0, (1 - left / (S.msLeft || 12000)) * 100)).toFixed(1)}%`;
      const btn = document.getElementById('duel-hint-btn');
      if (btn && btn.disabled && S.myPick === null && S.hintAt && performance.now() >= S.hintAt) {
        btn.disabled = false;
        btn.textContent = S.hintText ? '看过提示了' : '看提示';
        btn.classList.add('btn-seal');
      }
    }, 100);
  };

  /* ---------------- 服务端说话 ---------------- */
  const onMsg = (m) => {
    const kind = m && m.type;
    if (kind === 'welcome') {
      S.side = Number(m.side) || 0;
      S.size = Number(m.size) || 5;
      S.total = S.size;
      S.you = m.you || null;
      S.foe = m.foe || null;
      S.scores = numify(m.scores);
      S.phase = m.started ? 'playing' : 'waiting';
      S.note = m.started ? '' : '';
    } else if (kind === 'peer_joined') {
      if (m.foe) S.foe = m.foe;
      S.note = `${m.name || '对面'} 进来了。`;
    } else if (kind === 'go') {
      S.phase = 'playing';
      S.scores = numify(m.scores);
      S.note = '';
    } else if (kind === 'round') {
      S.i = Number(m.i) || 0;
      S.total = Number(m.total) || S.size;
      S.q = m.question || null;
      S.msLeft = Number(m.ms_left) || 12000;
      S.deadline = performance.now() + S.msLeft;
      S.hintNeedMs = Number(m.hint_ms) || 0;
      S.hintAt = performance.now() + S.hintNeedMs;
      S.hintText = '';
      S.myPick = null;
      S.locked = false;
      S.took = null;
      S.roundEnd = null;
      S.scores = numify(m.scores);
      if (m.you) S.you = m.you;
      if (m.foe) S.foe = m.foe;
      S.note = '';
    } else if (kind === 'took') {
      S.took = m;
      if (m.side !== S.side && m.correct) S.note = '对面先答对了 —— 这一回合没了。';
    } else if (kind === 'my_exp') {
      gainExp(Number(m.exp) || 0);
    } else if (kind === 'round_end') {
      S.roundEnd = m;
      S.scores = numify(m.scores);
      S.locked = true;
      S.deadline = 0;
      S.note = '';
    } else if (kind === 'hint') {
      S.hintText = m.text || '';
      S.hintWaitMs = 0;
    } else if (kind === 'hint_locked') {
      S.note = m.text || `提示还差 ${sec(m.in_ms)} 才解锁。`;
    } else if (kind === 'late') {
      S.note = m.text || '';
    } else if (kind === 'my_exp') {
      // 上面处理过了，这里只是保持分支完整
    } else if (kind === 'over') {
      S.over = m;
      S.phase = 'done';
      S.scores = numify(m.scores);
      S.note = '';
    } else if (kind === 'peer_left') {
      S.phase = 'gone';
      S.note = m.text || '对面走了，这一局不算。';
    } else if (kind === 'error') {
      S.note = m.detail || '月塔说这条不算。';
    }
    if (kind !== 'my_exp') paintMatch();
  };

  /** 答对一样记经验：走本地结算那条链，再上报镜像（和问询/训练/竞技场同一套）。
   *  ⚠️ 升级那一下**要说出来** —— 训练关、竞技场、问询三处都会报
   *     "它又长大了一点。LV.x → LV.y"，这里原来只加经验不吭声，
   *     等于把养成里最要紧的那个时刻吞掉了。 */
  const gainExp = (exp) => {
    if (!(exp > 0)) return;
    const dog = get().dog;
    if (!dog) return;
    const gain = applyExp(dog, exp);
    S.exp += exp;
    if (gain.leveledUp) S.levelUp = { from: gain.from, level: gain.level };
    set({ dog: { ...dog, level: gain.level, total_exp: gain.total_exp } });
    api.updateMine({ level: gain.level, total_exp: gain.total_exp }).catch(() => {});
  };

  const connect = (room) => {
    closeWs();
    S.room = room;
    S.over = null;
    S.q = null;
    S.roundEnd = null;
    S.myPick = null;
    S.exp = 0;
    S.levelUp = null;
    S.phase = 'waiting';
    S.note = '';
    paintMatch();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws/quiz/${encodeURIComponent(room)}` +
      `?token=${encodeURIComponent(token.get() || '')}`;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      S.phase = 'gone';
      S.note = '接不上月塔。';
      paintMatch();
      return;
    }
    ws.onmessage = (ev) => {
      let m = null;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      onMsg(m);
    };
    ws.onerror = () => { S.note = '这条线不太顺 —— 房间还在的话，重进一次。'; paintMatch(); };
    ws.onclose = () => {
      if (disposed) return;
      ws = null;
      stopTick();
      if (S.phase === 'waiting' || S.phase === 'playing') {
        S.phase = 'gone';
        S.note = S.note || '连接断了 —— 对面那边也会散场。';
        paintMatch();
      }
    };
  };

  const answer = (i) => {
    if (S.myPick !== null || S.roundEnd || S.phase !== 'playing') return;
    S.myPick = i;
    S.note = '';
    paintMatch();
    send({ type: 'answer', i: S.i, choice: i });
  };

  /* ---------------- 等着开局的那一屏 ---------------- */
  async function renderLobby() {
    closeWs();
    S.phase = 'lobby';
    S.over = null;
    S.q = null;
    S.roundEnd = null;
    S.myPick = null;
    S.exp = 0;
    S.levelUp = null;
    S.note = '';
    box.replaceChildren(head(), loading('正在问月塔…'));
    let data = null;
    let rec = null;
    try {
      [data, rec] = await Promise.all([api.duelOpponents(), api.duelRecord()]);
    } catch (e) {
      box.replaceChildren(head(), errorBox(e instanceof ApiError ? e : e, renderLobby));
      return;
    }
    if (disposed) return;
    S.left = rec.left;
    S.limit = rec.limit;

    const me = data.me || {};
    const npcRow = h('div', { class: 'npc-row', id: 'duel-npcs' });
    (data.npc || []).forEach((d) => {
      npcRow.appendChild(h('button', {
        class: 'npc-card', id: `duel-npc-${d.dog_id}`, type: 'button',
        onclick: () => open('npc', d.dog_id),
      },
        h('div', { class: 'npc-name' }, d.name),
        h('div', { class: 'tiny muted' }, `${d.breed_name} · LV.${d.level}`),
        h('div', { class: 'tiny' }, `智力 ${d.wisdom} · ${d.style}`),
        h('div', { class: 'tiny muted' }, `提示 ${sec(d.hint_ms)} 解锁`)));
    });

    const joinInput = h('input', {
      class: 'join-input', id: 'duel-join-input', maxlength: '5',
      placeholder: '房间码', autocomplete: 'off',
      onkeydown: (e) => { if (e.key === 'Enter') doJoin(); },
    });

    /* 名册上的真人：点它 = 开一间**留给它**的房（座位占住，别人进不来）。
       对方那一屏会看到"某某开了一间房等你"，点一下就进来 —— 不用念房间码。
       为什么要留这条路：房间码得靠嘴传（念错一位就进不去），
       而"我找谁打"这件事在名册上本来就是现成的。 */
    const friendRow = (data.friends || []).length
      ? h('div', { class: 'npc-row', id: 'duel-friends' },
          ...(data.friends || []).map((d) => h('button', {
            class: 'npc-card', id: `duel-friend-${d.dog_id}`, type: 'button',
            onclick: () => open('friend', d.dog_id),
          },
            h('div', { class: 'npc-name' }, d.name),
            h('div', { class: 'tiny muted' }, `${d.breed_name || '—'} · LV.${d.level}`),
            h('div', { class: 'tiny' }, `智力 ${d.wisdom} · ${d.style}`),
            h('div', { class: 'tiny muted' }, '点它就是把这间房留给它'))))
      : null;

    const doJoin = async () => {
      const code = (joinInput.value || '').trim().toUpperCase();
      if (!code) return;
      try {
        const r = await api.duelJoin(code);
        connect(r.room);
      } catch (e) {
        S.note = e instanceof ApiError && e.status === 404
          ? '没有这个房间 —— 码对不对？'
          : (e.message || '进不去这间房。');
        const n = document.getElementById('duel-lobby-note');
        if (n) n.replaceChildren(note(S.note, 'warn'));
      }
    };

    const open = async (mode, dogId) => {
      try {
        const r = await api.duelOpen(mode, dogId || null);
        connect(r.room);
      } catch (e) {
        S.note = e instanceof ApiError && e.status === 409
          ? '今天开的局已经够多了 —— 明天再来。' : (e.message || '开不了房。');
        const n = document.getElementById('duel-lobby-note');
        if (n) n.replaceChildren(note(S.note, 'warn'));
      }
    };

    const invites = (data.invites || []).length
      ? h('div', { class: 'stack-sm', id: 'duel-invites' },
          ...(data.invites || []).map((iv) => h('div', { class: 'card' },
            h('div', { class: 'between' },
              h('span', null, `「${(iv.challenger || {}).name || '有人'}」开了一间房，等你进来。`),
              h('button', {
                class: 'btn btn-seal btn-sm', id: `duel-invite-${iv.id}`,
                onclick: () => connect(iv.room),
              }, '进去'))) ))
      : null;

    box.replaceChildren(h('div', { class: 'rise-in' }, head(),
      h('div', { class: 'card stack', id: 'duel-lobby' },
        h('div', { class: 'between' },
          h('div', null,
            h('div', { class: 'hand', style: { fontSize: '18px' } }, '同一道题，两个人同时答'),
            h('div', { class: 'small muted' },
              '谁先答对，这一回合就记在谁头上。答错这一回合就锁住了 —— 不能乱点。')),
          h('div', { class: 'tiny muted mono' },
            S.left == null ? '' : `今天还能开 ${S.left} / ${S.limit} 局 · 一局 ${data.size} 回合`)),
        h('div', { class: 'note' },
          h('span', null,
            `你的提示：${sec(me.hint_ms)} 解锁（智力 ${me.wisdom}）。`),
          h('span', { class: 'muted' },
            ' 智力越高解锁得越早 —— 抢先手就早在这几秒。')),
        invites,
        h('div', { class: 'divider' }),
        h('div', { class: 'kicker' }, '找一只模拟体对一局'),
        h('div', { class: 'small muted' }, '它不用等人，你一进去它就开答。脑子越好使的，答得又快又准。'),
        npcRow,
        h('div', { class: 'divider' }),
        h('div', { class: 'kicker' }, '找一只狗，把这间房留给它'),
        h('div', { class: 'small muted' },
          '点一下就是开一间留给它的房 —— 它那边会看到"等你进来"，不用念房间码。'),
        friendRow || h('div', { class: 'small muted', id: 'duel-friends-none' },
          '名册上还没有别的狗。先把房间码念给对面也一样能打。'),
        h('div', { class: 'divider' }),
        h('div', { class: 'kicker' }, '等好友进来'),
        h('div', { class: 'row-tight' },
          h('button', { class: 'btn btn-seal', id: 'duel-open-btn',
            onclick: () => open('friend', null) }, '开一间房'),
          h('span', { class: 'small muted' }, '开好之后把这串码念给对面，它在自己的册子上输进去。')),
        h('div', { class: 'row-tight' },
          joinInput,
          h('button', { class: 'btn', id: 'duel-join-btn', onclick: doJoin }, '进这间房')),
        h('div', { id: 'duel-lobby-note' }, S.note ? note(S.note, 'warn') : null)),
      recordCard(rec)));
  }

  const recordCard = (rec) => h('div', { class: 'card', id: 'duel-record' },
    h('div', { class: 'between' },
      h('span', { class: 'kicker' }, '同问战绩'),
      h('span', { class: 'tiny mono muted' },
        `${rec.wins} 胜 · ${rec.losses} 负 · ${rec.draws} 平`)),
    (rec.recent || []).length
      ? h('div', { class: 'stack-sm', style: { marginTop: '8px' } },
          ...(rec.recent || []).map((r) => h('div', { class: 'between tiny' },
            h('span', null,
              `${r.verdict === 'win' ? '赢' : (r.verdict === 'lose' ? '输' : '平')}　` +
              `${(r.foe || {}).name || '对面'}${(r.foe || {}).is_npc ? '（模拟体）' : ''}`),
            h('span', { class: 'mono muted' }, `${r.mine} : ${r.theirs}　${r.baseline_label || ''}`))))
      : h('div', { class: 'small muted', style: { marginTop: '6px' } },
          '还没对过局。第一次会记在这里。'));

  await renderLobby();
  return shell;
}
