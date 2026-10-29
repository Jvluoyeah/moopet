/* 开放世界联机会话（浏览器端）
   ------------------------------------------------------------
   和对战的 LockstepSession 是两套东西，别混：

     LockstepSession（game/net.js）    WorldSession（本文件）
     ─────────────────────────────    ────────────────────────────
     两端逐帧逐位一致                  各看各的，看着顺就行
     要等齐双方输入才推进              本地立刻动，位置只是"上报"
     固定两个座位                      一个场景几十个人，随时进出
     掉线 → AI 接管                    掉线 → 别人那边把这只狗抹掉

   世界为什么不用锁步：锁步意味着每一步都要等对方确认，移动会带一个 RTT 的延迟。
   大厅里走两步顿一下，手感直接废掉。所以走「客户端权威 + 服务端校验 + 远端插值」。

   这个类**刻意不碰 WebSocket**：构造函数收一个 `send(payload)` 回调，
   收到的消息喂给 `receive(msg)`。所以可以在 Node 里用"虚拟网线"直接测
   （见 tests/world_net_test.mjs），也可以在浏览器里挂真 WS。

   远端插值口径：给每个远端玩家缓存一小段位置样本，
   渲染时播放"当前时间 − 延迟"那一刻的位置。
   延迟取 120ms（约等于两个上报周期），足以抹平抖动，又不至于看起来慢半拍。
*/

export const DEFAULT_DELAY = 0.12;      // 远端插值缓冲（秒）
const MAX_BUFFER = 40;                  // 每人最多缓存多少帧样本
const REPORT_HZ = 10;                   // 上报频率，和服务端约定一致
/**
 * 心跳：**站着不动也要每 2 秒报一次**。
 *
 * 为什么不能"没动就不发"：远端那边有 pruneStale —— 太久收不到你的位置就把你当掉线清掉。
 * 如果一只狗加入后一直站着不动（新手刚进广场最正常的行为），它就永远不发位置，
 * 8 秒后所有人画面上它都会凭空消失——而服务端其实还认为它在房间里。
 * 这个问题是双浏览器联机测试抓出来的：A 站了 8 秒，B 那边 A 就没了。
 */
export const HEARTBEAT_SEC = 2.0;

export class WorldSession {
  /**
   * @param {object} opts
   * @param {(payload:object)=>void} opts.send   把消息发出去（浏览器里是 ws.send）
   * @param {string} opts.scene                  当前场景 code
   * @param {number} opts.delay                  远端插值延迟（秒）
   * @param {()=>number} opts.now                取当前时间（秒），测试可注入假时钟
   */
  constructor(opts = {}) {
    this.send = opts.send || null;
    this.scene = opts.scene || 'plaza';
    this.delay = opts.delay ?? DEFAULT_DELAY;
    this.now = opts.now || (() => performance.now() / 1000);
    /** 远端玩家：dog_id -> { dog, buffer:[{t,x,z}], shown:{x,z}, facing, status } */
    this.peers = new Map();
    this.dogId = null;
    this.connected = false;
    this.bounds = { w: 2200, d: 1700 };
    this.reportInterval = 1 / REPORT_HZ;
    this._lastSentAt = -1e9;
    this._lastSent = null;
    this.stats = { sent: 0, received: 0, rejected: 0, joined: 0, left: 0 };
    this.onPeerJoin = null;
    this.onPeerLeave = null;
    this.onPeerAction = null;
    this.onChat = null;
    this.onReject = null;
  }

  // ---------------- 出站 ----------------

  /** 上报自己的位置（10Hz 上限 + 2 秒心跳）。返回是否真的发出去了。 */
  reportMine(x, z, facing, status, force = false) {
    const t = this.now();
    const px = Math.round(x), pz = Math.round(z);
    const last = this._lastSent;
    const unchanged = Boolean(last) && last.x === px && last.z === pz
      && last.status === status && last.facing === facing;
    if (!force) {
      // 用 1e-6 的容差比时间：浮点累加出来的 0.4-0.3 是 0.09999999999999998，
      // 直接和 0.1 比会把整整一帧吞掉（这个 bug 让上报从 10Hz 掉到 7Hz）
      if (t - this._lastSentAt < this.reportInterval - 1e-6) return false;
      if (unchanged && t - this._lastSentAt < HEARTBEAT_SEC) return false;
    }
    this._lastSentAt = t;
    this._lastSent = { x: px, z: pz, facing, status };
    this.stats.sent += 1;
    this.send?.({ type: 'move', x: px, z: pz, facing, status });
    return true;
  }

  action(name, bubble = '') {
    this.send?.({ type: 'action', action: name, bubble });
  }

  chat(text) {
    if (!text) return;
    this.send?.({ type: 'chat', text: String(text).slice(0, 120) });
  }

  ping(t = Date.now()) {
    this.send?.({ type: 'ping', t });
  }

  /** 换场景：重连由调用方负责，这里只把远端清干净，免得旧场景的人留在画面上 */
  setScene(scene) {
    this.scene = scene;
    this.peers.clear();
    this.connected = false;
    this._lastSent = null;
    this._lastSentAt = -1e9;
  }

  // ---------------- 入站 ----------------

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    this.stats.received += 1;
    const t = this.now();
    switch (msg.type) {
      case 'welcome': {
        this.dogId = msg.dog_id;
        this.scene = msg.scene || this.scene;
        if (msg.bounds) this.bounds = msg.bounds;
        if (msg.report_hz) this.reportInterval = 1 / msg.report_hz;
        this.connected = true;
        this.peers.clear();
        for (const p of msg.peers || []) this._addPeer(p, t);
        this.stats.joined += 1;
        break;
      }
      case 'peer_join':
        this._addPeer(msg.peer, t);
        this.onPeerJoin?.(msg.peer);
        break;
      case 'peer_move': {
        const peer = this.peers.get(msg.dog_id);
        if (!peer) break;
        peer.buffer.push({ t, x: msg.x, z: msg.z });
        if (peer.buffer.length > MAX_BUFFER) peer.buffer.shift();
        peer.facing = msg.facing ?? peer.facing;
        peer.status = msg.status || peer.status;
        peer.lastAt = t;
        break;
      }
      case 'peer_action': {
        const peer = this.peers.get(msg.dog_id);
        if (peer) peer.bubble = msg.bubble || '';
        this.onPeerAction?.(msg.dog_id, msg.action, msg.bubble || '');
        break;
      }
      case 'peer_chat': {
        const peer = this.peers.get(msg.dog_id);
        if (peer) peer.bubble = String(msg.text || '').slice(0, 24);
        this.onChat?.(msg.dog_id, msg.name, msg.text);
        break;
      }
      case 'peer_leave':
        if (this.peers.delete(msg.dog_id)) this.stats.left += 1;
        this.onPeerLeave?.(msg.dog_id);
        break;
      case 'reject':
        // 服务端说你这一步不合法。本地已经动了，不做硬回滚——
        // 世界里位置本来就是"看着对"，硬拉回去反而更突兀；
        // 只在统计里记一笔，页面可以据此提示"网络异常"。
        this.stats.rejected += 1;
        this.onReject?.(msg.detail, msg);
        break;
      default:
        break;
    }
  }

  _addPeer(p, t) {
    if (!p || p.dog_id == null || p.dog_id === this.dogId) return;
    this.peers.set(p.dog_id, {
      dog: p,
      buffer: [{ t, x: p.x, z: p.z }],
      shown: { x: p.x, z: p.z },
      facing: p.facing ?? 1,
      status: p.status || 'idle',
      bubble: p.bubble || '',
      lastAt: t,
    });
  }

  // ---------------- 渲染侧 ----------------

  /**
   * 推进插值，返回要画的远端列表。
   * 播放的是 `now - delay` 那一刻的位置：两个样本之间线性插值，
   * 比"收到就跳"顺得多（这是远端看起来漂不漂的关键）。
   */
  update() {
    const playAt = this.now() - this.delay;
    const out = [];
    for (const [dogId, peer] of this.peers) {
      const buf = peer.buffer;
      if (buf.length === 1) {
        peer.shown.x = buf[0].x;
        peer.shown.z = buf[0].z;
      } else {
        // 找到第一个 t > playAt 的样本，在它和前一个之间插值
        let i = buf.length - 1;
        while (i > 0 && buf[i - 1].t > playAt) i -= 1;
        const b = buf[i];
        const a = buf[Math.max(0, i - 1)];
        const span = b.t - a.t;
        const k = span > 1e-6 ? Math.max(0, Math.min(1, (playAt - a.t) / span)) : 1;
        peer.shown.x = a.x + (b.x - a.x) * k;
        peer.shown.z = a.z + (b.z - a.z) * k;
      }
      out.push({
        dogId, dog: peer.dog, x: peer.shown.x, z: peer.shown.z,
        facing: peer.facing, status: peer.status, bubble: peer.bubble,
      });
    }
    return out;
  }

  /** 掉线兜底：太久没收到某人的位置就把他从画面上抹掉（服务端 peer_leave 丢了也不会留幽灵）。
   *  阈值要**明显大于**上报侧的心跳（HEARTBEAT_SEC=2），否则丢两个包就会误清。 */
  pruneStale(maxAge = 15) {
    const t = this.now();
    const gone = [];
    for (const [dogId, peer] of this.peers) {
      if (t - peer.lastAt > maxAge) {
        this.peers.delete(dogId);
        gone.push(dogId);
      }
    }
    for (const id of gone) this.onPeerLeave?.(id);
    return gone;
  }

  roster() {
    return [...this.peers.entries()].map(([dogId, p]) => ({ dogId, ...p.dog }));
  }

  snapshot() {
    return {
      scene: this.scene, connected: this.connected, dogId: this.dogId,
      peers: this.peers.size, ...this.stats,
    };
  }
}
