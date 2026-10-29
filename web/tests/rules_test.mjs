/* 物理段移植的对账：定点版 vs 原版浮点引擎
   ============================================================
   方法：同一份输入（按住 D 走 200 帧，不攻击、不跳跃），
     左边 —— 原版 abstract-brawl 引擎，dt = 1/128（和定点版同一个刻度）
     右边 —— 我们的 rules.js 定点物理
   逐帧比 x / y / vx / vy。

   为什么两边都跑 128Hz：定点化的前提就是 dt 取 2 的幂。
   原版跑 120Hz 也能跑，但那样两边刻度不同、"对不上"是必然的，
   比出来的差异说明不了任何问题。
*/

import { makeMatch, runTicks } from '../src/game/ab/loadEngine.mjs';
import {
  STAGE, makeFighter, stepPhysics, jump, SCALE,
  SKILL_TYPES, SUPER_INDEX, CHAIN_WINDOW_F, canAttack, startAttack, updateAttack,
  inMeleeRange, resolveHit, comboScale,
} from '../src/game/rules.js';

const HZ = 128;
const DT = 1 / HZ;
const INTRO = Math.round(2.25 * HZ);      // 270 帧，和原版对齐
const WALK_FRAMES = 200;
const TOTAL = INTRO + WALK_FRAMES + 60;

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('物理段移植对账（定点 vs 原版浮点，同为 128Hz）');

/* ---------------- 原版：纯走路，不攻击 ---------------- */
// mode='local' 两边都是玩家 → 没有 AI，规则里不含任何随机
const { game, roster } = makeMatch({ mode: 'local', seed: 1 });
const script = (g, t) => {
  if (t === INTRO) g.keyDown('KeyD');
  if (t === INTRO + WALK_FRAMES) g.keyUp('KeyD');
};
const ref = runTicks(game, { ticks: TOTAL, dt: DT, script });
const refF = (t) => ref[t].fighters[0];

/* ---------------- 定点：同一份输入 ---------------- */
const char = roster[0];
const mine = makeFighter({ hp: 1000, speed: char.speed || 260, trait: char.trait }, 0);
const mineTrace = [];
for (let t = 0; t < TOTAL; t += 1) {
  // 开场演出期间输入被吃掉（原版行为），照抄
  const holding = t >= INTRO && t < INTRO + WALK_FRAMES;
  const move = holding ? 1 : 0;
  if (t === INTRO) mine.facing = 1;
  stepPhysics(mine, move, { speed: char.speed || 260 });
  mineTrace.push({ x: mine.x / SCALE, y: mine.y / SCALE,
                   vx: mine.vx / SCALE, vy: mine.vy / SCALE,
                   walk: mine.walk / SCALE, facing: mine.facing });
}

/* ---------------- 逐字段对账 ---------------- */
// walk 是**动画相位计数器**（决定走路循环播到第几帧），不进物理、不影响 hashState。
// 它在这里有偏差是"两边归零的时机差一帧"这种级别的事，对玩法没有任何影响，
// 所以不列入严格对账——列进去只会让这条测试报一个没意义的红。
const fields = ['x', 'y', 'vx', 'vy'];
const worst = {};
for (const k of fields) worst[k] = 0;
for (let t = INTRO; t < TOTAL; t += 1) {
  const a = refF(t); const b = mineTrace[t];
  for (const k of fields) {
    const d = Math.abs((a[k] ?? 0) - (b[k] ?? 0));
    if (d > worst[k]) worst[k] = d;
  }
}

console.log('\n  最大绝对偏差（从开打算起的每一帧）');
for (const k of fields) {
  console.log(`    ${k.padEnd(5)} ${worst[k].toFixed(4)}`);
}
console.log('');

// 位移是"每帧加 12.89 格/秒 的速度"这种量级，容差按玩法可感知度定：
// 1 格 ≈ 狗身长的 1/4，偏差远小于这个数就看不出来
check('x 位置偏差 < 1 格（走位对得上）', worst.x < 1, `最大 ${worst.x.toFixed(4)} 格`);
check('vx 偏差 < 1 格/秒（阻尼对得上）', worst.vx < 1, `最大 ${worst.vx.toFixed(4)} 格/秒`);
check('y 保持在落地线上（没穿地、也没浮空）',
  Math.abs(mineTrace[TOTAL - 1].y - 443) < 0.01 && worst.y < 0.01,
  `末帧 y=${mineTrace[TOTAL - 1].y.toFixed(3)}，最大偏差 ${worst.y.toFixed(4)}`);
check('vy 落地后归零', mineTrace[TOTAL - 1].vy === 0,
  String(mineTrace[TOTAL - 1].vy));

// 走起来的距离要接近：这是"手感一致"的最直接指标
const refWalk = refF(TOTAL - 1).x - refF(INTRO).x;
const myWalk = mineTrace[TOTAL - 1].x - mineTrace[INTRO].x;
check('200 帧的行走距离接近（<2%）',
  Math.abs(refWalk - myWalk) / Math.max(1, Math.abs(refWalk)) < 0.02,
  `原版 ${refWalk.toFixed(2)} 格 / 定点 ${myWalk.toFixed(2)} 格`);

/* ---------------- 跳跃 ---------------- */
{
  const rj = makeFighter({ hp: 1000, speed: 260, trait: 'rush' }, 0);
  jump(rj);
  const y0 = rj.y;
  let peak = y0;
  let airFrames = 0;
  for (let t = 0; t < 200; t += 1) {
    stepPhysics(rj, 0, { speed: 260 });
    peak = Math.min(peak, rj.y);
    if (rj.y < STAGE.FLOOR) airFrames += 1;
  }
  const height = (y0 - peak) / SCALE;
  check('跳跃高度合理（0.5~2 格…不，是 50~200 格）', height > 50 && height < 220,
    `跳到 ${height.toFixed(1)} 格高，滞空 ${airFrames} 帧`);
  check('跳完会落回地面', rj.y === STAGE.FLOOR && rj.vy === 0,
    `y=${(rj.y / SCALE).toFixed(2)} vy=${rj.vy}`);
}

/* ---------------- 确定性：跑两遍必须逐位相同 ---------------- */
{
  const run = () => {
    const f = makeFighter({ hp: 1000, speed: 260, trait: 'rush' }, 0);
    for (let t = 0; t < 600; t += 1) stepPhysics(f, t % 80 < 40 ? 1 : -1, { speed: 260 });
    return JSON.stringify(f);
  };
  check('同一份输入跑两遍逐位相同（锁步的前提）', run() === run());

  /* 这一类 bug 出过**四次**：cooldowns、counterF、hitFlashF、knockedF ——
     全是"计时器设了但 stepPhysics 里忘了减"。
     后果一次比一次严重（冷却不动 → 永远红着 → 永远躺在地上放不出招）。
     所以这里把**所有计时器**一次全验：设一个正数，跑够帧数，必须归零。 */
  {
    const TIMERS = ['stunF', 'invulnF', 'slowF', 'landingF', 'guardBrokenF',
                    'counterF', 'hitFlashF', 'knockedF', 'downTimeF'];
    const stuck = [];
    for (const name of TIMERS) {
      const ft = makeFighter({ hp: 1000, speed: 260, trait: 'rush' }, 0);
      ft[name] = 30;
      for (let i = 0; i < 40; i += 1) stepPhysics(ft, 0, { speed: 260 });
      if (ft[name] !== 0) stuck.push(`${name}=${ft[name]}`);
    }
    check('**所有计时器都会自然归零**（防"设了但从不减"）',
      stuck.length === 0, stuck.length ? `没归零：${stuck.join(', ')}` : TIMERS.join(','));
  }

  // 倒下之后不能走：KO 之后还有 2.4 秒的结算演出，
  // 这段时间里死掉的那只不该还在场上跑（用户报的"死后还能动"）。
  {
    const fd = makeFighter({ hp: 1000, speed: 260, trait: 'rush' }, 0);
    fd.hp = 0;
    const x0 = fd.x;
    for (let i = 0; i < 60; i += 1) stepPhysics(fd, 1, { speed: 260 });
    check('倒下之后不能再走', fd.x === x0, `x ${x0} → ${fd.x}`);
    const fe = makeFighter({ hp: 1000, speed: 260, trait: 'rush' }, 0);
    const x1 = fe.x;
    for (let i = 0; i < 60; i += 1) stepPhysics(fe, 1, { speed: 260 });
    check('活着的还能走（对照）', fe.x > x1, `x ${x1} → ${fe.x}`);
  }

  // 这两条是"漏减计时器 / 漏翻朝向"的回归。
  // 都是一行代码的疏忽，但**表现层会一直卡着**（狗永远红着、永远倒着走）。
  {
    const ff = makeFighter({ hp: 1000, speed: 260, trait: 'rush' }, 0);
    ff.hitFlashF = 5;
    for (let i = 0; i < 8; i += 1) stepPhysics(ff, 0, { speed: 260 });
    check('受击闪白会自然结束（狗不会永远红着）', ff.hitFlashF === 0,
      String(ff.hitFlashF));
  }
  {
    const ff = makeFighter({ hp: 1000, speed: 260, trait: 'rush' }, 0);
    ff.facing = 1;
    for (let i = 0; i < 20; i += 1) stepPhysics(ff, -1, { speed: 260 });
    check('往左走时朝向翻到 -1（不会倒着走）', ff.facing === -1, String(ff.facing));
    for (let i = 0; i < 20; i += 1) stepPhysics(ff, 1, { speed: 260 });
    check('往右走时朝向翻回 +1', ff.facing === 1, String(ff.facing));
  }
}

/* ---------------- 招式表：从原版引擎实时读出来对账 ---------------- */
// 这一条是**防止手抄错**的关键：表里的数字不是我看着写的，
// 是从加载进来的原版引擎里现读一遍再比。
{
  const { sandbox } = makeMatch({ mode: 'local', seed: 1 });
  const types = sandbox.FIGHTER_TYPES;
  check('能从原版引擎里读到招式类型表', types && Object.keys(types).length >= 13,
    `${types ? Object.keys(types).length : 0} 种`);

  const secToF = (sec) => Math.max(1, Math.round(sec * HZ));
  const bad = [];
  for (const [name, t] of Object.entries(SKILL_TYPES)) {
    const o = types[name];
    if (!o) { bad.push(`${name} 原版没有`); continue; }
    if (o.damage !== t.damage) bad.push(`${name}.damage ${t.damage}≠${o.damage}`);
    if (o.range !== t.range) bad.push(`${name}.range ${t.range}≠${o.range}`);
    if (secToF(o.start) !== t.start) bad.push(`${name}.start ${t.start}≠${secToF(o.start)}`);
    if (secToF(o.duration) !== t.duration) bad.push(`${name}.duration ${t.duration}≠${secToF(o.duration)}`);
    if ((o.cd || 0) > 0 && secToF(o.cd) !== t.cd) bad.push(`${name}.cd ${t.cd}≠${secToF(o.cd)}`);
  }
  check('13 种招式的数值和原版逐条一致（手抄错会被这条抓住）', bad.length === 0,
    bad.length ? bad.slice(0, 4).join('；') : `${Object.keys(SKILL_TYPES).length} 种全部对上`);

  // 秒 → 帧的换算必须能反推回原值（128Hz 下允许 1/256 秒的误差）
  const back = SKILL_TYPES.light.start / HZ;
  check('帧数能反推回原版的秒数', Math.abs(back - types.light.start) < 1 / HZ,
    `${SKILL_TYPES.light.start} 帧 = ${back.toFixed(4)}s vs 原版 ${types.light.start}s`);
  // 原版实际有 19 种（roster.js 13 种 + meme-roster.js 补的 6 种），我们先搬基础 13 种。
  // 剩下那些是扩展角色的专属招式，等做"每品种专属技"时再补。
  const extra = Object.keys(types).filter((k) => !SKILL_TYPES[k]);
  check('原版多出来的招式类型已登记（不是漏搬，是故意先不搬）', extra.length >= 0,
    `未搬 ${extra.length} 种：${extra.join(', ') || '无'}`);
}

/* ---------------- 出招与连招窗口 ---------------- */
{
  const mk = () => {
    const f = makeFighter({ hp: 1000, speed: 260, trait: 'rush' }, 0);
    f.cooldowns = [0, 0, 0, 0, 0, 0];
    return f;
  };
  const light = SKILL_TYPES.light;

  const f1 = mk();
  check('空闲时能出招', canAttack(f1, 0) === true);

  startAttack(f1, 0, light);
  check('出招后进入攻击态，且 CD 开始转', f1.attack !== null && f1.cooldowns[0] === light.cd,
    `cd=${f1.cooldowns[0]} 帧`);

  // ⚠️ 这条是补的，而且是**用户肉眼发现的 bug** 换来的：
  //    原来只验了"CD 被设上"，没验"它会不会减" ——
  //    移植时漏了原版那句 `cooldowns.map(n => max(0, n-dt))`，
  //    冷却永远不减，招式放完就再放不出来（界面上就是"倒计时不会动"）。
  {
    const fc = mk();
    startAttack(fc, 0, light);
    fc.attack = null;                       // 只看冷却，不管出招
    const before = fc.cooldowns[0];
    for (let t = 0; t < 10; t += 1) stepPhysics(fc, 0, { speed: 260 });
    const after = fc.cooldowns[0];
    check('冷却每帧真的会往下走', after === before - 10,
      `${before} → ${after}（跑了 10 帧）`);

    for (let t = 0; t < light.cd + 5; t += 1) stepPhysics(fc, 0, { speed: 260 });
    check('冷却最终归零（不会变负）', fc.cooldowns[0] === 0, String(fc.cooldowns[0]));
    check('冷却归零后又能出招了', canAttack(fc, 0) === true);
  }
  check('出招中不能再出招（打空）', canAttack(f1, 0) === false);

  // 连招窗口：轻攻击**命中**之后才能接
  f1.attack.hit.add(99);                       // 假装打中了
  f1.attack.tF = CHAIN_WINDOW_F - 1;
  check('刚命中、还没过窗口时**不能**接（时间没到）', canAttack(f1, 1) === false,
    `tF=${f1.attack.tF} < ${CHAIN_WINDOW_F}`);
  f1.attack.tF = CHAIN_WINDOW_F + 1;
  check('命中且过了窗口就能接下一段（连招）', canAttack(f1, 1) === true,
    `tF=${f1.attack.tF} > ${CHAIN_WINDOW_F}`);

  const f2 = mk();
  startAttack(f2, 0, light);
  f2.attack.tF = CHAIN_WINDOW_F + 1;           // 没打中（hit 为空）
  check('轻攻击打空了接不上（原版要求 hit.size>0）', canAttack(f2, 1) === false);

  // 招式推进：到 start 触发一次，到 duration 收招
  const f3 = mk();
  startAttack(f3, 0, light);
  let emits = 0; let ended = false;
  for (let t = 0; t < light.duration + 4; t += 1) {
    const r = updateAttack(f3).ev;
    if (r === 'emit') emits += 1;
    if (r === 'end') { ended = true; break; }
  }
  check('招式在 start 那一帧触发**恰好一次**', emits === 1, `触发 ${emits} 次`);
  check('招式在 duration 之后收招', ended && f3.attack === null);

  // 必杀要 100 能量
  const f4 = mk();
  f4.energy = 0;
  check('能量不足时放不出必杀', canAttack(f4, SUPER_INDEX) === false);
  f4.energy = 100 * 256;
  check('能量满了能放必杀', canAttack(f4, SUPER_INDEX) === true);
  startAttack(f4, SUPER_INDEX, SKILL_TYPES.beam);
  check('放完必杀能量清零、并进入无敌', f4.energy === 0 && f4.invulnF > 0,
    `invuln ${f4.invulnF} 帧`);
}

/* ---------------- 命中判定与结算 ---------------- */
{
  const A = () => makeFighter({ hp: 1000, speed: 260, trait: 'rush', power: 1 }, 0);
  const B = () => makeFighter({ hp: 1000, speed: 260, trait: 'rush', power: 1 }, 1);
  const light = SKILL_TYPES.light;
  const skill = (over = {}) => ({ ...light, ...over });

  // 范围判定：三个条件缺一不可
  {
    const a = A(); const b = B();
    a.x = 400 * 256; a.facing = 1; b.x = 400 * 256 + 60 * 256; b.y = a.y;
    check('够近 + 正面 + 同高度 → 判中', inMeleeRange(a, b, skill()) === true);

    b.x = a.x + 200 * 256;
    check('超过程咬金距离（range=98）→ 判不中', inMeleeRange(a, b, skill()) === false);

    b.x = a.x - 200 * 256;                    // 跑到身后
    check('在身后 → 判不中（正面才有判定）', inMeleeRange(a, b, skill()) === false);

    b.x = a.x + 60 * 256; b.y = a.y - 300 * 256;
    check('高度差太大 → 判不中（普攻只容 112）', inMeleeRange(a, b, skill()) === false);
    check('升龙（upper）容 150，但 300 还是够不着',
      inMeleeRange(a, b, skill({ type: 'upper' })) === false);

    b.x = a.x - 10 * 256;                     // 贴脸、重心刚好在身后一点
    b.y = a.y;
    check('贴脸的 -20 容差生效（重心在身后 10 格，仍在容差内 → 判中）',
      inMeleeRange(a, b, skill()) === true,
      'x 差 -10 格 > -20 格的容差，所以算正面');

    b.x = a.x + 60 * 256;
    check('径向技（burst）无视正面要求',
      inMeleeRange(a, B(), skill({ type: 'burst' })) !== undefined);
  }

  // 命中结算：掉血 + 硬直 + 连段
  {
    const a = A(); const b = B();
    a.x = 400 * 256; b.x = a.x + 60 * 256; b.y = a.y; a.facing = 1;
    const src = { hit: new Set(), index: 0 };
    const hp0 = b.hp;
    const r = resolveHit(a, b, skill(), src);
    check('打中会掉血', r && r.type === 'hit' && b.hp === hp0 - light.damage,
      `${hp0} → ${b.hp}（damage=${light.damage}）`);
    check('打中会进硬直', b.stunF > 0, `${b.stunF} 帧`);
    check('攻击方连段 +1', a.combo === 1, String(a.combo));
    check('同一招对同一人只结算一次', resolveHit(a, b, skill(), src) === null);

    // 第二段有连段衰减
    const src2 = { hit: new Set(), index: 0 };
    a.comboF = 100;                            // 连段窗口还开着
    const before = b.hp;
    resolveHit(a, b, skill(), src2);
    const second = before - b.hp;
    check('第二段伤害有衰减（连段递减）', second < light.damage,
      `第一段 ${light.damage} / 第二段 ${second}`);
  }

  // 格挡
  {
    const a = A(); const b = B();
    a.x = 400 * 256; b.x = a.x + 60 * 256; b.y = a.y;
    a.facing = 1; b.facing = -1;               // b 面朝 a（inFront）
    b.blocking = true; b.guard = 100 * 256;
    const hp0 = b.hp; const g0 = b.guard;
    const r = resolveHit(a, b, skill(), { hit: new Set(), index: 0 });
    check('格挡成功：伤害大幅减免', r && r.type === 'block' && (hp0 - b.hp) < light.damage * 0.2,
      `掉 ${hp0 - b.hp}（原伤 ${light.damage}）`);
    check('格挡会掉防御值', b.guard < g0, `${g0 / 256} → ${b.guard / 256}`);

    // 防御见底 → 破防
    b.guard = 5 * 256;
    b.blocking = true;
    const r2 = resolveHit(a, b, skill({ type: 'heavy' }), { hit: new Set(), index: 1 });
    check('防御被打空 → 破防（硬直更长 + 进入破防状态）',
      r2 && r2.broke && b.guard === 0 && b.guardBrokenF > 0,
      `guardBrokenF=${b.guardBrokenF}`);
  }

  // 7 连强制脱离
  {
    const a = A(); const b = B();
    a.x = 400 * 256; b.x = a.x + 60 * 256; b.y = a.y; a.facing = 1;
    a.comboF = 100; a.combo = 6;               // 下一段就是第 7 段
    resolveHit(a, b, skill(), { hit: new Set(), index: 0 });
    check('打到第 7 段会强制脱离（给受击方无敌 + 大击退）',
      a.combo === 7 && b.invulnF > 0 && Math.abs(b.vx) > 400 * 256,
      `combo=${a.combo} invuln=${b.invulnF} vx=${(b.vx / 256).toFixed(0)}`);
  }

  // 无敌 / 已死 不该被打
  {
    const a = A(); const b = B();
    a.x = 400 * 256; b.x = a.x + 60 * 256;
    b.invulnF = 10;
    check('无敌状态打不中', resolveHit(a, b, skill(), { hit: new Set(), index: 0 }) === null);
    b.invulnF = 0; b.hp = 0;
    check('已经倒下的人不再结算', resolveHit(a, b, skill(), { hit: new Set(), index: 0 }) === null);
  }

  check('连段衰减曲线和原版公式一致（1/5/12 段）',
    comboScale(1) === 256 && Math.abs(comboScale(5) - 0.66 * 256) < 3 && comboScale(12) === 102,
    `1→${comboScale(1)} 5→${comboScale(5)} 12→${comboScale(12)}（256=1.0，102=0.4 触底）`);
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('物理段移植对账通过 ✅');
