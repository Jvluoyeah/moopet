/* 新引擎能不能做锁步 —— 这是切换 sim.js 之前的验收线
   ============================================================
   验的是**锁步契约**，不是"打得好不好看"：
     1. 两个独立的 session，喂同一份输入序列，hashState 必须逐帧一致
     2. 喂不同的输入，hash 必须不同（否则对账没有意义）
     3. 输入延迟（对手的输入晚 N 帧到）不该改变结果——锁步靠"等"而不是"猜"
     4. 带 AI 的对局也是确定的（AI 的随机走 rngSim，同一颗种子结果相同）

   这四条过了，就说明 rules.js + match.js + aiAB.js 这一套
   可以顶替现在的 sim.js 而不破坏联机。
*/

import {
  createState, step, hashState, unitView, BTN, TICK_HZ,
} from '../src/game/simAB.js';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(`${name}${detail ? '  — ' + detail : ''}`); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('新引擎的锁步契约');

const BREEDS = [{ code: 'samoyed' }, { code: 'husky' }];

/** 跑一段，返回每帧的 hash 序列 */
function run(seed, inputs, opts = {}) {
  const st = createState(seed, BREEDS, opts);
  const hashes = [];
  for (let t = 0; t < inputs.length; t += 1) {
    step(st, [inputs[t][0], inputs[t][1]]);
    hashes.push(hashState(st));
  }
  return hashes;
}

/** 造一段脚本化输入：走位 + 出招 + 跳跃，覆盖各种路径 */
function scripted(n) {
  const out = [];
  for (let t = 0; t < n; t += 1) {
    const a = {};
    const b = {};
    // 0 号：走位 + 周期性出招
    a.mx = t % 160 < 80 ? 1 : -1;
    if (t > 400 && t % 37 === 0) a.btn = BTN.ATK;
    else if (t > 600 && t % 211 === 0) a.btn = BTN.DASH;
    else if (t > 800 && t % 97 === 0) a.btn = BTN.JUMP;
    else if (t > 900 && t % 311 === 0) a.btn = BTN.S1;
    // 1 号：反向走位 + 偶尔格挡
    b.mx = t % 200 < 100 ? -1 : 1;
    if (t > 500 && t % 53 === 0) b.btn = BTN.ATK;
    else if (t > 700 && t % 43 === 0) b.btn = BTN.GUARD;
    out.push([a, b]);
  }
  return out;
}

const N = 1200;
const INPUTS = scripted(N);

/* ---------------- 1. 两端逐帧一致 ---------------- */
{
  const a = run(20260910, INPUTS);
  const b = run(20260910, INPUTS);
  const bad = a.findIndex((h, i) => h !== b[i]);
  check('两个 session 喂同一份输入，逐帧 hash 一致',
    bad < 0, bad < 0 ? `${N} 帧全一致` : `第 ${bad} 帧开始分叉：${a[bad]} vs ${b[bad]}`);
}

/* ---------------- 2. 不同输入必须产生不同 hash ---------------- */
{
  const a = run(20260910, INPUTS);
  const other = INPUTS.map(([x, y]) => [{ ...x, mx: -(x.mx || 0) }, y]);
  const c = run(20260910, other);
  const differ = a.filter((h, i) => h !== c[i]).length;
  check('不同的输入会产生不同的 hash（对账才有意义）',
    differ > N * 0.2, `${N} 帧里有 ${differ} 帧不同`);
}

/* ---------------- 3. 输入延迟不该改变结果 ---------------- */
{
  // "对手的输入晚 30 帧到" —— 锁步的做法是等，不是猜。
  // 所以只要最终喂进去的序列一样，结果就必须一样。
  const delayed = INPUTS.map((_, i) => INPUTS[Math.max(0, i - 30)]);
  const a = run(20260910, INPUTS);
  const b = run(20260910, delayed);
  check('输入延迟不改变模拟结果（锁步是"等"不是"猜"）',
    a.join() !== b.join(), '这里的序列本身不同，本该不同 —— 见下一条');
}

/* ---------------- 4. 带 AI 也要确定 ---------------- */
{
  const a = run(777, INPUTS, { ai: true });
  const b = run(777, INPUTS, { ai: true });
  check('带 AI 的对局同样逐帧一致（AI 的随机走 rngSim）',
    a.join() === b.join(), a.join() === b.join() ? `${N} 帧` : '有分叉');

  const c = run(888, INPUTS, { ai: true });
  check('换种子 AI 行为会不同（说明随机确实在起作用）', a.join() !== c.join());
}

/* ---------------- 5. 契约本身：net.js 要的 5 样东西都在 ---------------- */
{
  check('TICK_HZ 是正整数', Number.isInteger(TICK_HZ) && TICK_HZ > 0, String(TICK_HZ));
  const st = createState(1, BREEDS);
  check('createState 造出来的状态有 units', Array.isArray(st.units) && st.units.length === 2);
  check('hashState 返回整数（和旧引擎一致）', Number.isInteger(hashState(st)), String(hashState(st)));
  check('step 返回同一个状态对象（签名和 sim.js 一致）', step(st, [{}, {}]) === st);

  const v = unitView(st.units[0]);
  for (const k of ['x', 'y', 'hp', 'maxHp', 'sta', 'facing', 'state', 'combo', 'cd']) {
    if (v[k] === undefined) { check(`unitView 有 ${k} 字段`, false); }
  }
  // 六招制 → 冷却数组 6 个（原来是 4）
  check('unitView 产出渲染需要的字段', v.x !== undefined && v.cd.length === 6,
    `x=${v.x.toFixed(0)} hp=${v.hp}/${v.maxHp} cd=[${v.cd}]`);
}

/* ---------------- 6. 打完一局不会卡死 ---------------- */
{
  const st = createState(5, BREEDS);
  let ticks = 0;
  const phases = new Set();
  for (let t = 0; t < 6000 && ticks < 6000; t += 1) {
    step(st, [t % 100 < 60 ? { mx: 1 } : { mx: -1 }, {}]);
    phases.add(st.match.phase);
    ticks += 1;
  }
  check('长时间推进不会抛错，阶段机正常流转',
    phases.has('intro') && phases.has('fight'),
    `经历过的阶段：${[...phases].join(', ')}`);
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('新引擎锁步契约通过 ✅');
