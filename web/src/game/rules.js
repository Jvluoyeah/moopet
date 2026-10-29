/* 横板格斗规则（定点确定性）—— 移植自 abstract-brawl 的 engine.js
   ============================================================
   来源：https://github.com/XzJoshZ/abstract-brawl （XzJoshZ，非商业学习交流许可）
   原版是浮点 + 120Hz；这里改成 **Q8 定点 + 128Hz**，两边跑同一份输入必须逐位相同。

   为什么是 128Hz：见 fx.js 的说明 —— dt=1/128 时 Q8 下每条常数都正好是整数，
   而且 `x += vx*dt` 变成 `x += vx >> 7`（纯移位，零舍入）。
   120Hz 的话四条常数要取整，误差几千帧就积出来了。

   本文件**只搬"每帧都跑"的物理段**（第一段）。命中判定、招式、投射物在第二段，
   等这一段和基准轨迹对齐之后再搬——物理段没有分支依赖，最容易先对上。

   原版对应的代码（engine.js · step · for(const f of this.fighters) 循环尾部）：
     if (f.stun<=0 && !f.blocking && !f.knocked) {
       const factor = f.attack?.skill.type==='light' ? .25 : (f.attack ? 0 : 1);
       f.x += move*f.data.speed*(f.slow>0?.55:1)*(f.buff?.speed||1)
              *(f.form?.speed||1)*factor*dt;
       if (move && factor) f.walk += dt*12; else f.walk = 0;
     }
     f.x += f.vx*dt;  f.vx *= Math.exp(-9*dt);
     f.vy += 1650*dt; f.y += f.vy*dt;
     if (f.y > FLOOR) { if (f.vy > 350) { f.landing=.12; ...dust... } f.y=FLOOR; f.vy=0; }
     f.x = clamp(f.x, 44, W-44);
   ------------------------------------------------------------
   舞台尺寸沿用原版：W=960、H=540、地面 FLOOR=443。
*/

import {
  SCALE, SHIFT, TICK_HZ, TICK_SHIFT, T_GRAVITY, T_GUARD_REGEN, T_WALK_PHASE,
  T_ENERGY_CHARGE, T_ENERGY_NORMAL, T_TRAIN_HEAL,
  JUMP_VY, JUMP_VY_AIR, LANDING_VY, T_LANDING,
  damp, mul, mulShift, clamp, makeRng,
} from './fx.js';

/** 舞台（和原版一致，坐标单位是"格"，Q8 定点后 1 格 = 256 单位） */
export const STAGE = {
  W: 960,
  H: 540,
  FLOOR: 443 * SCALE,
  WALL_L: 44 * SCALE,
  WALL_R: (960 - 44) * SCALE,
};

/** 一只格斗者的初始状态。字段名沿用原版，值全部是定点整数。 */
export function makeFighter(data, id, { training = false } = {}) {
  return {
    data,
    id,
    team: id % 2,
    x: id === 0 ? 265 * SCALE : 695 * SCALE,
    y: STAGE.FLOOR,
    vx: 0,
    vy: 0,
    facing: id % 2 === 0 ? 1 : -1,
    hp: data.hp,
    // 能量/防御：原版是 0..100 的浮点，这里放大 256 倍存整数
    energy: (training ? 100 : 20) * SCALE,
    guard: 100 * SCALE,
    blocking: false,
    // ↓ 计时器一律是**帧数**，不是秒（见 fx.js 里那段说明）
    stunF: 0,
    invulnF: 0,
    slowF: 0,
    landingF: 0,
    guardBrokenF: 0,
    // ⚠️ 下面这几个字段会被 hashState 拼进指纹，**必须一开始就有确定的值**。
    //    第一版 makeFighter 漏了 combo / cooldowns，结果第一次命中前
    //    combo 是 undefined、cooldowns 干脆不存在 —— 指纹里出现 "undefined"。
    //    两端虽然一样（不影响锁步），但 unitView 的契约说好 combo 是数字，
    //    测试直接抓出来了。
    combo: 0,
    comboF: 0,
    hitCount: 0,
    hitFlashF: 0,
    counterF: 0,
    counterDamage: 0,
    trapSpawn: null,
    cooldowns: [0, 0, 0, 0, 0, 0],
    attack: null,
    attackSerial: 0,
    knockedF: 0,
    downTimeF: 0,
    castPending: null,
    queue: [],
    // 移动/物理
    slow: 0,
    walk: 0,
    grounded: true,
  };
}

/**
 * 推进一帧。**只做物理**：输入 → 位移 → 速度 → 落点。
 *
 * @param {object} f    makeFighter 造出来的对象（会被就地修改）
 * @param {number} move −1 / 0 / +1，这一帧的水平输入
 * @param {object} opts { blocking, attacking, attackLight, training, speed }
 *                     都是"这一帧的事实"，由上层状态机算好传进来；
 *                     这样这个函数是纯物理，没有隐藏状态。
 */
export function stepPhysics(f, move, opts = {}) {
  const {
    blocking = false, attacking = false, attackLight = false,
    training = false, speed = f.data.speed,
  } = opts;
  const spd = Math.round(speed * SCALE);

  // ---- 冷却递减 ----
  // ⚠️ 原来是**漏掉的**。原版有这一句：
  //      f.cooldowns = f.cooldowns.map(n => Math.max(0, n - dt*(f.buff?.cooldown||1)));
  //    我移植时只搬了"出招时设冷却"和"能不能出招时读冷却"，
  //    中间这一步没搬 —— 冷却永远不减，招式放完就再也放不出来了。
  //    表现就是用户截图里那个："技能倒计时不会动"。
  //    而当时的测试只验了"出招后 CD 被设上"，没验"它会不会减"，所以全绿放过去了。
  for (let i = 0; i < f.cooldowns.length; i += 1) {
    if (f.cooldowns[i] > 0) f.cooldowns[i] -= 1;
  }

  // ---- 计时器：帧计数，每帧减 1 ----
  if (f.stunF > 0) f.stunF -= 1;
  if (f.invulnF > 0) f.invulnF -= 1;
  if (f.slowF > 0) f.slowF -= 1;
  if (f.landingF > 0) f.landingF -= 1;
  if (f.guardBrokenF > 0) f.guardBrokenF -= 1;
  // ⚠️ counterF 也要减 —— 原来漏了。
  //    后果不只是"架势光环不冒"：架势**永远不会结束**，
  //    因为 resolveHit 里判的是 `def.counterF > 0`，它一直是 256。
  //    原版对应的是 `f.counterTime -= dt`（架势 2 秒）。
  if (f.counterF > 0) f.counterF -= 1;
  // ⚠️ hitFlashF 也要减 —— 又漏了一个（和 counterF 一样）。
  //    它是"受击闪白"的计时器，不减的话：
  //      unitView.hurt 永远是 true → 渲染层**永远把那身提亮色穿着**，
  //      狗会一直保持红/粉色，看起来像卡住了（用户截图里就是那只粉狗）。
  if (f.hitFlashF > 0) f.hitFlashF -= 1;
  /* ⚠️ **击倒计时也要减** —— 这已经是第四个漏减的计时器了
     （前面三个：cooldowns、counterF、hitFlashF，都是"设了但从不减"）。

     后果比前三个都严重：`knockedF` 是"被击倒、躺着起不来"的计时器。
     不减的话，**挨一次击倒就永远躺在地上** ——
     而 `canAttack` 的第一条就是 `f.knockedF > 0 → false`，
     于是玩家再也放不出任何招。

     实测（剧情关卡 Boss 是 roller，滚动会击倒）：
       22 次按键里 19 次被 `knockedF=92` 挡掉，900 帧只起手 1 次，
       Boss 血一直是 240，关卡永远打不完。
     竞技场里只要发生一次击倒也一样。

     `downTimeF` 同理 —— 它管的是"倒地后多久爬起来"，不减就永远起不来。 */
  if (f.knockedF > 0) f.knockedF -= 1;
  if (f.downTimeF > 0) f.downTimeF -= 1;

  // ---- 能量 / 防御：每帧加常数（128Hz 下都是精确整数）----
  if (training) {
    f.energy = 100 * SCALE;
  } else {
    const gain = (f.data.trait === 'charge' ? T_ENERGY_CHARGE : T_ENERGY_NORMAL);
    f.energy = clamp(f.energy + gain, 0, 100 * SCALE);
  }
  // 防御只在"没在防"的时候回（原版 `if(!f.blocking) f.guard = clamp(f.guard+dt*15,0,100)`）
  if (!blocking) f.guard = clamp(f.guard + T_GUARD_REGEN, 0, 100 * SCALE);

  const grounded = f.y >= STAGE.FLOOR;
  /* ⚠️ 要判 `hp > 0`。原来只判了硬直和格挡 —— 于是**倒下的人还能走**：
     一方被打倒之后还有 roundend 那 307 帧（2.4 秒）才结算，
     这段时间里死掉的那只还在场上跑（用户看到的就是"死后还能动 1 秒左右"）。
     原版各处都带 `f.hp <= 0` 的短路，这里补上最要紧的一处 —— 移动。 */
  const alive = f.hp > 0;
  const canMove = alive && f.stunF <= 0 && !blocking;

  // ---- 走位（原版的 factor：轻攻击时只有 1/4 速度，其他攻击时不能动）----
  if (canMove) {
    // factor 是 1 / 0.25 / 0 三档，用整数表示成 256 / 64 / 0
    const factor = attacking ? (attackLight ? 64 : 0) : SCALE;
    if (move !== 0 && factor > 0) {
      // 原式：move * speed * (slow?.55:1) * factor * dt
      //
      // ⚠️ 量纲：spd 和 factor **都是 Q8**，两个 Q8 相乘是 Q16，
      //    要移掉 SCALE 那 8 位、再移掉 dt 那 7 位，一共 **>> 15**。
      //    第一版只写了 >> 7（当成普通整数乘了），走位速度差了 256 倍——
      //    对账测试里 x 偏 647 格就是这么来的（vx/vy/y 全是 0 偏差，
      //    因为那三条只走 vx、不碰这个乘法）。
      let step = (move * spd * factor) >> (SHIFT + TICK_SHIFT);
      if (f.slowF > 0) step = mul(step, Math.round(0.55 * SCALE));
      f.x += step;
    }
    if (move !== 0 && factor > 0) f.walk += T_WALK_PHASE;
    else f.walk = 0;
    /* 朝向跟着移动方向翻。
       原版是 `f.facing = Math.sign(move)`，**移植时漏了这一行** ——
       于是 facing 永远停在出生时的值，往左走的时候狗是"倒着走"的
       （贴图不翻面，看着像在倒退）。 */
    if (move !== 0 && factor > 0) f.facing = move > 0 ? 1 : -1;
  }

  // ---- 速度 → 位移（纯移位，零舍入）----
  f.x += f.vx >> TICK_SHIFT;
  f.vx = damp(f.vx);
  f.vy += T_GRAVITY;
  f.y += f.vy >> TICK_SHIFT;

  // ---- 落地 ----
  let landed = false;
  if (f.y > STAGE.FLOOR) {
    if (f.vy > LANDING_VY) { f.landingF = T_LANDING; landed = true; }
    f.y = STAGE.FLOOR;
    f.vy = 0;
  }
  f.grounded = f.y >= STAGE.FLOOR;

  // ---- 场地边界 ----
  /* 场地边界。
     ⚠️ 原来写死 STAGE.WALL_L/WALL_R（= [44, 916]，引擎的对战场地 960 宽）。
        剧情关卡不行 —— 它的场地是 **2400 宽**（关卡定义里的 gate 是
        620~2100，按 2400 的尺度写的），照 960 夹的话对手会被直接夹到 916：
        表现是"对手和玩家叠在同一格、玩家永远走不到下一道闸门"。
        （实测：放好的 517120 走一帧就变成 234496 = 916×256。）

        所以边界从 opts 里来，默认还是对战那套。 */
  const wallL = opts.wallL === undefined ? STAGE.WALL_L : opts.wallL;
  const wallR = opts.wallR === undefined ? STAGE.WALL_R : opts.wallR;
  f.x = clamp(f.x, wallL, wallR);

  return { landed, grounded: f.grounded };
}

/** 跳跃：原版 `f.vy = trait==='air' ? -680 : -600`（没有 dt，是瞬时赋值） */
export function jump(f) {
  f.vy = (f.data.trait === 'air' ? JUMP_VY_AIR : JUMP_VY);
  f.grounded = false;
}

/* ================= 招式参数表 =================
   原版在 roster.js 里：
     types = { light:{damage:26,range:98,start:.075,duration:.26,cd:.23}, ... }
   角色表拿它按"2 普攻 + 4 技能"拼出 6 招（J/K/U/I/O/L，第 6 个是必杀）。

   移植的转换规则（**不是照抄数字**）：
     damage / range    → Q8 定点（range 要参与坐标比较）
     start/duration/cd → **帧数**（原来是秒；规则里不该有秒，
                          也不该有"减 dt"，理由见 fx.js）

   ⚠️ 这张表必须和原版一致。tests/rules_test.mjs 里有一条断言是
   **从原版引擎实时读出来对账**的——手抄错了会被测出来。 */
const secToF = (sec) => Math.max(1, Math.round(sec * TICK_HZ));
/** ⚠️ 每条都必须带 `type` 字段，别漏！原版是 `light:{type:'light',damage:26,...}`。
 *  连招判断用的是 `a.skill.type === 'light'`，漏了 type 连招就永远接不上。
 *  （这个坑我踩过：13 条数值全抄对了，就是没抄 type，
 *    tests 里"命中后能接下一段"那条挂了才发现。） */
const S = (type, damage, range, start, duration, cd) => ({
  type, damage, range,
  start: secToF(start), duration: secToF(duration), cd: cd > 0 ? secToF(cd) : 0,
});

export const SKILL_TYPES = {
  light:      S('light', 26, 98, 0.075, 0.26, 0.23),
  heavy:      S('heavy', 53, 126, 0.19, 0.53, 0.51),
  projectile: S('projectile', 42, 900, 0.23, 0.53, 3.2),
  dash:       S('dash', 51, 112, 0.12, 0.47, 4.2),
  upper:      S('upper', 57, 115, 0.1, 0.65, 4.8),
  slam:       S('slam', 65, 188, 0.7, 0.93, 5.5),
  burst:      S('burst', 62, 180, 0.3, 0.65, 5.2),
  grab:       S('grab', 70, 90, 0.2, 0.65, 6),
  counter:    S('counter', 30, 145, 0.09, 0.34, 6.8),
  trap:       S('trap', 38, 210, 0.23, 0.6, 5.4),
  heal:       S('heal', 20, 120, 0.38, 0.7, 11),
  beam:       S('beam', 188, 880, 0.55, 1.12, 0),
  barrage:    S('barrage', 40, 900, 0.25, 1.16, 0),
};

/** 六招的按键顺序（和原版一致）：J K U I O L，第 6 个是必杀（要 100 能量） */
export const SKILL_KEYS = ['J', 'K', 'U', 'I', 'O', 'L'];
export const SUPER_INDEX = 5;
/* ★ O 键（下标 4）现在是**治愈**，不再是飞弹（用户要求）。
   之所以要有这个常量：治愈是**第一招要扣气的普通招**（必杀是攒满整条气才放），
   判"气够不够"和"扣多少"都要认它。 */
export const HEAL_INDEX = 4;

/** 连招窗口：轻攻击**命中后** 0.12 秒内可以接下一段（原版写死的 .12） */
export const CHAIN_WINDOW_F = Math.round(0.12 * TICK_HZ);

/**
 * 能不能出招。逐条搬自原版 canAttack：
 *   if(f.castPending||this.paused)return false;
 *   if(phase!=='fight'||f.hp<=0||f.stun>0||f.knocked>0||f.blocking||f.cooldowns[index]>0)return false;
 *   if(index===5&&f.energy<100)return false;
 *   const a=f.attack;
 *   if(a&&!(a.skill.type==='light'&&a.hit.size>0&&a.t>.12&&index<=1))return false;
 *
 * 最后一条是连招窗口：轻攻击命中之后（a.hit.size>0，打空不算）才能接下一段；
 * 其余情况只要在出招中就一律不能再出。
 */
export function canAttack(f, index, ctx = {}) {
  const { phase = 'fight', paused = false } = ctx;
  if (f.castPending || paused) return false;
  if (phase !== 'fight' || f.hp <= 0 || f.stunF > 0 || f.knockedF > 0
      || f.blocking || f.cooldowns[index] > 0) return false;
  if (index === SUPER_INDEX && f.energy < 100 * SCALE) return false;
  /* ★ 治愈（O 键）要**气够才放得出来** —— 耗气量由敏捷决定（见 growth.js 的 healOf）。
     气不够时这一招直接不可用：不扣血、不扣气、也不进冷却（和必杀同一个处理方式）。 */
  if (index === HEAL_INDEX && f.data.healCost
      && f.energy < f.data.healCost * SCALE) return false;
  const a = f.attack;
  if (a) {
    const chain = a.skill.type === 'light' && a.hit.size > 0
      && a.tF > CHAIN_WINDOW_F && index <= 1;
    if (!chain) return false;
  }
  return true;
}

/** 起手出招。原版 attack() 的核心：
 *    f.attack = { skill, index, serial:++f.attackSerial, t:0, emitted:false,
 *                 shots:0, hit:new Set(), leeched:false };
 *    f.cooldowns[index] = skill.cd;
 *    index===5 → 能量清零 + 0.64 秒无敌
 *    upper → vy=-580 + 0.2 秒无敌 ；slam → vy = super?-710:-570
 *  （原版还有个 mimic 的异步分支，我们用不到，先不搬。） */
export function startAttack(f, index, skill) {
  f.attack = {
    skill, index, serial: (f.attackSerial += 1),
    tF: 0, emitted: false, shots: 0,
    hit: new Set(), leeched: false,
  };
  /* ★ 冷却按人的智力缩放（见 game/growth.js 的 cdMul）。
     ⚠️ 这里原来直接写 `f.cooldowns[index] = skill.cd` —— 所有人冷却一样长，
        智力这个属性在战斗里完全没作用。缺省 1，所以不影响没接四维的调用方
        （原版参照实现、以及只传 breeds 不传 level 的旧测试）。 */
  f.cooldowns[index] = Math.round(skill.cd * (f.data?.cdMul || 1));
  if (index === SUPER_INDEX) {
    f.energy = 0;
    f.invulnF = Math.round(0.64 * TICK_HZ);
  } else if (skill.type === 'upper') {
    f.vy = Math.round(-580 * SCALE);
    f.invulnF = Math.round(0.2 * TICK_HZ);
  } else if (skill.type === 'slam') {
    f.vy = Math.round((skill.super ? -710 : -570) * SCALE);
  }
}

/** 命中判定范围。逐条搬自原版 applyMelee：
 *    const dist = Math.abs(o.x-f.x), dy = Math.abs(o.y-f.y),
 *          radial = ['burst','slam','heal','grab'].includes(s.type),
 *          front  = (o.x-f.x)*f.facing >= -20,
 *          height = s.type==='slam' ? o.y > FLOOR-80
 *                 : dy < (s.type==='upper' ? 150 : (s.super ? 170 : 112));
 *    if (dist < s.range && (radial||front) && height) → hit
 *
 * 三个条件缺一不可：够近、在正面（或径向技无视朝向）、高度差在允许范围。
 * 那个 -20 是容差：贴脸时对手中心可能刚好在身后一点点，不该判不中。 */
export const FRONT_TOLERANCE = -20 * SCALE;
export const HEIGHT_NORMAL = 112 * SCALE;
export const HEIGHT_UPPER = 150 * SCALE;
export const HEIGHT_SUPER = 170 * SCALE;
const RADIAL_TYPES = new Set(['burst', 'slam', 'heal', 'grab']);

export function inMeleeRange(atk, def, skill) {
  const dist = Math.abs(def.x - atk.x);
  const dy = Math.abs(def.y - atk.y);
  const radial = RADIAL_TYPES.has(skill.type);
  const front = (def.x - atk.x) * atk.facing >= FRONT_TOLERANCE;
  const height = skill.type === 'slam'
    ? def.y > STAGE.FLOOR - 80 * SCALE
    : dy < (skill.type === 'upper' ? HEIGHT_UPPER
      : (skill.super ? HEIGHT_SUPER : HEIGHT_NORMAL));
  return dist < skill.range * SCALE && (radial || front) && height;
}

/* ---- hit() 里那些写死的秒数，统一换成帧 ---- */
/* 连招保护（原版 attacker.combo >= 7 触发） */
const COMBO_BREAK_AT = 7;
const T_INVULN_COMBO_BREAK = Math.round(0.48 * TICK_HZ);   // 原版 defender.invuln = .48
const T_STUN_COMBO_BREAK = Math.round(0.24 * TICK_HZ);     // 原版 defender.stun = .24

const T_STUN_LIGHT = Math.round(0.28 * TICK_HZ);      // 36
const T_STUN_HEAVY = Math.round(0.37 * TICK_HZ);      // 47
const T_STUN_SUPER = Math.round(0.42 * TICK_HZ);      // 54
const T_STUN_BLOCK = Math.round(0.075 * TICK_HZ);     // 10
const T_STUN_BREAK = Math.round(0.9 * TICK_HZ);       // 115
const T_GUARDBROKEN = Math.round(1.2 * TICK_HZ);      // 154
const T_KNOCKED = Math.round(0.72 * TICK_HZ);         // 92
const T_INVULN_DOWN = Math.round(0.48 * TICK_HZ);     // 61
const T_HITFLASH = Math.round(0.13 * TICK_HZ);        // 17
const T_COMBO_WINDOW = Math.round(1.3 * TICK_HZ);     // 166
const T_SLOW_TRAP = Math.round(1.5 * TICK_HZ);        // 192
const T_COUNTER_STUN = Math.round(0.45 * TICK_HZ);    // 58
const T_COUNTER_HITSTOP = Math.round(0.075 * TICK_HZ);

/** 连段衰减：原版 `damage *= Math.max(.4, 1-(combo-1)*.085)`
 *  用 Q12 存，因为 .085 在 Q8 下只有 22/256 = 0.0859（差 1%） */
const COMBO_DECAY_Q = Math.round(0.085 * 4096);
export const COMBO_MIN_Q = Math.round(0.4 * 4096);

/** 连段衰减系数（Q8 返回值）：第 n 段伤害乘多少 */
export function comboScale(combo) {
  const q = 4096 - (combo - 1) * COMBO_DECAY_Q;
  return mulShift(Math.max(COMBO_MIN_Q, q), SCALE, 12);
}

/* ================= 打击感分级（原版 hit() 里的那两个三目） =================
   移植时我把"纯表现"整类跳过了，结果所有命中长得一模一样 —— 用户的原话是
   "受击特效和打击感可以说一点都没有"。而原版的做法**核心就是分级**：

     this.shake   = blocked ? 2 : skill.super ? 12 : skill.type==='heavy' ? 7 : 4
     this.hitstop = blocked ? .018 : skill.super ? .065 : skill.type==='heavy' ? .065 : .032

   轻击/重击/格挡/必杀各给不同强度的反馈，玩家不用看数字就知道自己打出了什么。
   这里把秒换成帧（128Hz），衰减也照搬：震屏每秒减 22，顿帧每秒减 1。
*/
const secToFrames = (sec) => Math.max(0, Math.round(sec * TICK_HZ));

/** 震屏强度（像素级，和原版同量纲） */
export function hitShake(skill, blocked) {
  if (blocked) return 2;
  if (skill.super) return 12;
  if (skill.type === 'heavy') return 7;
  return 4;
}

/** 顿帧帧数。格挡几乎不顿（.018s），必杀/重击顿得最久（.065s） */
export function hitStopFrames(skill, blocked) {
  if (blocked) return secToFrames(0.018);
  if (skill.super) return secToFrames(0.065);
  if (skill.type === 'heavy') return secToFrames(0.065);
  return secToFrames(0.032);
}

/** 反击/破防这类特殊事件单独给更长的顿帧（原版是写死的 .075） */
export const HITSTOP_COUNTER = secToFrames(0.075);
export const HITSTOP_BREAK = secToFrames(0.05);
/** 震屏衰减速度（原版 `this.shake -= dt*22`，即每秒 22 点） */
export const SHAKE_DECAY_PER_SEC = 22;
/** 白闪时长（原版必杀 `this.flash = .15`） */
export const FLASH_FRAMES = secToFrames(0.15);

/**
 * 命中结算。逐条搬自原版 hit()。
 *
 * 顺序很重要，别调换：
 *   ① 能不能打（敌人 / 没死 / 没无敌 / 这一招没打过他）
 *   ② 反击架势（counterTime>0 且面向来袭方向）→ 反伤攻击方并直接返回
 *   ③ 格挡成立吗（blocking && inFront && guard>0 && 不是抓投）
 *   ④ 未格挡：连段 +1 → 伤害按连段衰减 → 硬直/击飞/脱离连段
 *
 * @returns {null|{type:'counter'|'block'|'hit', damage:number, broke:boolean}}
 */
export function resolveHit(atk, def, skill, source, originX = atk.x) {
  if (!atk || !def || atk.team === def.team) return null;
  if (def.hp <= 0 || def.invulnF > 0) return null;
  if (source.hit.has(def.id)) return null;           // 同一招对同一人只结算一次
  source.hit.add(def.id);

  const dir = def.x >= originX ? 1 : -1;
  const inFront = def.facing === -dir;
  const isGrab = skill.type === 'grab';

  // ② 反击：架势中、面朝来袭方向、不是抓投、不是必杀、不是远程类
  const REMOTE = ['projectile', 'throw', 'summon', 'rain', 'barrage', 'beam', 'trap'];
  if (def.counterF > 0 && inFront && !isGrab && !skill.super && !REMOTE.includes(skill.type)) {
    def.counterF = 0;
    const back = def.counterDamage || 30;
    atk.hp = clamp(atk.hp - back, 0, atk.data.hp);
    atk.stunF = T_COUNTER_STUN;
    atk.vx = -dir * 220 * SCALE;
    atk.attack = null;
    def.energy = clamp(def.energy + 14 * SCALE, 0, 100 * SCALE);
    return { type: 'counter', damage: back, broke: false, combo: 0, escape: false,
             shake: 6, hitstopF: HITSTOP_COUNTER, flash: false };
  }

  let comboBroke = false;

  // ③ 格挡
  const blocked = def.blocking && inFront && def.guard > 0 && !isGrab;
  const power = atk.data.power || 1;
  let dmg = skill.damage * power;
  if (def.data.trait === 'armor') dmg = mul(dmg, Math.round(0.9 * SCALE));

  if (blocked) {
    const scale = skill.super ? 0.24 : 0.13;
    const taken = Math.round(dmg * scale);
    const cost = skill.super ? 42 : (skill.type === 'heavy' ? 26 : 15);
    def.guard = clamp(def.guard - cost * SCALE, 0, 100 * SCALE);
    def.stunF = T_STUN_BLOCK;
    // 格挡给一点（鼓励防守），但别给成主要来源
    def.energy = clamp(def.energy + (3 + (def.data.trait === 'counter' ? 3 : 0)) * SCALE,
      0, 100 * SCALE);
    atk.energy = clamp(atk.energy + 4 * SCALE, 0, 100 * SCALE);
    def.hp = Math.max(0, def.hp - taken);
    let broke = false;
    if (def.guard <= 0) {                 // 破防
      def.guard = 0;
      def.stunF = T_STUN_BREAK;
      def.guardBrokenF = T_GUARDBROKEN;
      def.blocking = false;
      broke = true;
    }
    return { type: 'block', damage: taken, broke, combo: 0, escape: false,
             shake: hitShake(skill, true),
             hitstopF: broke ? HITSTOP_BREAK : hitStopFrames(skill, true),
             flash: false };
  }

  // ④ 未格挡
  atk.combo = atk.comboF > 0 ? atk.combo + 1 : 1;
  atk.comboF = T_COMBO_WINDOW;
  atk.hitCount = (atk.hitCount || 0) + 1;
  dmg = mul(dmg, comboScale(atk.combo));

  /* ⚠️ **连招保护**（原版 engine.js 里有，移植时漏了）。
       原版：
         if (attacker.combo >= 7) { defender.invuln = .48;
                                    defender.vx = dir*470; defender.stun = .24; }
       没有它的话，攻方可以把守方**无限连**：每一下都进硬直，
       守方永远出不了招。

       实测代价：剧情关卡的 Boss（roller，高速滚过）把玩家锁在硬直里 ——
       600 帧只起手了 1 次，Boss 血一直是 240，关卡永远打不完。
       竞技场里"按不出招"的手感也是同一个原因。

       到第 7 连击就给守方 0.48 秒无敌 + 击飞，把连招打断。 */
  if (atk.combo >= COMBO_BREAK_AT) {
    def.invulnF = Math.max(def.invulnF, T_INVULN_COMBO_BREAK);
    def.stunF = Math.min(def.stunF, T_STUN_COMBO_BREAK);
    def.vx = (def.x >= atk.x ? 1 : -1) * 470 * SCALE;
    comboBroke = true;
  }

  def.stunF = skill.type === 'light' ? T_STUN_LIGHT
    : (skill.super ? T_STUN_SUPER : T_STUN_HEAVY);
  def.attack = null;
  def.hitFlashF = T_HITFLASH;
  def.blocking = false;
  if (skill.type === 'trap') def.slowF = T_SLOW_TRAP;

  // 击飞：upper / slam / grab，或必杀且不是收尾招
  if (['upper', 'slam', 'grab'].includes(skill.type)
      || (skill.super && source.finisher !== false)) {
    def.vy = Math.round((-240 - (skill.type === 'upper' ? 120 : 0)) * SCALE);
    def.knockedF = T_KNOCKED;
    def.downTimeF = 0;
  }
  // 7 连以上强制脱离：给受击方一个无敌 + 大击退，防止被无限连
  // 这是**一条规则级的规则**（不许无限连），不是普通命中，
  // 所以要在返回值里标出来 —— 上层靠它出提示，不然玩家只会觉得
  // "怎么突然打不动了"。原来这里只是改了状态、没有任何信号。
  let escaped = false;
  if (atk.combo >= 7) {
    def.invulnF = T_INVULN_DOWN;
    def.vx = dir * 470 * SCALE;
    def.stunF = Math.round(0.24 * TICK_HZ);
    escaped = true;
  }
  /* 能量收支。
     ⚠️ **挨打加气**原来照搬了原版的 +7 —— 但那是原版的节奏（3/秒 的自然回复）。
        实测下来气涨到 20/秒、5 秒就满：因为 AI 打得勤，你一直在挨打，
        挨打又一直给你加气 —— 于是"气一直是满的"，但硬直又让你放不出来，
        手感就变成"L 按不出来"。

     调法：**挨打给的少、打中给的多**。
     让"气"奖励进攻而不是奖励挨打 —— 这才是它该有的因果。 */
  /* ★ 亲和的落点：**打中回气**（主气源）按 energyMul 缩放（见 game/growth.js）。
     只接这一处、不撒到每一处 —— 挨打那 3 点保持原样，
     这样"亲和高的狗更靠进攻攒气"这个因果是清楚的，而不是全面变快。 */
  atk.energy = clamp(
    atk.energy + (skill.super ? 2 : 9) * SCALE * (atk.data?.energyMul || 1),
    0, 100 * SCALE);
  def.energy = clamp(def.energy + 3 * SCALE, 0, 100 * SCALE);
  def.hp = Math.max(0, def.hp - dmg);
  return { type: 'hit', damage: dmg, broke: false, escape: escaped, combo: atk.combo,
           shake: hitShake(skill, false),
           hitstopF: hitStopFrames(skill, false),
           flash: Boolean(skill.super) };
}

/** 招式速度/时序里几个写死的数（原版散在 updateAttack 里） */
const DASH_SPEED = 580 * SCALE;
const DASH_SPEED_SUPER = 820 * SCALE;
const DASH_TAIL = Math.round(0.08 * TICK_HZ);          // 收招前 .08 秒停止位移
const BARRAGE_COUNT = 5;
const BARRAGE_INTERVAL = Math.round(0.14 * TICK_HZ);   // 每 18 帧一发
const TRAP_OFFSET = 180 * SCALE;                       // 布在身前 180 格
const TRAP_RADIUS = 65 * SCALE;
const TRAP_LIFE_F = Math.round(3.4 * TICK_HZ);
const COUNTER_FRAMES = Math.round(2 * TICK_HZ);        // 反击架势持续 2 秒
const HEAL_AMOUNT = 55;
const SLAM_GROUND = Math.round(0.1 * TICK_HZ);         // 离地不到这个量算落地

/**
 * 招式推进一帧。完整的 updateAttack 移植。
 *
 * 原版顺序（**不能调换**，dash 和 barrage 走的是另一条分支）：
 *   a.t += dt
 *   ① dash：在 [start, duration-.08) 窗口内每帧位移 + 判定
 *   ② barrage：按 interval 连发，打满 count 发
 *   ③ 否则到 start 触发一次，按 type 分派（projectile/trap/counter/heal/beam/近战）
 *   ④ slam 的判定不在这里，是"落地那一帧"才结算
 *   ⑤ 收招：t >= duration，且 slam 必须已经落地
 *
 * @returns {{ev:string, shots:number, melee:boolean}} 这一帧发生了什么。
 *   ev: 'none' | 'emit' | 'slam' | 'end'
 *   melee=true 表示这一帧要调 inMeleeRange/resolveHit
 */
export function updateAttack(f) {
  const a = f.attack;
  if (!a) return { ev: 'none', shots: 0, melee: false };
  const s = a.skill;
  a.tF += 1;
  let shots = 0;
  let melee = false;

  // ① dash：突进位移 + 每帧判定
  if (s.type === 'dash' && a.tF >= s.start && a.tF < s.duration - DASH_TAIL) {
    f.x = clamp(f.x + f.facing * (s.super ? DASH_SPEED_SUPER : DASH_SPEED) / TICK_HZ,
      STAGE.WALL_L, STAGE.WALL_R);
    melee = true;
  }

  // ② barrage：按间隔连发
  if (s.type === 'barrage') {
    const count = s.count || BARRAGE_COUNT;
    const interval = s.interval ? Math.round(s.interval * TICK_HZ) : BARRAGE_INTERVAL;
    while (a.shots < count && a.tF >= s.start + a.shots * interval) {
      a.shots += 1;
      shots += 1;                      // 交给上层生成飞弹（位置偏移 (shots%3-1)*15）
    }
  } else if (!a.emitted && a.tF >= s.start) {
    // ③ 到点触发一次
    a.emitted = true;
    if (s.type === 'projectile') {
      const count = s.count || 1;
      for (let n = 0; n < count; n += 1) { a.shots = n + 1; shots += 1; }
    } else if (s.type === 'trap') {
      // 布阵：记在 f 身上，交给 match.js 生成陷阱实体
      f.trapSpawn = {
        x: clamp(f.x + f.facing * TRAP_OFFSET, STAGE.WALL_L, STAGE.WALL_R),
        y: STAGE.FLOOR, owner: f.id, attack: a,
        radius: TRAP_RADIUS, lifeF: TRAP_LIFE_F,
      };
    } else if (s.type === 'counter') {
      f.counterF = COUNTER_FRAMES;
      f.counterDamage = s.damage;
    } else if (s.type === 'heal') {
      /* ★ 回血量由**体力**决定（上限 80），见 growth.js 的 healOf。
         没有 data.healAmount 的调用方（原版参照实现、只传 breeds 的旧测试）
         走 HEAL_AMOUNT 这个老常量，行为不变。 */
      f.hp = clamp(f.hp + (f.data.healAmount || HEAL_AMOUNT), 0, f.data.hp);
      // ★ 花气：耗气量由**敏捷**决定（越高越省）
      if (f.data.healCost) {
        f.energy = clamp(f.energy - f.data.healCost * SCALE, 0, 100 * SCALE);
      }
      melee = true;
    } else if (s.type === 'beam') {
      melee = true;
    } else if (s.type !== 'dash' && s.type !== 'slam') {
      melee = true;
    }
    return { ev: 'emit', shots, melee };
  }

  // ④ slam：落地那一帧结算
  let ev = shots > 0 ? 'emit' : 'none';
  if (s.type === 'slam' && a.emitted && f.y >= STAGE.FLOOR - SLAM_GROUND * 1 && !a.landed) {
    a.landed = true;
    melee = true;
    ev = 'slam';
  }

  // ⑤ 收招（slam 必须落地才算完）
  if (a.tF >= s.duration && (s.type !== 'slam' || a.landed)) {
    f.attack = null;
    ev = 'end';
  }
  return { ev, shots, melee };
}

/** 对账用的一帧快照：只取规则产生的量 */
export function snap(f) {
  return {
    x: f.x / SCALE, y: f.y / SCALE,
    vx: f.vx / SCALE, vy: f.vy / SCALE,
    hp: f.hp, energy: f.energy / SCALE, guard: f.guard / SCALE,
    walk: f.walk / SCALE, facing: f.facing,
  };
}

export { makeRng, SCALE, TICK_SHIFT };
