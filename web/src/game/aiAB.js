/* 电脑对手（定点确定性）—— 移植自 abstract-brawl 的 engine.js · ai(dt)
   ============================================================
   来源：https://github.com/XzJoshZ/abstract-brawl （XzJoshZ，非商业学习交流许可）

   ⚠️ 文件名带 AB 后缀是因为**现有的 game/ai.js 还在给 sim.js 用**，
      不能覆盖。等 sim.js 被换掉之后，这个文件改名成 ai.js、旧的删掉。

   原版结构（逐条对过来的）：
     ai(dt){
       if (mode==='local' || mode==='training') return;    // ← 见下
       const hard = this.difficulty;
       for (const f of this.fighters) {
         if (f.controller !== null || f.hp <= 0) continue;
         const o = this.targetFor(f); if (!o) continue;
         const dist = Math.abs(o.x - f.x), dir = Math.sign(o.x - f.x) || f.facing;
         f.aiWait -= dt; f.aiBlock = Math.max(0, f.aiBlock - dt);
         if (f.aiWait > 0) continue;
         f.aiWait = [.36,.22,.12,.045][hard] + random()*[.15,.15,.1,.035][hard];
         if (f.stun > 0 || f.knocked > 0) continue;
         ... 危险感知 / 格挡 / 走位 / 选招 ...
       }
     }

   ⚠️ **训练场没有 AI** —— 原版第一行就 return。这不是省事，是设计：
      练习模式不挨打。match.js 也照此办理。

   ⚠️ **随机必须走 rngSim**
      这里有 6 处 random()：等多久、防不防、防御时长、跳不跳、走位抖动、
      选招抖动与评分。它们**会改变战斗走向**，属于规则的一部分，
      必须用双端同步的那条流（fx.js 的 makeRng 注入进来）。
      用 Math.random 会直接导致联机不同步；粒子/镜头用另一条流（rngFx），两条不能混。
*/

import { TICK_HZ, clamp, SCALE } from './fx.js';
import { canAttack, SUPER_INDEX } from './rules.js';

const secToF = (sec) => Math.max(1, Math.round(sec * TICK_HZ));

/** 难度表（原版把这些数组直接写在函数里，这里提出来并换成帧） */
export const AI_TUNING = {
  waitBase: [0.36, 0.22, 0.12, 0.045].map(secToF),
  waitSpread: [0.15, 0.15, 0.1, 0.035].map(secToF),
  blockChance: [0.22, 0.48, 0.7, 0.9],
  incomingRange: [160, 240, 300, 370],
  attackChance: [0.55, 0.8, 0.94, 0.99],
};
const approachDist = (hard) => (hard === 3 ? 68 : 100);
const JUMP_OVER_CHANCE = 0.35;
const LONG_RANGE_TYPES = ['projectile', 'beam', 'barrage', 'dash', 'trap'];

/**
 * 跑一帧 AI，就地修改 fighters 的 aiWaitF / aiBlockF / aiMove / aiFacing / queue。
 *
 * @param {object} ctx { fighters, difficulty, random, phase, projectiles, training, local }
 * @returns {number} 这一帧做了决策的角色数（给测试用）
 */
export function stepAI(ctx) {
  const {
    fighters, difficulty = 1, random, phase = 'fight',
    projectiles = [], training = false, local = false,
  } = ctx;
  if (local || training) return 0;          // 原版第一行
  if (phase !== 'fight') return 0;
  if (typeof random !== 'function') {
    throw new Error('stepAI 必须注入确定性随机源（ctx.random），不能用 Math.random');
  }

  const hard = clamp(difficulty | 0, 0, 3);
  let acted = 0;

  for (const f of fighters) {
    if (f.controller !== null && f.controller !== undefined) continue;  // 人类操作
    if (f.hp <= 0) continue;

    const o = fighters
      .filter((v) => v.team !== f.team && v.hp > 0)
      .sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x))[0];
    if (!o) continue;

    const dist = Math.abs(o.x - f.x);
    const dir = Math.sign(o.x - f.x) || f.facing;

    if (f.aiWaitF > 0) f.aiWaitF -= 1;
    if (f.aiBlockF > 0) f.aiBlockF -= 1;
    if (f.aiWaitF > 0) continue;

    // 下次决策等多久：基础 + 抖动（随机 1）
    f.aiWaitF = AI_TUNING.waitBase[hard]
      + Math.floor(random() * AI_TUNING.waitSpread[hard]);
    if (f.stunF > 0 || f.knockedF > 0) continue;
    acted += 1;

    // ---- 危险感知：有飞弹朝我飞来 / 有人在我旁边出招 ----
    const incoming = projectiles.find((p) => {
      const owner = fighters[p.owner];
      if (!owner || owner.team === f.team) return false;
      if (!(p.lifeF > 0)) return false;
      if ((f.x - p.x) * p.vx < 0) return false;                       // 方向要对着我
      if (Math.abs(p.x - f.x) >= AI_TUNING.incomingRange[hard] * SCALE) return false;
      return Math.abs(p.y - (f.y - 80 * SCALE)) < 95 * SCALE;
    });
    const threatened = fighters.find((v) => v.team !== f.team && v.attack
      && Math.abs(v.x - f.x) < Math.min(240, (v.attack.skill.range || 120) + 35) * SCALE);

    // 最高难度会躲抓投
    if (hard === 3 && o.attack?.skill.type === 'grab' && dist < 150 * SCALE) {
      f.aiMove = -dir;
      f.jumpRequest = true;
      continue;
    }

    // ---- 防还是挨（随机 2）----
    if ((incoming || threatened) && random() < AI_TUNING.blockChance[hard]) {
      if (hard === 3 && incoming && !threatened && random() < 0.3) {    // 随机 3
        f.jumpRequest = true;
        f.aiMove = dir;
      } else {
        f.aiBlockF = secToF(0.18) + Math.floor(random() * secToF(0.24));
        f.aiMove = 0;
        const src = incoming ? incoming.x : (threatened ? threatened.x : o.x);
        f.aiFacing = Math.sign(src - f.x) || dir;
        f.facing = f.aiFacing;
      }
      continue;
    }

    // ---- 走位（随机 4）----
    f.aiMove = dist > approachDist(hard) * SCALE ? dir
      : (hard === 3 && o.blocking ? dir
        : (random() < 0.12 ? -dir : 0));
    if (incoming && random() < JUMP_OVER_CHANCE) {                      // 随机 5
      f.jumpRequest = true;
      continue;
    }

    // ---- 选招 ----
    const candidates = [0, 1, 2, 3, 4, 5].filter((i) => {
      if (!canAttack(f, i, { phase })) return false;
      const s = f.data.skills?.[i];
      if (!s) return false;
      if (s.type === 'heal') return f.hp < f.data.hp * 0.75;
      return LONG_RANGE_TYPES.includes(s.type)
        || dist < ((s.range || 120) + (hard === 3 ? -5 : 30)) * SCALE;
    });
    if (!candidates.length) continue;
    if (random() > AI_TUNING.attackChance[hard]) continue;              // 随机 6

    let index;
    if (hard === 3) {
      const score = (i) => {
        const s = f.data.skills[i];
        let v = 0;
        if (s.type === 'grab' && o.blocking) v += 150;
        if (i === SUPER_INDEX) v += 90;
        if (f.attack?.skill.type === 'light' && i === 1) v += 100;       // 轻击后接重击
        if (s.type === 'heal' && f.hp < f.data.hp * 0.4) v += 140;
        v += (s.damage || 20) * (s.count || 1) / Math.max(0.25, s.duration / TICK_HZ);
        if (dist > 230 * SCALE && ['projectile', 'beam'].includes(s.type)) v += 35;
        return v + random() * 20;                                       // 评分抖动
      };
      index = candidates.map((i) => [i, score(i)]).sort((a, b) => b[1] - a[1])[0][0];
    } else {
      index = candidates[Math.floor(random() * candidates.length)];
    }
    if (!f.queue.some((q) => q.index === index)) f.queue.push({ index, ttlF: secToF(0.18) });
  }
  return acted;
}

/** 给 AI 角色补上需要的字段（makeFighter 里没有的几个） */
export function initAI(f, { controller = null } = {}) {
  // ⚠️ 默认必须是 null：原版里 controller===null 才表示这台机器在控制，
  //    非 null 表示人类在操作（0=1P 键盘，1=2P 键盘）。
  //    我第一版默认给了 1，结果 AI 角色被当成人类、一次都不动作，测试全挂。
  f.controller = controller;
  f.aiWaitF = 0;
  f.aiBlockF = 0;
  f.aiMove = 0;
  f.aiFacing = f.facing;
  f.queue = f.queue || [];
  return f;
}
