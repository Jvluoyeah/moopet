/* 开放世界联机会话单测（不需要浏览器）
   ------------------------------------------------------------
   WorldSession 刻意不碰 WebSocket —— 构造函数收一个 send 回调，
   收到的消息喂给 receive()。所以这里可以拉一根"虚拟网线"：
   两个会话互相喂消息，还能用假时钟精确控制插值。

   跑法：node tests/world_net_test.mjs
*/
import { WorldSession, DEFAULT_DELAY, HEARTBEAT_SEC } from '../src/world/worldNet.js';

let pass = 0;
const fails = [];

function ok(label, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fails.push(`${label}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}

function eq(label, got, want) {
  ok(label, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

/* ---------------- 虚拟网线（含一个假服务端） ----------------
   服务端在转发时会**换一个消息类型并补上发送者的 dog_id**
   （客户端发 `move`，别人收到的是 `peer_move`，见 ws/world_routes.py）。
   小网线必须照做——之前偷懒直接原样转发，结果测出来"别人收不到位置"，
   排查了半天才发现是测试自己没模拟对协议。
   ------------------------------------------------------------------ */
const SERVER_RELAY = {
  move: (p, id) => ({ type: 'peer_move', dog_id: id, x: p.x, z: p.z,
                      facing: p.facing, status: p.status, t: Date.now() }),
  action: (p, id) => ({ type: 'peer_action', dog_id: id, action: p.action,
                        bubble: p.bubble || '' }),
  chat: (p, id) => ({ type: 'peer_chat', dog_id: id, name: p.name || '', text: p.text }),
};

function wire(...sessions) {
  const log = [];
  const relay = (fromIdx, payload) => {
    const from = sessions[fromIdx];
    const build = SERVER_RELAY[payload.type];
    const out = build ? build(payload, from.dogId) : { ...payload };
    sessions.forEach((other, j) => {
      if (j === fromIdx) return;               // 服务端不回声给发送者
      other.receive(JSON.parse(JSON.stringify(out)));
    });
  };
  sessions.forEach((s, i) => {
    s.send = (payload) => { log.push({ from: i, payload }); relay(i, payload); };
  });
  return log;
}

/** 可控时钟 */
function clock(start = 100) {
  const c = { t: start };
  return { now: () => c.t, tick: (dt) => { c.t += dt; }, set: (t) => { c.t = t; } };
}

/* ---------------- 出站：上报节流 ---------------- */

function testReportThrottle() {
  console.log('\n[上报节流]');
  const c = clock();
  const sent = [];
  const s = new WorldSession({ send: (p) => sent.push(p), now: c.now });
  s.reportMine(100, 200, 1, 'walk', true);
  eq('首次强制上报发出去', sent.length, 1);
  eq('上报内容', sent[0], { type: 'move', x: 100, z: 200, facing: 1, status: 'walk' });

  s.reportMine(140, 200, 1, 'walk');
  eq('不到 1/10 秒不再发', sent.length, 1);

  c.tick(0.11);
  s.reportMine(140, 200, 1, 'walk');
  eq('过了 100ms 且位置变了 → 发', sent.length, 2);

  c.tick(0.11);
  s.reportMine(140, 200, 1, 'walk');
  eq('位置没变就不发（省流量）', sent.length, 2);

  c.tick(0.11);
  s.reportMine(140, 200, 1, 'run');
  eq('状态变了要发（别人要看到你在跑）', sent.length, 3);

  c.tick(0.11);
  s.reportMine(140, 200, -1, 'run');
  eq('朝向变了也要发', sent.length, 4);
}

function testReportRoundsToInt() {
  console.log('\n[上报取整]');
  const sent = [];
  const s = new WorldSession({ send: (p) => sent.push(p), now: clock().now });
  s.reportMine(100.4, 200.6, 1, 'walk', true);
  eq('坐标取整再发（省字节、也不给浮点差异留缝）',
     [sent[0].x, sent[0].z], [100, 201]);
}

function testIdleHeartbeat() {
  console.log('\n[静止心跳]');
  const c = clock();
  const sent = [];
  const s = new WorldSession({ send: (p) => sent.push(p), now: c.now });
  s.reportMine(500, 500, 1, 'idle', true);
  eq('先发一帧', sent.length, 1);
  for (let i = 0; i < 15; i += 1) {          // 站着不动 1.5 秒
    c.tick(0.1);
    s.reportMine(500, 500, 1, 'idle');
  }
  eq('1.5 秒内不重复发（省流量）', sent.length, 1);
  for (let i = 0; i < 10; i += 1) {          // 再到 2.5 秒
    c.tick(0.1);
    s.reportMine(500, 500, 1, 'idle');
  }
  ok('过了 2 秒心跳窗口必须补发一次', sent.length >= 2, `sent=${sent.length}`);
  ok('补发的还是同一个位置（别人靠这个知道你还活着）',
     sent[sent.length - 1].x === 500 && sent[sent.length - 1].z === 500);

  // 这条是联机测试抓出来的真 bug：不发心跳的话，别人 15 秒后把你这只静止的狗清掉
  eq('心跳常量是 2 秒', HEARTBEAT_SEC, 2);
}

function testPruneKeepsIdlePeerWithHeartbeat() {
  console.log('\n[静止的狗不会被误清]');
  const c = clock(0);
  const s = new WorldSession({ now: c.now });
  s.receive({ type: 'welcome', scene: 'plaza', dog_id: 1,
              peers: [{ dog_id: 2, name: '阿牧', x: 100, z: 100 }] });
  // 对方每 2 秒发一次心跳，持续 30 秒
  for (let i = 1; i <= 15; i += 1) {
    c.tick(2.0);
    s.receive({ type: 'peer_move', dog_id: 2, x: 100, z: 100, status: 'idle' });
    s.pruneStale();
  }
  eq('对方一直没动也还在场上', s.peers.size, 1);

  // 真的掉线（15 秒没有任何消息）才清
  c.tick(20);
  const gone = s.pruneStale();
  eq('超过阈值才清理', gone, [2]);
}

/* ---------------- 入站：welcome / join / move / leave ---------------- */

function testWelcomeAndRoster() {
  console.log('\n[welcome 快照]');
  const s = new WorldSession({ now: clock().now });
  s.receive({
    type: 'welcome', scene: 'park', dog_id: 7,
    bounds: { w: 2400, d: 1900 }, report_hz: 10,
    peers: [
      { dog_id: 1, name: '雪团', breed_code: 'samoyed', level: 18, x: 100, z: 200, facing: 1, status: 'walk' },
      { dog_id: 7, name: '我自己', x: 0, z: 0 },     // 自己不该进远端表
    ],
  });
  ok('连接成功', s.connected);
  eq('自己的 dog_id', s.dogId, 7);
  eq('场景', s.scene, 'park');
  eq('边界跟着服务端走', s.bounds, { w: 2400, d: 1900 });
  eq('远端只有别人（不含自己）', s.peers.size, 1);
  ok('远端名字对', s.peers.get(1).dog.name === '雪团');
}

function testPeerMoveAndInterpolation() {
  console.log('\n[远端插值]');
  const c = clock(0);
  const s = new WorldSession({ now: c.now, delay: 0.12 });
  s.receive({ type: 'welcome', scene: 'plaza', dog_id: 9, peers: [
    { dog_id: 2, name: '阿牧', x: 0, z: 0, status: 'walk' }] });

  // 1 秒内从 x=0 跑到 x=100（10Hz）
  for (let i = 1; i <= 10; i += 1) {
    c.set(i * 0.1);
    s.receive({ type: 'peer_move', dog_id: 2, x: i * 10, z: 0, facing: 1, status: 'run' });
  }

  c.set(1.0);
  let out = s.update();
  eq('远端在列表里', out.length, 1);
  // 播放时刻 = 1.0 - 0.12 = 0.88 → 应该在 x=80 和 x=90 之间
  ok('播放的是"延迟后"的位置（不是最新值）', out[0].x > 80 && out[0].x < 90,
     `x=${out[0].x}`);
  ok('状态跟着更新', out[0].status === 'run');

  c.set(0.5);
  out = s.update();
  ok('时间回退也不炸（夹在样本之间）', out[0].x >= 0 && out[0].x <= 100, `x=${out[0].x}`);
}

function testInterpolationIsSmooth() {
  console.log('\n[插值平滑性]');
  const c = clock(0);
  const s = new WorldSession({ now: c.now, delay: 0.12 });
  s.receive({ type: 'welcome', scene: 'plaza', dog_id: 9,
              peers: [{ dog_id: 3, name: '短腿', x: 0, z: 0, status: 'run' }] });
  // 匀速运动：每 100ms 走 40 格
  for (let i = 1; i <= 12; i += 1) {
    c.set(i * 0.1);
    s.receive({ type: 'peer_move', dog_id: 3, x: i * 40, z: 0, status: 'run' });
  }
  const xs = [];
  for (let i = 0; i < 10; i += 1) {
    c.set(1.2 + i * 0.016);            // 60fps 步进
    xs.push(s.update()[0].x);
  }
  const steps = xs.slice(1).map((v, i) => v - xs[i]);
  const maxStep = Math.max(...steps);
  ok('每帧位移很小（不会一跳一跳）', maxStep < 40, `maxStep=${maxStep.toFixed(1)}`);
  ok('整体在前进', xs[xs.length - 1] > xs[0]);
}

function testPeerLeaveAndPrune() {
  console.log('\n[掉线处理]');
  const c = clock(0);
  const s = new WorldSession({ now: c.now });
  let left = null;
  s.onPeerLeave = (id) => { left = id; };
  s.receive({ type: 'welcome', scene: 'plaza', dog_id: 1,
              peers: [{ dog_id: 5, name: '二哈', x: 10, z: 10 }] });
  s.receive({ type: 'peer_leave', dog_id: 5 });
  eq('peer_leave 之后远端被删掉', s.peers.size, 0);
  eq('回调带上了 dog_id', left, 5);

  // 服务端没发 peer_leave（网络断了）也要能自己清掉幽灵
  s.receive({ type: 'welcome', scene: 'plaza', dog_id: 1,
              peers: [{ dog_id: 6, name: '大金', x: 10, z: 10 }] });
  c.tick(9);
  const gone = s.pruneStale(8);
  eq('超时未更新的远端被清理', gone, [6]);
  eq('清理后列表为空', s.peers.size, 0);
}

function testActionAndChat() {
  console.log('\n[动作与说话]');
  const s = new WorldSession({ now: clock().now });
  let act = null; let chat = null;
  s.onPeerAction = (id, a, b) => { act = { id, a, b }; };
  s.onChat = (id, name, text) => { chat = { id, name, text }; };
  s.receive({ type: 'welcome', scene: 'plaza', dog_id: 1,
              peers: [{ dog_id: 4, name: '柴柴', x: 0, z: 0 }] });
  s.receive({ type: 'peer_action', dog_id: 4, action: 'bark', bubble: '汪！' });
  eq('动作回调', act, { id: 4, a: 'bark', b: '汪！' });
  eq('气泡挂到了远端身上', s.peers.get(4).bubble, '汪！');

  s.receive({ type: 'peer_chat', dog_id: 4, name: '柴柴', text: '来玩' });
  eq('聊天回调', chat, { id: 4, name: '柴柴', text: '来玩' });
}

function testRejectIsCountedNotRolledBack() {
  console.log('\n[服务端拒绝]');
  const s = new WorldSession({ now: clock().now });
  let detail = null;
  s.onReject = (d) => { detail = d; };
  s.receive({ type: 'reject', detail: 'too_fast', x: 10, z: 20 });
  eq('拒绝次数记账', s.stats.rejected, 1);
  eq('回调拿到原因', detail, 'too_fast');
  eq('不做硬回滚（世界里位置本来就是客户端权威）',
     s.snapshot().rejected, 1);
}

function testSetSceneClearsPeers() {
  console.log('\n[换场景]');
  const s = new WorldSession({ now: clock().now });
  s.receive({ type: 'welcome', scene: 'plaza', dog_id: 1,
              peers: [{ dog_id: 2, name: 'x', x: 0, z: 0 }] });
  s.setScene('park');
  eq('换场景要把旧场景的人清掉（否则画面上留着幽灵）', s.peers.size, 0);
  ok('标记为未连接，等新的 welcome', s.connected === false);
  eq('场景已切换', s.scene, 'park');
}

/* ---------------- 双端对练：虚拟网线 ---------------- */

function testTwoSessionsOverVirtualWire() {
  console.log('\n[双端对练]');
  const cA = clock(0); const cB = clock(0);
  const A = new WorldSession({ now: cA.now });
  const B = new WorldSession({ now: cB.now });

  A.receive({ type: 'welcome', scene: 'plaza', dog_id: 11,
              peers: [{ dog_id: 12, name: '阿牧', x: 1000, z: 1000 }] });
  B.receive({ type: 'welcome', scene: 'plaza', dog_id: 12,
              peers: [{ dog_id: 11, name: '雪团', x: 1000, z: 1000 }] });
  const log = wire(A, B);      // 两边都拿到 dog_id 之后再接线（服务端靠它认人）

  // A 往右跑 5 帧
  for (let i = 1; i <= 5; i += 1) {
    cA.tick(0.1);
    A.reportMine(1000 + i * 40, 1000, 1, 'run');
  }
  const moves = log.filter((m) => m.payload.type === 'move');
  eq('A 上报了 5 帧', moves.length, 5);
  // welcome 快照本身会先塞一个样本，所以是 1 + 5（插值起点要有东西可比）
  eq('B 收到了 A 的位置（含 welcome 里的那一个）', B.peers.get(11).buffer.length, 6);

  cB.set(1.0);
  const out = B.update();
  ok('B 能算出 A 的插值位置', out.length === 1 && out[0].x > 1000, `x=${out[0].x}`);

  // 反向：B 说话，A 收到
  B.chat('过来这边');
  ok('A 收到了 B 的聊天', A.peers.get(12).bubble === '过来这边');
}

function testReconnectAfterSceneSwitch() {
  console.log('\n[换场景重连]');
  const A = new WorldSession({ now: clock().now });
  const B = new WorldSession({ now: clock().now });
  wire(A, B);
  A.receive({ type: 'welcome', scene: 'plaza', dog_id: 1, peers: [{ dog_id: 2, name: 'x' }] });
  A.setScene('park');
  A.receive({ type: 'welcome', scene: 'park', dog_id: 1, peers: [] });
  eq('重连后拿到新场景的快照', A.peers.size, 0);
  eq('场景是新场景', A.scene, 'park');
  eq('连接恢复', A.connected, true);
  eq('默认延迟是 120ms', DEFAULT_DELAY, 0.12);
}

/* ---------------- 跑 ---------------- */

console.log('开放世界联机会话测试');
testReportThrottle();
testReportRoundsToInt();
testIdleHeartbeat();
testPruneKeepsIdlePeerWithHeartbeat();
testWelcomeAndRoster();
testPeerMoveAndInterpolation();
testInterpolationIsSmooth();
testPeerLeaveAndPrune();
testActionAndChat();
testRejectIsCountedNotRolledBack();
testSetSceneClearsPeers();
testTwoSessionsOverVirtualWire();
testReconnectAfterSceneSwitch();

console.log(`\n${pass}/${pass + fails.length} 通过`);
if (fails.length) {
  console.log('失败项：');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('开放世界联机会话测试通过 ✅');
