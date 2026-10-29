/* 回合流程的验证
   ============================================================
   这一段没有"原版浮点 vs 定点"的可比性（它本来就全是整数逻辑），
   所以要验的是**行为契约**：能不能按时开打、怎么算赢、三局两胜什么时候结束、
   训练场是不是真的不会结束、时间到怎么判。

   拿原版引擎当参照的地方在 tests/ab_golden_test.mjs（那里验了 intro→fight
   发生在第 288 帧、FIGHT! 横幅的时机等）。
*/

import { makeFighter, SKILL_TYPES, startAttack } from '../src/game/rules.js';
import {
  createMatch, stepMatch, ROUND, teamHealth, teamAlive, snapMatch,
} from '../src/game/match.js';

const HZ = 128;
let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('回合流程');

const mkDogs = () => [
  makeFighter({ hp: 1000, speed: 260, trait: 'rush', power: 1 }, 0),
  makeFighter({ hp: 1000, speed: 260, trait: 'rush', power: 1 }, 1),
];
/** 跑 n 帧，返回事件日志 */
function run(m, n, inputs = []) {
  const log = [];
  for (let t = 0; t < n; t += 1) log.push(...stepMatch(m, inputs));
  return log;
}

/* ---------------- 1. 开场：intro → fight ---------------- */
{
  const m = createMatch(mkDogs());
  check('开局是 intro 阶段', m.phase === 'intro');
  const early = run(m, 10);
  check('intro 期间不跑物理（原版在这里 return）', early.length === 0,
    `前 10 帧事件：${early.join(',') || '无'}`);

  const log = run(m, ROUND.introF + 5);
  check('开场演出结束后进入 fight', m.phase === 'fight',
    `${ROUND.introF} 帧后 phase=${m.phase}`);
  check('会喊一次 FIGHT!', log.includes('fight'), `事件：${log.join(',')}`);

  // 开场期间输入被吃掉：这是原版行为，我们照搬
  const m2 = createMatch(mkDogs());
  run(m2, 100, [{ move: 1 }]);
  check('intro 期间按方向键不会动（输入被吃掉，和原版一致）',
    m2.fighters[0].x === 265 * 256, `x=${m2.fighters[0].x / 256}`);
}

/* ---------------- 2. 打空血 → K.O. → 结束回合 ---------------- */
{
  const m = createMatch(mkDogs());
  run(m, ROUND.introF + 1);
  check('开打后进入 fight', m.phase === 'fight');

  m.fighters[1].hp = 0;                       // 直接把 1 号打倒
  const log = run(m, 2);
  check('有人倒下 → 立刻进 roundend', m.phase === 'roundend', m.phase);
  check('横幅是 K.O.', m.banner === 'K.O.', m.banner);
  check('赢的一方记 1 分', m.wins[0] === 1, `wins=${m.wins}`);
  check('事件里有 ko', log.includes('ko'), log.join(','));

  // 回合结束后会开下一回合
  run(m, ROUND.roundendF + 2);
  check('roundend 结束后进下一回合（round=2，回到 intro）',
    m.round === 2 && m.phase === 'intro', `round=${m.round} phase=${m.phase}`);
}

/* ---------------- 3. 三局两胜 ---------------- */
{
  const m = createMatch(mkDogs());
  const winRound = (who) => {
    run(m, ROUND.introF + 2);                 // 等开打
    m.fighters[1 - who].hp = 0;
    run(m, 2);                                // 触发 roundend
    run(m, ROUND.roundendF + 2);              // 等下一回合
  };
  winRound(0);
  check('第一回合 0 队赢', m.wins[0] === 1, `wins=${m.wins}`);
  winRound(0);
  check('赢两回合后 phase=finished', m.phase === 'finished', m.phase);
  check('finished 之后不再推进回合', (() => {
    const before = JSON.stringify(snapMatch(m));
    run(m, 500);
    return JSON.stringify(snapMatch(m)) === before;
  })(), '跑了 500 帧状态没变');
  check('胜者队伍是 0', m.winnerTeam === 0, String(m.winnerTeam));
}

/* ---------------- 4. 平局：双方同时倒 ---------------- */
{
  const m = createMatch(mkDogs());
  run(m, ROUND.introF + 1);
  m.fighters[0].hp = 0; m.fighters[1].hp = 0;
  const log = run(m, 2);
  check('同时倒下判平局（draw）', log.includes('draw'), log.join(','));
  check('平局不给任何人加分', m.wins[0] === 0 && m.wins[1] === 0, `wins=${m.wins}`);
  check('横幅是 DRAW', m.banner === 'DRAW', m.banner);
}

/* ---------------- 5. 时间到：按血量判 ---------------- */
{
  const m = createMatch(mkDogs());
  run(m, ROUND.introF + 1);
  m.timeF = 1;
  m.fighters[0].hp = 800; m.fighters[1].hp = 300;
  const log = run(m, 3);
  check('时间到 → TIME UP', log.includes('timeup'), log.join(','));
  check('血量多的一方赢', m.wins[0] === 1, `wins=${m.wins} hp 800 vs 300`);
}

/* ---------------- 6. 训练场：不会结束 ---------------- */
{
  const m = createMatch(mkDogs(), { training: true });
  run(m, ROUND.introF + 1);
  m.fighters[1].hp = 0;
  const log = run(m, 5);
  check('训练场里倒下会立刻满血复活', m.fighters[1].hp === 1000,
    `hp=${m.fighters[1].hp}`);
  check('训练场发的是 training-revive 事件', log.includes('training-revive'));
  check('训练场永远不会进 roundend', m.phase === 'fight', m.phase);

  const t0 = m.timeF;
  run(m, 600);
  check('训练场不倒计时（原版就是 time -= 0）', m.timeF === t0,
    `${t0} → ${m.timeF}`);
}

/* ---------------- 7. 队伍血量 / 存活 ---------------- */
{
  const fs = mkDogs();
  check('teamHealth 是队伍血量之和', teamHealth(fs, 0) === 1000 && teamHealth(fs, 1) === 1000);
  fs[1].hp = 0;
  check('teamAlive 能看出队伍全灭', teamAlive(fs, 0) === true && teamAlive(fs, 1) === false);
}

/* ---------------- 8. 确定性 ---------------- */
{
  const play = () => {
    const m = createMatch(mkDogs());
    const ins = [{ move: 1 }, { move: -1 }];
    for (let t = 0; t < 1200; t += 1) stepMatch(m, ins);
    return JSON.stringify(snapMatch(m));
  };
  check('同一份输入跑两遍逐位相同（锁步的前提）', play() === play());
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('回合流程通过 ✅');
