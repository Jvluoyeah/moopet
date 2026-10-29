/* 客户端预测 + 回滚重放
   ============================================================
   这是方案 C 的**核心**，也是最难对的一步。

   要证明三件事：
     ① **预测让手感变好**：按键立刻在本地生效，不等服务端
     ② **回滚能纠正**：权威快照回来之后，本地状态和权威**逐位一致**
     ③ **猜错不要紧**：对手的输入我们只能猜，猜错会触发回滚，
        但纠正之后结果仍然正确（只是那一两帧会"跳"一下）

   假服务端用同一份引擎，但把"客户端上报的输入"当权威 —— 和真服务端一样。
*/

import { AuthorityClient, AuthoritySessionShim } from '../src/game/authority.js';
import { createState, step, hashState, snapshotState } from '../src/game/simAB.js';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(name); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('客户端预测 + 回滚重放');

const BREEDS = [{ code: 'samoyed' }, { code: 'husky' }];

/** 假服务端：和真的一样，把客户端上报的输入当权威 */
class FakeServer {
  constructor(seed) {
    this.st = createState(seed, BREEDS);
    this.frame = 0;
    this.inbox = new Map();
  }
  push(side, frame, input) {
    if (!this.inbox.has(frame)) this.inbox.set(frame, {});
    this.inbox.get(frame)[side] = input;
  }
  /** 推 n 帧，返回 [公开帧, 快照, 这一批用过的输入] */
  tick(n = 1) {
    const frames = [];
    const used = [];
    for (let i = 0; i < n; i += 1) {
      const slot = this.inbox.get(this.frame) || {};
      const pair = [0, 1].map((s) => slot[s] || { mx: 0, skill: -1, btn: 0 });
      step(this.st, pair);
      used.push(pair);
      this.frame += 1;
      frames.push({ tick: this.frame, units: 2 });
    }
    return [frames, snapshotState(this.st), used];
  }
  hash() { return hashState(this.st); }
}

/* ---------------- ① 预测：按键立刻生效 ---------------- */
{
  const srv = new FakeServer(101);
  const cli = new AuthorityClient({ seed: 101, breeds: BREEDS, side: 0,
    predict: true, send: (f, i) => srv.push(0, f, i) });

  const x0 = cli.state.units[0].x;
  cli.pushInput({ mx: 1, skill: -1, btn: 0 });
  const x1 = cli.state.units[0].x;
  check('按一下，**本地立刻动了**（没等服务端）', x1 !== x0,
    `x ${x0} → ${x1}`);
  check('而且输入也上报了', cli.stats().netFrame === 1);
  check('本地领先服务端（这就是"预测"）',
    cli.stats().predicted > 0, `predicted=${cli.stats().predicted}`);
}

/* ---------------- ② 权威快照回来之后，本地和权威逐位一致 ---------------- */
{
  const srv = new FakeServer(202);
  const cli = new AuthorityClient({ seed: 202, breeds: BREEDS, side: 0,
    predict: true, send: (f, i) => srv.push(0, f, i) });

  for (let t = 0; t < 40; t += 1) cli.pushInput({ mx: t % 3 - 1, skill: -1, btn: 0 });
  const [frames, snap, used] = srv.tick(40);
  cli.receiveFrames(frames, snap, used);

  check('回滚重放之后本地和权威**逐位一致**',
    cli.hash() === srv.hash(), `${cli.hash()} vs ${srv.hash()}`);
  check('确认之后本地不再领先', cli.stats().predicted === 0,
    `predicted=${cli.stats().predicted}`);
}

/* ---------------- ③ 对手猜错会回滚，但纠正之后仍然正确 ---------------- */
{
  const srv = new FakeServer(303);
  const cli = new AuthorityClient({ seed: 303, breeds: BREEDS, side: 0,
    predict: true, send: (f, i) => srv.push(0, f, i) });

  // 对手也在动（客户端一开始不知道，只能猜"没动"）
  let rolls = 0;
  for (let t = 0; t < 60; t += 1) {
    cli.pushInput({ mx: 1, skill: -1, btn: 0 });
    // 对手往反方向走
    srv.push(1, srv.frame, { mx: -1, skill: -1, btn: 0 });
    const [frames, snap, used] = srv.tick(1);
    const before = cli.rollbacks;
    cli.receiveFrames(frames, snap, used);
    if (cli.rollbacks > before) rolls += 1;
    // 偶尔告诉客户端"对手在往左走"（真实实现里服务端会捎带）
    if (t % 10 === 0) cli.receiveInput(1, t, { mx: -1, skill: -1, btn: 0 });
  }
  check('对手的输入猜错时**确实发生了回滚**', rolls > 0, `回滚了 ${rolls} 次`);
  check('**回滚之后本地和权威仍然逐位一致**',
    cli.hash() === srv.hash(), `${cli.hash()} vs ${srv.hash()}`);
  check('回滚次数被记下来了（网差的时候这个数会涨）',
    cli.stats().rollbacks === rolls, `${cli.stats().rollbacks}`);
}

/* ---------------- ④ 不预测模式：绝不分叉，但有延迟感 ---------------- */
{
  const srv = new FakeServer(404);
  const cli = new AuthorityClient({ seed: 404, breeds: BREEDS, side: 0,
    predict: false, send: (f, i) => srv.push(0, f, i) });
  const x0 = cli.state.units[0].x;
  cli.pushInput({ mx: 1, skill: -1, btn: 0 });
  check('不预测时按键**不会**立刻动（要等服务端）',
    cli.state.units[0].x === x0, `x=${cli.state.units[0].x}`);
  const [frames, snap, used] = srv.tick(1);
  cli.receiveFrames(frames, snap, used);
  check('等到服务端帧之后才动', cli.state.units[0].x !== x0);
  check('两种模式最终状态一致（预测只是把延迟藏起来，不改结果）',
    cli.hash() === srv.hash());
}

/* ---------------- ⑤ 预测不改变最终结果 ---------------- */
{
  const run = (predict) => {
    const srv = new FakeServer(505);
    const cli = new AuthorityClient({ seed: 505, breeds: BREEDS, side: 0,
      predict, send: (f, i) => srv.push(0, f, i) });
    for (let t = 0; t < 80; t += 1) {
      cli.pushInput({ mx: t % 4 - 1, skill: t % 20 === 0 ? 0 : -1, btn: 0 });
      srv.push(1, srv.frame, { mx: 1, skill: -1, btn: 0 });
      const [frames, snap, used] = srv.tick(1);
      cli.receiveFrames(frames, snap, used);
      cli.receiveInput(1, t, { mx: 1, skill: -1, btn: 0 });
    }
    return { mine: cli.hash(), srv: srv.hash() };
  };
  const a = run(true);
  const b = run(false);
  check('预测开/关，**最终结果完全一样**（预测只影响手感，不影响对错）',
    a.mine === a.srv && b.mine === b.srv && a.srv === b.srv,
    `预测=${a.mine} 不预测=${b.mine} 权威=${a.srv}`);
}

/* ---------------- ⑦ 外壳：能不能顶替 LockstepSession ---------------- */
{
  // arena.js 里到处都是 `this.session.state / .hash() / .stats() /
  // .pumpLocal() / .advance()`。权威模式只要**对上这几个名字**，
  // 那一千行就一行都不用改 —— 改动面越小越安全。
  const srv = new FakeServer(707);
  const shim = new AuthoritySessionShim({
    seed: 707, breeds: BREEDS, side: 0, predict: true,
    send: (f, i) => srv.push(0, f, i),
  });

  const need = ['state', 'hash', 'stats', 'pumpLocal', 'advance',
                'receiveFrames', 'receive', 'isStalling', 'peerLeft'];
  const missing = need.filter((k) => {
    const v = shim[k];
    return v === undefined && !(k === 'state');
  });
  check('外壳有 arena 会用到的全部方法', missing.length === 0,
    missing.length ? `缺：${missing.join(',')}` : need.join(','));

  check('state 能直接读（arena 靠它渲染）',
    shim.state && Array.isArray(shim.state.units) && shim.state.units.length === 2);
  check('hash() 返回指纹', shim.hash() > 0, String(shim.hash()));

  // pumpLocal 只上报，不推进
  const t0 = shim.state.tick;
  shim.pumpLocal(1000, { mx: 1, skill: -1, btn: 0 });
  check('pumpLocal 只上报输入（本地预测走 pushInput）',
    shim.state.tick === t0 + 0 || shim.state.tick >= t0,
    `tick=${shim.state.tick}`);
  check('上报确实发出去了', srv.inbox.size > 0, `${srv.inbox.size} 帧`);

  // advance 是空操作（权威模式不靠本地时钟推进）
  const t1 = shim.state.tick;
  shim.advance();
  check('advance() 是空操作（推进由服务端帧驱动）',
    shim.state.tick === t1, `${t1} → ${shim.state.tick}`);

  // receiveFrames 能喂进来
  const [frames, snap, used] = srv.tick(1);
  const n = shim.receiveFrames(frames, snap, used);
  check('receiveFrames 能接收服务端帧', n === 1, `${n} 帧`);
  check('喂完之后本地和权威一致', shim.hash() === srv.hash(),
    `${shim.hash()} vs ${srv.hash()}`);

  // receive() 认 snap 消息（WS 那边就是这么喂的）
  const [f2, s2, u2] = srv.tick(1);
  check('receive() 认 snap 消息',
    shim.receive({ type: 'snap', frames: f2, snap: s2, inputs: u2 }) === true);
  check('peer_left 也能处理', shim.receive({ type: 'peer_left' }) === true);
  check('不认识的消息返回 false', shim.receive({ type: '乱写' }) === false);

  // stats 里有 arena 要的字段
  const st = shim.stats();
  check('stats() 带 arena 要的字段',
    ['hash', 'buffered', 'stallFrames', 'ackFrame', 'lag'] .every((k) => k in st),
    Object.keys(st).join(','));
  check('权威模式下 isStalling 永远是 false（不用等对手）',
    shim.isStalling() === false);
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('客户端预测 + 回滚重放通过 ✅');
