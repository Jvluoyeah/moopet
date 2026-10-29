/* 回合流程（定点确定性）—— 移植自 abstract-brawl 的 engine.js · step()
   ============================================================
   来源：https://github.com/XzJoshZ/abstract-brawl （XzJoshZ，非商业学习交流许可）

   这一段管的是"一局怎么开始、怎么结束、什么时候换回合、三局两胜谁赢"。
   原版对应代码：

     intro:      phaseTime -= dt;
                 if (phaseTime < .75 && lastBanner !== 'FIGHT!') → 喊 FIGHT!
                 if (phaseTime <= 0) → phase = 'fight'
     roundend:   phaseTime -= dt;
                 if (phaseTime <= 0) {
                   if (wins.some(n => n >= 2)) phase = 'finished'
                   else { round++; resetRound(); }
                 }
     fight:      time -= (mode === 'training' ? 0 : dt);
                 if (training) { hp<=0 的人原地满血复活 }
                 else if (!teamAlive(0) || !teamAlive(1) || time <= 0) {
                   health = [teamHealth(0), teamHealth(1)]
                   winner = health[0] > health[1] ? 0 : 1
                   draw = |health[0] - health[1]| < 1e-5
                   if (!draw) wins[winner]++
                   phase = 'roundend'; phaseTime = 2.4;
                   banner = draw ? 'DRAW' : (time <= 0 ? 'TIME UP' : 'K.O.')
                 }

   定点化的转换：
     phaseTime / time 都是"秒"，这里一律换成**帧计数**（128Hz）。
     回合时长 60 秒 → 7680 帧；训练场不倒计时（原版就是这个行为）。
*/

import { TICK_HZ, clamp } from './fx.js';
import {
  STAGE, stepPhysics, updateAttack, inMeleeRange, resolveHit,
  canAttack, startAttack, SKILL_TYPES,
} from './rules.js';

/** 没给 data.skills 时用的默认六招（和 simAB 的 DEFAULT_SKILLS 一致） */
/* ⚠️ 顺序必须和 HUD_SKILLS 的标签一一对应：
       0 J 轻击 / 1 K 重击 / 2 U 突进 / 3 I 升龙 / 4 O 飞弹 / 5 L 必杀
       原来第 2、4 位是 projectile 和 upper（跟 HUD 的"突进/飞弹"标签错开了），
       表现是**按"突进"放出来的是飞弹** —— 按钮在骗人。
       这种错位不会报错、不会崩，只有对着标签实际放一遍才发现。 */
const DEFAULT_SKILLS = [
  SKILL_TYPES.light, SKILL_TYPES.heavy, SKILL_TYPES.dash,
  SKILL_TYPES.upper, SKILL_TYPES.projectile,
  // ⚠️ 第 6 招要显式带 `super: true`。
  //    类型表里的 beam 不带这个标记（原版是角色表在 index===5 时补的），
  //    少了它必杀会被当成普通招 —— 打击感分级里 `skill.super ? 12 : 4`
  //    就走到 4 那一支，震屏和顿帧都只有轻击的强度。
  { ...SKILL_TYPES.beam, super: true },
];


const secToF = (sec) => Math.max(1, Math.round(sec * TICK_HZ));

export const ROUND = {
  introF: secToF(2.25),          // 开场演出 288 帧（这期间输入会被吃掉）
  fightBannerAt: secToF(0.75),   // 剩这么多帧时喊 FIGHT!
  roundendF: secToF(2.4),        // 回合结束演出 307 帧
  roundF: secToF(60),            // 一回合 60 秒 = 7680 帧
  teamRoundF: secToF(90),        // 2v2 是 90 秒
  winsNeeded: 2,                 // 三局两胜
};

/** 队伍血量合计（原版 teamHealth）：原版是活人血量之和 */
export function teamHealth(fighters, team) {
  let n = 0;
  for (const f of fighters) if (f.team === team) n += Math.max(0, f.hp);
  return n;
}

/** 队伍里还有活人吗（原版 teamAlive） */
export function teamAlive(fighters, team) {
  return fighters.some((f) => f.team === team && f.hp > 0);
}

/** 开一局。原版 resetRound() 的对应物 */
export function createMatch(fighters, { training = false, teamMatch = false,
                                    winsNeeded = ROUND.winsNeeded,
                                    maxRounds = 0 } = {}) {
  return {
    fighters,
    training,
    phase: 'intro',
    phaseF: ROUND.introF,
    round: 1,
    wins: [0, 0],
    winsNeeded,
    // maxRounds>0 时，打到这个回合数就收工 —— 哪怕双方都没拿到足够胜场
    // （平局会一直开新回合）。0 表示不限，只看 winsNeeded。
    maxRounds,
    timeF: teamMatch ? ROUND.teamRoundF : ROUND.roundF,
    banner: '',
    bannerSub: '',
    finished: false,
    winnerTeam: null,
    // 出招队列（原版 f.queue），锁步下由输入驱动，这里先留结构
    hits: [],
    shots: [],        // 飞弹（projectile / barrage）
    traps: [],        // 布阵（trap）
  };
}

function startRound(m) {
  m.phase = 'intro';
  m.phaseF = ROUND.introF;
  m.timeF = ROUND.teamRoundF;
  m.banner = `ROUND ${m.round}`;
  m.bannerSub = '先赢两回合 · READY';
  for (const f of m.fighters) {
    f.attack = null;
    f.castPending = null;
    f.vx = 0; f.vy = 0;
    f.stunF = 0; f.knockedF = 0;
  }
}

/**
 * 推进一局一帧。
 * @param {object} m    createMatch 造出来的局
 * @param {object[]} inputs 每只格斗者这一帧的输入 { move, jump, attackIndex, blocking }
 * @returns {string[]} 这一帧发生的事件（'fight'|'ko'|'timeup'|'draw'|'roundend'|'finished'）
 */
export function stepMatch(m, inputs = []) {
  const events = [];

  // ---------- intro ----------
  if (m.phase === 'intro') {
    m.phaseF -= 1;
    if (m.phaseF <= ROUND.fightBannerAt && m.banner !== 'FIGHT!') {
      m.banner = 'FIGHT!';
      m.bannerSub = '开打！';
      events.push('fight');
    }
    if (m.phaseF <= 0) { m.phase = 'fight'; m.banner = ''; m.bannerSub = ''; }
    return events;                       // 原版 intro 里 return，不跑物理
  }

  // ---------- roundend ----------
  if (m.phase === 'roundend') {
    m.phaseF -= 1;
    if (m.phaseF <= 0) {
      const need = m.winsNeeded || ROUND.winsNeeded;
      const enough = m.wins.some((n) => n >= need);
      // ⚠️ 平局会一直开新回合（谁都没拿到胜场），所以还要有个回合上限兜底。
      //    这一条是第二十二轮量出来的：联机时两个人类都不怎么打，双方满血 →
      //    时间到判平局 → wins 一直是 [0,0] → 无限开新回合，e2e 等 75 秒等不到结束。
      const tooMany = m.maxRounds > 0 && m.round >= m.maxRounds;
      if (enough || tooMany) {
        m.phase = 'finished';
        m.finished = true;
        const need = m.winsNeeded || ROUND.winsNeeded;
        m.winnerTeam = m.wins[0] >= need ? 0 : 1;
        events.push('finished');
      } else {
        m.round += 1;
        startRound(m);
        events.push('roundstart');
      }
    }
    return events;
  }

  if (m.phase !== 'fight') return events;

  // ---------- fight ----------
  if (!m.training) m.timeF -= 1;

  // 每个格斗者：物理 + 出招 + 判定
  m.fighters.forEach((f, i) => {
    const inp = inputs[i] || {};
    const move = inp.move || 0;
    // 出招：上层直接给下标（原版是队列驱动，语义一样）
    if (inp.skill >= 0 && canAttack(f, inp.skill, { phase: m.phase })) {
      startAttack(f, inp.skill, f.data.skills?.[inp.skill] || DEFAULT_SKILLS[inp.skill]);
    }

    // 出招推进。updateAttack 会告诉我们"这一帧要不要做近战判定"、
    // "生成了几发飞弹"（barrage 连发就是靠这个）。
    const skillBefore = f.attack;
    const atk = updateAttack(f);
    const attacking = f.attack !== null;
    // 判定：对每个敌人试一次（原版 applyMelee 的循环）。
    // dash 是**每帧都判**，其余是"到点判一次"或"落地判一次"——
    // updateAttack 用 melee 标志把这件事告诉了我们，不用在这里分 type。
    if (atk.melee && skillBefore) {
      for (const o of m.fighters) {
        if (o.team === f.team || o.hp <= 0) continue;
        if (inMeleeRange(f, o, skillBefore.skill)) {
          const r = resolveHit(f, o, skillBefore.skill, skillBefore);
          if (r) {
      m.hits.push({
        by: f.id, on: o.id, type: r.type, dmg: r.damage,
        escape: Boolean(r.escape), combo: r.combo || 0, broke: Boolean(r.broke),
        // 打击感分级（震屏/顿帧/白闪）一路带出去，页面才能演出"轻重之分"
        shake: r.shake || 0, hitstopF: r.hitstopF || 0, flash: Boolean(r.flash),
      });
    }
        }
      }
    }
    // barrage / projectile 的飞弹：这一帧生成了几发就 push 几个实体
    for (let n = 0; n < atk.shots; n += 1) {
      m.shots.push({
        owner: f.id, x: f.x + f.facing * 40 * 256, y: f.y - 83 * 256,
        vx: f.facing * 520 * 256, vy: 0, lifeF: 90,
        skill: skillBefore ? skillBefore.skill : null,
      });
    }
    // trap：布阵实体
    if (f.trapSpawn) { m.traps.push(f.trapSpawn); f.trapSpawn = null; }
    const light = f.attack?.skill.type === 'light';
    stepPhysics(f, move, {
      blocking: Boolean(inp.blocking),
      attacking,
      attackLight: light,
      training: m.training,
      speed: f.data.speed,
    });
    f.blocking = Boolean(inp.blocking) && f.stunF <= 0 && !attacking;

    // 训练场：倒了立刻满血复活（原版 mode==='training' 的行为）
    if (m.training && f.hp <= 0) {
      f.hp = f.data.hp;
      f.stunF = Math.round(0.5 * TICK_HZ);
      events.push('training-revive');
    }
  });

  // 回合结束判定
  if (!m.training) {
    const over = !teamAlive(m.fighters, 0) || !teamAlive(m.fighters, 1) || m.timeF <= 0;
    if (over) {
      const h0 = teamHealth(m.fighters, 0);
      const h1 = teamHealth(m.fighters, 1);
      const draw = Math.abs(h0 - h1) < 1;      // 定点下用 1 个单位当"相等"
      const winner = h0 > h1 ? 0 : 1;
      if (!draw) m.wins[winner] += 1;
      m.phase = 'roundend';
      m.phaseF = ROUND.roundendF;
      m.banner = draw ? 'DRAW' : (m.timeF <= 0 ? 'TIME UP' : 'K.O.');
      m.bannerSub = draw ? '平局 · 再战一回合' : `第 ${winner + 1} 队赢下本回合`;
      m.hits.length = 0;
      for (const f of m.fighters) { f.attack = null; f.castPending = null; }
      events.push(draw ? 'draw' : (m.timeF <= 0 ? 'timeup' : 'ko'));
    }
  }

  return events;
}

/** 对账快照 */
export function snapMatch(m) {
  return {
    phase: m.phase, round: m.round, wins: [...m.wins],
    timeF: m.timeF, phaseF: m.phaseF, banner: m.banner,
    fighters: m.fighters.map((f) => ({
      id: f.id, x: f.x / 256, y: f.y / 256, hp: f.hp,
      stunF: f.stunF, combo: f.combo, attack: f.attack ? f.attack.index : null,
    })),
  };
}

export { STAGE, clamp };
