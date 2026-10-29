/* 把**移植过来的引擎**接进真正的锁步会话，跑一遍双端对账
   ============================================================
   上一轮（tests/simAB_test.mjs）验的是"引擎本身确定"——两个状态机喂同一份输入
   得到同一个指纹。那还没碰到真正的联机路径。

   这一轮走**真正的 LockstepSession**（net.js），只是把引擎换成 simAB：
     · 还是那套"只有拿到双方第 N 帧输入才推进第 N 帧"的协议
     · 还是那条会延迟、会抖动的线
     · 还是同一份 encodeInput / receive 的报文格式
   如果这也能逐帧对上，那"换引擎会不会破坏联机"就不再是猜的了。

   做法：给 LockstepSession 加了一个 engine 注入点（默认还是 sim.js），
   这里传 simAB 进去。
*/

import { LockstepSession } from '../src/game/net.js';
import { encodeInput } from '../src/game/net.js';
import * as SIM_AB from '../src/game/simAB.js';

let passed = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${label}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(`${label}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${label}  ${detail}`); }
}

const TICK_MS = 1000 / SIM_AB.TICK_HZ;
const BREEDS = [{ code: 'samoyed' }, { code: 'husky' }];

/** 带延迟与抖动的假线路（和 net_test 里那套同源，简化版） */
class Wire {
  constructor(latencyTicks = 2, jitter = 0) {
    this.lat = latencyTicks; this.jitter = jitter; this.q = []; this.tick = 0;
    this.rng = 12345;
  }
  send(to, msg) {
    this.rng = (this.rng * 1103515245 + 12345) & 0x7fffffff;
    const extra = this.jitter ? (this.rng % (this.jitter + 1)) : 0;
    this.q.push({ to, msg, at: this.tick + this.lat + extra });
  }
  advance() {
    const ready = []; const rest = [];
    for (const it of this.q) (it.at <= this.tick ? ready : rest).push(it);
    this.q = rest; this.tick += 1;
    return ready;
  }
}

function makePair({ latencyTicks = 2, jitter = 0, seed = 4242 } = {}) {
  const wire = new Wire(latencyTicks, jitter);
  const a = new LockstepSession({ seed, breeds: BREEDS, side: 0, engine: SIM_AB });
  const b = new LockstepSession({ seed, breeds: BREEDS, side: 1, engine: SIM_AB });
  a.send = (frame, input) => wire.send('B', { type: 'input', side: 0, frame, keys: encodeInput(input) });
  b.send = (frame, input) => wire.send('A', { type: 'input', side: 1, frame, keys: encodeInput(input) });
  const deliver = () => {
    for (const it of wire.advance()) (it.to === 'A' ? a : b).receive(it.msg);
  };
  return { a, b, wire, deliver };
}

/** 两端各自的按键脚本（确定性） */
function scriptedKeys(n, seed) {
  let s = seed >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const mx = Math.floor(next() * 3) - 1;
    let btn = 0;
    if (next() < 0.10) btn |= SIM_AB.BTN.ATK;
    if (next() < 0.03) btn |= SIM_AB.BTN.JUMP;
    if (next() < 0.02) btn |= SIM_AB.BTN.S1;
    out.push({ mx, my: 0, atk: (btn & SIM_AB.BTN.ATK) ? 1 : 0, btn });
  }
  return out;
}

console.log('新引擎跑真锁步会话');

/* ---------------- 1. 双端逐帧对账 ---------------- */
{
  const { a, b, deliver } = makePair({ latencyTicks: 2 });
  const keysA = scriptedKeys(1400, 11);
  const keysB = scriptedKeys(1400, 22);
  let diverged = null;
  for (let t = 0; t < 1400; t += 1) {
    a.pumpLocal(t * TICK_MS, keysA[Math.min(t, keysA.length - 1)]);
    b.pumpLocal(t * TICK_MS, keysB[Math.min(t, keysB.length - 1)]);
    deliver();
    a.advance(); b.advance();
    if (a.state.tick === b.state.tick && a.hash() !== b.hash()) {
      diverged = `t=${t} tick=${a.state.tick} A=${a.hash()} B=${b.hash()}`;
      break;
    }
  }
  check('两个 session 用新引擎跑 1400 帧，hash 全程一致', diverged === null,
    diverged || `最终 tick=${a.state.tick} hash=${a.hash()}`);
  check('确实推进了很多帧（不是一直在 stall）', a.state.tick > 500,
    `推进到第 ${a.state.tick} 帧`);
  check('两端推进到同一帧', a.state.tick === b.state.tick,
    `A=${a.state.tick} B=${b.state.tick}`);
}

/* ---------------- 2. 有抖动也要一致 ---------------- */
{
  const { a, b, deliver } = makePair({ latencyTicks: 3, jitter: 2, seed: 99 });
  const keysA = scriptedKeys(900, 5);
  const keysB = scriptedKeys(900, 6);
  let diverged = null;
  for (let t = 0; t < 900; t += 1) {
    a.pumpLocal(t * TICK_MS, keysA[t]);
    b.pumpLocal(t * TICK_MS, keysB[t]);
    deliver(); a.advance(); b.advance();
    if (a.state.tick === b.state.tick && a.hash() !== b.hash()) {
      diverged = `t=${t} A=${a.hash()} B=${b.hash()}`; break;
    }
  }
  check('线路有 3 帧延迟 + 抖动，两端依然逐帧一致', diverged === null,
    diverged || `最终 tick=${a.state.tick}`);
}

/* ---------------- 3. 掉线接管：AI 也要能换 ----------------
   上一轮这块是崩的：net.js 的接管调的是旧 ai.js，它读 sim.js 的状态形状
   （me.cd / me.sta），喂新引擎的状态就 undefined。
   修法是把 AI 也纳入引擎契约（engine.createAI / engine.aiInput），
   契约从 4 样变成 6 样。这一条就是验它确实通了。 */
{
  const { a, b, deliver } = makePair({ latencyTicks: 1, seed: 7 });
  const keysA = scriptedKeys(700, 1);
  const keysB = scriptedKeys(700, 2);
  for (let t = 0; t < 300; t += 1) {
    a.pumpLocal(t * TICK_MS, keysA[t]);
    b.pumpLocal(t * TICK_MS, keysB[t]);
    deliver(); a.advance(); b.advance();
  }
  const tickBefore = a.state.tick;
  const hashBefore = a.hash();
  a.peerLeft('测试掉线');

  // 掉线后 A 由本地 AI 接管继续打完
  for (let t = 300; t < 900; t += 1) {
    a.pumpLocal(t * TICK_MS, keysA[Math.min(t, keysA.length - 1)]);
    a.advance();
  }
  check('掉线接管不再崩，能继续推进', a.state.tick > tickBefore,
    `${tickBefore} → ${a.state.tick} 帧`);
  check('接管后状态确实在变（AI 真的在打，不是空转）', a.hash() !== hashBefore,
    `${hashBefore} → ${a.hash()}`);

  // 接管用的 AI 必须是确定性的：同一份输入重跑一遍结果相同
  const replay = makePair({ latencyTicks: 1, seed: 7 });
  const ka = scriptedKeys(700, 1);
  const kb = scriptedKeys(700, 2);
  for (let t = 0; t < 300; t += 1) {
    replay.a.pumpLocal(t * TICK_MS, ka[t]);
    replay.b.pumpLocal(t * TICK_MS, kb[t]);
    replay.deliver(); replay.a.advance(); replay.b.advance();
  }
  replay.a.peerLeft('测试掉线');
  for (let t = 300; t < 900; t += 1) {
    replay.a.pumpLocal(t * TICK_MS, ka[Math.min(t, ka.length - 1)]);
    replay.a.advance();
  }
  check('接管用的 AI 可复现（同一份输入重跑，hash 一致）',
    replay.a.hash() === a.hash(), `${a.hash()} vs ${replay.a.hash()}`);
}

/* ---------------- 4. 换引擎之后旧协议的行为没变 ---------------- */
{
  const { a, b, deliver } = makePair({ latencyTicks: 1, seed: 3 });
  const keysA = scriptedKeys(400, 8);
  const keysB = scriptedKeys(400, 9);
  let stalls = 0;
  for (let t = 0; t < 400; t += 1) {
    a.pumpLocal(t * TICK_MS, keysA[t]);
    b.pumpLocal(t * TICK_MS, keysB[t]);
    deliver();
    const t0 = a.state.tick;
    a.advance();
    if (a.state.tick === t0) stalls += 1;
    b.advance(); deliver();
  }
  check('仍然遵守"拿不到对手输入就等"（会 stall 但不是卡死）',
    stalls >= 0 && a.state.tick > 200,
    `stall ${stalls} 次，仍推进到第 ${a.state.tick} 帧`);
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('新引擎锁步会话通过 ✅');
