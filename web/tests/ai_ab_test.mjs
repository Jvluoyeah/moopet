/* AI 的验证：**重点是确定性**，不是"打得好不好"
   ============================================================
   AI 里有 6 处随机，全都必须走 rngSim。这个测试要证明的就是：
     同一颗种子 → 逐位相同的决策序列；不同种子 → 决策确实不同（随机生效了）
   这条不成立的话，联机锁步一上来就会不同步。

   另外验两条原版的硬性行为：
     · 训练场没有 AI（原版第一行 return）
     · 人类操作的角色不归 AI 管
*/

import { makeFighter, SKILL_TYPES, SUPER_INDEX } from '../src/game/rules.js';
import { stepAI, initAI, AI_TUNING } from '../src/game/aiAB.js';
import { makeRng } from '../src/game/fx.js';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('电脑对手（AI）');

/** 造一对：0 号是玩家（controller=0），1 号是 AI（controller=1） */
function pair() {
  const skills = ['light', 'heavy', 'projectile', 'dash', 'upper', 'beam']
    .map((t) => SKILL_TYPES[t]);
  const mk = (id) => {
    const f = makeFighter({ hp: 1000, speed: 260, trait: 'rush', power: 1, skills }, id);
    f.data.skills = skills;
    f.controller = id === 0 ? 0 : null;   // null = 电脑控制（原版约定）
    f.cooldowns = [0, 0, 0, 0, 0, 0];
    f.queue = [];
    return f;
  };
  return [mk(0), mk(1)];
}

/** 跑 n 帧，记录 AI 那方的决策轨迹 */
function trace(seed, { ticks = 900, difficulty = 3, training = false, local = false } = {}) {
  const fighters = pair();
  const random = makeRng(seed);
  const out = [];
  for (let t = 0; t < ticks; t += 1) {
    stepAI({ fighters, difficulty, random, phase: 'fight', projectiles: [],
             training, local });
    const f = fighters[1];
    out.push(`${f.aiWaitF}|${f.aiBlockF}|${f.aiMove}|${f.facing}|${f.queue.map((q) => q.index).join('')}`);
  }
  return out;
}

/* ---------------- 1. 确定性：这是这个文件存在的理由 ---------------- */
{
  const a = trace(1234);
  const b = trace(1234);
  check('同一颗种子跑两遍，AI 决策逐帧逐位相同',
    a.join('\n') === b.join('\n'),
    a.join('\n') === b.join('\n') ? `${a.length} 帧` : '有差异');

  const c = trace(999);
  check('换一颗种子决策会不同（说明随机真的在起作用）',
    a.join('\n') !== c.join('\n'));
}

/* ---------------- 2. 训练场 / 本地对战里没有 AI ---------------- */
{
  // 判据用"acted 次数"而不是字段值：训练场里 stepAI 直接 return，
  // 字段压根没被初始化（是 undefined），拿字符串前缀判会误伤。
  const held = (opts) => {
    const fighters = pair();
    const random = makeRng(7);
    let acted = 0;
    for (let t = 0; t < 300; t += 1) {
      acted += stepAI({ fighters, difficulty: 3, random, phase: 'fight', ...opts });
    }
    return acted;
  };
  check('训练场里 AI 一次都不做决策（原版第一行就 return）',
    held({ training: true }) === 0);
  check('本地双人对战里 AI 也不做决策', held({ local: true }) === 0);
  check('同样是 300 帧，普通对局里 AI 是活跃的（对照）', held({}) > 0,
    `${held({})} 次决策`);

  // 人类角色不该被 AI 碰
  const fighters = pair();
  const random = makeRng(3);
  const before = fighters[0].aiWaitF;
  for (let t = 0; t < 300; t += 1) {
    stepAI({ fighters, difficulty: 3, random, phase: 'fight' });
  }
  check('controller=0 的角色不归 AI 管（它的字段没被动过）',
    fighters[0].aiWaitF === before && fighters[0].queue.length === 0,
    `aiWaitF=${fighters[0].aiWaitF} queue=${fighters[0].queue.length}`);
}

/* ---------------- 3. 难度真的在起作用 ---------------- */
{
  // 统计一段时间里 AI 做了多少次决策：难度越高，决策越频繁
  const count = (difficulty) => {
    const fighters = pair();
    const random = makeRng(5);
    let n = 0;
    for (let t = 0; t < 2000; t += 1) {
      n += stepAI({ fighters, difficulty, random, phase: 'fight' });
    }
    return n;
  };
  const c0 = count(0); const c3 = count(3);
  check('高难度的决策频率明显更高（间隔更短）', c3 > c0 * 1.5,
    `难度 0：${c0} 次 / 难度 3：${c3} 次`);

  check('难度表是从原版的秒数换算来的（0.36s → 46 帧）',
    AI_TUNING.waitBase[0] === 46 && AI_TUNING.waitBase[3] === 6,
    `waitBase=[${AI_TUNING.waitBase}] 帧`);
  check('格挡概率表是原版那四个数',
    JSON.stringify(AI_TUNING.blockChance) === JSON.stringify([0.22, 0.48, 0.7, 0.9]),
    AI_TUNING.blockChance.join('/'));
}

/* ---------------- 4. 没有随机源就直接报错，不许偷偷用 Math.random ---------------- */
{
  let threw = false;
  try {
    stepAI({ fighters: pair(), difficulty: 1, phase: 'fight' });
  } catch (e) {
    threw = /随机源/.test(e.message);
  }
  check('不注入随机源会立刻报错（防止有人顺手写 Math.random）', threw);
}

/* ---------------- 5. 会出招 ---------------- */
{
  const fighters = pair();
  const random = makeRng(11);
  // 把两只摆到够近，让 AI 有招可出
  fighters[0].x = 400 * 256;
  fighters[1].x = 400 * 256 + 80 * 256;
  let queued = 0;
  for (let t = 0; t < 3000; t += 1) {
    stepAI({ fighters, difficulty: 3, random, phase: 'fight' });
    queued = Math.max(queued, fighters[1].queue.length);
    fighters[1].queue.length = 0;            // 清掉，好统计下一次
  }
  check('靠近时会往队列里排招', queued > 0, `最多排到 ${queued} 个`);
}

/* ---------------- 6. initAI 补齐字段 ---------------- */
{
  const f = makeFighter({ hp: 1000, speed: 260, trait: 'rush' }, 1);
  initAI(f);
  check('initAI 会把 AI 需要的字段都补上（controller=null 表示电脑控制）',
    f.controller === null && f.aiWaitF === 0 && f.aiBlockF === 0 && Array.isArray(f.queue),
    `controller=${f.controller} queue=${Array.isArray(f.queue)}`);
  void SUPER_INDEX;
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('AI 通过 ✅');
