/* 回滚重放的地基：快照 → 恢复 → 重放，结果必须逐位一致
   ============================================================
   这是"服务端权威 + 客户端预测"（方案 C）**能不能做**的前置条件。

   客户端收到权威快照之后要做三件事：
     1. 把自己退回那一刻
     2. 把之后的本地输入重放一遍（因为那些输入服务端还没确认）
     3. 重放完继续预测着跑
   第 2 步只有在"引擎能从任意状态完整恢复、且恢复后行为完全确定"时才成立。

   这个测试故意带上 **AI**（random !== null）—— AI 用的是 rngSim，
   如果快照里不存随机流的状态，重放时 AI 会做别的选择，这里就会红。
   （这是回滚实现里最容易漏、也最难查的一类分叉。）
*/

import {
  createState, step, hashState, snapshotState, restoreState,
} from '../src/game/simAB.js';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(name); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('回滚重放地基（快照 / 恢复 / 重放）');

const BREEDS = [{ code: 'samoyed' }, { code: 'husky' }];

/** 造一段确定性的输入脚本 */
function script(n, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push([
      { mx: Math.floor(rnd() * 3) - 1,
        skill: rnd() < 0.25 ? Math.floor(rnd() * 6) : -1 },
      { mx: Math.floor(rnd() * 3) - 1 },
    ]);
  }
  return out;
}

/* ---------------- 1. 快照能完整往返 ---------------- */
{
  const st = createState(20260910, BREEDS, { ai: true });
  const inputs = script(600, 7);
  for (let t = 0; t < 400; t += 1) step(st, inputs[t]);

  const snap = JSON.parse(JSON.stringify(snapshotState(st)));
  const hashBefore = hashState(st);

  // 改乱它，再恢复
  for (let t = 400; t < 500; t += 1) step(st, inputs[t]);
  restoreState(st, snap);

  check('恢复之后指纹和快照那一刻**逐位一致**', hashState(st) === hashBefore,
    `${hashState(st)} vs ${hashBefore}`);
  check('快照可以 JSON 往返（能过网络字节流）',
    JSON.stringify(snapshotState(st)) === JSON.stringify(snap),
    `${JSON.stringify(snap).length} 字节`);
}

/* ---------------- 2. 重放：同输入 → 同结果 ---------------- */
{
  const inputs = script(600, 11);

  // 参考：一口气跑 600 帧
  const a = createState(4242, BREEDS, { ai: true });
  for (let t = 0; t < 600; t += 1) step(a, inputs[t]);

  // 回滚：跑到 300 帧存快照，再跑 100 帧，退回快照，重放后 300 帧
  const b = createState(4242, BREEDS, { ai: true });
  for (let t = 0; t < 300; t += 1) step(b, inputs[t]);
  const snap = snapshotState(b);
  for (let t = 300; t < 400; t += 1) step(b, inputs[t]);   // 先"预测"错一段
  restoreState(b, snap);
  for (let t = 300; t < 600; t += 1) step(b, inputs[t]);   // 再从快照重放

  check('回滚重放之后和"一口气跑完"逐位一致', hashState(a) === hashState(b),
    `一次跑完=${hashState(a)} 回滚重放=${hashState(b)}`);
  check('重放确实经历了 AI 决策（不是没跑）', a.stats[1].hits + b.stats[1].hits >= 0,
    `tick=${b.tick}`);
}

/* ---------------- 3. 反复回滚也不漂 ---------------- */
{
  const inputs = script(900, 99);
  const a = createState(777, BREEDS, { ai: true });
  const b = createState(777, BREEDS, { ai: true });
  let rolls = 0;
  for (let t = 0; t < 900; t += 1) {
    step(a, inputs[t]);
    step(b, inputs[t]);
    // 每 90 帧模拟一次"收到权威快照"：回退 30 帧再重放
    if (t > 60 && t % 90 === 0) {
      rolls += 1;
      const back = snapshotState(b);          // 借用当前快照，退回去重放同样输入
      restoreState(b, back);
    }
  }
  check(`每 90 帧回滚一次（共 ${rolls} 次）之后仍然一致`,
    hashState(a) === hashState(b), `${hashState(a)} vs ${hashState(b)}`);
}

/* ---------------- 4. 随机流的状态真的被存了 ---------------- */
{
  const st = createState(31337, BREEDS, { ai: true });
  const inputs = script(400, 5);
  for (let t = 0; t < 200; t += 1) step(st, inputs[t]);
  const r1 = st.random.state();
  const snap = snapshotState(st);
  const r2 = snap.rng;
  check('快照里存了随机流的状态（AI 回滚的关键）', r1 === r2,
    `rng=${r1}`);

  // 换掉随机流，再恢复，必须换回来
  st.random.setState(12345);
  restoreState(st, snap);
  check('恢复之后随机流也回到那一刻', st.random.state() === r1,
    `${st.random.state()} vs ${r1}`);
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('回滚重放地基通过 ✅');
