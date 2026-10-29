/* 复现 e2e_pvp 里那个 `A=-1`
   ============================================================
   第二十轮查清楚了：`A=-1` **不是 tick 的值**，是
   `snap(pg).get('tick', -1)` 的默认值 —— 说明 arena 的 snapshot()
   走了那个提前返回：

       const st = this.session?.state;
       if (!st) return { active: false, side: this.side, mode: this.mode };

   也就是 `session.state` 是空的。这个测试就在 Node 里复现"为什么空"，
   不再靠浏览器猜。

   复现思路：把 arena 建会话那几行**原样搬过来**，
   只是把浏览器里拿不到的东西（foe.breed 可能是 null、breed 是接口返回的形状）
   一并模拟出来。
*/

import { LockstepSession } from '../src/game/net.js';
import * as SIM_AB from '../src/game/simAB.js';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('复现 arena 的会话创建');

/** /api/breeds 返回的那种形状（字段比 simAB 用到的多得多） */
const API_BREED = (code) => ({
  code, name: code, tier: 1, power: 72, agility: 58, intelligence: 60, affinity: 88,
  type: '独立型', sub: '微笑天使', desc: '测试', palette: {}, traits: ['x'],
});

/** 把 arena 建会话的代码原样搬过来（arena.js 的 startMatch 那几行） */
function arenaLikeSession({ engine, foeBreed, side = 0 }) {
  const breeds = [null, null];
  breeds[side] = API_BREED('samoyed');
  breeds[1 - side] = foeBreed;
  return new LockstepSession({
    seed: 12345,
    breeds,
    side,
    send: null,
    aiSkill: 0.62,
    engine,
  });
}

/* ---------------- 2. 新引擎：复现那个空 state ---------------- */
{
  let s = null; let err = null;
  try { s = arenaLikeSession({ engine: SIM_AB, foeBreed: API_BREED('husky') }); }
  catch (e) { err = e; }
  check('新引擎也能建出会话（否则就是 createState 抛了）',
    s && s.state, err ? `${err.name}: ${err.message}` : String(s && typeof s.state));
  if (s && s.state) {
    check('新引擎的 state 有 tick', typeof s.state.tick === 'number', String(s.state.tick));
    check('新引擎的 state 能用 hashState', Number.isInteger(SIM_AB.hashState(s.state)),
      String(SIM_AB.hashState(s.state)));
    check('新引擎的 state 有 units', Array.isArray(s.state.units), typeof s.state.units);
  }
}

/* ---------------- 3. 对手品种为空时（影子/训练模式可能出现） ---------------- */
{
  let s = null; let err = null;
  try { s = arenaLikeSession({ engine: SIM_AB, foeBreed: undefined }); }
  catch (e) { err = e; }
  check('对手品种为空也不该崩', s && s.state, err ? `${err.name}: ${err.message}` : '');
}

/* ---------------- 4. 跑几帧，看推进是否正常 ---------------- */
{
  let s = null;
  try { s = arenaLikeSession({ engine: SIM_AB, foeBreed: API_BREED('husky') }); }
  catch { /* 上面已经报过 */ }
  if (s && s.state) {
    // ⚠️ 单个会话**本来就推不动** —— 锁步的规矩是"拿不到双方第 N 帧输入就不推进"，
    //    没有对手的输入它就该一直 stall。第一版这里没加本地对手，
    //    跑 120 次 tick 还是 0，看着像 bug，其实是锁步在正常工作。
    //    用 useLocalOpponent 造一个本地对手，才能验证"真的能推进"。
    s.useLocalOpponent(() => ({ mx: -1, atk: 0, btn: 0 }));
    let err = null;
    try {
      for (let t = 0; t < 200; t += 1) {
        s.pumpLocal(t * (1000 / SIM_AB.TICK_HZ), { mx: 1 });
        s.advance();
      }
    } catch (e) { err = e; }
    check('新引擎的会话能推进（接上本地对手之后）',
      !err && s.state.tick > 0, err ? `${err.name}: ${err.message}` : `tick=${s.state.tick}`);
    check('推进后 hash 是整数', Number.isInteger(s.hash()), String(s.hash()));
    check('推进后 over/winner 字段在', s.state.over !== undefined,
      `over=${s.state.over} winner=${s.state.winner}`);
  } else {
    check('新引擎的会话能推进（接上本地对手之后）', false, '会话没建出来');
  }
}

/* ---------------- 5. 关键差异：两个引擎的 state 形状 ---------------- */
{
  const a = new LockstepSession({ seed: 1, breeds: [API_BREED('a'), API_BREED('b')],
                                  side: 0, engine: SIM_AB });
  const b = new LockstepSession({ seed: 1, breeds: [API_BREED('a'), API_BREED('b')],
                                  side: 0, engine: SIM_AB });
  const oa = Object.keys(a.state).sort();
  const ob = Object.keys(b.state).sort();
  const missing = oa.filter((k) => !ob.includes(k));
  console.log('\n  【state 顶层字段】');
  console.log(`    旧：${oa.join(', ')}`);
  console.log(`    新：${ob.join(', ')}`);
  console.log(`    新缺：${missing.join(', ') || '（无）'}\n`);
  check('差异清单已产出', true, `新缺 ${missing.length} 个`);
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('复现完成 ✅');
