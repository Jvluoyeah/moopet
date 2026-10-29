/* 训练场（无压力练习）
   ============================================================
   用的是**移植过来的新引擎**（simAB：rules + match + aiAB 那一套），
   不是现有的 sim.js。所以这个页面同时是"新引擎能不能跑起来"的实机验证。

   训练场和正式对战的差别（都在规则层，页面不用管）：
     · 不倒计时（match.js：training 时 timeF 不减）
     · 倒下立刻满血复活
     · **没有 AI**（aiAB 第一行就 return —— 练习模式不挨打）

   页面自己要做的事，和 arena.js 一样：按键 → 输入 → 步进 → 渲染。
   每帧步进的次数按 128Hz 走（新引擎的节拍），和别的页面不同。
*/

import { h } from '../lib/dom.js';
import { get } from '../lib/store.js';
import { pageShell } from '../components/layout.js';
import { onDispose } from '../lib/router.js';
import { SideStage } from '../game/stage.js';
import { createBattleHud } from '../game/hud.js';
import { attachFullscreen } from '../lib/fullscreen.js';
import { dogTexture } from '../world/actors.js';
import { breedOf } from '../lib/store.js';
import { actionFrames, preloadActions, preloadBreedArt } from '../lib/breedAssets.js';
import { pickPose } from '../game/pose.js';
import { createInterp, lerpFocus } from '../game/interp.js';
import { createTouchPad, isTouchDevice } from '../game/touch.js';
import {
  createState, step, unitView, BTN, TICK_HZ, STAGE_W, STAGE_H, HUD_SKILLS,
} from '../game/simAB.js';

const TICK_MS = 1000 / TICK_HZ;
/** 六招的键位（新引擎是 J/K/U/I/O/L） */
/* 招式键位。**必须和 HUD 钮上的标签一致** ——
   HUD 写 J/K/U/I/O/L，键盘就得认这些字母；
   只认数字的话，玩家照着钮上的字按是没反应的。
   数字键作为"不想记键位"的备选一起保留。 */
const KEY_SKILL = ['1', '2', '3', '4', '5', '6'];
const KEY_SKILL_AB = ['j', 'k', 'u', 'i', 'o', 'l'];

export async function dojoPage() {
  await Promise.all([
    preloadBreedArt().catch(() => {}),
    preloadActions().catch(() => {}),
  ]);
  const st = get();
  const myDog = st.dog;
  if (!myDog) return null;
  const myBreed = breedOf(myDog.breed_code);

  // ⚠️ 全屏按钮要在 Dojo 造出来**之后**才拿得到 fs，
  //    所以用个 holder 延后取——第一版直接在 onclick 里写 `fs.toggle()`，
  //    fs 在那个作用域里根本不存在，点一下就是 ReferenceError。
  let dojoRef = null;

  const { shell, pageEl } = pageShell({ current: '/dojo', withAside: false });
  const stage = h('div', { class: 'battle-stage', id: 'dojo-stage' });
  const hudHost = h('div', { class: 'battle-hud', id: 'dojo-hud' });
  const wrap = h('div', { class: 'battle-wrap', id: 'dojo-wrap' }, stage, hudHost);
  const side = h('div', { class: 'stack' });

  pageEl.replaceChildren(
    h('header', { class: 'sheet-head' },
      h('div', null,
        h('h1', null, '训练场'),
        h('div', { class: 'small muted' }, '无压力练习 · 不倒计时 · 倒下自动复活 · 木桩不会还手')),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-ghost btn-sm', id: 'dojo-fullscreen',
                      onclick: () => dojoRef?.fs?.toggle() }, '全屏'))),
    // 竖屏提示：横板对战在竖屏手机上摆不开，只显示"请横过来"
    h('div', { class: 'rotate-hint' },
      // 同 arena：去掉 📱 emoji（全站羊皮纸/墨线，且竖屏现在能打了）
      h('div', { class: 't' }, '把手机横过来'),
      h('div', { class: 'small' }, '横板对战需要宽一点的画面')),
    h('div', { class: 'battle-layout' },
      wrap, side));

  const game = new Dojo({ stage, hudHost, side, myDog, myBreed, wrap });
  dojoRef = game;
  window.__dojo = game;
  return onDispose(shell, () => game.dispose());
}

class Dojo {
  constructor({ stage, hudHost, side, myDog, myBreed, wrap }) {
    // ⚠️ 这里的 `side` 是**右侧面板的 DOM 节点**，不是玩家座位。
    //    名字撞车过（ackSkill 曾把它当数组下标用，直接失效）。
    //    玩家座位在训练场永远是 0，显式声明成 mySide。
    this.side = side;
    this.mySide = 0;
    this.wrap = wrap;               // ← 触控层要往它上面挂（忘了就是 createTouchPad(undefined)）
    this.stageEl = stage;
    this.myDog = myDog;
    this.myBreed = myBreed;
    this.keys = new Set();
    this.acc = 0;
    this.last = 0;
    this.hitstopF = 0;
    this.slowmoF = 0;
    // 渲染插值：128Hz 模拟跑在 60Hz 屏幕上，不插值就是一顿一顿的
    this.interp = createInterp();
    this._prevFocus = null;
    this._curFocus = null;
    this.raf = 0;

    this.st = createState(Date.now() & 0xffff, [myBreed, { code: 'husky' }], { training: true });
    this.view = new SideStage(stage, {
      stageW: STAGE_W, viewH: 660,
      backdrop: 'arena-hall',      // 和竞技场同一张大厅背景
      textureFor: (code, form) => (code ? dogTexture(breedOf(code), 1, 'print', form) : null),
    });
    // ⚠️ skills 与 tickHz 必须传。新签名的 hud.js 不再写死旧引擎的 4 招，
    //    不传的话右下角会渲染成 **0 个技能钮**（第一版就是这个疏漏）。
    this.hud = createBattleHud(hudHost, {
      skills: HUD_SKILLS,
      tickHz: TICK_HZ,
      onSkill: (i) => this.pressSkill(i),
    });
    this.hud.setNames(myDog.name, '木桩');
    this.hud.setAvatars({ url: `breeds/${myBreed.code}/forms/face.png`, alt: myBreed.code }, '');
    this.fs = attachFullscreen(wrap, { onResize: () => this.view.resize() });

    this.renderSide();
    this.bindKeys();
    this.setupTouch();
    this.start();
  }

  renderSide() {
    this.side.replaceChildren(
      h('div', { class: 'card flat' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '练习场')),
        h('ul', { class: 'small', style: { margin: 0, paddingLeft: '18px' } },
          h('li', null, '木桩站着不动，你可以随便试招'),
          h('li', null, '倒下会自动站起来，不会结束'),
          h('li', null, '没有时间限制，练到会为止'))),
      h('div', { class: 'card flat' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '操作')),
        // 键位说明必须跟着引擎走 —— 这里是六招制，写"1~4 放技能"就是错的
        //（训练场原来照抄了竞技场的旧文案，换引擎之后没人改）。
        h('ul', { class: 'small', style: { margin: 0, paddingLeft: '18px' } },
          h('li', null, 'A / D 移动，W 或空格 跳'),
          h('li', null, 'L / S 防御（有防御值，被打空会破防）'),
          h('li', null, 'J 轻击 · K 重击 · U 突进 · I 升龙 · O 治愈（回血看体力、耗气看敏捷）'),
          h('li', null, '气攒满 100 放 L 必杀'),
          h('li', null, '数字键 1~6 是同样的六招（不想记键位就用它）'))),
      h('div', { class: 'note-paper' },
        h('div', { class: 'hand', style: { fontSize: '15px' } }, '小贴士'),
        h('div', { class: 'small' },
          '气在训练场里会自动补满，想练必杀随时可以放。',
          '被打破防的时候会有一下硬直，那是练防御的好时机。')));
  }

  bindKeys() {
    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (k === ' ') { if (!e.repeat) this.keys.add('w'); return; }
      this.keys.add(k);
      // 数字键和字母键都认（字母是钮上标的那套）
      let si = KEY_SKILL.indexOf(k);
      if (si < 0) si = KEY_SKILL_AB.indexOf(k);
      if (si >= 0) this.pressSkill(si);
    };
    this._onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ') this.keys.delete('w');
      this.keys.delete(k);
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /**
   * 触控层。**只在触屏设备上挂** —— 桌面窄窗口不该冒出虚拟按键。
   * 触控走的是同一条输入路径：写 this.keys + 调 pressSkill，
   * 所以引擎那边完全不需要知道有触摸这回事。
   */
  setupTouch() {
    if (!isTouchDevice()) return;
    document.body.classList.add('is-touch');
    document.body.classList.add('is-battle');
    // 和 arena 一样：必须挂 body（挂在 wrap 里会被 .sheet 的 transform 困住）
    this.touch = createTouchPad(document.body, {
      skillCount: HUD_SKILLS.length,
      // 同 arena：触控层显示招式中文名，不显示键盘字母（手机上没有键盘）
      skillKeys: HUD_SKILLS.map((s) => s.name),
      onKey: (key, down) => {
        if (down) this.keys.add(key); else this.keys.delete(key);
      },
      onSkill: (i) => this.pressSkill(i),
    });
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

  readInput() {
    const k = this.keys;
    let btn = 0;
    if (k.has('w') || k.has('arrowup')) btn |= BTN.JUMP;
    if (k.has('j') || k.has('z')) btn |= BTN.ATK;
    if (k.has('shift')) btn |= BTN.DASH;   // 冲刺只留 Shift（K 现在是重击）
    if (k.has('s') || k.has('arrowdown')) btn |= BTN.GUARD;   // 防御只留 S（L 现在是必杀）
    return {
      mx: (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0),
      my: 0,
      atk: (btn & BTN.ATK) ? 1 : 0,
      btn,
      skill: this._skillIndex(),       // -1 = 这一帧不出招
    };
  }

  start() {
    this.last = performance.now();
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - this.last);
      this.last = now;

      // ---- 顿帧 ----
      // 命中瞬间把模拟冻住几帧、画面照常渲染 —— 这就是"打到了"的手感。
      // 帧数由引擎按招式分级给（轻击 4 / 重击 8 / 必杀 8 / 格挡 2），
      // 照搬原版 `this.hitstop = blocked ? .018 : super ? .065 : ...`。
      if (this.hitstopF > 0) {
        this.hitstopF -= 1;
        this.acc = 0;                 // 顿帧期间不要攒时间，不然解冻会连跳好几帧
this.draw();
        return;
      }

      // ---- KO 慢镜 ----
      // 打死对手的那一下拉长来看（只喂一部分时间给模拟），终结感全靠它。
      // 用累加器缩放而不是改 TICK_HZ：模拟本身的刻度不能动，
      // 否则锁步对账会算错（联机那边两端慢镜时间不同就分叉了）。
      let scale = 1;
      if (this.slowmoF > 0) {
        this.slowmoF -= 1;
        scale = 0.28;
      }
      this.acc += dt * scale;
      let n = 0;
      // 128Hz 步进；一次最多补 8 帧，避免切后台回来爆炸
      while (this.acc >= TICK_MS && n < 8) { this.acc -= TICK_MS; this.tickOnce(); n += 1; }
      // 插值系数 = 累加器余数 / 一个 tick。
      // 每帧都画（哪怕这一帧没推进模拟），位置在两次 tick 之间平滑过渡。
      this.draw(n > 0 ? this.acc / TICK_MS : this._lastAlpha);
      this._lastAlpha = n > 0 ? this.acc / TICK_MS : this._lastAlpha;
    };
    this.raf = requestAnimationFrame(loop);
  }

  tickOnce() {
    const me = this.readInput();
    // 木桩（1 号）不动也不还手 —— 训练场本来就没有 AI
    step(this.st, [me, {}]);
    // 每推进一 tick 记一次，插值时拿它和上一 tick 比
    this.interp.push(this.st.units.map(unitView));
  }

  draw(alpha = 0) {
    // 插值出来的位置（只有 x/y/vx/vy 是插的，状态取当前 tick）
    const units = this.interp.sample(alpha);
    if (!units.length) return;
    // ⚠️ 立牌要**页面自己挂**：SideStage 不会自动造 actor，
    //    必须调 attachActor(side, texture, facing)。
    //    （第一版漏了这步，页面不报错、HUD 也正常，就是场上一只狗都没有。）
    if (!this._attached) {
      this._attached = true;
      units.forEach((u, i) => {
        const tex = dogTexture(breedOf(this.myBreed.code), 1, 'print', 'sit');
        this.view.attachActor(i, tex, i === 0 ? 1 : -1);
      });
    }
    const me = units[0];
    const foe = units[1];
    const nf = actionFrames(this.myBreed.code, 'run');
    const forms = [
      pickPose(me, this.st.tick, nf).form,
      pickPose(foe, this.st.tick, nf).form,
    ];
    this.view.render({
      units,
      balls: [],
      forms,
      codes: [this.myBreed.code, this.myBreed.code],
      focus: { x: (me.x + foe.x) / 2, span: Math.abs(me.x - foe.x) },
      dt: 1 / TICK_HZ,
    });
    // 血量飘字统一在 stage.js 的 render 里做（见那里的注释），别在这里重复调用
    this.consumeEvents(this.st);
    this.ackSkill(this.st);
    // 训练场没有时限，用正计时
    this.hud.update({ units }, this.st.tick, 0, true);
    this.hud.setSideVisible(1, true);
  }

  /** 消费引擎事件：把"打到了"这件事演出来（顿帧/震屏/白闪/火花/飘字） */
  consumeEvents(st) {
    if (!st || !st.events || !st.events.length) return;
    for (const ev of st.events) {
      if (ev.type === 'escape') {
        this.hud.flash(ev.by === 0 ? `${ev.combo} 连击 · 木桩脱离` : '被强制脱离', 900, 'escape');
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
      this.hitstopF = Math.max(this.hitstopF || 0, ev.hitstopF || 0);
      this.view.shake = Math.max(this.view.shake || 0, ev.shake || 0);
      if (ev.flash) this.view.flash = 0.15;
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
      if (ev.broke) this.hud.flash('破防！', 700, 'escape');
      else if (ev.kind === 'counter') this.hud.flash('反击！', 700, 'escape');
      // 慢镜：KO / 破防 / 必杀这三个"高光时刻"才拉慢，普通命中不慢
      if (ev.broke || ev.flash) this.slowmoF = Math.max(this.slowmoF || 0, 26);
    }
    st.events.length = 0;
  }

  /** e2e 用的快照（不要靠 DOM 断言） */
  snapshot() {
    const units = this.st.units.map(unitView);
    return {
      tick: this.st.tick,
      phase: this.st.match.phase,
      training: this.st.training,
      x: units.map((u) => Math.round(u.x)),
      hp: units.map((u) => u.hp),
      state: units.map((u) => u.state),
      timeF: this.st.match.timeF,
      hash: this.hash(),
    };
  }

  hash() {
    const m = this.st.match;
    return m.fighters.map((f) => `${Math.round(f.x)},${f.hp}`).join('|');
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.touch?.dispose();
    document.body.classList.remove('is-touch');
    document.body.classList.remove('is-battle');
    this.hud?.dispose();
    this.view?.dispose?.();
    this.fs?.dispose?.();
  }
}

export { STAGE_H };
