/* 剧情关卡的对手行为（杂兵与 Boss）
   ============================================================
   和 game/ai.js（对战的 AI 对手）分开写，因为目标不一样：

     ai.js     要"公平地对打"，和玩家用同一套限制
     pve.js    要"演出 + 可读的威胁"：Boss 的大招必须能被看出来、能被躲

   两条硬要求：
   1) **确定性** —— 只依赖 state 和 tick，不用随机数。
      剧情关卡虽然是单机，但失败重来要能复现同一套出招，
      不然"我刚才明明躲过去了"就无从验证。
   2) **可读** —— 每次出手前都有明确的前摇，玩家看得见。
      这是横板动作游戏最基本的礼貌。

   四种行为档（对应 levels.js 的 PROFILES）：
     chaser   直线逼近，进范围就咬
     pouncer  拉开距离 → 蓄力 → 扑过来（扑完有硬直，这是玩家的输出窗口）
     drone    悬空游走，周期性俯冲；玩家得跳起来打
     roller   高速滚过碾压，冲过头会有一段转身时间
*/

/* ⚠️ 从**新引擎**取。
   旧引擎 sim.js 已经删了（上面那些 import 一度指向它）。
   字段名的差异在 simAB.step 末尾已经补齐（state/act/cd/stun），
   所以这里的行为逻辑一行没改 —— 改的只是取值的来源。 */
import { BTN, helpers } from './simAB.js';
import { SCALE } from './fx.js';

/* ⚠️ 旧引擎的 `helpers.fx`（格 → 定点）在新引擎的 helpers 里没有，
   这里自己补一个。**不能只靠 helpers** —— 那个对象的成员是两个引擎
   各自挑的，名字重叠但内容不同（`helpers.fx` 就是踩到的第一个）。 */
const fx = (v) => Math.round(v * SCALE);
import { SKILL_TYPES } from './rules.js';

const { toGrid } = helpers;

/**
 * 产出这一 tick 的对手输入。
 * @param {object} st 模拟状态
 * @param {object} u  units[1]（对手）
 */
export function enemyInput(st, u) {
  const idle = { mx: 0, my: 0, atk: 0, btn: 0 };
  if (!u || !u.active || st.over) return idle;
  if (st.hitstop > 0) return idle;
  if (u.stun > 0 || u.state === 'down') return idle;

  const me = u;
  const foe = st.units[0];
  const dx = toGrid(foe.x - me.x);
  const dist = Math.abs(dx);
  const toward = dx >= 0 ? 1 : -1;
  // reach 是**格**（COMBO 里写的就是格）；toGrid 一次会变成不到 1 格，
  // 对手就永远够不到人——ai.js 里踩过同一个坑
  /* ⚠️ 字段名：**旧引擎叫 reach，新引擎叫 range**（rules.js 的 S() 里是 range）。
     写成 `.reach` 会拿到 undefined，于是 `dist > reach * 0.8` 变成
     `dist > NaN` —— 永远 false，对手**一步都不走**。
     （实测：levels_test 的"对手会自己走过来 Δx=0"、e2e_training 里
       对手站着不动，根子都是这一个名字。）
     两个名字都认一下，免得以后再踩。 */
  const reach = (me.act && (me.act.range || me.act.reach))
    || SKILL_TYPES.light.range;

  // 出招中：把连招接完（和玩家一样按住攻击就能三连）
  if (me.state === 'attack' || me.state === 'skill' || me.state === 'dash') {
    if (me.state === 'attack' && me.combo < 3) return { mx: 0, my: 0, atk: 1, btn: BTN.ATK };
    return idle;
  }

  const profile = me.profile || 'chaser';
  const phase = st.tick % 240;        // 每个行为档自己的周期（4 秒）

  switch (profile) {
    case 'pouncer':
      return pouncerInput(me, foe, dist, toward, reach, phase);
    case 'drone':
      return droneInput(me, foe, dist, toward, reach, phase);
    case 'roller':
      return rollerInput(me, foe, dist, toward, reach, phase);
    case 'chaser':
    default:
      return chaserInput(me, foe, dist, toward, reach);
  }
}

/** 杂兵：直线逼近，进范围就咬 */
function chaserInput(me, foe, dist, toward, reach) {
  let mx = 0;
  let btn = 0;
  if (dist > reach * 0.8) mx = toward;
  else if (dist < reach * 0.5) mx = -toward * 0.0;   // 贴身不后退，站着咬
  if (dist <= reach * 1.02) btn |= BTN.ATK;
  return { mx: Math.round(mx), my: 0, atk: (btn & BTN.ATK) ? 1 : 0, btn };
}

/** 头目：拉开 → 蓄力 → 扑（扑完的硬直就是玩家的输出窗口） */
function pouncerInput(me, foe, dist, toward, reach, phase) {
  const state = me.patternState || 'approach';
  const t = me.patternT || 0;
  // 简单状态机，全部由 tick 推进（确定性）
  if (state === 'approach') {
    if (dist <= reach * 2.4 && dist >= reach * 1.3) {
      me.patternState = 'wind';
      me.patternT = 0;
      return { mx: 0, my: 0, atk: 0, btn: 0 };
    }
    return { mx: toward, my: 0, atk: dist <= reach * 1.02 ? 1 : 0,
             btn: dist <= reach * 1.02 ? BTN.ATK : 0 };
  }
  if (state === 'wind') {
    me.patternT = t + 1;
    if (me.patternT >= 18) { me.patternState = 'leap'; me.patternT = 0; }
    return { mx: 0, my: 0, atk: 0, btn: 0 };
  }
  if (state === 'leap') {
    me.patternT = t + 1;
    // 扑出去：冲撞技能 + 一个前跳
    const out = { mx: toward, my: 0, atk: 0, btn: 0 };
    if (me.patternT === 1) out.btn |= BTN.JUMP;
    if (me.patternT >= 4 && me.patternT <= 8 && me.cd[0] === 0) {
      out.btn |= BTN.S1;                       // 冲撞＝扑咬
      me.patternState = 'recover';
      me.patternT = 0;
      return out;
    }
    if (me.patternT > 16) { me.patternState = 'recover'; me.patternT = 0; }
    return out;
  }
  // recover：站着喘气（约 0.6 秒），这就是玩家的机会
  me.patternT = t + 1;
  if (me.patternT >= 20) { me.patternState = 'approach'; me.patternT = 0; }
  return { mx: 0, my: 0, atk: 0, btn: 0 };
}

/** 无人机：悬空游走 + 周期俯冲 */
function droneInput(me, foe, dist, toward, reach, phase) {
  const state = me.patternState || 'hover';
  const t = me.patternT || 0;
  if (state === 'hover') {
    me.patternT = t + 1;
    // 保持在玩家斜上方 200~400 格
    const want = dist > 420 ? toward : (dist < 220 ? -toward : 0);
    if (me.patternT >= 40) { me.patternState = 'dive'; me.patternT = 0; }
    me.hoverY = fx(200);
    return { mx: want, my: 0, atk: 0, btn: 0 };
  }
  // dive：压低高度扑过来，落地后有一段拉起
  me.patternT = t + 1;
  me.hoverY = fx(me.patternT < 14 ? 60 : 210);
  const out = { mx: toward, my: 0, atk: 0, btn: 0 };
  if (me.patternT >= 22) { me.patternState = 'hover'; me.patternT = 0; me.hoverY = fx(200); }
  if (dist <= reach * 1.1 && me.patternT < 18) { out.btn |= BTN.ATK; out.atk = 1; }
  return out;
}

/** 毛线球：高速滚过 + 转身 */
function rollerInput(me, foe, dist, toward, reach, phase) {
  const state = me.patternState || 'aim';
  const t = me.patternT || 0;
  if (state === 'aim') {
    me.patternT = t + 1;
    if (me.patternT >= 26) { me.patternState = 'roll'; me.patternT = 0; }
    // 蓄力时慢慢逼近，给玩家反应时间
    return { mx: toward, my: 0, atk: 0, btn: 0 };
  }
  if (state === 'roll') {
    me.patternT = t + 1;
    const out = { mx: 1, my: 0, atk: 0, btn: BTN.DASH };   // 一路向右滚
    if (me.patternT <= 2) out.btn = BTN.DASH;
    if (me.patternT >= 26) { me.patternState = 'turn'; me.patternT = 0; }
    return out;
  }
  // turn：滚过头了，转身（玩家的输出窗口）
  me.patternT = t + 1;
  if (me.patternT >= 24) { me.patternState = 'aim'; me.patternT = 0; }
  return { mx: 0, my: 0, atk: 0, btn: 0 };
}

/** 关卡里要用的技能提示（HUD 里显示"这一关的 Boss 会什么"） */
export function bossKit(profile) {
  return {
    pouncer: ['三段扑咬', '蓄力前摇明显，扑完有硬直'],
    drone: ['悬空游走', '俯冲扑击 · 要跳起来打'],
    roller: ['高速滚动碾压', '用冲刺的无敌帧穿过去'],
    chaser: ['直线追击', '进范围就咬'],
  }[profile] || ['普通追击'];
}

