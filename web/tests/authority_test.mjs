/* 权威模式客户端的第一阶段：**不预测**，收快照就照做
   ============================================================
   验的核心是一句话：**不用等对手**。

   锁步里"双方都要等最慢的那一方"——这是用户报的"加入方很卡"的根因。
   权威模式里客户端只跟服务端打交道，对手慢不慢和它无关。

   做法：在 Node 里起一个**假服务端**（用同一份引擎跑权威模拟），
   一个延迟 0、一个延迟 30 帧，看两个客户端各自的体验。
*/

import { AuthorityClient } from '../src/game/authority.js';
import {
  createState, step, hashState, snapshotState,
} from '../src/game/simAB.js';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(name); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('权威客户端（第一阶段：不预测）');

const BREEDS = [{ code: 'samoyed' }, { code: 'husky' }];

/** 假服务端：一份权威模拟 + 输入表，按调用者的时钟推进 */
class FakeServer {
  constructor(seed, { inputDelay = 3 } = {}) {
    this.st = createState(seed, BREEDS);
    this.frame = 0;
    this.delay = inputDelay;
    this.inputs = new Map();
  }
  push(side, frame, input) {
    const f = Math.max(this.frame + 1, frame);
    if (!this.inputs.has(f)) this.inputs.set(f, {});
    this.inputs.get(f)[side] = input;
  }
  /** 推 n 帧，返回 [frames, snapshot] */
  tick(n = 1) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const f = this.frame;
      const slot = this.inputs.get(f) || {};
      const pair = [0, 1].map((s) => slot[s] || { mx: 0, skill: -1, btn: 0 });
      step(this.st, pair);
      this.frame += 1;
      out.push({ tick: this.frame, units: this.st.units.length });
    }
    return [out, snapshotState(this.st)];
  }
}

/* ---------------- 1. 上报的输入真的到了服务端 ---------------- */
{
  const srv = new FakeServer(777);
  const sent = [];
  const cli = new AuthorityClient({
    seed: 777, breeds: BREEDS, side: 0,
    send: (frame, input) => { sent.push([frame, input]); srv.push(0, frame, input); },
  });
  for (let t = 0; t < 10; t += 1) cli.pushInput({ mx: 1, skill: -1, btn: 0 });
  check('每按一次就上报一帧', sent.length === 10, `${sent.length} 次`);
  check('帧号从 0 开始、逐帧递增',
    sent.every(([f], i) => f === i), sent.map(([f]) => f).join(','));

  const [frames, snap] = srv.tick(10);
  cli.receiveFrames(frames, snap);
  check('收到服务端帧之后，本地跟上了权威',
    cli.ackFrame === 10, `ackFrame=${cli.ackFrame}`);
  check('本地状态和权威**逐位一致**（没预测就不会分叉）',
    cli.hash() === hashState(srv.st), `${cli.hash()} vs ${hashState(srv.st)}`);
}

/* ---------------- 2. 不用等对手：对手不发输入也照样推进 ---------------- */
{
  // 锁步在这里会**卡住**（第 N 帧永远凑不齐双方输入）。
  // 权威模式：对手什么都没发，服务端照样推。
  const srv = new FakeServer(555);
  const cli = new AuthorityClient({ seed: 555, breeds: BREEDS, side: 0,
    send: (f, i) => srv.push(0, f, i) });
  for (let t = 0; t < 30; t += 1) {
    cli.pushInput({ mx: t % 2 ? 1 : -1, skill: -1, btn: 0 });   // 只有我在动
    const [frames, snap] = srv.tick(1);
    cli.receiveFrames(frames, snap);
  }
  // 对手（side 1）一个输入都没发过
  check('**对手一个输入都没发，我这边照样推进了 30 帧**',
    cli.ackFrame === 30, `ackFrame=${cli.ackFrame}`);
  check('而且本地和权威一致', cli.hash() === hashState(srv.st));
}

/* ---------------- 3. 延迟只影响"看到多久以前"，不影响结果 ---------------- */
{
  const run = (lagFrames) => {
    const srv = new FakeServer(999);
    const cli = new AuthorityClient({ seed: 999, breeds: BREEDS, side: 0,
      send: (f, i) => srv.push(0, f, i) });
    const queue = [];
    for (let t = 0; t < 60; t += 1) {
      cli.pushInput({ mx: t % 3 - 1, skill: -1, btn: 0 });
      const batch = srv.tick(1);
      queue.push(batch);
      // 服务端的帧要过 lagFrames 才到客户端
      if (queue.length > lagFrames) {
        const [frames, snap] = queue.shift();
        cli.receiveFrames(frames, snap);
      }
    }
    while (queue.length) {
      const [frames, snap] = queue.shift();
      cli.receiveFrames(frames, snap);
    }
    return { hash: cli.hash(), ack: cli.ackFrame, srvHash: hashState(srv.st) };
  };
  const a = run(0);
  const b = run(30);
  check('延迟 0 帧和延迟 30 帧，最终状态**一致**',
    a.hash === b.hash && a.hash === a.srvHash,
    `0 帧=${a.hash} 30 帧=${b.hash} 权威=${a.srvHash}`);
  check('延迟只影响"我看到的进度落后多少"',
    a.ack === 60 && b.ack === 60,
    `ack 0 帧=${a.ack} 30 帧=${b.ack}`);
}

/* ---------------- 4. 快照恢复是真在用 ---------------- */
{
  const srv = new FakeServer(31);
  const cli = new AuthorityClient({ seed: 31, breeds: BREEDS, side: 0,
    send: (f, i) => srv.push(0, f, i) });
  cli.pushInput({ mx: 1, skill: -1, btn: 0 });
  const [f1, s1] = srv.tick(1);
  cli.receiveFrames(f1, s1);
  const st = cli.stats();
  check('收快照的次数被记下来了（排查用）', st.snapshots === 1, JSON.stringify(st));
  check('lag 能算出来（= 我上报到哪 − 服务端确认到哪）',
    st.lag === 0, `lag=${st.lag}`);
}

/* ---------------- 5. 落单的输入不会无限堆积 ---------------- */
{
  const cli = new AuthorityClient({ seed: 5, breeds: BREEDS, side: 0 });
  for (let t = 0; t < 600; t += 1) cli.pushInput({ mx: 1 });
  const st = cli.stats();
  check('没收到确认时，本地输入缓冲有上限（不会无限涨）',
    st.pending <= 256, `pending=${st.pending}`);
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('权威客户端（第一阶段）通过 ✅');
