/* 剧情关卡页面：「档案册」里的训练记录
   ============================================================
   两个视图，同一个页面：
     map    关卡列表 —— 羊皮纸手绘地图（节点 + 连线），显示首通/星级/推荐等级
     play   关内横板 —— 推进 → 遇敌 → Boss 战（顶部血条这时才出现）

   三个刻意为之的取舍：
   1) **关卡内容全在前端**（game/levels.js），服务端只认识 level_code。
      和"服务端不跑对战模拟"是同一个理由：多一份数据就多一处会不一致。
   2) 关内**不走锁步**：单机 PvE 不需要等谁，直接本地固定步长推进，
      玩家输入来自键盘、对手输入来自 pve.js（确定性纯函数，失败重来能复现）。
   3) 复用横板那套舞台与 HUD（game/stage.js、game/hud.js），
      只额外开了 Boss 血条与推进提示两个位置。
*/

import { h, withBusy } from '../lib/dom.js';
import { api, ApiError } from '../lib/api.js';
import { get, set, breedOf } from '../lib/store.js';
// ★ 本地结算：服务端只返回"本关应得经验"，等级由本地算（见 src/lib/exp.js）
import { applyExp } from '../lib/exp.js';
import { sheetHead, note, errorBox, loading } from '../components/ui.js';
import { pageShell } from '../components/layout.js';
import { onDispose } from '../lib/router.js';
import { portraitSVG } from '../lib/breedArt.js';
import { dogTexture } from '../world/actors.js';
import { attachFullscreen } from '../lib/fullscreen.js';
import {
  BTN, ROUND_TICKS, TICK_HZ, createState, hashState, helpers, step, unitView,
} from '../game/simAB.js';
import { bossKit, enemyInput } from '../game/pve.js';
import { LEVELS, levelOf, parTicks, starsFor } from '../game/levels.js';
import { SideStage } from '../game/stage.js';
import { actionFrames, preloadActions, preloadBreedArt } from '../lib/breedAssets.js';
import { pickPose } from '../game/pose.js';
import { createBattleHud } from '../game/hud.js';

const TICK_MS = 1000 / TICK_HZ;
/* ⚠️ 剧情关卡跑的是**旧引擎**（4 招），而且键位只绑了数字键 ——
   但同一页的说明文字写的是"J/K/U/I/O/L 六招"（我上一轮改文案时改错了：
   文案跟着竞技场一起改成了六招，代码没跟上）。
   结果就是：玩家照着说明按字母键，**一个招都放不出来**。

   现在两边对齐：
     · 字母键 J/K/U/I 也能用（对上旧引擎的前四招）
     · 文案改回"四招"（旧引擎就是四招，写六招是骗人）

   彻底的做法是把剧情关卡也迁到 simAB（六招）——
   那是一次完整的搬家，等这一版稳了再做。 */
const KEY_SKILL = ['1', '2', '3', '4', '5', '6'];
const KEY_SKILL_AB = ['j', 'k', 'u', 'i', 'o', 'l'];
const { toGrid } = helpers;

export async function trainingPage() {
  await Promise.all([
    preloadBreedArt().catch(() => {}),
    preloadActions().catch(() => {}),
  ]);
  const st = get();
  const { shell, pageEl } = pageShell({ current: '/training', withAside: false });

  if (!st.account || !st.dog) {
    pageEl.replaceChildren(
      sheetHead('训练记录', '档案册 · 关卡'),
      h('div', { class: 'empty' },
        h('span', { class: 'hand' }, '训练场的门锁着。册子上还没有编号。'),
        h('div', { class: 'small' }, '登录并领养一只机械狗，档案册才会开始记页。'),
        h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
          h('a', { class: 'btn btn-seal', href: '#/adopt' }, '去领养'))));
    return shell;
  }

  const mapHost = h('div', { class: 'stack' });
  const stage = h('div', { class: 'battle-stage', id: 'training-stage' });
  const hudHost = h('div', { class: 'battle-hud', id: 'training-hud' });
  const playWrap = h('div', { class: 'battle-wrap', style: { display: 'none' } }, stage, hudHost);
  /* ⚠️ 提示条要放在 `.battle-wrap` **外面**。
     `.battle-hud` 是 `position:absolute; inset:0`，它铺满的是**整个 wrap** ——
     提示条塞进 wrap 会让 wrap 变高，HUD 就跟着盖到提示条上，
     底部那些绝对定位的元素（狗头像、连击数）正好压在字上
     （用户截图：提示条左边被头像和一条状态栏压住）。
     放在 wrap 外面之后，HUD 的 inset:0 只覆盖舞台，各归各位。 */
  const side = h('div', { class: 'stack' });

  // 小说第四章『名为日常的废墟，与哭泣的第四关』—— 关卡就是册子上的一页页
  const head = sheetHead('训练记录', '四道关卡。翻过去，册子上会多一页', null);
  /* 提示条是 playWrap 的**兄弟节点**（不是子节点）——
     放进去会让 HUD 的 inset:0 盖到它头上，见上面那段注释。
     它跟着 playWrap 一起显隐（打起来才出现）。 */
  const hintBar = battleHint();
  hintBar.style.display = 'none';
  const showHide = () => {
    hintBar.style.display = playWrap.style.display === 'none' ? 'none' : '';
  };
  new MutationObserver(showHide).observe(playWrap, { attributes: true, attributeFilter: ['style'] });
  showHide();
  pageEl.replaceChildren(head, playWrap, hintBar, h('div', { class: 'grid-2',
    style: { gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 1fr)', alignItems: 'start' } },
    mapHost, side));

  const game = new TrainingGame({ mapHost, side, playWrap, stage, hudHost });
  window.__training = game;
  game.renderMap();
  return onDispose(shell, () => {
    if (window.__training === game) delete window.__training;
    game.dispose();
  });
}

/* ================= 关卡列表（羊皮纸地图） ================= */

/** 战斗界面上的操作提示条（用户要求：关卡界面也要有键位提示）。
 *  原来只在右侧那张 helpCard 里写了一遍，而那一栏打起来并不在视野里，
 *  等于关卡界面上没有键位提示。
 *  ⚠️ 必须是**模块级函数**：类方法得用 `this.` 调，而这里是页面函数在拼 playWrap。 */
function battleHint() {
  return h('div', { class: 'note', id: 'training-hint', style: { marginTop: '10px' } },
    '操作：A/D 移动，W 或空格 跳，S 防御，J 轻击 · K 重击 · U 突进 · I 升龙 · O 治愈 · L 必杀。',
    '每一波之间有一段冷却（HUD 上那条细线走完就登场），不用特意往右跑。',
    'O 治愈：回血看体力（单次最多 80），耗气看敏捷 —— 气不够就放不出来。');
}

function levelNode(lv, i, progress, onPick) {
  const p = progress[lv.code] || {};
  const stars = p.stars || 0;
  const node = h('button', {
    class: 'lv-node' + (p.cleared ? ' is-clear' : ''),
    'data-level': lv.code,
    onclick: () => onPick(lv.code),
  },
    h('span', { class: 'lv-index mono' }, lv.code),
    h('span', { class: 'lv-body' },
      h('span', { class: 'lv-name' }, lv.name),
      h('span', { class: 'lv-sub' }, lv.subtitle),
      h('span', { class: 'lv-meta tiny muted' },
        `推荐 LV.${lv.recLevel} · ${lv.waves.length} 波 · 首通 ${lv.firstReward.exp} 经验`,
        p.cleared && p.bestTicks ? ` · 最快 ${(p.bestTicks / TICK_HZ).toFixed(1)}s` : '')),
    h('span', { class: 'lv-stars' },
      [0, 1, 2].map((k) => h('i', { class: k < stars ? 'on' : '' }, '★'))),
    i < LEVELS.length - 1 ? h('span', { class: 'lv-link' }) : null);
  return node;
}

/* ================= 关内战斗 ================= */

class TrainingGame {
  constructor({ mapHost, side, playWrap, stage, hudHost }) {
    this.mapHost = mapHost;
    this.side = side;
    this.playWrap = playWrap;
    this.stage = stage;
    this.hudHost = hudHost;
    this.keys = new Set();
    this.st = null;
    this.raf = 0;
    this.acc = 0;
    this.last = 0;
    this.myDog = get().dog;
    this.myBreed = breedOf(this.myDog.breed_code);
    this.progress = {};
    this.view = null;
    this.hud = null;
    this.fs = null;
    this._loop = this._loop.bind(this);
    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
      let si = KEY_SKILL.indexOf(k);
      if (si < 0) si = KEY_SKILL_AB.indexOf(k);
      if (si >= 0) this.pressSkill(si);
      if (k === 'r' && this.st && this.st.over) this.startLevel(this.level.code);
      if (k === 'escape' && this.st) this.backToMap();
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  // ---------------- 地图 ----------------

  async renderMap() {
    this.stopLoop();
    this.playWrap.style.display = 'none';
    this.mapHost.style.display = '';
    this.hud?.dispose();
    this.hud = null;
    this.view?.dispose();
    this.view = null;
    this.mapHost.replaceChildren(loading('正在读档案册…'));
    try {
      const rows = await api.trainingLevels();
      this.progress = Object.fromEntries((rows || []).map((r) => [r.code, {
        cleared: r.cleared, stars: r.stars, bestTicks: r.best_ticks, attempts: r.attempts,
      }]));
    } catch (e) {
      // 服务端挂了也要能玩：进度退化成"全未通关"，只是不记账
      this.progress = {};
      this.offline = true;
      this.mapHost.replaceChildren(
        note('暂时连不上，进度不会保存，但关卡照打', 'warn'));
    }
    const cleared = Object.values(this.progress).filter((p) => p.cleared).length;
    const body = h('div', { class: 'lv-map' },
      ...LEVELS.map((lv, i) => levelNode(lv, i, this.progress, (code) => this.startLevel(code))));
    this.mapHost.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'card-title' },
          h('span', { class: 'kicker' }, '训练记录'),
          h('span', { class: 'tiny muted' }, `已通 ${cleared}/${LEVELS.length} 关`)),
        h('div', { class: 'small muted', style: { marginBottom: '10px' } },
          '每通一关，档案册就多一页。首通给大奖，重复通关给少量经验。'),
        body));

    this.side.replaceChildren(this.helpCard());
    this._refreshBoard();
  }

  helpCard() {
    return h('div', { class: 'card flat' },
      h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '操作')),
      h('ul', { class: 'small', style: { margin: 0, paddingLeft: '18px' } },
        h('li', null, 'A/D 移动，W 或空格 跳，J 普攻（连按三连）'),
        h('li', null, 'S 防御（有防御值，被打空会破防）'),
        h('li', null, 'J 轻击 · K 重击 · U 突进 · I 升龙 · O 治愈 · L 必杀'),
        h('li', null, '数字键 1~6 是同样的六招'),
        // ⚠️ 这条原来是「关内先往右推进，走到标记处对手才登场」——
        //    那是**旧设计**（要走到闸门才刷怪）。用户要求改成"不用往右走也能刷新"
        //    之后，刷怪靠的是一段冷却计时，这句话就成了误导：玩家会以为必须一直往右跑。
        h('li', null, '每一波之间有一段冷却，走完下一波就登场 —— 不用特意往右跑'),
        h('li', null, 'O 治愈：回多少血看体力（单次最多 80），花多少气看敏捷'),
        h('li', null, '倒下了按 R 重来，Esc 回关卡列表')));
  }

  /** 战斗界面上的操作提示条 —— 挪到模块级了（见文件下方 battleHint）。
   *  ⚠️ 类体里**不能**写 `function xxx(){}` 声明（那是语法错误），
   *     这点我改的时候踩过；类方法写法则必须被 `this.` 调用，
   *     而这里需要的是从页面函数里直接调。 */

  async _refreshBoard() {
    try {
      const rows = await api.trainingBoard('L1');
      if (!rows.length) return;
      this.side.appendChild(h('div', { class: 'card flat' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '第一关通关榜')),
        h('ol', { class: 'small', style: { margin: 0, paddingLeft: '20px' } },
          ...rows.slice(0, 8).map((r) => h('li', null,
            h('span', null, r.dog_name),
            h('span', { class: 'mono tiny muted', style: { marginLeft: '8px' } },
              `${r.stars}★ ${r.seconds}s`))))));
    } catch { /* 榜单拿不到就算了，不影响打关卡 */ }
  }

  // ---------------- 进关 ----------------

  startLevel(code) {
    const lv = levelOf(code);
    if (!lv) return;
    this.level = lv;
    this.offline = false;
    this.mapHost.style.display = 'none';
    this.playWrap.style.display = '';
    /* ⚠️ 参数形状变了：
       旧引擎  createState(seed, breeds, { training: 关卡对象 })
       新引擎  createState(seed, breeds, { training: 布尔, pve: 关卡对象 })
       —— 之所以拆开：`training` 在新引擎里是"木桩模式"（不打人不结算），
          而剧情关卡要**正常结算**（对手会打你、倒下就失败）。
          两者混在一个参数里会让关卡变成打木桩。 */
    this.st = createState(lv.seed, [this.myBreed, {}],
                          { training: false, pve: lv });
    this.acc = 0;
    this.last = 0;
    this.finished = false;
    this._skillLatch = null;

    /* ⚠️ 这里原来写的是 `if (!this.view)` —— **只建一次**。
       于是同一会话里换了关也不重建：舞台宽度永远是**第一关**的 2000，
       而模拟那边用的是关卡自己的 stageW（L4 = 2400）。
       两者不一致的后果和"越打越看不见人"是同一族：L4 里角色能走到 2400，
       相机却夹在 2000 的边界上 → 后面的角色又出画。
       （探针实测：连打四关，四次的 view.stageW 全是 2000。）
       现在按**宽度变了就重建** —— 顺带把幕布尺寸也一起对齐。 */
    if (this.view && this.view.stageW !== lv.stageW) {
      this.view.dispose?.();
      this.view = null;
    }
    if (!this.view) {
      this.view = new SideStage(this.stage, {
        stageW: lv.stageW, viewH: 660,
        backdrop: 'arena-hall',    // 和竞技场同一张大厅背景
        /* 背景**不再平铺** —— 和竞技场/道场完全一样（用户："训练记录这里的背景
           也可以和其他竞技的一样了"）。
           来龙去脉：这一项是当初为了补一个 bug 加的 ——
              · 旧刷新规则要求玩家"走到闸门"才出对手，于是相机一路跟着跑到
                场地两端之外，单张幕布（中心 stageW/2、宽 bd.width）覆盖不到，
                右边露出一大片空白（用户截图：右边三分之二全白）；
              · 当时的补丁是 `backdropTile: 4`（横向铺四张）。
           后来刷新规则改成"以玩家为参照、夹在 [320, stageW-320]"（见
           game/pveAB.js 的注释），战斗就发生在玩家附近，相机的行程大幅缩短，
           平铺这个补丁也就没必要了 —— 撤掉它，三个对战页共用同一张幕布。 */
        textureFor: (code, form) => (code ? dogTexture(breedOf(code), 1, 'print', form) : null),
      });
    }
    if (!this.hud) this.hud = createBattleHud(this.hudHost, { onSkill: (i) => this.pressSkill(i) });
    this.hud.setNames(this.myDog.name, '');
    this.hud.setAvatars(
      { url: `breeds/${this.myBreed.code}/forms/face.png`, alt: this.myBreed.code }, '');
    this.hud.setBuffs([
      { label: '力', title: `体力 ${this.myBreed.power ?? '-'}` },
      { label: '敏', title: `敏捷 ${this.myBreed.agility ?? '-'}` },
      { label: '智', title: `智力 ${this.myBreed.wisdom ?? '-'}` },
      { label: '亲', title: `亲和 ${this.myBreed.affinity ?? '-'}` },
    ]);
    this.hud.setSideVisible(1, false);
    this.hud.setBoss(null);
    this.hud.setHint('');

    this.view.actorRoot.clear();
    this.view.clearBalls();
    this.actorMine = this.view.attachActor(0, dogTexture(this.myBreed, this.myDog.level, 'print'), 1);
    this.actorFoe = this.view.attachActor(1, null, -1);
    // 对手的形象按波次换：杂兵用小一号的深色狗，Boss 用大一号
    this._foeTexture = null;

    this.renderSidebar();
    // 全屏 wrap（含 HUD）；只全屏 stage 会把血条/技能钮留在外面
    if (!this.fs) this.fs = attachFullscreen(this.playWrap, { onResize: () => this.view.resize() });
    this.startLoop();
  }

  backToMap() {
    this.renderMap();
  }

  renderSidebar() {
    const lv = this.level;
    const kit = bossKit(lv.waves[lv.waves.length - 1].unit.profile);
    this.side.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'card-title' },
          h('span', { class: 'kicker' }, lv.name),
          h('span', { class: 'tiny muted' }, `LV.${lv.recLevel}+`)),
        h('div', { class: 'small', style: { marginBottom: '8px' } }, lv.brief),
        h('dl', null,
          h('dt', null, '波数'), h('dd', { class: 'mono' }, String(lv.waves.length)),
          h('dt', null, '目标用时'), h('dd', { class: 'mono' }, `${(parTicks(lv) / TICK_HZ).toFixed(0)}s 内`),
          h('dt', null, '首通奖励'), h('dd', { class: 'mono' }, `${lv.firstReward.exp} 经验 · ${lv.firstReward.item}`),
          h('dt', null, '重复奖励'), h('dd', { class: 'mono' }, `${lv.repeatExp} 经验`)),
        h('div', { class: 'tiny muted', style: { marginTop: '8px' } }, '这一关的对手会什么'),
        h('ul', { class: 'small', style: { margin: '4px 0 10px', paddingLeft: '18px' } },
          ...kit.map((k) => h('li', null, k))),
        h('div', { class: 'stack-sm' },
          h('button', { class: 'btn btn-ghost btn-block btn-sm', id: 'lv-back',
                        onclick: () => this.backToMap() }, '← 回关卡列表（Esc）'),
          h('button', { class: 'btn btn-ghost btn-block btn-sm', id: 'lv-retry',
                        onclick: () => this.startLevel(this.level.code) }, '重新开始（R）'))));
  }

  // ---------------- 循环 ----------------

  /* ⚠️ 这里原来是**单槽闩锁 + 位掩码反查**：
       pressSkill(i) 记一个 idx，再 `_skillBtn()` 把它翻成 BTN.S1~S4，
       交给引擎用 firstSkill() 反查回下标。
       那条路是错的 —— 位掩码和下标**不是一一对应**
       （INPUT_MAP 是 S1→2、S2→4、S3→5、S4→1），
       于是"按第 3 个钮放成第 5 招"。而且只有 4 个钮，
       后按的还会把先按的覆盖掉。

     现在和竞技场用同一套：**队列 + 直传下标**。
       · 队列：多键同时按不会互相覆盖
       · 直传 skill：不再过位掩码那一层，钮上写什么就放什么
       · 120ms 窗口：够吸收一帧采样延迟，又不至于"0.7 秒后自己放招" */
  pressSkill(i) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this._skillQueue) this._skillQueue = [];
    const last = this._skillQueue[this._skillQueue.length - 1];
    if (last && last.idx === i && now - last.at < 60) return;
    this._skillQueue.push({ idx: i, until: now + 120, at: now });
    if (this._skillQueue.length > 4) this._skillQueue.shift();
  }

  /** 这一帧放第几招；没有就 -1。**只看不取**（起手之后才由 ackSkill 拿走）。 */
  _skillIndex() {
    const q = this._skillQueue;
    if (!q || !q.length) return -1;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    while (q.length && now >= q[0].until) q.shift();
    return q.length ? q[0].idx : -1;
  }

  /** 确认起手，把队列头拿走 */
  ackSkill(st) {
    const q = this._skillQueue;
    if (!q || !q.length || !st || !st.units) return;
    const me = st.units[0];
    if (me && me.attack && me.attack.index === q[0].idx) q.shift();
  }

  readInput() {
    const k = this.keys;
    let btn = 0;
    if (k.has('w') || k.has('arrowup') || k.has(' ')) btn |= BTN.JUMP;
    if (k.has('j') || k.has('z')) btn |= BTN.ATK;
    if (k.has('k') || k.has('shift')) btn |= BTN.DASH;
    if (k.has('l') || k.has('s') || k.has('arrowdown')) btn |= BTN.GUARD;
    /* ⚠️ 必须**直传 skill 下标**，不能让引擎用 btn 反查 ——
       位掩码和下标不是一一对应（S1→2/S2→4/S3→5/S4→1），
       反查会把招式放错。这一条和竞技场是同一个约定。 */
    const skill = this._skillIndex();
    return {
      mx: (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0),
      my: 0,
      atk: (btn & BTN.ATK) ? 1 : 0,
      btn,
      skill,
    };
  }

  startLoop() {
    this.stopLoop();
    this.last = 0;
    this.raf = requestAnimationFrame(this._loop);
  }

  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  _loop(t) {
    this.raf = requestAnimationFrame(this._loop);
    if (!this.st) return;
    const now = t || 0;
    if (!this.last) this.last = now - TICK_MS;
    this.acc += Math.min(200, now - this.last);       // 切后台回来别一次补几百帧
    this.last = now;

    let steps = 0;
    while (this.acc >= TICK_MS && steps < 5 && !this.st.over) {
      this.acc -= TICK_MS;
      steps += 1;
      const mine = this.readInput();
      const foe = enemyInput(this.st, this.st.units[1]);
      step(this.st, [mine, foe]);
      this.ackSkill(this.st);
    }
    this.paint();
  }

  paint() {
    const st = this.st;
    const units = st.units.map(unitView);
    const me = units[0];
    const foe = units[1];
    const balls = st.balls.map((b) => ({ x: toGrid(b.x), y: toGrid(b.y) }));

    // 表现事件
    for (const f of st.fx) {
      if (f.kind === 'jump' || f.kind === 'dash' || f.kind === 'land') {
        this.view.spawnFx('evade', toGrid(f.x), toGrid(f.y));
      } else if (f.kind === 'wave') {
        this.hud.setHint(f.boss ? '模拟体登场' : '遇敌！');
      } else if (f.kind === 'clear') {
        this.hud.setHint('通关！');
      }
    }
    for (const hit of st.hits) {
      this.view.spawnFx(hit.guarded ? 'guard' : (hit.dmg >= 15 ? 'ko' : 'hit'),
        toGrid(hit.x), toGrid(hit.y));
    }

    // 对手形象按波次切换（杂兵小、Boss 大）
    this._syncFoeActor(foe);

    /* focus 还要带上双方**渲染坐标**：舞台靠它做"两个人都在画面里"的硬约束
       （相机是插值跟随，两人快速分开时会跟不上 —— 见 stage.js 的 _updateCamera）。 */
    const focus = foe.active
      ? { x: (me.x + foe.x) / 2, span: Math.abs(me.x - foe.x),
          meX: me.x, foeX: foe.x, foeActive: true }
      : { x: me.x, span: 0, meX: me.x, foeX: me.x, foeActive: false };
    /* 取景排查用：把这一帧的 focus 和双方的原始坐标留在 view 上，
       探针（_refs/_camera_probe.py）直接读它 —— "相机把人甩出画面"这类问题
       只有把**输入**和**输出**摆在一起看才定得下来。 */
    this.view._lastFocus = { ...focus, meX: me.x, foeX: foe.x, foeActive: foe.active !== false };
    // 关卡里的对手不是真品种，沿用玩家品种的图当"机械对手"，只换姿态
    // 姿态：有动作帧用动作帧，没有退回四形态（见 game/pose.js）
    const nf = actionFrames(this.myBreed.code, 'run');
    const forms = [pickPose(me, st.tick, nf).form,
                   foe.active ? pickPose(foe, st.tick, nf).form : 'sit'];
    this.view.render({
      units, balls, focus, forms,
      codes: [this.myBreed.code, this.myBreed.code], dt: 1 / TICK_HZ,
    });
    /* 血量飘字统一在 stage.js 的 render 里做（三个对战页共用一处），
       这里不要重复调用，否则会飘两次。 */

    this.hud.update({ units }, st.tick, ROUND_TICKS, true);   // true = 正计时（关卡没有时限）
    this.hud.setSideVisible(1, foe.active);
    this.hud.setNames(this.myDog.name, foe.active ? this._foeName : '');

    // Boss 血条：只有真 Boss 登场才显示
    if (foe.active && foe.isBoss) {
      const pct = foe.hp / foe.maxHp;
      this.hud.setBoss({ name: this._foeName, subtitle: this.level.subtitle, hp: foe.hp, maxHp: foe.maxHp },
        pct <= 0.33 ? '狂暴' : (pct <= 0.66 ? '第二阶段' : ''));
    } else {
      this.hud.setBoss(null);
    }

    /* 推进提示。
       ⚠️ 这里原来写的是「**往右走** · 第 N/M 波」—— 那是旧设计的指令
          （要走到闸门才刷出对手）。用户要求改成"不用往右走也能刷新"之后，
          这句话就成了**误导**：玩家会以为必须一直往右跑。
       现在改成"下一波在路上了"+ 一条冷却细线（走到底就登场）。
       文案不写秒数：写出来是催促，而这只是"它快到了"。 */
    if (st.pve.phase === 'advance') {
      const total = st.pve.gapTotal || 1;
      const left = st.pve.gapF ?? 0;
      this.hud.setWave(`下一波在路上了 · 第 ${st.pve.wave + 1}/${this.level.waves.length} 波`,
                       1 - left / total);
    } else if (st.pve.phase === 'fight') {
      this.hud.setWave(foe.isBoss ? '' : `第 ${st.pve.wave + 1}/${this.level.waves.length} 波`);
    } else {
      this.hud.setWave('');
    }

    if (st.over && !this.finished) this.finish();
  }

  _syncFoeActor(foe) {
    const world = this.st.units[1];
    if (!foe.active) { this.actorFoe.visible = false; return; }
    this.actorFoe.visible = true;
    const spec = this.level.waves[this.st.pve.wave]?.unit || {};
    if (this._foeName !== spec.name) {
      this._foeName = spec.name;
      const isBoss = Boolean(spec.boss);
      // 关卡里没有真实的品种形象，用玩家品种换个主题色当"机械对手"，
      // 真形象到位后（见 docs/狗形象设定与出图清单.md）替换这一处即可
      const tex = dogTexture(this.myBreed, isBoss ? 30 : 8, isBoss ? 'night' : 'day');
      const body = this.actorFoe.children[0];
      body.material.map = tex;
      body.material.needsUpdate = true;
      const H = isBoss ? 210 : 140;
      body.geometry.dispose();
      body.geometry = new body.geometry.constructor(H * 0.78, H);
      body.position.y = H / 2;
      this.actorFoe.userData.H = H;
    }
    if (world.flying) {
      this.actorFoe.position.y = world.y / 256;
    }
  }

  // ---------------- 结算 ----------------

  async finish() {
    this.finished = true;
    const st = this.st;
    const win = st.pve.phase === 'clear';
    const lv = this.level;
    const hpRatio = st.units[0].hp / st.units[0].maxHp;
    const stars = win ? starsFor(lv, st.tick, hpRatio) : 0;
    const seconds = (st.tick / TICK_HZ).toFixed(1);
    this.hud.setHint(win ? `通关 · ${stars}★ · ${seconds}s` : '倒下了 · 按 R 重来');

    let drop = null;
    if (win && !this.offline) {
      try {
        drop = await api.trainingClear({
          level_code: lv.code, ticks: st.tick, stars,
          hp_left: Math.round(hpRatio * 1000),
        });
      } catch (e) {
        drop = { error: e instanceof ApiError ? e.message : String(e) };
      }
    }

    const dl = h('dl', null,
      h('dt', null, '结果'), h('dd', { class: 'mono' }, win ? '通关' : '失败'),
      h('dt', null, '用时'), h('dd', { class: 'mono' }, `${seconds}s（目标 ${(parTicks(lv) / TICK_HZ).toFixed(0)}s）`),
      h('dt', null, '剩余血量'), h('dd', { class: 'mono' }, `${st.units[0].hp}/${st.units[0].maxHp}`),
      h('dt', null, '星级'), h('dd', { class: 'mono' }, win ? '★'.repeat(stars) : '—'),
      h('dt', null, '剩余血量'), h('dd', { class: 'mono' }, st.units.map((u) => u.hp).join(' : ')));

    /* ★★ 本地结算（和竞技场同一套，原来这里也没有）：
         服务端把这一关应得的经验返回来了（`drop.exp`），但前端只拿它**显示了**
         一句话 —— "经验由本地养成结算"里的"本地结算"根本不存在，
         所以打完一关等级一点不动。现在真的加、真的重算、真的上报镜像。 */
    let gain = null;
    if (drop && !drop.error && drop.exp > 0) {
      const dog = get().dog;
      gain = applyExp(dog || {}, drop.exp);
      if (dog) {
        set({ dog: { ...dog, level: gain.level, total_exp: gain.total_exp } });
        api.updateMine({ level: gain.level, total_exp: gain.total_exp }).catch(() => {});
      }
    }

    const reward = drop && !drop.error
      ? drop.first_clear
        ? note(`首通！${drop.exp} 经验 + ${drop.item}`, 'good')
        : note(`重复通关，${drop.exp} 经验`, '')
      : (drop?.error ? note(`记账失败：${drop.error}`, 'warn') : null);
    // 升级那个"时刻"：不做成就口吻，就写它长大了一点
    const levelNote = gain && gain.leveledUp
      ? note(`它又长大了一点。LV.${gain.from} → LV.${gain.level}`, 'good')
      : null;

    this.side.replaceChildren(
      h('div', { class: 'card tint' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '本关结束')),
        h('div', { class: 'h2' }, win ? `${stars}★ 通关` : '失败'),
        dl, reward, levelNote,
        h('div', { class: 'stack-sm', style: { marginTop: '10px' } },
          h('button', { class: 'btn btn-seal btn-block', id: 'lv-again',
                        onclick: () => this.startLevel(lv.code) }, '再来一次（R）'),
          h('button', { class: 'btn btn-ghost btn-block btn-sm', id: 'lv-back',
                        onclick: () => this.backToMap() }, '回关卡列表（Esc）'))));
  }

  // ---------------- 对外快照（给自动化测试与排障用） ----------------
  /** 只读快照。**不要**从 DOM 里抠数字——HUD 改一次版式测试就全瞎了。 */
  snapshot() {
    const st = this.st;
    if (!st) return { active: false };
    const foe = st.units[1];
    return {
      active: true,
      level: this.level?.code || null,
      phase: st.pve?.phase || null,
      wave: st.pve?.wave ?? -1,
      cleared: st.pve?.cleared ?? 0,
      waves: this.level?.waves.length ?? 0,
      tick: st.tick,
      over: st.over,
      winner: st.winner,
      hash: hashState(st),
      x: st.units.map((u) => Math.round(toGrid(u.x))),
      y: st.units.map((u) => Math.round(toGrid(u.y))),
      hp: st.units.map((u) => u.hp),
      maxHp: st.units.map((u) => u.maxHp),
      foeActive: foe.active !== false,
      foeHp: foe.active === false ? 0 : foe.hp,
      foeBoss: Boolean(foe.isBoss),
      foeIsBoss: Boolean(foe.isBoss),
      balls: st.balls.length,
    };
  }

  dispose() {
    this.stopLoop();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.fs?.dispose();
    this.hud?.dispose();
    this.view?.dispose();
  }
}
