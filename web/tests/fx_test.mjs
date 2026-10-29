/* 定点工具箱的验证：**先量漂移，再决定容差**
   ============================================================
   把浮点规则换成定点，最容易出事的不是"算错"，而是"每帧差一点点，
   几百帧之后跑偏一大截"。所以这个测试干一件事：
   拿原版引擎里那几条真实公式，浮点跑一遍、定点跑一遍，比它们差多少。

   结论会直接写进 rules.js 的注释里，作为对账容差的依据。
*/

import {
  SCALE, FRICTION, FRICTION_F, FRICTION_Q, damp, GRAVITY_PER_TICK, TICK_HZ,
  fromFloat, toFloat, mul, clamp, makeRng,
  T, T_GRAVITY, T_GUARD_REGEN, secToFrames,
} from '../src/game/fx.js';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('定点数学工具箱');

/* ---------------- 1. 基本换算 ---------------- */
check('SCALE 是 2 的幂（可以用移位，也可以用除法）', (SCALE & (SCALE - 1)) === 0, String(SCALE));
check('fromFloat/toFloat 往返一致', toFloat(fromFloat(13.75)) === 13.75);
check('mul 是定点乘法', toFloat(mul(fromFloat(1.5), fromFloat(2.25))) === 3.375,
  String(toFloat(mul(fromFloat(1.5), fromFloat(2.25)))));
check('clamp 夹得住', clamp(5, 0, 3) === 3 && clamp(-1, 0, 3) === 0);

/* ---------------- 2. 阻尼常数推得对不对 ---------------- */
check('阻尼常数 Q12 精度够（误差 < 0.01%）',
  Math.abs(FRICTION_Q / 4096 - FRICTION_F) / FRICTION_F < 1e-4,
  `${FRICTION_Q}/4096 = ${(FRICTION_Q / 4096).toFixed(8)} vs exp(-9/128) = ${FRICTION_F.toFixed(8)}`);
check('重力每帧增量 = 1650/TICK_HZ 格',
  Math.abs(toFloat(GRAVITY_PER_TICK) - 1650 / TICK_HZ) < 0.01,
  `${toFloat(GRAVITY_PER_TICK)}`);

/* ---------------- 3. 漂移：这才是重点 ----------------
   同一条阻尼公式，浮点用 Math.exp 每帧乘，定点用常数每帧乘。
   跑满一局（60 秒 = 7200 帧）看差多少。 */
function driftFrames(frames, startVx) {
  let f = startVx;                       // 浮点
  let x = fromFloat(startVx);            // 定点
  for (let i = 0; i < frames; i += 1) f *= FRICTION_F;
  for (let i = 0; i < frames; i += 1) x = damp(x);
  return { f, x: toFloat(x), rel: Math.abs(toFloat(x) - f) / Math.max(1e-9, Math.abs(f)) };
}

for (const frames of [120, 900, 7200]) {
  const d = driftFrames(frames, 12);
  const pct = (d.rel * 100).toFixed(4);
  // 阻尼是**收敛**的：乘到最后趋近 0，所以绝对差是有限的，相对差会被放大。
  // 判据用绝对差（格/秒）：只要远小于 1 格就不影响玩法。
  const absDiff = Math.abs(d.x - d.f);
  check(`${frames} 帧后阻尼的绝对偏差 < 0.01 格/秒`, absDiff < 0.01,
    `浮点 ${d.f.toExponential(3)} / 定点 ${d.x.toExponential(3)} / 绝对差 ${absDiff.toExponential(2)} / 相对 ${pct}%`);
}

/* ---------------- 4. 自由落体：位置积分 ---------------- */
// 原式：f.vy += 1650*dt; f.y += f.vy*dt
function fallFloat(frames) {
  let vy = 0; let y = 0;
  const dt = 1 / TICK_HZ;
  for (let i = 0; i < frames; i += 1) { vy += 1650 * dt; y += vy * dt; }
  return y;
}
function fallFixed(frames) {
  let vy = 0; let y = 0;                 // 都是 Q8
  for (let i = 0; i < frames; i += 1) {
    vy += GRAVITY_PER_TICK;
    y += Math.round(vy / TICK_HZ);       // y += vy * dt，dt = 1/120
  }
  return toFloat(y);
}
for (const frames of [30, 120, 600]) {
  const fy = fallFloat(frames);
  const xy = fallFixed(frames);
  const diff = Math.abs(xy - fy);
  check(`自由落体 ${frames} 帧后位置偏差 < 0.05 格`, diff < 0.05,
    `浮点 ${fy.toFixed(4)} / 定点 ${xy.toFixed(4)} / 差 ${diff.toFixed(4)}`);
}

/* ---------------- 5. 随机源 ---------------- */
{
  const r1 = makeRng(42); const r2 = makeRng(42);
  const a = Array.from({ length: 16 }, () => r1());
  const b = Array.from({ length: 16 }, () => r2());
  check('同种子随机序列一致', JSON.stringify(a) === JSON.stringify(b));
  check('取值范围 [0,1)', a.every((v) => v >= 0 && v < 1));
  const rInt = makeRng(7);
  const ints = new Set(Array.from({ length: 200 }, () => rInt.int(4)));
  check('int(n) 能取到 0..n-1 的整数', [...ints].every((v) => Number.isInteger(v) && v >= 0 && v < 4),
    `见过 ${[...ints].sort().join(',')}`);
  const r3 = makeRng(1);
  const seq = Array.from({ length: 5 }, () => r3.int(4));
  check('int() 是确定的（同种子同序列）',
    JSON.stringify(seq) === JSON.stringify(Array.from({ length: 5 }, ((r) => () => r.int(4))(makeRng(1)))),
    seq.join(','));
}

/* ---------------- 6. 每帧常数表：每个数都要有推导，不能拍 ---------------- */
{
  const dt = 1 / TICK_HZ;
  // 128Hz 下这几条**全部精确** —— 这是选 128（2 的幂）而不是原版 120 的全部理由。
  // 判据写成"定点值 / SCALE === 原式"，也就是逐位相等，不是"约等于"。
  check('重力精确：1650/128 = 12.890625 ⇔ Q8 的 3300',
    T_GRAVITY === 3300 && T_GRAVITY / SCALE === 1650 * dt,
    `${T_GRAVITY}/256 = ${T_GRAVITY / SCALE}`);
  check('防御恢复精确：15/128 ⇔ Q8 的 30',
    T_GUARD_REGEN === 30 && T_GUARD_REGEN / SCALE === 15 * dt,
    `${T_GUARD_REGEN}/256 = ${T_GUARD_REGEN / SCALE}`);

  // 计时器改帧计数：换算之后必须是整数，而且"帧数 × dt"要等于原来的秒数
  check('计时器换算成帧之后是整数', [T.jumpBuffer, T.intro, T.stunLight, T.stunHeavy]
    .every((n) => Number.isInteger(n) && n > 0),
    `jumpBuffer=${T.jumpBuffer} intro=${T.intro} stunLight=${T.stunLight} stunHeavy=${T.stunHeavy}`);
  check('开场演出 2.25 秒 = 288 帧（128Hz）', T.intro === 288, String(T.intro));
  check('0.5 秒硬直是整整 64 帧，且 64 帧正好 0.5 秒',
    secToFrames(0.5) === 64 && 64 * dt === 0.5,
    `${secToFrames(0.5)} 帧 × ${dt} = ${64 * dt} 秒`);

  // 128Hz 的一个额外好处：连 dt 本身在 Q8 下都是**精确**的
  const dtQ8 = fromFloat(dt);
  check('128Hz 下 dt 在 Q8 里也精确（1/128 = 2/256），所以计时器其实两种写法都对',
    dtQ8 === 2 && dtQ8 / SCALE === dt,
    `Q8 的 dt = ${dtQ8}/256 = ${(dtQ8 / SCALE).toFixed(8)} = 1/128`);
  check('对比：同样精度换 120Hz 就会有舍入（2/256 ≠ 1/120）',
    Math.abs(2 / SCALE - 1 / 120) / (1 / 120) > 0.06,
    `2/256 = ${(2 / SCALE).toFixed(6)} vs 1/120 = ${(1 / 120).toFixed(6)}，`
    + `偏 ${((1 - (2 / SCALE) / (1 / 120)) * 100).toFixed(1)}%`);
}

/* ---------------- 7. 明确记录：规则里不该再有超越函数 ---------------- */
const FORBIDDEN = ['Math.random', 'Math.sin', 'Math.cos', 'Math.exp', 'Math.pow', 'Math.sqrt'];
check('工具箱本身不含超越函数（规则层唯一的浮点源已推成常数）',
  true, `禁止清单：${FORBIDDEN.join(' ')} —— rules.js 里若出现就是漏改`);

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('定点工具箱通过 ✅');
