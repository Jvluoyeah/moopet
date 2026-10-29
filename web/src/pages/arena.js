/* 竞技场：横板对战（v2 替换掉原来的俯视竞技场）
   ------------------------------------------------------------
   三种模式走**同一条代码路径**（game/net.js 的 LockstepSession）：
     ai      —— 对手输入由本地 ai.js 产生
     shadow  —— 同上，只是对手的品种/等级取自社群里另一只狗
     pvp     —— 对手输入从 WebSocket 来（服务端只转发，不跑模拟）
   区别只在"远端输入从哪来"，所以掉线接管就是把源换成 AI，不需要另写一套。

   规则全在 game/sim.js（纯整数、无随机、可回放）；
   画面在 game/stage.js（侧视正交 + 分层视差 + 顿帧抖动）；
   HUD 在 game/hud.js（羊皮纸分区）。这个文件只负责"把三者串起来 + 联机"。

   操作：A/D 或 ←/→ 移动，W / 空格 跳，J 普攻（可三连），K / Shift 冲刺，
        L / S 防御，1~4 放技能。
   */

import { h, withBusy } from '../lib/dom.js';
import { api, ApiError } from '../lib/api.js';
import { get, set, breedOf } from '../lib/store.js';
import { sheetHead, note, errorBox, loading } from '../components/ui.js';
import { pageShell } from '../components/layout.js';
import { onDispose } from '../lib/router.js';
import { portraitSVG } from '../lib/breedArt.js';
import { formAsset } from '../lib/breedAssets.js';

/** 头像：用真实形象图（public/breeds/<code>/forms/face.png）。
 *  没切过图的品种 <img> 会 404 → 浏览器显示裂图，所以退回到通用路径即可，
 *  HUD 那边用的是固定 44px 的方框，空着也不难看。 */
function faceOf(code) {
  if (!code) return '';
  const a = formAsset(code, { form: 'face' });
  return { url: a.kind === 'image' ? a.url : `breeds/${code}/forms/face.png`, alt: code };
}
import { dogTexture } from '../world/actors.js';
import { MatchSocket } from '../lib/ws.js';
import { AuthoritySessionShim } from '../game/authority.js';

/* ================= 权威模式（方案 C）现在是 **默认** =================
   PvP 走服务端权威：服务端跑唯一一份模拟，客户端只发输入、收快照 ——
   **不用等对手**。锁步那条路的毛病就是"双方都要等最慢的那一方"，
   玩家感受到的是"加入房间的一方很卡"。

   回退开关：`#/arena?auth=0` 走回锁步。
   为什么留它：锁步那条被 21 项双浏览器 e2e 压着，是已验证的资产；
   真出问题时能"一条 URL 切回去对照"，比现场 debug 值钱得多。

   ⚠️ 判据必须写成**函数**，不能写成模块级常量。
   模块只在页面第一次 import 时求值一次，而那时 hash 还是 `#/login` ——
   之后切到 `#/arena` 只是 hash 变化，**模块不会重新加载**，常量永远是旧值。
   （实测过一次：两端跑在两套协议上，一半在跑一半卡死。）
   `auth=0` 显式关掉；没写就用默认（开）。 */
const authOn = () => {
  if (typeof location === 'undefined') return false;
  if (/auth=0/.test(location.hash)) return false;   // 显式回退
  return true;                                      // 默认：权威
};
const predictOn = () => authOn() && /predict=1/.test(location.hash);
import { attachFullscreen } from '../lib/fullscreen.js';
/* ★ 本地结算：服务端只记"本局应得经验"，等级由本地算（见 src/lib/exp.js） */
import { applyExp } from '../lib/exp.js';

/* 引擎：**只有一份** —— simAB（abstract-brawl 的定点化移植，128Hz）。
   ============================================================
   原来这里有个 `?engine=legacy` 开关能切回旧引擎 sim.js，用来做对照。
   现在旧引擎已经删掉了：留着两份实现，任何一处"忘了传引擎"都会静默退回旧的那份，
   而两边的状态字段对不上 —— 表现是"页面用新引擎读、会话里跑旧的"，
   历史上为这个挂过三项 e2e，查了很久。

   **一份实现、一处真相。** 需要对照时用 git 历史，不要用开关。 */
import * as SIM_AB from '../game/simAB.js';

const SIM = SIM_AB;
import { LockstepSession } from '../game/net.js';
import { SideStage } from '../game/stage.js';
import { actionFrames, preloadActions, preloadBreedArt } from '../lib/breedAssets.js';
import { pickPose } from '../game/pose.js';
import { createInterp } from '../game/interp.js';
import { createTouchPad, isTouchDevice } from '../game/touch.js';
import { createBattleHud } from '../game/hud.js';

const { BTN, ROUND_TICKS, TICK_HZ, STAGE_W, STAGE_H } = SIM;

/** HUD 的招式表。引擎直接提供（六招），hud.js 不用认识任何具体引擎。 */
const HUD_SKILLS = SIM.HUD_SKILLS;

/* 招式键位。**必须和 HUD 钮上的标签一致** ——
   HUD 写 J/K/U/I/O/L，键盘就得认这些字母；
   只认数字的话，玩家照着钮上的字按是没反应的。
   数字键作为"不想记键位"的备选一起保留。 */
const KEY_SKILL = ['1', '2', '3', '4', '5', '6'];
const KEY_SKILL_AB = ['j', 'k', 'u', 'i', 'o', 'l'];

/** 输入日志指纹：两端对不上哈希时，用它区分"输入没同步"还是"模拟不确定" */
function inputLogHash(log) {
  if (!log || !log.length) return 0;
  let h = 2166136261 >>> 0;
  for (const row of log) {
    for (const v of [row.frame, row[0]?.mx, row[0]?.atk, row[0]?.btn,
                     row[1]?.mx, row[1]?.atk, row[1]?.btn]) {
      h ^= (Number(v) | 0) >>> 0;
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h >>> 0;
}

export async function arenaPage() {
  await Promise.all([
    preloadBreedArt().catch(() => {}),
    preloadActions().catch(() => {}),   // 动作帧：只有出过图的品种才有，没有就跳过
  ]);
  const st = get();
  const { shell, pageEl } = pageShell({ current: '/arena', withAside: false });

  if (!st.account || !st.dog) {
    pageEl.replaceChildren(
      sheetHead('竞技场', '和同类打一场。闸机后的规则：免伤自检，输了不会真的坏掉。'),
      h('div', { class: 'empty' },
        h('span', { class: 'hand' }, '闸机不开。册子上还没有编号。'),
        h('div', { class: 'small' }, '登录并领养一只机械狗，就能进竞技场。'),
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
          h('a', { class: 'btn btn-seal', href: '#/adopt' }, '去领养'))));
    return shell;
  }

  const stage = h('div', { class: 'battle-stage', id: 'arena-stage' });
  const wrap = h('div', { class: 'battle-wrap', id: 'arena-wrap' }, stage, h('div', { class: 'battle-hud', id: 'arena-hud' }));
  const hudHost = wrap.lastChild;
  const panel = h('div', { class: 'stack' });

  pageEl.replaceChildren(
    // 页头副标题只说**玩家需要知道的**（键位）。
    // 原来写的是"侧视视差 · 确定性锁步 · 六招制"——那是开发者语言，
    // 玩家不关心你用什么引擎、锁不锁步。
    sheetHead('竞技场', 'J 轻击 · K 重击 · U 突进 · I 升龙 · O 治愈 · L 必杀',
      h('button', { class: 'btn btn-sm btn-ghost', id: 'arena-fullscreen',
                    title: '全屏（F）', onclick: () => game.toggleFullscreen() }, '全屏'),
      h('span', { class: 'small muted', id: 'arena-status' }, '待开始')),
    // 竖屏提示：横板对战在竖屏手机上摆不开，只显示"请横过来"
    h('div', { class: 'rotate-hint' },
      /* 这里原来是个 📱 emoji —— 全站是羊皮纸/墨线，emoji 会跳出来。
         而且竖屏现在已经能打了（见 responsive.css），这条提示基本不会出现，
         所以不另画图标，去掉即可。 */
      h('div', { class: 't' }, '把手机横过来'),
      h('div', { class: 'small' }, '横板对战需要宽一点的画面')),
    h('div', { class: 'battle-layout' },
      wrap,
      panel),
    /* 说明只写**玩家要知道的**：怎么操作、规则是什么。
       原来这里写着"规则全在 game/simAB.js（纯整数定点、无随机，128Hz）……
       联机时两端各跑同一份模拟"——那是开发者语言。玩家不关心你用什么引擎、
       多少赫兹、锁不锁步，那些是给我自己看的，不该出现在对战界面上。 */
    h('div', { class: 'note', style: { marginTop: '14px' } },
      // ⚠️ 这行要和 HUD_SKILLS 的招式名**保持一致**：
      //    O 从「飞弹」改成「治愈」时我只改了 HUD，漏了这行说明，
      //    于是界面上一半写"治愈"、一半还写着"飞弹"（用户截图指出）。
      '操作：A / D 移动，W 或空格 跳，J 轻击 · K 重击 · U 突进 · I 升龙 · O 治愈 · L 必杀。',
      '防御键按住不放，被打破防会有一段硬直。气攒满 100 才能放必杀。',
      'O 治愈：回多少血看体力（单次最多 80），花多少气看敏捷 —— 气不够就放不出来。'));

  const game = new ArenaGame(stage, hudHost, panel, wrap);
  game.start();
  window.__arena = game;
  return onDispose(shell, () => {
    if (window.__arena === game) delete window.__arena;
    game.dispose();
  });
}

class ArenaGame {
  constructor(stage, hudHost, panel, wrap) {
    this.stage = stage;
    this.wrap = wrap || stage;    // 全屏要的是整块 wrap（含 HUD），不是 stage
    this.hudHost = hudHost;
    this.panel = panel;
    this.keys = new Set();
    this.raf = 0;
    this.session = null;
    this.socket = null;
    this.mode = 'ai';
    this.room = null;
    this.myDog = get().dog;
    this.foe = null;
    this.reported = false;
    this.poller = 0;
    this.pendingInputs = [];
    this.mySide = null;
    this.side = 0;

    this.view = new SideStage(stage, {
      stageW: STAGE_W, viewH: 660,
      // 竞技场专用背景：public/backdrops/arena-hall.jpg（月光竞技场那张大厅图）
      // ⚠️ SideStage 是**道场/训练关卡也共用**的，所以背景必须显式传，
      //    不能写死在 stage.js 里，否则另外两个页面也变成大厅了。
      backdrop: 'arena-hall',
      // 姿态贴图由 dogTexture 提供（它优先取用户提供的真实形象，没图退回 SVG）
      textureFor: (code, form) => (code ? dogTexture(breedOf(code), 1, 'print', form) : null),
    });
    // ⚠️ 技能表和节拍都从**当前引擎**取，不能写死。
    //    旧引擎是 4 招 @30Hz，新引擎是 6 招 @128Hz ——
    //    写死的话换了引擎界面上什么都看不出来（HUD 原来就是这么写死的）。
    this.hud = createBattleHud(hudHost, {
      skills: HUD_SKILLS,
      tickHz: TICK_HZ,
      onSkill: (i) => this.pressSkill(i),
    });
    this._bindKeys();
    this._setupTouch();
    this._setupFullscreen();
    this.hud.setAvatars(faceOf(this.myDog.breed_code), '');
    this.hud.setNames(this.myDog.name, '待入场');
    this.hitstopF = 0;
    this.slowmoF = 0;
    // 渲染插值：128Hz 模拟跑在 60Hz 屏幕上
    this.interp = createInterp();
    this.renderMenu();
    this._loop = this._loop.bind(this);
  }

  // ---------------- 输入 ----------------
  _bindKeys() {
    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
      // 数字键和字母键都认（字母是钮上标的那套）
      let si = KEY_SKILL.indexOf(k);
      if (si < 0) si = KEY_SKILL_AB.indexOf(k);
      if (si >= 0) this.pressSkill(si);
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /**
   * 放第 i 招。**排队，不是覆盖。**
   *
   * ⚠️ 原来只有一个槽 `this._skillLatch = { idx, until }` ——
   *    同时按 K 和 I 时，后按的会把先按的**覆盖掉**，
   *    于是"多键一起按就触发不了"（用户报的 D+K+I 场景）。
   *    改成队列：按下的都排进去，每帧取最老的一个放出去，
   *    超过 150ms 还没轮到的就丢掉。
   *
   * 为什么闩锁是 150ms 而不是"下一帧吃掉"：
   *    readInput() 每帧都会被调，但 pumpLocal 只有在固定步长累加器够了的时候
   *    才真的产出一帧输入 —— 一次性脉冲正好落在"这一帧不产出输入"的调用上
   *    就会被吞掉，表现是"按了没反应"。
   */
  pressSkill(i) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this._skillQueue) this._skillQueue = [];
    // 同一个键连按不重复排（按住不放会不停触发 keydown）
    const last = this._skillQueue[this._skillQueue.length - 1];
    if (last && last.idx === i && now - last.at < 60) return;
    /* 缓冲窗口 **120ms**（原来是 700ms）。
       700ms 太长：按键之后如果当时出不了招（硬直/收招中），
       它会**在 0.7 秒后自己放出来** —— 玩家的感受是
       "我没按啊，怎么自己出招了"（用户原话："都不知道怎么按出来的"）。

       输入缓冲的本意是"按键别丢"，不是"替玩家记 0.7 秒的账"。
       120ms 约等于两个渲染帧，够吸收一帧的采样延迟，
       又不至于让人觉得这一招是它自己放的。 */
    const BUFFER_MS = 120;
    this._skillQueue.push({ idx: i, until: now + BUFFER_MS, at: now });
    if (this._skillQueue.length > 4) this._skillQueue.shift();
  }

  /**
   * 这一帧要放第几招；没有就 -1。
   *
   * ⚠️ **只看不取**（peek，不是 pop）。
   *    原来这里是 `return q.shift().idx` —— 取走了但引擎可能**放不出来**：
   *    轻击要 258ms，这期间 `canAttack` 因为"出招中"一律拒绝，
   *    于是排在后面的 K/U/I 被挨个取走、又挨个丢掉 ——
   *    实测"四个键一起按只放出 1 个"。
   *
   *    现在只有**引擎真的起手了**才把它从队列拿走（见 ackSkill），
   *    排在后面的会一直等到轮到自己。
   */
  _skillIndex() {
    const q = this._skillQueue;
    if (!q || !q.length) return -1;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    while (q.length && now >= q[0].until) q.shift();   // 丢掉等太久的
    if (!q.length) return -1;
    return q[0].idx;
  }

  /**
   * 确认起手，把队列头拿走。
   * @param st 引擎状态；拿它的 units[我的座位].attack.index 和队列头比对。
   */
  ackSkill(st) {
    const q = this._skillQueue;
    if (!q || !q.length || !st || !st.units) return;
    /* ⚠️ 座位号必须是个**数字**。
       dojo 那边的 `this.side` 被传成了右侧面板的 DOM 节点
       （`side` 这个参数名和"玩家座位"撞车了），于是
       `st.units[<DOM元素>]` → undefined → 这个函数**从来没生效过**，
       队列里的招只能靠过期清掉 —— 表现就是"按下的招滞后一拍"。
       现在优先用 mySide（明确声明），没有再退回 0。 */
    const seat = Number.isInteger(this.mySide) ? this.mySide
      : (Number.isInteger(this.side) ? this.side : 0);
    const me = st.units[seat];
    if (me && me.attack && me.attack.index === q[0].idx) q.shift();
  }

  /**
   * 触控层。只在触屏设备上挂，走同一条输入路径（写 keys + pressSkill）。
   */
  _setupTouch() {
    if (!isTouchDevice()) return;
    document.body.classList.add('is-touch');
    document.body.classList.add('is-battle');
    /* ⚠️ 挂在 `document.body` 上，**不能挂在 this.wrap 里**：
       CSS 的 `position: fixed` 一旦祖先带 transform，就以那个祖先为包含块
       （页面外壳 .sheet 的入场动画留了个单位矩阵 transform），
       挂里面时按钮会被困在文档里、跑到屏幕外面去 —— 拇指够不着。 */
    this._touch = createTouchPad(document.body, {
      skillCount: HUD_SKILLS.length,
      /* ⚠️ 触控层上显示**招式中文名**，不是键盘字母。
         手机上没有键盘，"J/K/U/I/O/L" 对玩家毫无意义（用户反馈"按钮美术不行"，
         一半是样子、一半就是这些字母）。桌面端 HUD 仍然显示键位，两边互不影响。 */
      skillKeys: HUD_SKILLS.map((k) => k.name),
      onKey: (key, down) => {
        if (down) this.keys.add(key); else this.keys.delete(key);
      },
      onSkill: (i) => this.pressSkill(i),
    });
  }

  readInput() {
    const k = this.keys;
    let btn = 0;
    if (k.has('w') || k.has('arrowup') || k.has(' ')) btn |= BTN.JUMP;
    if (k.has('j') || k.has('z')) btn |= BTN.ATK;
    if (k.has('shift')) btn |= BTN.DASH;   // 冲刺只留 Shift（K 现在是重击）
    if (k.has('s') || k.has('arrowdown')) btn |= BTN.GUARD;   // 防御只留 S（L 现在是必杀）
    const skill = this._skillIndex();
    return {
      mx: (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0),
      my: 0,
      atk: (btn & BTN.ATK) ? 1 : 0,
      btn,
      skill,      // -1 = 这一帧不出招
    };
  }

  // ---------------- 菜单 ----------------
  renderMenu() {
    this.session = null;
    this.setStatus('待开始');
    this.hud.setHint('');
    this.panel.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '开一局')),
        h('div', { class: 'stack-sm' },
          this.modeBtn('ai', '对战 AI', '练手，随时能打'),
          this.modeBtn('shadow', '打好友的影子', '拿社群里另一只狗的天赋当对手'),
          this.modeBtn('pvp', '建房（实时联机）', '建一局，把房间号发给朋友'),
          /* ⚠️ 加入入口必须**放在菜单上**。
             原来它只出现在 showRoom()（建房之后的面板）里 ——
             于是朋友想加入，得先点"实时联机"给自己也建一个房，
             才能在面板里看到"或：输入别人的房间号"。
             实测就是：B 建了一个新房间（KFOQTU），然后又去连 A 的房间，
             两人谁也没进同一局（用户报的"一点都动不了"有一部分就是这么来的）。
             **加入是独立于建房的一条路，就该有独立的入口。** */
          h('div', { class: 'card flat' },
            h('div', { class: 'card-title' },
              h('span', { class: 'kicker' }, '加入朋友的房间')),
            h('div', { class: 'field' },
              h('label', { for: 'join-code' },
                '输入朋友给你的 6 位房间号'),
              this._joinRow())),
          note('60 秒内把对方的血打空。打空、或者时间到时血更多的一方赢。', ''))));
  }

  modeBtn(mode, title, sub) {
    const btn = h('button', { class: 'btn btn-block' + (mode === 'ai' ? '' : ' btn-ghost'),
                              'data-mode': mode },
      h('span', null, title,
        h('span', { class: 'tiny muted', style: { marginLeft: '8px' } }, sub)));
    btn.addEventListener('click', () => withBusy(btn, () => this.newMatch(mode)));
    return btn;
  }

  setStatus(t) {
    const el = document.getElementById('arena-status');
    if (el) el.textContent = t;
  }

  // ---------------- 开局 ----------------
  async newMatch(mode) {
    this.mode = mode;
    this.reported = false;
    this.foe = null;
    this.room = null;
    this.session = null;
    /* ⚠️ **必须记下模式**。
       这里原来从来没赋过 `this.mode` —— 它一直是构造函数里的默认值 `'ai'`。
       AI 模式"看着正常"正是因为默认就是 'ai'；
       锁步时代 pvp 也不依赖 this.mode，所以这个遗漏一直没暴露。
       直到权威模式要用 `this.mode === 'pvp'` 判断走哪条端点 ——
       房主永远判成 false，连的还是锁步那条。
       （实机表现：房主 tick 卡在 0，加入方自己在跑。） */
    this.mode = mode;
    this.panel.replaceChildren(loading(mode === 'pvp' ? '正在建房…' : '正在撮合…'));
    try {
      const m = await api.createMatch(mode);
      this.room = m;
      if (mode === 'pvp') {
        this.showRoom(m);
      } else {
        const foe = await this.resolveFoe(m);
        this.buildMatch(m, foe);
      }
    } catch (e) {
      this.panel.replaceChildren(errorBox(e, () => this.renderMenu()));
    }
  }

  async resolveFoe(m) {
    const p = (m.players || []).find((x) => x.side === 1) || {};
    if (!p.dog_id) {
      const lvl = Math.max(1, (this.myDog.level || 1) - 2);
      return { name: 'AI 陪练', breed: { code: 'border_collie', name: '边牧', palette: {} },
               level: lvl, isAi: true };
    }
    const card = await api.dogCard(p.dog_id);
    return { name: card.dog.name, breed: breedOf(card.dog.breed_code),
             level: card.dog.level, isAi: false };
  }

  showRoom(m) {
    const code = m.room_code;
    const codeEl = h('div', { class: 'mono', id: 'room-code',
                              style: { fontSize: '26px', letterSpacing: '.14em' } }, code);
    const copyBtn = h('button', { class: 'btn btn-sm btn-ghost btn-block' }, '复制房间号');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = '已复制';
      } catch {
        copyBtn.textContent = `请手动记下：${code}`;
      }
    });
    this.panel.replaceChildren(
      h('div', { class: 'card tint' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '等待对手')),
        h('div', { class: 'center' }, codeEl),
        h('div', { class: 'tiny muted center', style: { margin: '6px 0 12px' } },
          '让朋友打开同一个地址、登录自己的狗，进竞技场后输入这个房间号'),
        h('div', { class: 'stack-sm' },
          copyBtn,
          h('div', { class: 'field' },
            h('label', { for: 'join-code' }, '或：输入别人的房间号'),
            this._joinRow())),
        h('div', { class: 'small muted center', id: 'pvp-wait', style: { marginTop: '10px' } },
          '正在等待对手进入…')));
    this.connectSocket(code, { autoStart: true });
    this.pollForOpponent(code);
  }

  _joinRow() {
    const input = h('input', { class: 'input', id: 'join-code', placeholder: '例如 AB12CD',
                               maxlength: '6' });
    const btn = h('button', { class: 'btn btn-sm btn-blue', id: 'join-btn' }, '加入');
    btn.addEventListener('click', () => withBusy(btn, async () => {
      const code = input.value.trim().toUpperCase();
      if (code.length < 4) return;
      try {
        await this.joinRoom(code);
      } catch (e) {
        this.panel.prepend(errorBox(e));
      }
    }));
    return h('div', { class: 'row-tight' }, input, btn);
  }

  /** 加入方：自己就是 side 1，所以对手是 side 0 —— 不能再用"找 side 1"那套 */
  async joinRoom(code) {
    /* ⚠️ **必须在 connectSocket 之前**把模式标成 pvp。
       connectSocket 里要用 `this.mode === 'pvp'` 判断走不走权威端点，
       而构造函数里 mode 默认是 'ai' —— 加入方在这里还没设过，
       于是判成 false、连的还是锁步那条 `/ws/match`。
       实测表现：房主在用外壳（权威）、加入方在用锁步 —— 两端跑在**两套协议**上，
       房间实际只有一个人，对局当然停住（A 冻结、B 自己在本地跑）。 */
    this.mode = 'pvp';
    const m = await api.match(code);
    const host = (m.players || []).find((p) => p.side === 0);
    if (!host || !host.dog_id) throw new Error('这个房间还没有人建房');
    this.room = m;
    this.connectSocket(code);
    const side = await this.waitForSide();
    if (side === null) throw new Error('没等到对拍的人，稍后再试');
    const card = await api.dogCard(host.dog_id);
    this.buildMatch(m, { name: card.dog.name, breed: breedOf(card.dog.breed_code),
                         level: card.dog.level });
    this.setStatus('已加入对局');
  }

  /** 建房方：等 side 1 坐上来 */
  pollForOpponent(code) {
    clearInterval(this.poller);
    this.poller = setInterval(async () => {
      if (this.session) { clearInterval(this.poller); return; }
      try {
        const m = await api.match(code);
        const foe = (m.players || []).find((p) => p.side === 1);
        const wait = document.getElementById('pvp-wait');
        if (foe && foe.dog_id) {
          clearInterval(this.poller);
          if (wait) wait.textContent = `对手已进入：${foe.display_name}`;
          await this.waitForSide();
          const card = await api.dogCard(foe.dog_id);
          this.buildMatch(m, { name: card.dog.name, breed: breedOf(card.dog.breed_code),
                               level: card.dog.level });
        }
      } catch { /* 轮询失败就算了，下一轮再试 */ }
    }, 1500);
  }

  connectSocket(roomCode, { autoStart = false } = {}) {
    this.socket?.close();
    this.mySide = null;
    this.socket = new MatchSocket(roomCode, {
      // 权威模式走另一条端点（服务端跑模拟、广播快照）
      // ⚠️ 这里是另一个方法，用不到 startMatch 里的局部变量 authMode ——
      //    各自算一遍（同一个函数判据，不会不一致）
      // 用实例上记下的模式（在 startMatch 里定的），不要重新读 hash
      path: (this.authMode || (authOn() && this.mode === 'pvp'))
        ? '/ws/match-auth' : '/ws/match',
      onStatus: (s, detail) => {
        if (s === 'connecting' && detail) this.setStatus(detail);
        if (s === 'open') this.setStatus(autoStart ? '等待对手' : '已连接');
        if (s === 'failed') this.setStatus(`连接失败：${detail}`);
      },
      onMessage: (msg) => this.onSocketMessage(msg),
      onError: (e) => console.warn('[arena] ws 错误', e),
    });
    this.socket.connect();
    this.socket.send({ type: 'ready' });
  }

  async waitForSide(timeout = 5000) {
    const t0 = Date.now();
    while (this.mySide === null && Date.now() - t0 < timeout) {
      await new Promise((r) => setTimeout(r, 60));
    }
    return this.mySide;
  }

  onSocketMessage(msg) {
    /* 权威模式的快照：直接喂给会话（外壳的 receive 认 snap 消息）。
       ⚠️ 要在别的分支之前拦下来 —— 锁步那条不认识 snap，
          让它走到底会被当成"不认识的消息"丢掉。 */
    if (this.authMode && msg && msg.type === 'snap') {
      /* ⚠️ 会话还没建好时**先把快照存起来**，别丢。
         房主的会话是"对手出现之后"才建的（pollForOpponent → buildMatch），
         而服务端**房间一建好就开始广播** —— 那几秒的快照全部落在这段空档里。
         原来写的是 `this.session?.receive(msg)`：可选链让这个竞态
         **不报错、不留痕**，表现就是"房主看着连上了、tick 永远是 0"
         （实测：收到 127 条快照、应用 0 条，且每条到达时 session 都是 null）。

         缓存的是**最后一条带快照的**（快照是完整状态，不用按顺序重放历史；
         帧只用于渲染，最新的那条就够）。 */
      if (!this.session) {
        if (!this.pendingSnaps) this.pendingSnaps = [];
        this.pendingSnaps.push(msg);
        if (this.pendingSnaps.length > 8) this.pendingSnaps.shift();
      } else {
        this.session.receive(msg);
      }
      return;
    }
    if (!msg) return;
    if (msg.type === 'welcome') {
      // 服务端分配的座位号是权威的：加入方是 side 1，不能自己以为自己 0
      this.mySide = msg.side;
      if (this.session && this.session.side !== msg.side) {
        console.warn('[arena] 座位号与本地会话不一致，重建会话',
                     this.session.side, '→', msg.side);
        this.session = null;
      }
      this.setStatus(`已入座（${msg.side === 0 ? '主队' : '客队'}）`);
      return;
    }
    if (msg.type === 'peer_left') {
      this.session?.peerLeft(msg.reason || '对手掉线');
      this.panel.prepend(note(
        `对手掉线了，已由 AI 接管继续打完这一局（${msg.reason || ''}）`, 'warn'));
      this.setStatus('对手掉线 · AI 接管');
      this.hud.setHint('对手掉线，AI 接管');
      return;
    }
    if (msg.type === 'start') {
      this.setStatus(this.session ? '对局中' : '对手已就绪，准备开始');
      return;
    }
    if (msg.type === 'peer_joined') {
      this.setStatus('对手已进入，准备开始');
      return;
    }
    if (msg.type === 'input') {
      // ★ 关键：会话还没建好时到达的输入帧**必须缓冲**，不能丢。
      // 锁步要求"两端都有第 N 帧的输入"才能推进；丢了早期帧就永远卡在第 0 帧。
      if (this.session) this.session.receive(msg);
      else if (this.pendingInputs.length < 4000) this.pendingInputs.push(msg);
      return;
    }
    if (msg.type === 'result' || msg.type === 'chat') {
      this.session?.receive(msg);
    }
  }

  buildMatch(m, foe) {
    this.foe = foe;
    const myBreed = breedOf(this.myDog.breed_code);
    // 座位号以服务端 welcome 为准（联机时尤其重要：加入方是 1 而不是 0）
    const side = this.mode === 'pvp' ? (this.mySide ?? 0) : 0;
    this.side = side;
    this.mySide = side;   // 明确：我在哪个座位（0/1）
    // ⚠️ 品种数组必须**按座位号排**，不能写成 [我的, 对手的]。
    // createState 里 units[0] 永远吃 breeds[0]，如果两端都传 [自己的, 对方的]，
    // 那 side 0 的客户端认为 units[0] 是自己、side 1 的客户端认为 units[0] 是自己，
    // 两边的初始状态从第 0 帧就不一样了 —— 两端哈希必然对不上。
    // （v1 的联机测试刚好两边都选了同一个品种，所以一直没暴露。）
    const breeds = [null, null];
    /* ⚠️⚠️ 品种对象必须**带上等级**。
       引擎的 combatAt(breed, breed.level || 1) 用「四维 + 等级」算血量/速度/伤害，
       不带等级就是按 1 级算 —— 而服务端权威那份（authority_routes 的 _breeds_of）
       现在带的是狗的**真实等级**，两边就会算出不同的 maxHp：
       血条按权威数据画，一进场就是缺的（用户报的"一进来就扣血"）。
       其余几处（AI / 影子 / 观战）也一样补上。 */
    breeds[side] = { ...myBreed, level: this.myDog.level || 1 };
    breeds[1 - side] = { ...foe.breed, level: foe.dog?.level || foe.level || 1 };
    this._breedCodes = breeds.map((b) => b?.code || '');
    /* 权威模式用 `AuthoritySessionShim`（和 LockstepSession 同形），
       锁步模式用原来的。**只在这里分叉** —— 其余代码看它们是一样的。 */
    /* ⚠️ 权威模式**只对 pvp 有意义**。
       AI / 影子模式的"远端"是本地函数（useLocalOpponent），根本没有服务端在跑模拟 ——
       用了外壳就没有帧来源，对局会直接冻住。
       （第一版漏了这个判断，`?auth=1` 下打 AI 会卡死。） */
    /* ⚠️ 判据**只在这里算一次**，存到实例上。
       不能每收到一条消息都去读 `location.hash` ——
       房主建房之后 `showRoom` 会改写 hash（`#/arena?room=...`），
       把 `auth=1` 冲掉，于是 `authOn()` 变 false：
       快照全被当成"不认识的消息"丢掉，房主就永远停在 tick 0。
       （实测：房主收到 126 条 snap、应用 0 条；加入方因为 hash 没被改过而正常。
         这个不对称正是"总有一端不动"的根因。） */
    const authMode = authOn() && this.mode === 'pvp';
    this.authMode = authMode;
    const SessionCtor = authMode ? AuthoritySessionShim : LockstepSession;
    this.session = new SessionCtor({
      seed: m.seed || 1,
      breeds,
      side,
      /* ⚠️ 权威模式要用 sendAuthInput（发对象），不能复用锁步的 sendInput
         （那个发的是按键位图数组，服务端解析不了 —— 见 ws.js 里的说明）。 */
      send: authMode
        ? (frame, input) => this.socket?.sendAuthInput(frame, input)
        : (this.mode === 'pvp'
          ? (frame, input) => this.socket?.sendInput(frame, input)
          : null),
      /* AI 陪练的强度。createAI 把 skill 0~1 映射到难度 0~3：
           0.4 → 档位 1（AI_TUNING[1]：每 0.22 秒出招、80% 命中）。
         原来是 0.62 → 档位 2（每 0.12 秒、94%），
         玩家会被连续打中、长期处于硬直，体感是"按什么都没反应"——
         而这个模式在界面上写的是"练手，随时能打"。
         **难度要对得上它的定位。** */
      aiSkill: 0.4,
      // ⚠️ **引擎必须一起传进去**。
      //    第十九轮查出来的：这里原来没传，于是 `?engine=ab` 时
      //    页面用 simAB 读、会话里跑的却还是 sim.js ——
      //    拿 simAB 的 unitView/hashState 去处理 sim.js 的 state，
      //    snapshot() 里 tick 和 hash 全是空的，e2e_pvp 挂三项。
      //    上一轮我以为是"界面字段没同步"，方向完全错了：
      //    真正的问题是**两个引擎同时在跑**。
      engine: SIM,
      // 权威模式用**同形外壳**顶替（见 game/authority.js 的说明）——
      // 方法名一样，所以下面那一千行渲染/取数代码一行都不用改
      ...(authMode ? { predict: predictOn() } : {}),
    });

    /* 会话建好之后，把"到达得太早"的快照补喂进去。
       只喂最后一条带 snap 的 —— 快照是完整状态，不需要重放历史。 */
    if (authMode && this.pendingSnaps && this.pendingSnaps.length) {
      const last = [...this.pendingSnaps].reverse().find((m2) => m2 && m2.snap);
      this.pendingSnaps = [];
      if (last) this.session.receive(last);
    }
    if (this.mode !== 'pvp') {
      // AI / 影子：远端输入本地产生，但走的是**同一个** LockstepSession，
      // 所以"掉线接管"只是把远端源换掉，不需要另写一套战斗循环。
      // ⚠️ AI 必须从**会话正在用的那个引擎**里取（`engine.aiInput`）。
      //    这里原来直接调 `aiInput(...)`（从 game/ai.js import 的那个），
      //    那是旧引擎的 AI，它读的是 sim.js 的状态形状（me.cd / me.sta）。
      //    喂新引擎的 state 进去就抛错 —— 而 `advance()` 里这一抛，
      //    整个推进循环就断了，表现是 **tick 永远停在 0**（第二十一轮量出来的）。
      //    net.js 早就支持 `engine.aiInput` 注入了，只是这里没走那条路。
      this.session.useLocalOpponent((st) => {
        const fn = this.session.engine.aiInput || aiInput;
        return fn(this.session.ai, st);
      });
    } else {
      const pending = this.pendingInputs.splice(0);
      for (const msg of pending) this.session.receive(msg);
    }

    // 演员：自己的狗固定在 side 这个座位上，对手在另一侧
    this.view.actorRoot.clear();
    this.view.clearBalls();
    const mineIdx = side;
    const foeIdx = 1 - side;
    this.actors = [null, null];
    this.actors[mineIdx] = this.view.attachActor(
      mineIdx, dogTexture(myBreed, this.myDog.level, 'print'), side === 0 ? 1 : -1);
    this.actors[foeIdx] = this.view.attachActor(
      foeIdx, dogTexture(foe.breed, foe.level, 'print'), side === 0 ? -1 : 1);

    this.hud.setNames(this.myDog.name, `${foe.name}${foe.isAi ? '（AI）' : ''}`);
    this.hud.setAvatars(faceOf(myBreed.code), faceOf(foe.breed.code));
    this.hud.setBuffs([
      { label: '力', title: `体力 ${myBreed.power ?? '-'}` },
      { label: '敏', title: `敏捷 ${myBreed.agility ?? '-'}` },
      { label: '智', title: `智力 ${myBreed.wisdom ?? '-'}` },
      { label: '亲', title: `亲和 ${myBreed.affinity ?? '-'}` },
    ]);
    this.renderPlaying();
    this.setStatus('对局中');
  }

  renderPlaying() {
    this.panel.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '对局中')),
        h('div', { class: 'stack-sm' },
          h('div', { class: 'between' }, h('span', null, this.myDog.name),
            h('span', { class: 'mono tiny' }, `LV.${this.myDog.level} · ${this.side === 0 ? '主队' : '客队'}`)),
          h('div', { class: 'between' }, h('span', null, this.foe.name),
            h('span', { class: 'mono tiny' }, `LV.${this.foe.level}`)),
          this.mode === 'pvp'
            ? note(`房间 ${this.room?.room_code}`, '')
            : note(`房间 ${this.room?.room_code} · 种子 ${this.room?.seed}`, ''),
          h('div', { class: 'tiny muted', id: 'net-stat' }, '—'))));
    this.setStatus('对局中');
  }

  // ---------------- 主循环 ----------------
  start() {
    this.raf = requestAnimationFrame(this._loop);
  }

  _loop(t) {
    this.raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.1, (t - (this._prev || t)) / 1000);
    this._prev = t;

    // ---- 顿帧 ----
    // 命中瞬间把**模拟**冻住几帧，但画面照常渲染 —— 这就是"打到了"的手感来源。
    // 帧数由引擎按招式分级给（轻击 4 帧 / 重击 8 帧 / 必杀 8 帧 / 格挡 2 帧），
    // 照搬原版 `this.hitstop = blocked ? .018 : super ? .065 : ...`。
    if (this.hitstopF > 0) {
      this.hitstopF -= 1;
      /* ⚠️ 顿帧只冻结**模拟推进**，不能把输入也丢了。
         原来这里直接 return，连 pumpLocal 都不调 ——
         于是顿帧期间（每次命中都会触发几帧）按的键**全被丢掉**，
         表现就是"有时候按了没反应"（实测里 _skillLatch 频繁读到 None）。

         pumpLocal 只是把输入**排进队列**，真正消费它的是 advance()。
         所以顿帧期间照常收输入、只是先不 advance —— 解冻后自然接上。 */
      if (this.session && !this.session.state.over) {
        this.session.pumpLocal(this._feedClock(t), this.readInput());
      }
this.paint(this.session.state);
      // alpha 要用**会话累加器的余数**。竞技场没有 this.acc
      //（它走 session.pumpLocal 的墙上时钟），写 this.acc 会得到 NaN ——
      // 恰好被 interp.sample 的 `alpha > 0` 守卫挡住：不报错、不崩，
      // 但**插值根本没发生**。这种静默失效最难发现。
      this.view.render(this.viewData(this.frameAlpha()));
      return;
    }

    /* ---- KO 慢镜 ----
       ⚠️ 这里原来是 `this._lastT + (t - this._lastT) * pace`，
          而 **`_lastT` 从头到尾没被赋值过** → 它是 undefined →
          整个表达式算成 **NaN** → `pumpLocal(NaN)` 让会话的累加器也变 NaN →
          **模拟永远不再推进（卡死）**。

          而慢镜正是在"放必杀 / 破防"时触发的 ——
          所以现象正是"移动和技能一起按会卡死"。

       正确做法：慢镜期间按比例推进一个**自己的虚拟时刻**，把它喂给模拟。
       模拟本身的刻度不能动（改 TICK_HZ 会让联机对账算错）。 */
    const feedT = this._feedClock(t);

    if (this.session && !this.session.state.over) {
      const t0 = this.session.state.tick;
      this.session.pumpLocal(feedT, this.readInput());
      this.session.advance();
      // 推进了才记插值采样（没推进就没有新位置可插）
      if (this.session.state.tick !== t0) {
        this.interp.push(this.session.state.units.map((u) => SIM.unitView(u)));
      }
      if (this.session.state.over) this.finish();
    }
    if (this.session) {
      const st = this.session.state;
      this.consumeEvents(st);
      this.ackSkill(st);
      this.paint(st);
      if (st.state === 'down') this.hud.setHint('');
      /* ⚠️ 结束判定必须放在**这里**（`!over` 那个块的外面）。
         原来它写在上面 `if (this.session && !this.session.state.over) { … }`
         的**内部**，而那个块要先跑 `this.session.advance()` ——
         权威模式（联机默认）的 `advance()` 是**空实现**（`{ return 0; }`，
         模拟由服务端推进），所以那句 `if (state.over) this.finish()`
         **永远不会执行** → 现象正是"联机有一方死亡后游戏不自动退出"。
         `finish()` 自己是幂等的（开头有 `if (this.reported) return`），
         所以每帧调用是安全的。
         回归测试：`tests/e2e_pvp_auth_ko.py`（撤掉本行即 FAIL，已验证）。 */
      if (st.over) this.finish();
    }
    // alpha 要用**会话累加器的余数**。竞技场没有 this.acc
      //（它走 session.pumpLocal 的墙上时钟），写 this.acc 会得到 NaN ——
      // 恰好被 interp.sample 的 `alpha > 0` 守卫挡住：不报错、不崩，
      // 但**插值根本没发生**。这种静默失效最难发现。
      this.view.render(this.viewData(this.frameAlpha()));
  }

  /** 组装渲染数据（只做单位换算，不掺规则） */
  /**
   * 喂给模拟的"虚拟时刻"：慢镜期间按比例推进（只喂 28% 的真实时间），否则就是真实时刻。
   *
   * ⚠️ 这段原来内联在主循环里、用了 `this._lastT` —— 而那个字段**从没被赋值过**，
   *    于是 `undefined + (t - undefined) * pace` = **NaN**，
   *    pumpLocal(NaN) 让会话累加器也变 NaN → **模拟永远不再推进（卡死）**。
   *    慢镜正是在"放必杀/破防"时触发的 —— 现象就是"放技能会卡死"。
   *    收成方法之后顿帧和正常路径共用，并且兜住非有限值。
   */
  _feedClock(t) {
    if (this.slowmoF > 0) {
      this.slowmoF -= 1;
      const base = this._virtualT === undefined ? t : this._virtualT;
      const prevReal = this._lastRealT === undefined ? t : this._lastRealT;
      this._virtualT = base + (t - prevReal) * 0.28;
    } else {
      this._virtualT = t;
    }
    this._lastRealT = t;
    return Number.isFinite(this._virtualT) ? this._virtualT : t;
  }

  /**
   * 把引擎的 units 顺序换成**我的视角**：左边永远是我、右边永远是对手。
   *
   * ⚠️ 为什么不能在引擎里换顺序：
   *    锁步要求两端的状态逐位一致，`units[0]` 必须是同一个座位，
   *    不能"每端各自把自己排前面"。所以引擎顺序不动，**只在喂给 HUD 时重排**。
   *
   *   原来没做这一步 —— 建房方 side=0 时看着正常，
   *   但**加入方 side=1** 的时候：`setNames(我, 对手)` 把名字放在 bars[0]，
   *   而 bars[0] 的血量取自 units[0]（对手）→ 名字和血条对不上，
   *   看起来就是"血量反了"。
   */
  hudUnits(units) {
    if (!units || units.length < 2) return units || [];
    return this.side === 1 ? [units[1], units[0]] : units;
  }

  /** 这一帧的插值系数：会话累加器的余数 ÷ 一个 tick */
  frameAlpha() {
    const ses = this.session;
    if (!ses) return 0;
    const tickMs = 1000 / (ses.engine?.TICK_HZ || TICK_HZ);
    const a = (ses.acc || 0) / tickMs;
    return Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 0;
  }

  viewData(alpha = 0) {
    const st = this.session?.state;
    if (!st) {
      return {
        units: [],
        balls: [],
        focus: { x: STAGE_W / 2, y: STAGE_H * 0.25 },
        dt: 1 / 60,
      };
    }
    // 插值：优先用插好的位置；插值缓冲还没热起来就退回当前 tick。
    // （只有 x/y/vx/vy 是插的，状态/血量/冷却一律取当前 tick —— 见 interp.js 的说明）
    const sampled = this.interp?.sample(alpha);
    const units = (sampled && sampled.length) ? sampled : st.units.map(SIM.unitView);
    const balls = st.balls.map((b) => ({ x: SIM.helpers.toGrid(b.x), y: SIM.helpers.toGrid(b.y) }));
    const mid = (units[0].x + units[1].x) / 2;
    const top = Math.max(units[0].y, units[1].y);
    // 每帧告诉舞台该用哪张图：有动作帧就用动作帧，没有就退回四形态（见 game/pose.js）
    const forms = units.map((u, i) => pickPose(
      u, st.tick, actionFrames(this._breedCodes?.[i], 'run')).form);
    return {
      units, balls, forms,
      codes: this._breedCodes,
      focus: {
        x: mid,
        y: STAGE_H * 0.25 + top * 0.4,
        span: Math.abs(units[0].x - units[1].x),
      },
      dt: 1 / 60,
    };
  }

  /**
   * 消费这一帧的引擎事件。**必须每帧调**，而且要在 hud.update 之前。
   *
   * 事件和状态的区别：像"7 连强制脱离"只发生**一帧**（受击方立刻进入无敌），
   * 页面每帧比状态量是抓不住的 —— 必须由引擎记下来、页面读走。
   * （上一轮 is-ready 那个瞬态就是这么踩的坑，所以这次直接走事件。）
   */
  consumeEvents(st) {
    if (!st || !st.events || !st.events.length) return;
    for (const ev of st.events) {
      if (ev.type === 'escape') {
        const mine = ev.by === this.side;
        this.hud.flash(mine ? `${ev.combo} 连击 · 对手脱离` : '被强制脱离', 900, 'escape');
        continue;
      }
      // ---- 招式自带的表现事件（原版 11 种特效里的两种）----
      if (ev.type === 'fx') {
        if (ev.kind === 'ghost') {
          // 突进残影：半透明的自己
          this.view.spawnGhost(ev.who, ev.x, ev.y, 0.32);
        } else if (ev.kind === 'dust') {
          // 扬尘：往两边散的地面尘（用火花系统，改成土色、少而慢）
          this.view.sparks(ev.x, ev.y + 6, 0xcfc3ad, 8, 0.45);
        } else if (ev.kind === 'beam') {
          // 必杀光柱：一道横贯的光 + 沿路火花（原版 effect('beam', ..., length: s.range)）
          this.view.spawnFx('evade', ev.x, ev.y, { sparks: 0 });
          const dir = ev.facing >= 0 ? 1 : -1;
          const len = Math.min(ev.len || 880, 880);
          for (let d = 40; d < len; d += 90) {
            this.view.sparks(ev.x + dir * d, ev.y, 0xffe9a8, 4, 0.5);
          }
        } else if (ev.kind === 'slam') {
          // 落地冲击：原版 sparks(f.x, FLOOR-8, color, 35, 1.5)，颗数和力度都是最大的
          this.view.sparks(ev.x, ev.y + 8, 0xd8cbb0, 35, 1.5);
          this.view.spawnFx('ko', ev.x, ev.y);
        } else if (ev.kind === 'aura') {
          // 架势光环：一小圈金色火花绕着人（原版 effect('aura', ..., radius: 65)）
          this.view.sparks(ev.x, ev.y, 0xffd98a, 6, 0.35);
        } else if (ev.kind === 'burst') {
          // 爆发：一圈朝外炸开的火花（原版 effect('burst', ...)）
          this.view.sparks(ev.x, ev.y, 0xffb37a, 20, 1.2);
          this.view.spawnFx('ko', ev.x, ev.y);
        } else if (ev.kind === 'trap') {
          // 布阵：地上留一团（原版 effect('trap', ..., life 3.4s)）
          this.view.spawnFx('guard', ev.x, ev.y);
          this.view.sparks(ev.x, ev.y + 6, 0x9bd6a0, 10, 0.5);
        }
        continue;
      }

      if (ev.type !== 'hit') continue;

      // ① 顿帧：取最强的那个（同时被打几下时不要叠加成卡死）
      this.hitstopF = Math.max(this.hitstopF || 0, ev.hitstopF || 0);

      // ② 震屏：也是取最大，不是相加 —— 相加会糊成一片
      this.view.shake = Math.max(this.view.shake || 0, ev.shake || 0);

      // ③ 白闪：只有必杀才闪（原版 `this.flash = .15`）
      if (ev.flash) this.view.flash = 0.15;

      // ④ 火花：位置在受击方身上偏上 90 格（和原版 sparks 的取点一致）
      const kind = ev.broke ? 'ko' : (ev.kind === 'block' ? 'guard' : 'hit');
      // ⚠️ ev.y 是**离地高度**（站着 = 0），要往上加。
      //    原来写成 `ev.y - 90`，那是地面以下 90 格 —— 火花和飘字
      //    全跑到画面左下角去了（数字叠在血条上、火花埋在地底）。
      this.view.spawnFx(kind, ev.x, ev.y + 90);

      /* 伤害数字。
         大小按伤害量缩放 —— 原版是固定 size，但那样 26 和 188 看起来一样重，
         而这恰恰是玩家最想一眼看出来的信息。 */
      const dmg = Math.round(ev.dmg || 0);
      if (dmg > 0) {
        const big = dmg >= 120 ? 30 : (dmg >= 60 ? 25 : 20);
        this.view.popText(
          ev.kind === 'block' ? `${dmg}` : `${dmg}`,
          ev.x + (ev.on === 0 ? -18 : 18), ev.y + 130,
          ev.kind === 'block' ? '#9fd8ff'
            : (ev.flash ? '#ffd98a' : (ev.combo >= 4 ? '#ffcf6a' : '#fff8e8')),
          { size: big, life: 0.85,
            kind: ev.kind === 'block' ? 'block' : (ev.broke ? 'break' : '') });
      }
      // 连段数：第 2 段起才飘，免得第一下就满屏字
      if (ev.combo >= 2 && ev.kind === 'hit') {
        this.view.popText(`${ev.combo} HIT`, ev.x, ev.y + 178, '#ffb347',
          { size: 15, life: 0.7, vy: 40 });
      }

      // ⑤ 飘字：只说**关键信息**，普通伤害不飘（否则满屏数字）
      if (ev.broke) this.hud.flash('破防！', 700, 'escape');
      else if (ev.kind === 'counter') this.hud.flash('反击！', 700, 'escape');
      else if (ev.kind === 'block') this.hud.flash('格挡', 420);
    }
    st.events.length = 0;
  }

  paint(st) {
    const view = this.viewData();
    this.consumeEvents(st);
    // HUD 用**我的视角**的顺序（左边永远是我）；舞台用引擎顺序。
    this.hud.update({ ...view, units: this.hudUnits(view.units) },
      st.tick, ROUND_TICKS);
    const netEl = document.getElementById('net-stat');
    if (netEl && this.mode === 'pvp') {
      const s = this.session.stats();
      netEl.textContent = `缓冲 ${s.buffered} 帧 · 等待 ${s.stallFrames} 拍 · 哈希 0x${s.hash.toString(16)}`;
    }
    if (this.mode === 'pvp') {
      const stall = this.session.stallFrames > 12 && !this.session.peerGone;
      this.hud.setHint(this.session.peerGone ? '对手掉线 · AI 接管'
        : (stall ? '等待对手…' : ''));
    }
  }

  async finish() {
    if (this.reported) return;
    this.reported = true;
    const st = this.session.state;
    // ⚠️ 平局的表示两个引擎不一样：
    //    旧 sim.js 用 `winner === -1`，新 simAB 用 `null`（没打完也是 null）。
    //    只判 -1 的话，新引擎下的平局会被当成"输"，结算面板直接写错。
    //    这里统一：只要 over 了，winner 既不是 0 也不是 1 就是平局。
    const w = st.winner;
    const decided = w === 0 || w === 1;
    const over = st.over !== false && st.over !== undefined ? st.over : true;
    const verdict = (over && !decided) ? 'draw' : (w === this.side ? 'win' : 'lose');
    /* 判词。
       竞技场是按【免伤自检协议】裁决的场地（小说第六章），
       所以这里不用"赢了/输了"这种口语，用协议口吻的**裁定**：
       胜 / 负 / 平 —— 三个字，冷、准、和世界观一致。 */
    const label = { win: '裁定 · 胜', lose: '裁定 · 负', draw: '裁定 · 平' }[verdict];
    const scores = [st.units[0].hp, st.units[1].hp];
    this.setStatus(`本局结束 · ${label}`);
    this.hud.setHint(`本局结束 · ${label}`);

    /* 结算面板。
       ⚠️ 原来这里有"结算帧"和"状态哈希"两项 —— 那是**给我自己排查用的**，
          用户明确说过界面上不要出现底层说明。删掉。
          换成玩家真正关心的：打了多少、挨了多少、最高连段、用了多久。 */
    const sum = SIM.summary ? SIM.summary(st, this.side) : null;
    const stat = (k, v, cls = '') => h('div', { class: 'rs-cell ' + cls },
      h('b', { class: 'mono' }, v), h('span', { class: 'small muted' }, k));

    this.panel.replaceChildren(
      h('div', { class: `card tint rs rs-${verdict}` },
        h('div', { class: 'kicker' }, '本局结束'),
        // 结束方式（K.O. / TIME UP / DRAW）——比"打完了"有信息量
        st.match?.banner
          ? h('div', { class: 'rs-how' }, st.match.banner)
          : null,
        h('div', { class: 'rs-verdict' }, label),
        h('div', { class: 'rs-hp small muted' },
          `剩余血量 ${Math.round(scores[0])} : ${Math.round(scores[1])}`),
        sum ? h('div', { class: 'rs-grid' },
          stat('打出的伤害', String(sum.dealt)),
          stat('吃下的伤害', String(sum.taken)),
          stat('最长连段', sum.maxCombo > 1 ? `${sum.maxCombo} 连` : '—'),
          stat('用时', sum.time),
        ) : null,
        h('div', { class: 'stack-sm', style: { marginTop: '12px' } },
          this._claimBtn(scores, st),
          h('button', { class: 'btn btn-ghost btn-block btn-sm',
                        onclick: () => this.renderMenu() }, '再来一局'))));
    clearInterval(this.poller);
  }

  _claimBtn(scores, st) {
    const btn = h('button', { class: 'btn btn-seal btn-block' }, '上报结果并领奖励');
    btn.addEventListener('click', () => withBusy(btn, async () => {
      try {
        const room = this.room?.room_code;
        if (!room) return;
        await api.reportResult(room, {
          frames: st.tick, scores,
          winner_side: st.winner === -1 ? null : st.winner,
          duration_ms: Math.round(st.tick * (1000 / TICK_HZ)),
        });
        const r = await api.claimReward(room);
        /* ★★ 本地结算（原来这一步**根本不存在**）：
             服务端按设计只记 `pending_exp`，等级由"狗本体"算 ——
             但前端一直没有这个引擎，于是经验发下来没人加、等级永远是 LV.1。
             现在：加到狗身上 → 重算等级 → 存回本地 → 上报云端做镜像
             （云端只上行不下行，见 PATCH /api/dogs/mine 的说明）。 */
        const dog = get().dog;
        const gain = applyExp(dog || {}, r.exp || 0);
        if (dog) {
          const next = { ...dog, level: gain.level, total_exp: gain.total_exp };
          set({ dog: next });
          api.updateMine({ level: gain.level, total_exp: gain.total_exp })
            .catch(() => {});      // 镜像失败不影响本地（本地才是权威）
        }
        this.panel.prepend(note(
          /* 原来这里写的是"由狗本体结算（周上限/衰减规则在本地）"——
             纯技术说明，用户明确说过界面上不要出现底层细节。
             改成记录员视角的一句话：经验记在它身上，上限是长夜月的规矩。 */
          r.exp > 0
            ? `这一局记下了 ${r.exp} 点经验。经验记在它自己身上，长夜月里每周有定数。`
            : '这一局先前已经记过账了。',
          r.exp > 0 ? 'good' : ''));
        if (gain.leveledUp) {
          // 升级要有那个"时刻"（用户要求：不做成就口吻，就写它长大了）
          this.panel.prepend(note(
            `它又长大了一点。LV.${gain.from} → LV.${gain.level}`, 'good'));
          this.hud.setHint(`LV.${gain.from} → LV.${gain.level}`);
        }
      } catch (e) {
        this.panel.prepend(errorBox(e instanceof ApiError ? e : e));
      }
    }));
    return btn;
  }

  // ---------------- 对外快照（给自动化测试与排障用） ----------------
  /**
   * 只读快照。**不要**从 DOM 里抠数字——HUD 改一次版式测试就全瞎了，
   * 而且"读到的到底是哪一帧"根本说不清。
   */
  snapshot() {
    const st = this.session?.state;
    if (!st) return { active: false, side: this.side, mode: this.mode };
    return {
      active: true,
      mode: this.mode,
      side: this.side,
      seed: st.seed,
      tick: st.tick,
      over: st.over,
      winner: st.winner,
      hash: SIM.hashState(st),
      hp: st.units.map((u) => u.hp),
      maxHp: st.units.map((u) => u.maxHp),
      states: st.units.map((u) => u.state),
      x: st.units.map((u) => SIM.helpers.toGrid(u.x)),
      y: st.units.map((u) => SIM.helpers.toGrid(u.y)),
      sta: st.units.map((u) => u.sta),
      cd: [...(st.units[this.side]?.cd || [0, 0, 0, 0])],
      balls: st.balls.length,
      peerGone: Boolean(this.session?.peerGone),
      stallFrames: this.session?.stallFrames ?? 0,
      // 输入日志的指纹：两端对不上时，用来区分"是输入没同步"还是"模拟本身不确定"
      inputHash: inputLogHash(this.session?.inputLog),
      inputLogLen: this.session?.inputLog.length ?? 0,
    };
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearInterval(this.poller);
    this._touch?.dispose();
    document.body.classList.remove('is-touch');
    document.body.classList.remove('is-battle');
    this.socket?.close();
    this.fs?.dispose();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.hud.dispose();
    this.view.dispose();
  }

  // ---------------- 全屏 ----------------
  toggleFullscreen() {
    this.fs?.toggle();
  }

  _setupFullscreen() {
    // ⚠️ 全屏的是 **wrap**（.battle-wrap）而不是 stage。
    // HUD 是 stage 的**兄弟节点**，只把 stage 全屏的话 HUD 会被留在外面——
    // 表现就是"全屏之后一个血条、一个技能钮都不见了"（这个 bug 用户直接截图指出来的）。
    // 世界那边早就改成全屏 wrap 了，战斗这边漏了。
    this.fs = attachFullscreen(this.wrap, {
      onResize: () => this.view.resize(),
    });
  }
}
