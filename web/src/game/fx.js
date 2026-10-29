/* 定点数学工具箱（锁步对战用）
   ============================================================
   为什么需要它：联机锁步要求"同一份输入 → 双端逐位相同的结果"。
   浮点在 JS 里是 IEEE-754 双精度，**同一台机器同一份代码是确定的**，
   但一旦涉及 Math.sin/cos/exp 这类超越函数，不同引擎/平台的实现可以有
   末位差异，跨设备就会漂。定点整数没有这个问题。

   坐标口径：SCALE = 256，也就是 Q8 定点（1 格 = 256 个单位）。
   乘法的中间结果最大约 2^31，JS 的 Number 有 53 位整数精度，直接用
   a*b 再移位是安全的（不需要 BigInt，也不该用 |0 —— 那会截成 32 位）。
*/

export const SCALE = 256;
export const SHIFT = 8;

/** 引擎固定步长。**必须定义在所有常数之前**——下面的阻尼/重力都是从它推的，
 *  写在后面会触发 JS 的 TDZ（"Cannot access 'TICK_HZ' before initialization"，
 *  这个坑我自己踩过一次）。 */
export const TICK_HZ = 128;
export const TICK_SHIFT = 7;                 // 1/128 = >>7
export const FIXED_DT = 1 / TICK_HZ;

/** 一帧的位移：x += vx >> TICK_SHIFT（纯整数移位，无舍入） */
export const advance = (v) => v >> TICK_SHIFT;

/** 浮点 → 定点（只在"喂常量"的时候用，规则内部一律整数） */
export const fromFloat = (v) => Math.round(v * SCALE);

/** 定点 → 浮点（只给渲染/测试用，规则内部不要调） */
export const toFloat = (v) => v / SCALE;

/** 定点乘法：a、b 都是 Q8，结果也是 Q8。
 *
 *  ⚠️ 用**向零截断**，不用四舍五入。这不是风格问题，是必须：
 *  阻尼是"每帧乘一个略小于 1 的系数"，四舍五入会让小的值自我维持——
 *  `round(7*238/256) = round(6.508) = 7`，于是速度**永远停在 7**（≈0.027 格/秒），
 *  狗一直往前滑、停不下来。截断则单调递减，一定会到 0。
 *  （tests/fx_test.mjs 里的"阻尼漂移"就是为这件事写的，第一版就是这么挂的。）
 */
export const mul = (a, b) => {
  const p = a * b;
  const q = p / SCALE;
  return q < 0 ? -Math.floor(-q) : Math.floor(q);
};

/** 定点乘法（指定位数）。阻尼这类"每帧乘小系数"的场合要用更宽的小数位：
 *  8 位下 exp(-9/120) 只能表示成 238/256 = 0.9297（真值 0.92774，差 0.2%）；
 *  10 位下是 950/1024 = 0.927734（差 0.001%）。差 0.2% 在一局几千帧里会积出来。 */
export const mulShift = (a, b, shift) => {
  const p = a * b;
  const d = 1 << shift;
  const q = p / d;
  return q < 0 ? -Math.floor(-q) : Math.floor(q);
};

/** 定点除法：除以一个整数（比如 dt 换算过来的 120） */
export const div = (a, n) => Math.round(a / n);

export const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
export const sign = (v) => (v > 0 ? 1 : (v < 0 ? -1 : 0));

/** 确定性随机源：mulberry32，纯 32 位整数运算，跨平台逐位一致。
 *  引擎的随机分两条流要分开用（见 rules.js 的说明）：
 *    rngSim —— 只喂 AI 决策，**会进规则**，必须双端同步
 *    rngFx  —— 只喂粒子/镜头抖动，纯表现，不同步也不影响对账
 */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** 返回 [0, n) 的整数（AI 里要的是"概率判定"和"评分抖动"） */
  next.int = (n) => Math.floor(next() * n);
  /** 返回 0..SCALE 的定点数 */
  next.fx = () => Math.floor(next() * SCALE);
  /* 内部状态：**服务端权威 + 回滚重放必须能存取它**。
     回滚时如果只恢复位置、不恢复随机流，重放出来的 AI 决策会和权威分叉 ——
     而那种分叉极难查（表现是"偶尔打得不一样"）。 */
  next.state = () => a;
  next.setState = (v) => { a = v >>> 0; };
  return next;
}

/* ---------------- 从原版引擎里推出来的常数 ----------------
   这些值不是拍的，是从 engine.js 的浮点公式按 dt=1/120 推出来的，
   tests/fx_test.mjs 会验证"定点版和浮点版跑 600 帧的偏差"。 */

/** 水平阻尼：原式 f.vx *= Math.exp(-9*dt)，dt 恒定
 *  ⇒ 每帧乘 exp(-9/TICK_HZ)。
 *  精度选 **Q12**：Q8 误差 0.16%、Q10 0.05%、Q12 0.0028%。
 *  阻尼是每帧都乘的，误差会累积，花 4 位换精度是划算的。 */
export const FRICTION_F = Math.exp(-9 / TICK_HZ);
export const FRICTION = fromFloat(FRICTION_F);          // Q8，精度不够，别用在阻尼上
export const FRICTION_SHIFT = 12;
export const FRICTION_Q = Math.round(FRICTION_F * (1 << FRICTION_SHIFT));
/** 一帧阻尼：vx = mulShift(vx, FRICTION_Q, FRICTION_SHIFT) */
export const damp = (vx) => mulShift(vx, FRICTION_Q, FRICTION_SHIFT);

/** 重力：3300（= 1650/128 × 256）。注意：**必须先有 TICK_HZ 才能算**，
 *  所以这里写成字面量并留推导，改步长时两处一起改（tests/fx_test.mjs 会验）。 */
export const GRAVITY_PER_TICK = 3300;
/** 兼容老名字：fx_test 里用的是这个 */
export const TICK = { gravity: 3300 };

/* ================= 每帧常数表（从 engine.js 穷举推出来的）=================
   定点化的前提：**规则里不能再出现 dt**。每个 `X*dt` 都要先推成"每帧多少"。
   下面这些是把 engine.js 里所有含 dt 的式子扫了一遍的结果，分三类：

   ① 规则 · 能精确表示（直接用）
   ② 规则 · 精度不够（要换表示法，见"计时器改帧计数"）
   ③ 纯表现（粒子/文字/镜头抖动，不用管）

   扫的命令（改完引擎可以重跑核对）：
     python -c "…正则找 *dt…"   → 见 docs 或 git log 里的说明
*/

/** ① 重力：1650*dt，128Hz 下每帧 +12.890625 格/秒。Q8 下正好 3300，**无舍入** */
export const T_GRAVITY = GRAVITY_PER_TICK;                             // 3300

/** ① 防御恢复：dt*15 → 每帧 +0.1171875。Q8 下正好 30 */
export const T_GUARD_REGEN = Math.round((15 / TICK_HZ) * SCALE);       // 30

/** ① 走路动画相位：dt*12 → 每帧 +0.09375。Q8 下正好 24 */
export const T_WALK_PHASE = Math.round((12 / TICK_HZ) * SCALE);        // 24

/** ① 能量恢复：dt*3（trait='charge'）/ dt*2（其他）。Q8 下正好 6 / 4 */
export const T_ENERGY_CHARGE = Math.round((3 / TICK_HZ) * SCALE);      // 6
export const T_ENERGY_NORMAL = Math.round((2 / TICK_HZ) * SCALE);      // 4

/** ① 训练场回血：dt*350 → 每帧 +2.734375。Q8 下正好 700 */
export const T_TRAIN_HEAL = Math.round((350 / TICK_HZ) * SCALE);       // 700

/** ① 跳跃初速：原式 `f.vy = -600`（trait='air' 是 -680），原式里没有 dt，直接搬 */
export const JUMP_VY = -600 * SCALE;
export const JUMP_VY_AIR = -680 * SCALE;

/** ① 落地扬尘的阈值：`if(f.vy > 350)` —— 原式是格/秒，直接乘 SCALE */
export const LANDING_VY = 350 * SCALE;
/** ① 落地僵直：`f.landing = .12` 秒 */
export const T_LANDING = Math.max(1, Math.round(0.12 * TICK_HZ));

/* ② 计时器：**一律改成整数帧计数**，不用"减 dt"
   ------------------------------------------------------------
   这是整个移植里最要紧的一条。`f.stun -= dt` 这类写法在引擎里出现 12 处
   （stun / invuln / slow / counterTime / comboTime / hitFlash / landing /
     guardBroken / cooldowns / 出招队列 ttl / 回合时间 / 横幅时间）。
   dt = 1/120 = 0.008333，Q8 下是 2.133 个单位：
     取 2 → 慢 6.25%（一次 0.5 秒的硬直变成 0.533 秒）
     取 3 → 快 40%
   两个都不能用。改成**帧计数**就没有这个问题：
     0.5 秒 → 60 帧，每帧 -1，**精确**，而且整数比较更快、
     hashState 对账也不会有浮点尾数。
   换算：秒 → 帧 用 `secToFrames()`。 */

/** 秒 → 帧（四舍五入到最近的整帧，至少 1 帧） */
export const secToFrames = (sec) => Math.max(1, Math.round(sec * TICK_HZ));

/** 原版里几个写死的秒数，按帧重新表一遍 */
export const T = {
  jumpBuffer: secToFrames(0.14),       // 17 帧（原 0.14 秒）
  intro: secToFrames(2.25),            // 270 帧：开场演出，这期间输入会被吃掉
  roundend: secToFrames(2.0),
  aiWait: secToFrames(0.5),
  hitFlash: secToFrames(0.12),
  guardBroken: secToFrames(1.2),
  stunLight: secToFrames(0.22),
  stunHeavy: secToFrames(0.36),
  downTime: secToFrames(1.1),
  comboWindow: secToFrames(0.6),
  introFightBanner: secToFrames(0.75), // 剩这么多帧的时候喊 FIGHT!
};

/* ③ 纯表现，不进规则（列在这里是为了"别改"）
     t.y -= 28*dt          文字上飘
     p.vy += 520*dt        粒子重力
     this.shake -= dt*22   镜头抖动
     this.flash -= dt      白闪
   —— 这些留在浮点世界里没关系：它们不影响 hashState。 */
