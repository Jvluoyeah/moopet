/* 剧情关卡（PvE）—— 新引擎版
   ============================================================
   从旧引擎 sim.js 迁过来的。旧引擎里这块散在四处：
     initTraining / advanceToWave / progressTraining / settleRound 的 pve 分支。
   这里收成一个文件，**只在字段名上做适配**，规则一行不改：

     · 关卡节奏：推进 → 走到闸门 → 对手登场 → 打赢这一波 → 下一波 → 全清
     · 玩家倒下 = 失败（重来，没有"时间到比血量"）
     · 关内始终**只有两个 unit**（sim.js 的 pair=[本地,远端]、锁步、hashState
       全都建立在"两个单位"上，为杂兵改成不定长风险太大）

   ⚠️ 和旧引擎最大的差别是**字段名**，这张对照表是这次迁移的核心：
       旧                    新
       u.sta                 u.energy（0..100*SCALE）
       u.stun                u.stunF（帧，不是秒）
       u.invuln              u.invulnF
       u.cd[4]               u.cooldowns[6]（六招）
       u.act / u.actKind     u.attack（simAB 把招式状态收在一个对象里）
       u.comboWin            u.comboF
       u.maxHp               —— simAB 没有 maxHp，血量口径写在 data 里
       u.hitDone/dashCd      不需要（simAB 的 updateAttack 自己管）
   自己新增的是 PvE 专有的几个（旧引擎也有）：
       isBoss / profile / patternState / patternT
   —— 这几个**必须进快照和哈希**，否则联机/回滚会分叉（goal ⑥）。
*/

import { SCALE } from './fx.js';

/** 格 → 定点 */
const fx = (v) => Math.round(v * SCALE);

/** 这些是 PvE 专有字段，要跟着 unit 一起进快照 / 哈希 */
export const PVE_UNIT_FIELDS = ['isBoss', 'profile', 'patternState', 'patternT'];

/**
 * 开一关。
 * @param st      simAB 的 state
 * @param level   levels.js 里的关卡定义（含 waves / startX / name / code）
 * @param breeds  [我的品种, 关内对手的品种]
 */
export function initPve(st, level, breeds = []) {
  st.pve = {
    code: level.code,
    name: level.name,
    waves: level.waves,
    wave: -1,                       // -1 = 还没进第一波
    phase: 'advance',               // advance | fight | clear | fail
    gateX: 0,
    cleared: 0,
    breeds,
  };
  // 对手先不登场；玩家从场地左端出发，这样"往右推进"才是一段真的路
  //（出生点在中场的话第一道闸门就在身后，推进段等于没有）
  // 关卡可以指定自己的场地宽度（关卡数据里叫 stageW），
  // 不指定就用引擎默认的 STAGE_W。这一条要放在算 gateX 之前 ——
  // gateX 是绝对坐标，场地宽了之后闸门位置才对得上。
  if (level.stageW) st.stageW = level.stageW;
  st.units[1].active = false;
  st.units[0].x = fx(level.startX || 220);
  pveAdvanceToWave(st, 0);
  return st.pve;
}

/** 波与波之间的**刷新冷却**（帧）。
 *
 *  为什么要它：原来是"上一波倒下 → 立刻把下一波摆出来"，而且下一波摆在
 *  `min(stageW-150, gate+220)` —— 越靠后的波越贴近场地右边缘。
 *  实测 L1 的 Boss：gate 1700 → 1920，被 `stageW-150` 夹到 **1850**
 *  （stageW=2000，离右边界只剩 150）—— 于是 Boss 一登场就"卡在边缘"。
 *  用户的现场诊断："第三波 boss 要走到地图外才会刷新，一刷新就卡在边缘。"
 *
 *  128Hz 下 96 帧 ≈ 0.75 秒：足够看清"上一只倒了"，又不至于干等。
 *  这段冷却同时也是**界面示意的依据**（见 training.js 的倒计时提示）。
 */
export const WAVE_GAP_F = 96;

/** 登场时与玩家保持多远的距离（自己那一侧）。 */
const SPAWN_AHEAD = 420;
/** 登场点离场地两端至少留多少 —— 不留就会贴着边界（就是上面那个 bug）。 */
const SPAWN_MARGIN = 320;

/** 把第 idx 波的配置写到 units[1] 上（先不激活，等冷却走完） */
export function pveAdvanceToWave(st, idx) {
  const pve = st.pve;
  const w = pve.waves[idx];
  if (!w) { pve.phase = 'clear'; return; }
  pve.wave = idx;
  /* ⚠️ gateX 还在算，但**不再作为"激活条件"** —— 现在只用它决定
     "这一波偏向场地的哪一侧"（关卡设计上仍然希望后面的波更靠右）。
     激活条件换成了冷却计时，所以**玩家不必往右走**也能推进。 */
  pve.gateX = fx(w.gate);
  pve.gapF = WAVE_GAP_F;
  /* 冷却的**总长**也存一份：界面要算进度（1 - left/total）。
     不存的话页面只能去 import 常量，一旦关卡想给某一波单独调时长就对不上了。 */
  pve.gapTotal = WAVE_GAP_F;
  const u = st.units[1];
  const spec = w.unit || {};
  u.active = false;
  u.hp = spec.hp || 100;
  u.energy = u.maxEnergy || 100 * SCALE;
  /* 登场位置在这里**先按场地定一个**（离两端都留 SPAWN_MARGIN），
     真正激活时（progressPve 里）还会按玩家当前位置再校正一次 ——
     因为冷却期间玩家可能已经跑远了。 */
  u.x = fx(Math.max(SPAWN_MARGIN,
                    Math.min(st.stageW - SPAWN_MARGIN, w.gate + 220)));
  u.y = spec.flying ? fx(spec.hoverY || 150) : 0;
  u.vx = 0;
  u.vy = 0;
  u.facing = -1;
  u.grounded = !spec.flying;
  u.flying = Boolean(spec.flying);
  u.hoverY = fx(spec.hoverY || 150);
  u.isBoss = Boolean(spec.boss);
  u.profile = spec.profile || 'chaser';
  u.patternState = 0;
  u.patternT = 0;
  // 关卡可以覆盖数值（Boss 更硬更快）
  if (spec.stats) Object.assign(u.stats || (u.stats = {}), spec.stats);
  // 清状态（用 simAB 的字段名）
  u.stunF = 0;
  u.invulnF = 0;
  u.knockedF = 0;
  u.downTimeF = 0;
  u.cooldowns = [0, 0, 0, 0, 0, 0];
  u.combo = 0;
  u.comboF = 0;
  u.attack = null;
  u.blocking = false;
  pve.phase = 'advance';
}

/**
 * 每帧推进关卡。**在物理和命中之后调**（和旧引擎的位置一致）。
 */
export function progressPve(st) {
  const pve = st.pve;
  if (!pve || pve.phase === 'clear' || pve.phase === 'fail') return;
  const me = st.units[0];
  const foe = st.units[1];

  if (pve.phase === 'advance') {
    /* ★ 推进 = **等冷却**，不是"走到闸门"（用户要求：不用往右走就能刷新）。
       冷却走完的那一刻才决定登场位置：以**玩家当前所在**为参照，
       在他前方 SPAWN_AHEAD 处出现，并且夹进 [MARGIN, stageW - MARGIN] ——
       这样既不会离玩家太远（不必跑半张地图），也不会贴到边界上卡住。 */
    pve.gapF = Math.max(0, (pve.gapF || 0) - 1);
    if (pve.gapF === 0) {
      const toward = (foe.x ?? me.x) >= me.x ? 1 : -1;
      const want = me.x + toward * fx(SPAWN_AHEAD);
      foe.x = Math.max(fx(SPAWN_MARGIN),
                       Math.min(fx(st.stageW - SPAWN_MARGIN), want));
      foe.vx = 0;
      foe.vy = 0;
      foe.x = Math.round(foe.x);
      foe.active = true;
      pve.phase = 'fight';
      st.events.push({ kind: 'wave', wave: pve.wave, boss: foe.isBoss });
      st.fx.push({ kind: 'wave', wave: pve.wave, boss: foe.isBoss });
    }
    return;
  }

  // fight：这一波的对手倒下 → 进下一波
  if (foe.hp <= 0) {
    pve.cleared += 1;
    const next = pve.wave + 1;
    if (next >= pve.waves.length) {
      pve.phase = 'clear';
      st.over = true;
      st.winner = 0;
      st.events.push({ kind: 'clear' });
      st.fx.push({ kind: 'clear' });
    } else {
      pveAdvanceToWave(st, next);
    }
  }
}

/**
 * 关卡成败判定。**替代**普通对战的"时间到比血量"。
 * 玩家倒下 = 失败（重来即可）。
 */
export function settlePve(st) {
  if (!st.pve) return false;
  const me = st.units[0];
  if (me.hp <= 0) {
    st.pve.phase = 'fail';
    st.over = true;
    st.winner = 1;
    return true;
  }
  return false;
}
