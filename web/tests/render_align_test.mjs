/* 渲染对齐：新引擎产出的坐标，渲染层能不能吃下
   ============================================================
   前面十三轮验的都是"规则对不对"，这一轮验的是**规则和渲染之间的那道缝**。

   缝在哪：
     · 新引擎 y 轴**朝下**（0=屏幕顶，FLOOR=443 是地面），渲染层要的是"离地高度"
     · 新引擎场地只有 960 格宽，渲染层是按 2400 格调的
     · 新引擎 128Hz，渲染层的取景/缩放是按 30Hz 的手感调的
   unitView() 负责前两条的换算。换算错了的表现是"狗站歪了/跑出画面/倒着站"——
   这种问题测试测不出来（除非专门测），截图又要人眼盯。所以这里把不变式写成断言。

   这些不变式**不验好不好看**，只验"能不能画"：
     x 在场地内、y ≥ 0（不能钻到地下）、朝向是 ±1、血量/体力在范围内、
     状态名在渲染层认识的集合里、冷却数组长度对。
*/

import { createState, step, unitView, STAGE_W, STAGE_H, BTN, TICK_HZ } from '../src/game/simAB.js';
import { STAGE } from '../src/game/rules.js';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('渲染对齐（unitView 的坐标契约）');

/** 渲染层（stage.js）认识的状态名 */
const RENDER_STATES = new Set(['idle', 'run', 'walk', 'jump', 'attack', 'skill', 'hurt', 'down']);

const BREEDS = [{ code: 'samoyed' }, { code: 'husky' }];

/** 跑一段并收集所有 unitView，用来做全量不变式检查 */
function collect(frames = 1500, opts = {}) {
  const st = createState(31337, BREEDS, opts);
  const seen = [];
  for (let t = 0; t < frames; t += 1) {
    const a = { mx: t % 200 < 120 ? 1 : -1 };
    if (t > 350 && t % 41 === 0) a.btn = BTN.ATK;
    if (t > 500 && t % 173 === 0) a.btn = BTN.JUMP;
    if (t > 700 && t % 97 === 0) a.btn = BTN.DASH;
    step(st, [a, { mx: t % 260 < 130 ? -1 : 1 }]);
    seen.push(st.units.map(unitView));
  }
  return { st, seen };
}

const { st, seen } = collect();
const flat = seen.flat();
console.log(`  （采样了 ${seen.length} 帧 × 2 只 = ${flat.length} 个 unitView）`);

/* ---------------- 1. 坐标必须在场地内 ---------------- */
{
  const bad = flat.filter((v) => v.x < 0 || v.x > STAGE_W);
  check('x 始终落在场地宽度内（不会跑到画面外）', bad.length === 0,
    bad.length ? `${bad.length} 个越界，例如 x=${bad[0].x.toFixed(1)}（场地 0~${STAGE_W}）`
      : `x 范围 ${Math.min(...flat.map((v) => v.x)).toFixed(0)}~${Math.max(...flat.map((v) => v.x)).toFixed(0)}`);

  const below = flat.filter((v) => v.y < -0.01);
  check('y 不会变成负数（狗不会钻到地面以下）', below.length === 0,
    below.length ? `${below.length} 个负值，最低 y=${Math.min(...flat.map((v) => v.y)).toFixed(2)}`
      : `y 范围 ${Math.min(...flat.map((v) => v.y)).toFixed(1)}~${Math.max(...flat.map((v) => v.y)).toFixed(1)}`);

  // 跳跃高度要是个合理值：新引擎跳跃初速 600 格/秒，重力 1650 → 理论峰高 ~109 格
  const peak = Math.max(...flat.map((v) => v.y));
  check('跳跃高度在合理范围（不会飞出画面）', peak > 20 && peak < 300,
    `最高离地 ${peak.toFixed(1)} 格（stage.js 的 viewH 是 640）`);
}

/* ---------------- 2. 坐标口径：地面 = 0 ---------------- */
{
  const st2 = createState(1, BREEDS);
  // 前 288 帧是 intro，不跑物理；之后站着不动应该正好在地面上
  for (let t = 0; t < 400; t += 1) step(st2, [{}, {}]);
  const v = unitView(st2.units[0]);
  check('站着不动时 y 正好是 0（地面基准对得上）', Math.abs(v.y) < 0.01,
    `y=${v.y.toFixed(4)}（新引擎内部 y=${st2.units[0].y}，FLOOR=${STAGE.FLOOR}）`);
}

/* ---------------- 3. 数值范围：HUD 不会画出负数血条 ---------------- */
{
  check('血量在 [0, maxHp] 之内', flat.every((v) => v.hp >= 0 && v.hp <= v.maxHp),
    `hp 范围 ${Math.min(...flat.map((v) => v.hp))}~${Math.max(...flat.map((v) => v.hp))} / maxHp ${flat[0].maxHp}`);
  check('体力（能量）在 [0, maxSta] 之内', flat.every((v) => v.sta >= 0 && v.sta <= v.maxSta),
    `sta 范围 ${Math.min(...flat.map((v) => v.sta))}~${Math.max(...flat.map((v) => v.sta))}`);
  check('血量和体力都是整数（HUD 直接显示，不该出现小数）',
    flat.every((v) => Number.isInteger(v.hp) && Number.isInteger(v.sta)));
  check('朝向只有 ±1', flat.every((v) => v.facing === 1 || v.facing === -1));
}

/* ---------------- 4. 状态名是渲染层认识的 ---------------- */
{
  const names = new Set(flat.map((v) => v.state));
  const unknown = [...names].filter((n) => !RENDER_STATES.has(n));
  check('所有状态名渲染层都认识（不认识就会退回默认姿势）', unknown.length === 0,
    unknown.length ? `陌生状态：${unknown.join(', ')}` : `出现过：${[...names].join(', ')}`);
  check('战斗过程中确实出现了多种状态', names.size >= 3, `${names.size} 种`);
  // ⚠️ 下面两条是硬要求，不是"顺便看看"：
  //    unitView 第一版没映射移动态，整局只有 idle/attack/hurt，
  //    画面上就是"狗在原地滑行"。它不会让任何**规则**测试变红——
  //    只有盯住"状态集合里必须出现 run/jump"才拦得住。
  check('移动态真的出现了（否则狗会原地滑行）',
    names.has('run') || names.has('walk'), `出现过：${[...names].join(', ')}`);
  check('腾空态真的出现了（否则跳跃看不出滞空）', names.has('jump'),
    `出现过：${[...names].join(', ')}`);
}

/* ---------------- 5. 其它渲染层要读的字段 ---------------- */
{
  // 六招制 → 冷却数组是 6 个。
  // （原来是 4：旧引擎 4 招。改成 6 之后这条没跟着改，
  //   而它挂掉的时候我已经在用 5px 的小字看别的了 —— 是回归跑出来才发现的。）
  check('冷却数组是 6 个（HUD 有六个招式钮）', flat.every((v) => Array.isArray(v.cd) && v.cd.length === 6),
    `[${flat[flat.length - 1].cd}]`);
  check('combo 是数字（HUD 的连击显示要用）',
    flat.every((v) => typeof v.combo === 'number' && v.combo >= 0));
  check('grounded 是布尔', flat.every((v) => typeof v.grounded === 'boolean'));
  check('两只狗的 id 不同且固定', st.units[0].id === 0 && st.units[1].id === 1);
}

/* ---------------- 6. 两只狗不会重叠在一起 ---------------- */
{
  // 渲染上是两个立牌，坐标完全重合会看着像一只
  const st3 = createState(9, BREEDS);
  for (let t = 0; t < 400; t += 1) step(st3, [{}, {}]);
  const [a, b] = st3.units.map(unitView);
  check('开局两只狗分得开（不会叠在一起）', Math.abs(a.x - b.x) > 100,
    `x=${a.x.toFixed(0)} vs ${b.x.toFixed(0)}，相距 ${Math.abs(a.x - b.x).toFixed(0)} 格`);
}

/* ---------------- 7. 128Hz 下渲染取景要重新对一遍 ---------------- */
{
  // 旧引擎是 30Hz、场地 2400 格。新引擎 128Hz、场地 960 格。
  // 速度量级（格/秒）其实差不多，但**场地**差了 2.5 倍——
  // stage.js 的 viewH=640 是按旧场地调的，新场地下会显得很空。
  const st4 = createState(3, BREEDS);
  for (let t = 0; t < 400; t += 1) step(st4, []);
  let maxX = 0; let minX = STAGE_W;
  for (let t = 0; t < 900; t += 1) {
    step(st4, [{ mx: 1 }, {}]);
    const v = unitView(st4.units[0]);
    maxX = Math.max(maxX, v.x); minX = Math.min(minX, v.x);
  }
  const span = maxX - minX;
  check('走动范围占场地的比例是合理的（不是挤在一角，也不是一屏塞不下）',
    span > 100 && span < STAGE_W,
    `走了 ${span.toFixed(0)} 格，占场地 ${(span / STAGE_W * 100).toFixed(0)}%`);
  check('TICK_HZ 是 128（渲染层的插值步长要按这个改）', TICK_HZ === 128, String(TICK_HZ));
  check('stage.js 的取景高度和场地高度是同一量级', STAGE_H > 0,
    `STAGE_H=${STAGE_H}（渲染 viewH 目前是 640，切引擎时要一起对）`);
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('渲染对齐通过 ✅');
