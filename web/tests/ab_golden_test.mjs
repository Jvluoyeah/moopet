/* 移植基准测试：证明原版引擎能在 Node 里无渲染跑起来，而且是确定性的
   ============================================================
   这个测试**不验游戏好不好玩**，只验三件事：
     1. 引擎能脱离浏览器跑（canvas=null、音频空实现）
     2. 注入固定随机源之后，同一份输入两次跑出**逐位相同的轨迹**
     3. 轨迹里确实发生了战斗（掉血、有招式、有硬直），不是两尊雕像站着
   有了它，接下来把引擎改写成定点整数时才有"对不对"的判据。

   跑法：node tests/ab_golden_test.mjs [--write]
        --write 时把轨迹写进 tests/golden/ab_trace.json
*/

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeMatch, runTicks, seededRandom } from '../src/game/ab/loadEngine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, 'golden', 'ab_trace.json');

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('abstract-brawl 引擎移植基准');

/* ---------------- 1. 能加载 ---------------- */
let ctx;
try {
  ctx = makeMatch({ seed: 12345 });
  check('引擎能在 Node 里加载（无浏览器）', typeof ctx.game.step === 'function');
  check('拿到了角色表', (ctx.roster || []).length > 2,
    `${(ctx.roster || []).length} 名角色`);
  check('两个角色都有 hp', ctx.game.fighters.every((f) => f.hp > 0),
    ctx.game.fighters.map((f) => f.hp).join('/'));
} catch (e) {
  check('引擎能在 Node 里加载（无浏览器）', false, e.message);
  console.log(`\n${passed}/${passed + failures.length} 通过`);
  process.exit(1);
}

/* ---------------- 2. 固定步长推进 ---------------- */
// ⚠️ 开场有 2.25 秒的 intro（120Hz 下 270 帧），这期间**输入会被吃掉**。
//    第一版把按键全按在 intro 里，结果"按了 D 位移 0"，查了半天——
//    不是引擎的问题，是测试没等开打。
const INTRO_TICKS = 300;               // 270 + 余量
const script = (g, t) => {
  if (t === INTRO_TICKS) g.keyDown('KeyD');
  if (t === INTRO_TICKS + 200) g.keyUp('KeyD');
  // 走进攻击距离之后再出招
  if (t >= INTRO_TICKS + 220 && (t - INTRO_TICKS - 220) % 26 === 0) g.keyDown('KeyJ');
  if (t >= INTRO_TICKS + 220 && (t - INTRO_TICKS - 220) % 26 === 8) g.keyUp('KeyJ');
};

const TICKS = 900;
const a = runTicks(ctx.game, { ticks: TICKS, script });
check('能推进固定帧数', a.length === TICKS, `实际 ${a.length}`);
check('推进过程中回合真的开始了（intro → fight）',
  a.some((s) => s.phase === 'fight'),
  `出现过的阶段：${[...new Set(a.map((s) => s.phase))].join(', ')}`);

// 位移要跟"开打那一刻"比，不能跟第 0 帧比（第 0 帧还在 intro，位置是初始位）
const fightStart = a.findIndex((s) => s.phase === 'fight');
const moved = Math.abs(a[a.length - 1].fighters[0].x - a[fightStart].fighters[0].x);
check('输入真的驱动了角色（按 D 会走）', moved > 20,
  `位移 ${Math.round(moved)}（从第 ${fightStart} 帧开打算起）`);

const damaged = a.some((s) => s.fighters.some((f) => f.hp < f.maxHp));
check('发生了掉血（招式真的打中了）', damaged,
  `双方 hp 末值 ${a[a.length - 1].fighters.map((f) => f.hp).join('/')}`);

const states = [...new Set(a.flatMap((s) => s.fighters.map((f) => f.state)))];
check('出现过攻击/受击之类的战斗状态', states.some((s) => s !== 'idle'),
  `出现过的状态：${states.join(', ')}`);

/* ---------------- 3. 确定性：两次跑必须一模一样 ---------------- */
const b = runTicks(makeMatch({ seed: 12345 }).game, { ticks: TICKS, script });
check('同种子两次运行轨迹逐字节相同',
  JSON.stringify(a) === JSON.stringify(b),
  JSON.stringify(a) === JSON.stringify(b) ? '' : '有差异');

// 换种子该不该影响轨迹，**取决于有没有 AI**：
//   引擎里的随机分两类——粒子/镜头抖动（纯表现），和 ai() 里的决策
//   （`this.random() < [.22,.48,.7,.9][hard]` 决定防不防、跳不跳，技能评分也加随机）。
//   有 AI 时随机就是**真规则的一部分**，换种子必然换轨迹。
//   所以判据拆成两条：有 AI 确认随机在起作用；无 AI 时换种子必须完全一致。
const c = runTicks(makeMatch({ seed: 999 }).game, { ticks: TICKS, script });
const aiAffects = JSON.stringify(a) !== JSON.stringify(c);
check('确认 AI 决策确实用了随机（有 AI 时换种子会换轨迹）', aiAffects,
  aiAffects ? '符合预期：ai() 里有 3 处 this.random()' : '没差异，得回头查 AI 是不是没跑');

// 两边都交给键盘（mode='local'）时，规则里不该再有任何随机
const d1 = runTicks(makeMatch({ seed: 12345, mode: 'local' }).game, { ticks: TICKS, script });
const d2 = runTicks(makeMatch({ seed: 999, mode: 'local' }).game, { ticks: TICKS, script });
const pureRules = JSON.stringify(d1) === JSON.stringify(d2);
check('没有 AI 时，换随机种子战斗轨迹完全一致（随机只剩表现层）', pureRules,
  pureRules ? '' : '还有其他随机进了规则');

/* ---------------- 4. 随机源本身要确定 ---------------- */
const r1 = seededRandom(7); const r2 = seededRandom(7);
const s1 = Array.from({ length: 8 }, () => r1());
const s2 = Array.from({ length: 8 }, () => r2());
check('注入的随机源是可复现的', JSON.stringify(s1) === JSON.stringify(s2));
check('随机源落在 [0,1)', s1.every((v) => v >= 0 && v < 1));

/* ---------------- 产出基准轨迹 ---------------- */
if (process.argv.includes('--write')) {
  mkdirSync(dirname(GOLDEN), { recursive: true });
  writeFileSync(GOLDEN, JSON.stringify({
    note: '由 tests/ab_golden_test.mjs --write 生成：原版 abstract-brawl 引擎的逐帧轨迹，'
      + '用作定点化移植的对账基准。改这个文件没有意义，要更新就重跑生成命令。',
    seed: 12345,
    ticks: 400,
    dt: 1 / 120,
    script: '开场 300 帧后按 D 走 200 帧；再 220 帧后每 26 帧按一次 J',
    trace: a,
  }, null, 0));
  console.log(`\n基准轨迹已写出：${GOLDEN}`);
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('引擎移植基准通过 ✅');
