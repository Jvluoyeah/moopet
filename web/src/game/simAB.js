/* 新引擎的锁步适配层
   ============================================================
   目的：让 **移植过来的引擎**（rules.js + match.js + aiAB.js）实现和现有
   `sim.js` **一模一样的锁步契约**，这样 `net.js` 的 33 项锁步测试可以
   原封不动地架到新引擎上验一遍。

   为什么先写适配层、而不是直接把 sim.js 换掉：
     sim.js 的语义被 235 项测试钉着（sim 99 / net 33 / levels 103）。
     一次性替换，红的会是一大片，根本分不清"新引擎不对"还是"测试写的是旧语义"。
     先让新引擎**通过同一套契约测试**，再切页面——这样每一步都有明确的绿/红。

   net.js 只要求 5 样：TICK_HZ / createState / step / hashState / cloneState。

   ⚠️ 输入位掩码（BTN）沿用现有约定，页面和 net.js 不用改：
        JUMP → jumpRequest        ATK → 第 0 招（轻击）
        DASH → 第 3 招（dash）    S1..S4 → 第 2/4/5 招
      （现有四技能是 冲撞/吠叫/翻滚/捡球；新引擎是 6 招制，映射见 INPUT_MAP）
*/

import { TICK_HZ, SCALE as FX_SCALE } from './fx.js';
import {
  STAGE, makeFighter, stepPhysics, updateAttack, canAttack, startAttack,
  inMeleeRange, resolveHit, SKILL_TYPES,
} from './rules.js';
import { createMatch, stepMatch } from './match.js';
import { initPve, progressPve, settlePve, PVE_UNIT_FIELDS }
  from './pveAB.js';
import { stepAI, initAI } from './aiAB.js';
import { makeRng } from './fx.js';
// ★ 四维 → 战斗参数的唯一致源（等级 → 四维、四维 → 血量/伤害/速度/冷却/气力）
import { combatAt } from './growth.js';

export { TICK_HZ };

/** 引擎自带的舞台比现有场地窄（960 vs 2400）。适配层把坐标从"格"映射到现有场地，
 *  这样 stage.js 的取景不用改。 */
/** 一局的长度（帧）。arena.js 是 `const { ROUND_TICKS } = SIM` 解构取的，
 *  缺了 HUD 的计时器直接显示 NaN —— 而 api_diff_test 只扫 `SIM.xxx`，
 *  **扫不到解构出来的名字**，所以这条漏了一轮才被用户肉眼发现。 */
export const ROUND_TICKS = 7680;   // 60 秒 × 128Hz

export const STAGE_W = 2400;
export const STAGE_H = 900;
const X_OFFSET = Math.round((STAGE_W - STAGE.W) / 2);

/** 六招的默认配置（新引擎按类型表出招，这里给每个位置定死一个类型） */
/* ⚠️ 顺序必须和 HUD_SKILLS 的标签一一对应：
       0 J 轻击 / 1 K 重击 / 2 U 突进 / 3 I 升龙 / 4 O 飞弹 / 5 L 必杀
       原来第 2、4 位是 projectile 和 upper（跟 HUD 的"突进/飞弹"标签错开了），
       表现是**按"突进"放出来的是飞弹** —— 按钮在骗人。
       这种错位不会报错、不会崩，只有对着标签实际放一遍才发现。 */
const DEFAULT_SKILLS = [
  SKILL_TYPES.light, SKILL_TYPES.heavy, SKILL_TYPES.dash,
  SKILL_TYPES.upper,
  /* ★ 第 5 个键（O）从**飞弹**改成**治愈**（用户要求）。
     为什么不再留着飞弹：这一招的远程链路是坏的 —— 见本文件下面那条注释
     "远程招（O 飞弹 / barrage）在所有模式下都不造成伤害"，
     也就是 O 键按下去等于空放。改成治愈既补上了一个真能用的招，
     也顺手给了「体力」这一维一个战斗内的用处。
     回多少血 / 花多少气由 growth.js 的 healOf 决定（体力 → 回血、敏捷 → 耗气）。 */
  SKILL_TYPES.heal,
  // ⚠️ 第 6 招要显式带 `super: true`。
  //    类型表里的 beam 不带这个标记（原版是角色表在 index===5 时补的），
  //    少了它必杀会被当成普通招 —— 打击感分级里 `skill.super ? 12 : 4`
  //    就走到 4 那一支，震屏和顿帧都只有轻击的强度。
  { ...SKILL_TYPES.beam, super: true },
];

/** BTN 位掩码 → 第几招。和现有页面的按键约定保持一致。 */
export const BTN = {
  JUMP: 1, ATK: 2, DASH: 4, GUARD: 8, S1: 16, S2: 32, S3: 64, S4: 128,
};
/** arena.js 直接用 SIM.SKILL_BTN 做技能钮的位掩码（差异清单里点名的） */
export const SKILL_BTN = [BTN.S1, BTN.S2, BTN.S3, BTN.S4];

/** arena.js 用 SIM.helpers.toGrid / fromGrid 做坐标换算 */
export const helpers = {
  toGrid: (v) => v / FX_SCALE,
  fromGrid: (v) => Math.round(v * FX_SCALE),
  clamp: (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v)),
};

const INPUT_MAP = [
  [BTN.ATK, 0], [BTN.DASH, 3], [BTN.S1, 2], [BTN.S2, 4], [BTN.S3, 5], [BTN.S4, 1],
];

/**
 * 造一局。签名和 sim.js 的 createState 保持一致。
 * @param {number} seed
 * @param {Array} breeds  两只狗（0 号是本地，1 号是对手）
 * @param {object} opts   { training, ai }  ai=true 时 1 号交给电脑
 */
export function createState(seed, breeds = [], opts = {}) {
  const { training = false, ai = false, pve = null } = opts;
  const mkDogs = () => [0, 1].map((i) => {
    const b = breeds[i] || {};
    /* ★ 四维接进战斗（见 game/growth.js）。
       ⚠️ 在这之前这里是三个写死的值：`hp: 100 * 4`、`speed: 260`、`power: 1` ——
          而 `power` 唯一的用处是 rules.js 里的 `dmg = skill.damage * power`，
          也就是那个乘法**恒等于 ×1**；敏捷/智力/亲和更是全代码库没人读。
          于是八个原型打起来完全一样，选谁纯看长相。
       现在从品种四维 + 等级算出这三个值（`b.level` 缺省按 1 级）。
       数值口径与"接上之前"对齐：四维 50 → 血量 400 / 速度 260 / 伤害 ×1。 */
    const cb = combatAt(b, b.level || 1);
    const f = makeFighter({
      hp: cb.hpMax,
      speed: cb.speed,
      trait: b.trait || 'rush',
      power: cb.damageMul,
      // 智力/亲和：模拟里没有现成旋钮，用每人一份的倍率（rules.js 里读）
      cdMul: cb.cdMul,
      energyMul: cb.energyMul,
      // 治愈（O 键）的两个数：回血看体力、耗气看敏捷（见 growth.js 的 healOf）
      healAmount: cb.amount,
      healCost: cb.cost,
      skills: DEFAULT_SKILLS,
    }, i);
    f.cooldowns = [0, 0, 0, 0, 0, 0];
    f.queue = [];
    f.breed = b;
    f.combat = cb;                      // 留着给界面/测试看"它现在什么水平"
    return f;
  });
  const fighters = mkDogs();
  /* ⚠️ controller 的约定（原版就是这么定的，我踩了两次）：
       controller === null  → **机器控制**（stepAI 会驱动它）
       controller !== null  → **人类控制**（stepAI 跳过它）

     原来这里是 `else fighters[1].controller = 1` —— 竞技场调 createState 时
     没传 ai，于是对手被标成"人类操作"，stepAI 第一行就把它 continue 掉了：
     表现是 **AI 站着不动、一招不出**（实测"走过的格子 0、出过的招 -"）。

     正确做法：左边是人类座位（0），右边默认是**机器座位**（null）。
     双人对战时右边由远端输入驱动，跟 controller 没关系 ——
     net.js 只在"AI 模式"或"掉线接管"时才调 aiInput。
     （同一个坑在移植第 8 轮踩过一次，那次是在测试里把 AI 的 controller 设成 1。） */
  fighters[0].controller = 0;
  initAI(fighters[1], { controller: null });

  // ⚠️ 单局制，不是原版的三局两胜。
  //    abstract-brawl 的 match.js 是"先赢两回合"，而我们的竞技场
  //    打完**一局**就弹结算面板（文案是"本局结束"）。
  //    照搬三局两胜会让一局变成 2~3 倍长——e2e_pvp 等的是"本局结束"、
  //    窗口 75 秒，60 秒一局打完两局就超时了（第二十轮就是这个挂了）。
  //    规则层保留 winsNeeded 的概念，这里把它设成 1。
  const m = createMatch(fighters, { training, winsNeeded: 1, maxRounds: 1 });
  /* ⚠️ shots / traps / hits 必须是 **match 上那一份的别名**。
     原来 st 上各建了一个空数组，而 simAB.step 往 m.shots 里 push、
     aiInput 也从 m.shots 读 —— 于是 st.shots 永远是空的。
     快照存的是 st.shots（空的），回滚之后飞弹全丢、AI 的判断跟着变，
     整局就分叉了（diff 出来的表现是 AI 所有字段都对不上）。 */
  m.shots = m.shots || [];
  m.traps = m.traps || [];
  m.hits = m.hits || [];
  const state = {
    seed,
    tick: 0,
    training,
    ai,
    match: m,
    random: makeRng(seed),
    units: fighters,

    // ⚠️ 下面这些字段是 **arena.js 的 snapshot() 直接读的**，
    //    而且必须在**创建时**就有值 —— 不能等 step() 里再补。
    //    第二十轮在 Node 里复现出来的形状差：
    //      旧：balls, fx, hits, hitstop, over, pve, seed, stageW, tick, units, winner
    //      新：ai, match, random, seed, tick, training, units
    //      新缺：balls, fx, hits, hitstop, over, pve, stageW, winner
    //    `over` / `winner` 尤其致命：snapshot() 直接读它们，
    //    创建后还没 step 时就是 undefined，联机那边一格没推进就会读成空的。
    over: false,
    winner: null,
    stageW: STAGE_W,
    /** 别名到 match 上那一份（别各建一个） */
    hits: m.hits,
    /* ⚠️ shots / traps 也必须是 match 上那一份的**别名**。
       它们一度从 return 里整个丢了 —— 于是 st.shots 是 undefined，
       快照存了个空数组，回滚之后飞弹全没、AI 的判断跟着变、整局分叉。
       （diff 出来的表现是 AI 的所有字段都对不上。） */
    shots: m.shots,
    traps: m.traps,
    /** 顿帧剩余帧数 */
    hitstop: 0,
    /** 弹道 */
    balls: m.balls || (m.balls = []),
    /** 表现层特效队列（粒子等），引擎不管内容，页面自己填 */
    fx: [],
    /** 剧情关卡的波次状态。新引擎还没有 PvE，先给个空壳让页面读得到 */
    pve: null,
    /** 这一帧发生的事件（页面消费完自己清）。
     *  目前只有 'escape'（7 连强制脱离）和 'ko'/'timeup'/'draw'（回合结束）。
     *  为什么要事件而不是让页面去猜状态：这几个都是**瞬时**的，
     *  靠每帧比状态量根本抓不住（上一轮 is-ready 就是这么踩的坑）。 */
    events: [],
    /** 每个玩家的战绩。结算面板要显示"造成/承受伤害、最高连段、命中数" ——
     *  这些是**玩家看得懂**的信息，比原来的"结算帧/状态哈希"有用得多。
     *  （原来那两项是给我自己排查用的，用户明确说过界面上不要出现底层说明。） */
    stats: [
      { dealt: 0, taken: 0, hits: 0, maxCombo: 0, blocked: 0 },
      { dealt: 0, taken: 0, hits: 0, maxCombo: 0, blocked: 0 },
    ],
    /** 开局时刻的 tick，用来算用时 */
    startTick: 0,
  };

  /* 剧情关卡：状态组装好之后再开一关。
     必须放在最后 —— initPve 要写 units[1] 的 active/x，
     而 units 就是 m.fighters，得等 createMatch 把它们接上之后再动。 */
  if (pve) initPve(state, pve, breeds);
  return state;
}

/** 位掩码 → 这一帧的输入。找不到就返回 0（不出招）。 */
function firstSkill(btn) {
  for (const [bit, idx] of INPUT_MAP) if (btn & bit) return idx;
  return -1;
}

/**
 * 弹道推进 + 命中判定。**每个 tick 都要调**。
 *
 * 照抄 abstract-brawl `engine.js` 里 projectiles 的那段循环：
 *   移动 →（对每个敌人）距离判定 → 命中就结算并让弹丸消失
 *   → 清掉过期和出界的。
 *
 * ⚠️ 必须**就地改数组**（splice），不能 `st.shots = filtered` ——
 *    `st.shots` 是 `m.shots` 的别名，整体替换会让别名断掉，
 *    aiInput 读到的还是旧数组（这个坑在快照那边踩过一次）。
 */
export function resolveShots(st) {
  const m = st.match;
  const shots = st.shots || [];
  if (!shots.length) return 0;
  const HIT_X = 38 * SCALE;            // 原版：38 + radius
  const HIT_Y = 72 * SCALE;            // 原版：72
  let landed = 0;

  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const p = shots[i];
    p.lifeF -= 1;
    p.x += p.vx >> 7;                  // Q8：vx>>7 就是 vx/128
    p.y += (p.vy || 0) >> 7;

    let dead = p.lifeF <= 0;
    if (!dead) {
      const owner = m.fighters[p.owner];
      for (const t of m.fighters) {
        if (!owner || t.team === owner.team || t.hp <= 0) continue;
        if (Math.abs(p.x - t.x) < HIT_X
            && Math.abs(p.y - (t.y - 83 * SCALE)) < HIT_Y) {
          const skill = p.skill;
          if (skill) {
            // 借用 p.attack 当 source（里面有 hit 集合），没有就临时造一个
            const source = p.attack || { hit: new Set() };
            const r = resolveHit(owner, t, skill, source, p.x);
            if (r) {
              m.hits.push({
                by: owner.id, on: t.id, type: r.type, dmg: r.damage,
                escape: Boolean(r.escape), combo: r.combo || 0,
                broke: Boolean(r.broke),
                shake: r.shake || 0, hitstopF: r.hitstopF || 0,
                flash: Boolean(r.flash),
              });
              landed += 1;
            }
          }
          dead = true;
          break;
        }
      }
    }
    // 出界也算死（原版是 x < -60 或 x > W+60）
    if (!dead && (p.x < -60 * SCALE || p.x > (STAGE.W + 60) * SCALE)) dead = true;
    if (dead) shots.splice(i, 1);
  }
  return landed;
}

/**
 * 推进一帧。签名和 sim.js 的 step 一致：st = step(st, inputs)
 * @param {object} st
 * @param {Array} inputs  两个玩家这一帧的输入 { mx, atk, btn }
 */
export function step(st, inputs = []) {
  const m = st.match;
  const ins = [0, 1].map((i) => {
    const raw = inputs[i] || {};
    const btn = (raw.btn | 0) || (raw.atk ? BTN.ATK : 0);
    return {
      // mx 是 -1/0/1，新引擎的物理也是这个口径
      move: Math.max(-1, Math.min(1, raw.mx | 0)),
      blocking: Boolean(btn & BTN.GUARD),
      jump: Boolean(btn & BTN.JUMP),
      // ⚠️ 优先用 raw.skill（直接给招式下标 0~5）。
      //    走位掩码再 firstSkill() 反查是**多余的一层**，而且会错乱：
      //    INPUT_MAP 是 S1→2, S2→4, S3→5, S4→1，HUD 的钮却是按 0~5 排的，
      //    两边对不上 —— 按第 3 个钮实际放的是第 5 招（必杀），
      //    而必杀 cd=0，所以那个钮永远不进冷却（用户说的"倒计时不会动"）。
      //    现在钮 → 下标是直连的，键位标签说什么就放什么。
      // ⚠️ 判据是 `>= 0`，不是"不等于 undefined"。
      //    页面在没有放招时传的是 **-1**（不是 undefined），
      //    只判 undefined 的话 -1 会被当成"有效下标"，
      //    于是永远不回退到位掩码 —— J（普攻，走 BTN.ATK）就彻底失效了。
      //    （e2e_dojo 的"贴脸连按 J 能打到木桩"就是这么挂的。）
      skill: (typeof raw.skill === 'number' && raw.skill >= 0)
        ? raw.skill : firstSkill(btn),
      raw,
    };
  });

  // AI 先出决策（它写的是 f.aiMove / f.jumpRequest / f.queue）
  if (st.ai) {
    stepAI({
      /* ⚠️ 难度要**从 st.ai 取**，不能硬编码。
         原来写死 `difficulty: 2`，于是：
           · 竞技场传进来的 aiSkill 完全不起作用（AI 永远是最狠那一档）
           · AI_TUNING[2] = 每 0.12 秒出一次招、94% 命中、70% 格挡 ——
             玩家**永远在硬直里**，体感就是"一点都动不了/按不出招"（用户报的）
         （那不是 bug 而是难度问题：硬直中 canAttack 正确地拒绝了出招。
           但"练手"模式不该是这个强度。） */
      fighters: m.fighters,
      difficulty: (st.ai && Number.isFinite(st.ai.difficulty)) ? st.ai.difficulty : 1,
      random: st.random,
      phase: m.phase, projectiles: m.shots, training: st.training, local: false,
    });
    const bot = m.fighters[1];
    if (bot.aiMove) ins[1].move = bot.aiMove;
    if (bot.jumpRequest) { ins[1].jump = true; bot.jumpRequest = false; }
    if (bot.queue.length) { ins[1].skill = bot.queue[0].index; bot.queue.shift(); }
  }

  // 出招：先试玩家输入，再试 AI 排的队
  for (let i = 0; i < 2; i += 1) {
    const f = m.fighters[i];
    const want = ins[i].skill;
    if (want >= 0 && canAttack(f, want, { phase: m.phase })) {
      startAttack(f, want, DEFAULT_SKILLS[want]);
    } else if (f.queue.length && canAttack(f, f.queue[0].index, { phase: m.phase })) {
      startAttack(f, f.queue[0].index, DEFAULT_SKILLS[f.queue[0].index]);
      f.queue.shift();
    }
    if (ins[i].jump && f.y >= STAGE.FLOOR && f.stunF <= 0 && !f.attack) {
      f.vy = -600 * 256;
    }
  }

  // 推进物理（match.stepMatch 里也做物理，但那套走 inputs 数组；
  // 这里我们自己驱动，避免两套输入口径打架）
  for (let i = 0; i < 2; i += 1) {
    const f = m.fighters[i];
    f._xBefore = f.x;                     // 用来算这一帧的真实位移（见 unitView 的注释）
    const before = f.attack;
    const atk = updateAttack(f);
    if (atk.melee && before) {
      for (const o of m.fighters) {
        if (o.team === f.team || o.hp <= 0) continue;
        if (inMeleeRange(f, o, before.skill)) {
          resolveHit(f, o, before.skill, before);
        }
      }
    }
    stepPhysics(f, ins[i].move, {
      blocking: ins[i].blocking,
      attacking: f.attack !== null,
      attackLight: f.attack?.skill.type === 'light',
      training: st.training,
      speed: 260,
      // 剧情关卡的场地是 2400 宽（关卡定义按那个尺度写）；
      // 对战是引擎默认的 960。不传就沿用对战的边界。
      ...(st.pve ? { wallL: 44 * FX_SCALE, wallR: (STAGE_W - 44) * FX_SCALE } : {}),
    });
  }

  /* ---- 弹道推进 + 命中判定 ----
     ⚠️ 这一段是**补上的**。原来 `m.shots` 只在 match.js 里被 push，
        **全项目没有任何地方移动它或做命中判定** ——
        抽象大乱斗的这段（engine.js 里的 projectiles 循环）当时没移植。
        后果：**远程招（O 飞弹 / barrage）在所有模式下都不造成伤害**，
        而剧情关卡的 Boss 是**飞行单位**（drone，悬空），近战够不着 ——
        于是"关卡打不完"，卡在 Boss 那里 150 秒血都不掉。

     判定参数照抄原版：
       |p.x - t.x| < 38 + radius   且   |p.y - (t.y - 83)| < 72
     （我们的 shot.y 生成时就写成 `f.y - 83`，和原版同一套坐标） */
  resolveShots(st);

  /* 剧情关卡：推进波次（和旧引擎同位置 —— 物理和命中之后）。
     ⚠️ 关卡自己管成败（玩家倒下=失败），所以走 settlePve 而不是 match 的
        "时间到比血量"。 */
  if (st.pve) {
    /* ⚠️ 剧情关卡要**自己把 m.phase 顶成 fight**。
       关卡跳过了 stepMatch（阶段机由关卡自己的 pve.phase 管），
       于是 m.phase 永远停在初始值 —— 而 `canAttack` 的第一条就是
       `phase !== 'fight' → false`，结果**谁（包括对手）都放不出招**。
       （实测：levels_test 的"对手会出招"一直不过；
         对手会走、会挨打，就是不出手。） */
    if (m.phase !== 'fight') m.phase = 'fight';
    progressPve(st);
    settlePve(st);
  }

  // 回合流程：复用 match.js 的推进（它自己也会跑一遍物理，所以这里传空输入
  // 只为了走阶段机 —— 阶段机不依赖物理结果）
  if (!st.pve) stepMatch(m, []);

  /* ---- 招式自带的表现事件 ----
     原版有 11 种特效（aura/beam/burst/dust/ghost/heal/hit/shield/slam/super/trap），
     我移植时整类跳过了。这里先补两个最显眼的：

       ghost  突进残影 —— 原版 `if(Math.floor(a.t*30)%3===0) effect('ghost', x-facing*18, ...)`
              每 3 帧留一个残影，突进看起来才有速度感
       dust   扬尘 —— 落地那一下和突进中都会扬，原版是 `effect('dust', ...)`

     都是纯表现，不影响规则；页面收到就画。
  */
  for (const f of m.fighters) {
    // 架势光环：反击架势期间每隔 8 帧冒一圈（原版 effect('aura', ...)，.45 秒）
    if (f.counterF > 0 && f.counterF % 8 === 0) {
      st.events.push({
        type: 'fx', kind: 'aura', who: f.id,
        x: f.x / 256 + X_OFFSET, y: 443 - f.y / 256 + 80, radius: 65,
      });
    }

    const atk = f.attack;
    if (!atk) continue;
    const st2 = atk.skill;
    // 换招时清掉"这一招已经放过 slam 冲击"的标记
    if (f._slamSkill !== st2) {
      f._slamSkill = st2;
      f._slamFired = false; f._beamFired = false; f._burstFired = false;
    }

    // 突进残影：每 3 帧留一个（原版就是这个频率）
    if (st2.type === 'dash' && atk.tF >= st2.start
        && atk.tF < st2.duration && atk.tF % 3 === 0) {
      st.events.push({
        type: 'fx', kind: 'ghost', who: f.id,
        x: f.x / 256 + X_OFFSET - f.facing * 18,
        y: 443 - f.y / 256,
      });
    }

    // 必杀光柱：起手那一帧放一道（原版 effect('beam', x+facing*35, y-84, ...)）
    // ⚠️ 用"放过一次"的标记，不要用 `tF === start + 1` 这种精确帧号。
    //    updateAttack 是在 tF >= start 那一帧把 emitted 置真的，此时 tF 正好等于 start，
    //    所以 `start + 1` 永远不成立 —— 光柱一次都不会放（第一版就是这么写的）。
    if (st2.type === 'beam' && atk.emitted && !f._beamFired) {
      f._beamFired = true;
      st.events.push({
        type: 'fx', kind: 'beam', who: f.id,
        x: f.x / 256 + X_OFFSET + f.facing * 35,
        y: 443 - f.y / 256 + 84,
        facing: f.facing, len: st2.range,
      });
    }

    // 爆发：起手那一帧在身前炸一下（原版 effect('burst', ...)）
    if (st2.type === 'burst' && atk.emitted && !f._burstFired) {
      f._burstFired = true;
      st.events.push({
        type: 'fx', kind: 'burst', who: f.id,
        x: f.x / 256 + X_OFFSET + f.facing * 60,
        y: 443 - f.y / 256 + 70, radius: st2.range,
      });
    }

    // 布阵：埋下去的那一帧留个标记（原版 effect('trap', x+facing*180, FLOOR, ..., 3.4s)）
    if (st2.type === 'trap' && st2.start === atk.tF) {
      st.events.push({
        type: 'fx', kind: 'trap', who: f.id,
        x: f.x / 256 + X_OFFSET + f.facing * 180, y: 0,
      });
    }

    // 落地冲击：slam 砸到地面的那一帧
    if (st2.type === 'slam' && atk.landed && !f._slamFired) {
      f._slamFired = true;
      st.events.push({
        type: 'fx', kind: 'slam', who: f.id,
        x: f.x / 256 + X_OFFSET, y: 0, radius: st2.range,
      });
    }

    // 突进/落地扬尘
    const justLanded = f.landingF > 0 && f.landingF >= (f._lastLandingF || 0);
    if (justLanded && (f._lastLandingF || 0) !== f.landingF) {
      st.events.push({
        type: 'fx', kind: 'dust', who: f.id,
        x: f.x / 256 + X_OFFSET, y: 0,
      });
    }
    f._lastLandingF = f.landingF;
    if (st2.type === 'dash' && atk.tF === st2.start) {
      st.events.push({
        type: 'fx', kind: 'dust', who: f.id,
        x: f.x / 256 + X_OFFSET - f.facing * 40, y: 0,
      });
    }
  }

  // 把这一帧的命中事件翻成页面能用的事件。
  // 强制脱离是**瞬时**的（受击方无敌 61 帧 + 大击退），
  // 靠页面每帧比状态量抓不住，必须在发生的那一帧记下来。
  for (const h of m.hits) {
    // 每一次命中都产出一条事件，带给**表现层**要用的分级信息：
    //   震屏强度 / 顿帧帧数 / 要不要白闪 / 命中点的位置
    // 这些是"打击感"的全部来源 —— 移植时整类跳过，所以之前一点反馈都没有。
    const target = m.fighters[h.on];
    // 累计战绩
    const a = st.stats[h.by] || st.stats[0];
    const d = st.stats[h.on] || st.stats[1];
    const dmg = Math.round(h.dmg || 0);
    a.dealt += dmg; d.taken += dmg;
    if (h.type === 'block') { a.blocked += 1; } else { a.hits += 1; }
    a.maxCombo = Math.max(a.maxCombo, h.combo || 0);
    st.events.push({
      type: 'hit',
      kind: h.type,                     // 'hit' | 'block' | 'counter'
      by: h.by,
      on: h.on,
      dmg: h.dmg,
      combo: h.combo || 0,
      broke: Boolean(h.broke),
      escape: Boolean(h.escape),
      shake: h.shake || 0,
      hitstopF: h.hitstopF || 0,
      flash: Boolean(h.flash),
      /* 命中点。
         ⚠️ x 必须加 X_OFFSET，和 unitView 用**同一套世界坐标**。
            引擎场地是 960 宽、渲染世界是 2400 宽（unitView 里 +720）。
            事件里给原始引擎坐标的话，页面拿它去 spawnFx / popText，
            就会整体偏左 720 格 —— 表现是"火花有 46 颗但屏幕上什么都看不见"、
            "伤害数字挤在画面左下角叠在血条上"。 */
      x: target ? (target.x / 256 + X_OFFSET) : X_OFFSET,
      y: target ? (443 - target.y / 256) : 0,
    });
    // 7 连强制脱离原来单发一条，现在并进命中事件里（页面按 escape 处理）
  }
  m.hits.length = 0;
  // 事件队列别无限涨：页面每帧只消费最近的几条
  if (st.events.length > 32) st.events.splice(0, st.events.length - 32);

  // ⚠️ 把"界面会直接读的字段"同步到 fighter 上。
  //    arena.js 的 snapshot() **不走 unitView**，它直接读
  //    `st.units[i].hp / .maxHp / .state`。新引擎的 fighter 里
  //    maxHp 在 data.hp 上、state 是算出来的 —— 不补这一步，
  //    e2e_pvp 里就是 `tick=-1 / hash=None / cd=0` 一片挂。
  //    （为什么不让 arena 改用 unitView：那是 21 项已验证测试依赖的读取路径，
  //      改它等于同时动"已验证的东西"和"正在验证的东西"，出问题分不清谁错。）
  /* ⚠️ 剧情关卡的成败**由关卡自己判**（玩家倒下=失败、打完最后一波=通关），
     不走 match 的阶段机。这里如果照旧从 match 同步，就会把关卡的判定
     覆盖回去 —— 表现是"打完最后一波 over 还是 false"。
     （第一版就是这么挂的：settlePve 设了 over=true，下一帧又被这行改回 false。） */
  if (!st.pve) {
    st.over = m.phase === 'finished';
    st.winner = m.winnerTeam;
  }
  for (const f of m.fighters) {
    f.maxHp = f.data.hp;
    const v = unitView(f);
    f.state = v.state;
    f.x = f.x;                      // 保持原样（这一行是为了说明：位置不换算）
    f.sta = Math.round(f.energy / FX_SCALE);
    f.act = v.act;
    // cd 也要同步：arena 的 snapshot() 和 e2e 都是直接读 st.units[i].cd，
    // 而新引擎内部的字段名叫 cooldowns（名字不一样，不补就是 undefined）
    f.cd = f.cooldowns.slice(0, 6);
    f.guard = v.guard;
    f.invuln = v.invuln;
    // pve.js 的对手行为读的是 `u.stun > 0`（旧引擎是秒），
    // simAB 内部叫 stunF（帧）。不补这一个，杂兵在硬直里还会继续出招。
    f.stun = f.stunF;
  }

  st.tick += 1;
  return st;
}

/** 状态指纹：两端对账用。必须覆盖所有会影响后续演算的量。 */
export function hashState(st) {
  const m = st.match;
  let s = `${m.phase}|${m.round}|${m.wins[0]},${m.wins[1]}|${m.timeF}|${m.phaseF}`;
  for (const f of m.fighters) {
    s += `#${f.id}:${f.x},${f.y},${f.vx},${f.vy},${f.hp},${f.energy},${f.guard},`
      + `${f.stunF},${f.knockedF},${f.invulnF},${f.combo},${f.comboF},${f.facing},`
      + `${f.attack ? f.attack.index : -1},${f.attack ? f.attack.tF : -1},`
      + `${f.attack ? (f.attack.emitted ? 1 : 0) : -1},`
      + `${f.cooldowns.join(',')}`;
  }
  /* ⚠️ 剧情关卡的进度**必须进哈希**。
     旧引擎的 feed 里就有 pve.wave / pve.cleared / pve.phase ——
     不进哈希的话，联机对账和回放重放都会漏掉"打到第几波"这个状态，
     两端的指纹会对得上、但关卡进度其实不同。 */
  if (st.pve) {
    s += `|pve:${st.pve.wave},${st.pve.cleared},${st.pve.phase},`
      + `${st.pve.gateX},${st.units[1].active ? 1 : 0},`
      /* ★ 刷新冷却的计数必须进哈希：它现在**决定游戏状态**
         （冷却归零那一刻对手才登场），不进哈希的话两端时钟差一帧都发现不了，
         等到"一边有人一边没人"才暴露 —— 那就太晚了。
         加了新字段之后锁步测试的对账值会变，这是预期的。 */
      + `${st.pve.gapF ?? 0},`
      + `${st.units[1].isBoss ? 1 : 0},${st.units[1].profile || ''}`;
  }
  // ⚠️ 返回**整数**，不是十六进制字符串。
  //    旧引擎（sim.js）的 hashState 返回数字，e2e_pvp 里这么读：
  //        return format(h, 'x') if isinstance(h, int) else None
  //    我第一版返回的是补零的 hex 字符串 → isinstance 不成立 → 读成 None →
  //    "两端状态哈希一致"直接挂（第二十二轮就剩这一项）。
  //    要显示成十六进制由调用方 format 就行，接口本身跟旧引擎对齐。
  return fnv1a(s);
}

/** 调试用：把人看的十六进制形式单独提供，别混进 hashState 的返回值 */
export function hexHash(st) {
  return fnv1aInt(hashStateString(st)).toString(16).padStart(8, '0');
}

/** FNV-1a：纯整数，跨平台一致（不要用字符串 hash 的浮点实现） */
function fnv1a(str) {
  return fnv1aInt(str);
}

function fnv1aInt(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** hashState 里拼的那串；hexHash 要重算一遍所以单独提出来 */
function hashStateString(st) {
  const m = st.match;
  let s = `${m.phase}|${m.round}|${m.wins[0]},${m.wins[1]}|${m.timeF}|${m.phaseF}`;
  for (const f of m.fighters) {
    s += `#${f.id}:${f.x},${f.y},${f.vx},${f.vy},${f.hp},${f.energy},${f.guard},`
      + `${f.stunF},${f.knockedF},${f.invulnF},${f.combo},${f.comboF},${f.facing},`
      + `${f.attack ? f.attack.index : -1},${f.attack ? f.attack.tF : -1},`
      + `${f.attack ? (f.attack.emitted ? 1 : 0) : -1},`
      + `${f.cooldowns.join(',')}`;
  }
  return s;
}

/** 状态克隆：锁步里要保存/回滚时用 */
export function cloneState(st) {
  return structuredClone({ ...st, random: undefined, match: st.match });
}

/* ⚠️ 判断"在不在走"**不能用 f.vx**。
   新引擎（原版也是）的走位是**直接改坐标**：`f.x += move*speed*factor*dt`，
   而 `f.vx` 是另一条通道，只在击退/冲刺/阻尼时才有值。
   所以走路时 f.vx 是 0，拿它判就会永远得到 idle —— 狗一边跑一边显示站姿。
   （渲染对齐测试就是因为"整局只出现 idle/attack/hurt"抓到这个的。）
   改成用这一帧的**真实位移**来判：x 走了多少 ÷ dt 就是等效速度。 */
function walkSpeed(f) {
  if (f._xBefore === undefined) return 0;
  return (f.x - f._xBefore) * TICK_HZ;
}

/** 页面渲染要的单位视图。字段和现有 unitView 对齐，stage.js 不用改。 */
export function unitView(f) {
  return {
    id: f.id,
    // ⚠️ stage.js 按 `u.side` 索引 actorRoot.children（0=左，1=右），
    //    只给 id 的话 render() 里 `children[undefined]` 直接 continue，
    //    表现是"场上一只狗都没有"——页面不报错，就是空的。
    side: f.id,
    x: f.x / FX_SCALE + X_OFFSET,
    y: (STAGE.FLOOR - f.y) / FX_SCALE,    // 新引擎 y 向下增大，现有渲染是"离地高度"
    vx: f.vx / FX_SCALE,
    vy: -f.vy / FX_SCALE,
    facing: f.facing,
    hp: Math.round(f.hp / 4),
    maxHp: Math.round(f.data.hp / 4),
    sta: Math.round(f.energy / FX_SCALE),
    maxSta: 100,
    // 状态名必须覆盖**移动态**。第一版只映射了 down/hurt/attack/idle，
    // 渲染对齐测试立刻发现"整局只出现过 idle/attack/hurt"——
    // 意思是狗一边跑一边显示站姿，画面上就是原地滑行。
    // 优先级：倒地 > 受击 > 出招 > 腾空 > 跑 > 走 > 待机
    state: f.hp <= 0 ? 'down'
      : (f.stunF > 0 ? 'hurt'
        : (f.attack ? 'attack'
          : (f.y < STAGE.FLOOR - FX_SCALE ? 'jump'
            : (Math.abs(walkSpeed(f)) > 40 * FX_SCALE ? 'run'
              : (Math.abs(walkSpeed(f)) > 4 * FX_SCALE ? 'walk' : 'idle'))))),
    stateT: f.attack ? f.attack.tF : 0,
    combo: f.combo,
    grounded: f.y >= STAGE.FLOOR,
    hurt: f.hitFlashF > 0,
    // ⚠️ 是 **6**，不是 4。
    //    旧引擎 4 招，slice(0,4) 没问题；换成六招制之后，
    //    第 5、6 个钮（O 飞弹 / L 必杀）永远拿到 undefined → 冷却显示不出来。
    //    用户的截图里 O 和 L 就是死的。
    cd: f.cooldowns.slice(0, 6),
    /* 剧情关卡的三个标记。
       ⚠️ 必须从**战斗者身上**取，不能从 state 上取 ——
          渲染层拿的是 unitView 的结果，
          少了这三个就画不出 Boss 血条、也认不出"这一波还没登场"。 */
    // `f.active !== false` 是反的（active===false 时会得到 true）。
    // 没设过 active 的（竞技场）默认算激活；显式设成 false 的（PvE 未登场）就是 false。
    active: f.active === undefined ? true : Boolean(f.active),
    isBoss: Boolean(f.isBoss),
    flying: Boolean(f.flying),
    // ↓ 下面 8 个是 api_diff_test 扫出来的"旧引擎有、新引擎没有"的字段。
    //   arena.js（和将来的 PvE）会读它们，少于一个就会在那行崩或者少画一块。
    /** 当前招式。旧引擎是 { windup, active, recover }（tick 数），
     *  stage.js 用它判断"现在是在前摇还是判定"来决定姿势。 */
    act: f.attack ? {
      windup: f.attack.skill.start,
      active: Math.max(1, f.attack.skill.duration - f.attack.skill.start),
      recover: 0,
      name: f.attack.skill.type,
    } : null,
    /** 防御值换算回 0~100（HUD 直接显示） */
    guard: Math.round(f.guard / FX_SCALE),
    maxGuard: 100,
    /** 气（0~100），攒满才能放必杀 */
    energy: Math.round(f.energy / FX_SCALE),
    maxEnergy: 100,
    /** 破防硬直中（HUD 要标出来） */
    guardBroken: f.guardBrokenF > 0,
    /** 反击架势中（counter 招式的持续时间） */
    stance: f.counterF > 0,
    /* 无敌帧中（冲刺拖影要读它）。
       ⚠️⚠️ 这一行**原来只有注释、没有字段** —— `unitView().invuln` 恒为 undefined，
       于是 `hud.js` 的 `if (u.invuln) marks.push(['无敌', ...])` 永远不成立，
       "无敌"标记从来不显示；`stage.js` 的冲刺拖影同样读它，也一起坏掉。
       （e2e_hud_state 里 `无敌帧 → 出"无敌"标记` 稳定失败，根因就是这里。）
       字段名必须是 `invulnF` —— 状态哈希（hashStateString）用的就是它。 */
    invuln: f.invulnF > 0,
  };
}

/* ---------------- AI 也属于引擎契约 ----------------
   net.js 的掉线接管会调 createAI(side, skill) / aiInput(ai, state)。
   上一轮把引擎做成可注入之后，这一块还在用旧 ai.js（读的是 sim.js 的
   me.cd / me.sta 形状），喂新引擎的状态直接崩。
   所以引擎对象要连 AI 一起提供——契约是 6 样，不是 4 样。 */

/** 和 ai.js 的 createAI 同签名。新引擎的 AI 不需要预建对象，
 *  把难度和随机源带上就行；这里保留同样的"句柄"形状，net.js 不用改。 */
export function createAI(side, skill = 0.62) {
  // skill 0..1 → 难度 0..3（旧接口是"水平"，新的按档位）
  const difficulty = Math.max(0, Math.min(3, Math.round(skill * 3)));
  return { side, difficulty, skill };
}

/** 和 ai.js 的 aiInput 同签名：给一个 AI 句柄和当前状态，返回这一帧的输入。
 *  内部走 aiAB.stepAI —— 它会就地写 f.aiMove / f.jumpRequest / f.queue。 */
export function aiInput(ai, st) {
  const m = st.match;
  stepAI({
    fighters: m.fighters,
    difficulty: ai.difficulty,
    random: st.random,                 // ← rngSim：双端同步的那条流
    phase: m.phase,
    projectiles: m.shots,
    training: st.training,
    local: false,
  });
  const f = m.fighters[ai.side];
  const out = { mx: f.aiMove || 0, my: 0, atk: 0, btn: 0 };
  if (f.jumpRequest) { out.btn |= BTN.JUMP; f.jumpRequest = false; }
  if (f.queue.length) {
    const idx = f.queue[0].index;
    f.queue.shift();
    // 招式下标 → 按键位（和 INPUT_MAP 反向对应）
    const bit = [BTN.ATK, BTN.S4, BTN.S1, BTN.DASH, BTN.S2, BTN.S3][idx] || 0;
    out.btn |= bit;
    if (bit === BTN.ATK) out.atk = 1;
  }
  return out;
}

/* ---------------- HUD 需要的招式表 ----------------
   六招（J/K/U/I/O/L），第 6 个是靠气满触发的必杀。
   顺序和 INPUT_MAP 的按键约定一致，别单独改一个地方。
   ⚠️ 第 5 招（O）从「飞弹」改成了「治愈」（用户要求）——
      飞弹那条远程链路是坏的（见上面 projectile 那段注释：所有模式下都不造成伤害），
      按下去等于空放。治愈回多少血看**体力**、花多少气看**敏捷**，
      由 growth.js 的 healOf 算，下面这两个数只是**没接四维时的兜底显示**。 */
export const HUD_SKILLS = [
  { key: 'J', name: '轻击', kind: 'light',      cost: 0,   cd: SKILL_TYPES.light.cd },
  { key: 'K', name: '重击', kind: 'heavy',      cost: 0,   cd: SKILL_TYPES.heavy.cd },
  { key: 'U', name: '突进', kind: 'dash',       cost: 0,   cd: SKILL_TYPES.dash.cd },
  { key: 'I', name: '升龙', kind: 'upper',      cost: 0,   cd: SKILL_TYPES.upper.cd },
  { key: 'O', name: '治愈', kind: 'heal',       cost: 43,  cd: SKILL_TYPES.heal.cd,
    note: '回血看体力（单次最多 80），耗气看敏捷' },
  { key: 'L', name: '必杀', kind: 'beam',       cost: 100, cd: 0, super: true },
];

/**
 * 结算用的汇总。**只给玩家看得懂的东西** ——
 * 不含帧号、哈希这类底层信息（那些只该出现在调试面板里）。
 */
export function summary(st, side) {
  const s = st.stats?.[side] || { dealt: 0, taken: 0, hits: 0, maxCombo: 0, blocked: 0 };
  const foe = st.stats?.[1 - side] || { dealt: 0 };
  const secs = Math.max(0, (st.tick - (st.startTick || 0)) / TICK_HZ);
  return {
    dealt: s.dealt,
    taken: s.taken,
    hits: s.hits,
    blocked: s.blocked,
    maxCombo: s.maxCombo,
    foeDealt: foe.dealt,
    // 用时按"分:秒"给，别丢一串小数
    time: `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`,
    seconds: secs,
  };
}

/* ================= 快照 / 恢复（回滚重放的地基） =================
   服务端权威 + 客户端预测的**必需件**：收到权威快照之后，客户端要能
   "退回到那一刻、把之后的本地输入重放一遍"。所以引擎必须支持
   **从任意状态完整恢复**，而且恢复之后继续跑，结果要和原来逐位一致。

   要存的东西分三类，缺一样就会分叉：
     1. 每个 fighter 的全部字段（位置/速度/计时器/冷却/招式…）
     2. 比赛的阶段机（phase / round / wins / timeF / phaseF …）
     3. **随机流的状态** —— AI 的决策用的是 rngSim，
        不存它的话重放时 AI 会做别的选择（这条最容易漏）

   为什么不用 structuredClone 直接拷整个 state：
     state 里挂着函数（random）和 Set（attack.hit），
     而且 clone 出来的对象和引擎内部的引用关系会断。
     这里显式列出字段，虽然啰嗦，但"存了什么"一目了然，
     以后加了新字段忘了存，tests 里的重放对账会立刻报出来。
*/

const FIGHTER_NUM = [
  'x', 'y', 'vx', 'vy', 'facing', 'hp', 'energy', 'guard', 'walk',
  'stunF', 'invulnF', 'slowF', 'landingF', 'guardBrokenF', 'counterF',
  'counterDamage', 'combo', 'comboF', 'hitCount', 'hitFlashF', 'knockedF',
  'downTimeF', 'attackSerial',
];
const FIGHTER_BOOL = ['blocking', 'grounded'];

/** 把整个对局压成一份可 JSON 的快照 */
export function snapshotState(st) {
  const m = st.match;
  return {
    tick: st.tick,
    rng: st.random.state(),
    stats: st.stats.map((x) => ({ ...x })),
    /* ⚠️ 这些**瞬时数组**也必须存。
       第一版漏了它们，结果"跑到一半的快照"恢复之后，
       当时正在飞的弹丸还在场上 → 多打了一次 → 重放和一次跑完分叉。
       （测试里那条"回滚重放之后逐位一致"就是这么挂的。） */
    /* ⚠️ 剧情关卡的进度必须进快照。
       不回滚它的话，联机时"我这边已经打到第三波、你那边还在第二波"
       这种分叉**恢复不回来**（快照是唯一的权威状态）。
       goal ⑥ 点是这个：旧引擎的 feed 里有 pve.wave/cleared/phase。*/
    pve: st.pve ? {
      wave: st.pve.wave, phase: st.pve.phase, gateX: st.pve.gateX,
      // ★ 冷却计数与总长也要快照：回滚重放时光靠 gateX 恢复不出"还剩几帧登场"
      gapF: st.pve.gapF, gapTotal: st.pve.gapTotal,
      cleared: st.pve.cleared,
    } : null,
    shots: (st.shots || []).map((x) => ({ ...x, skill: undefined })),
    traps: (st.traps || []).map((x) => ({ ...x, attack: undefined })),
    balls: (st.balls || []).map((x) => ({ ...x })),
    hitstop: st.hitstop || 0,
    match: {
      phase: m.phase, phaseF: m.phaseF, round: m.round,
      wins: [...m.wins], timeF: m.timeF,
      banner: m.banner, bannerSub: m.bannerSub,
      finished: m.finished, winnerTeam: m.winnerTeam,
      training: m.training, winsNeeded: m.winsNeeded, maxRounds: m.maxRounds,
    },
    fighters: m.fighters.map((f) => {
      const o = { id: f.id, team: f.team, controller: f.controller ?? null };
      for (const k of FIGHTER_NUM) o[k] = f[k];
      for (const k of FIGHTER_BOOL) o[k] = f[k];
      o.cooldowns = [...f.cooldowns];
      // 招式：hit 是个 Set，存成数组
      o.attack = f.attack ? {
        index: f.attack.index, serial: f.attack.serial, tF: f.attack.tF,
        emitted: f.attack.emitted, landed: Boolean(f.attack.landed),
        shots: f.attack.shots, leeched: f.attack.leeched,
        hit: [...f.attack.hit],
      } : null;
      // AI 的临时状态
      o.aiWaitF = f.aiWaitF || 0;
      o.aiBlockF = f.aiBlockF || 0;
      o.aiMove = f.aiMove || 0;
      o.jumpRequest = Boolean(f.jumpRequest);
      o.queue = (f.queue || []).map((q) => ({ ...q }));
      return o;
    }),
  };
}

/** 从快照恢复（**就地**改 st，保持引用关系） */
export function restoreState(st, snap) {
  st.tick = snap.tick;
  st.random.setState(snap.rng);
  /* ⚠️ 必须**就地清空再填**，不能整体替换数组。
     `st.shots` 是 `m.shots` 的**别名**，写 `st.shots = [...]` 会让别名断掉：
     m.shots 还指着旧数组（里面躺着回滚前的飞弹），
     而 aiInput 读的是 m.shots —— AI 看到一堆幽灵飞弹，决策就变了。
     这是"回滚重放对不上"的最后一个原因（diff 表现为 AI 所有字段都偏）。 */
  const fill = (arr, src) => {
    arr.length = 0;
    for (const x of (src || [])) arr.push({ ...x });
  };
  if (st.pve && snap.pve) {
    st.pve.wave = snap.pve.wave;
    st.pve.phase = snap.pve.phase;
    st.pve.gateX = snap.pve.gateX;
    st.pve.gapF = snap.pve.gapF;
    st.pve.gapTotal = snap.pve.gapTotal;
    st.pve.cleared = snap.pve.cleared;
  }
  fill(st.shots, snap.shots);
  fill(st.traps, snap.traps);
  fill(st.balls, snap.balls);
  st.hitstop = snap.hitstop || 0;
  for (let i = 0; i < st.stats.length && i < snap.stats.length; i += 1) {
    Object.assign(st.stats[i], snap.stats[i]);
  }
  const m = st.match;
  Object.assign(m, snap.match);
  /* ⚠️⚠️ `over` / `winner` 是**派生字段**，正常只在 `step()` 末尾从 match 同步。
     权威模式（联机默认）下这里会漏：服务端判定"打完了"之后**不再发输入**，
     客户端就不再调 `step()` → `st.over` 永远停在 false →
     arena.js 的结束判定永远不触发 → **联机有一方死亡后游戏不自动退出**。
     快照里带着 match.finished / winnerTeam，就地补上这一步。 */
  if (!st.pve) {
    st.over = m.phase === 'finished';
    st.winner = m.winnerTeam;
  }
  m.wins = [...snap.match.wins];
  m.fighters.forEach((f, i) => {
    const o = snap.fighters[i];
    if (!o) return;
    for (const k of FIGHTER_NUM) f[k] = o[k];
    for (const k of FIGHTER_BOOL) f[k] = o[k];
    f.cooldowns = [...o.cooldowns];
    // 招式对象要保留 skill 的引用（快照里不存函数/表，只存进度）
    if (o.attack) {
      /* ⚠️ 招式必须**按快照里的 index 去取**，不能沿用 `f.attack?.skill`。
         那个 skill 是"回滚前残留的那次攻击"的对象 ——
         如果回滚前在放第 2 招、而快照里是第 3 招，
         恢复后就会出现"index=3、skill=第2招"的错配：
         判定用错招式的射程/伤害，整局分叉。
         （diff 里 AI 所有字段都偏，根子在这儿。） */
      const skill = f.data?.skills?.[o.attack.index]
        || DEFAULT_SKILLS[o.attack.index]
        || f.attack?.skill;
      f.attack = {
        skill, index: o.attack.index, serial: o.attack.serial,
        tF: o.attack.tF, emitted: o.attack.emitted, landed: o.attack.landed,
        shots: o.attack.shots, leeched: o.attack.leeched,
        hit: new Set(o.attack.hit),
      };
    } else {
      f.attack = null;
    }
    f.aiWaitF = o.aiWaitF; f.aiBlockF = o.aiBlockF; f.aiMove = o.aiMove;
    f.jumpRequest = o.jumpRequest;
    f.queue = o.queue.map((q) => ({ ...q }));
  });
  st.events.length = 0;
  return st;
}

export { STAGE, SCALE } from './rules.js';
