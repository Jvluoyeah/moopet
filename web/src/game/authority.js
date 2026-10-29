/* 权威模式的客户端（第一阶段：**不预测**）
   ============================================================
   和锁步的区别，一句话：
     锁步：两端各跑一份模拟，**双方都要等最慢的那一方**才推进
     权威：服务端跑唯一一份，客户端只发输入、收快照 —— **不用等对手**

   这才是"加入房间的一方很卡"的解法。

   本文件是**第一阶段**：客户端不预测，收到快照就按服务端的结果走。
   好处是绝对不会和权威分叉（客户端根本没有自己的判断）；
   代价是本地操作有一整个 RTT 的延迟感。

   第二阶段（下一步）再加：
     · 本地预测：按键立刻在本地应用
     · 回滚重放：收到权威快照后，如果预测和权威不一致，
       退回快照并重放未确认的输入（地基已经验过，见 tests/rollback_test.mjs）

   ⚠️ 传输是注入的（`send` 回调 + `receive()`），和 net.js 的 LockstepSession
      一个路子 —— 这样**不需要浏览器、不需要 WebSocket** 就能测联机逻辑。
*/

import { createState, step, hashState, snapshotState, restoreState }
  from './simAB.js';

export class AuthorityClient {
  /**
   * @param {object} opts
   *   seed/breeds/side   和服务端一致
   *   send(frame, input) 把本地输入发给服务端
   *   engine             可注入（默认 simAB），方便测试
   */
  constructor({ seed = 1, breeds = [], side = 0, send = null, engine = null,
                predict = false } = {}) {
    /** 要不要本地预测。默认关 —— 关掉就是"完全听服务端的"，
     *  绝对不会和权威分叉，代价是每个操作有半个 RTT 的延迟感。
     *  打开才需要回滚重放。 */
    this.predict = predict;
    this.predictedFrames = 0;
    this.lastRemoteInput = null;
    this.engine = engine || { createState, step, hashState, snapshotState,
                              restoreState };
    this.seed = seed;
    this.breeds = breeds;
    this.side = side;
    this.opponentSide = 1 - side;
    this.send = send;

    this.state = this.engine.createState(seed, breeds);
    this.netFrame = 0;        // 下一个要上报给服务端的输入帧
    this.ackFrame = 0;        // 服务端已经确认到第几帧
    this.lastFrame = null;    // 最近一次服务端帧（渲染用）
    this.pendingInputs = new Map();   // 本地已按下的输入（第二阶段预测要用）
    this.events = [];
    this.snapshots = 0;
    this.rollbacks = 0;
    /** 收到但被丢掉的过期快照数（乱序网络下会涨） */
    this.staleSnapshots = 0;
    /** 已经应用过的**快照**帧号。判"过期"要和它比，不是和 ackFrame 比 */
    this.appliedSnapTick = null;
  }

  /**
   * 上报这一帧的本地输入。
   * 不预测的话，本地**不等**它生效 —— 等的是服务端回来的帧。
   */
  pushInput(input) {
    const frame = this.netFrame;
    this.netFrame += 1;
    this.pendingInputs.set(frame, input);
    // 只留最近 2 秒的（回滚重放要用；不预测时纯粹是留个底）
    if (this.pendingInputs.size > 256) {
      const keys = [...this.pendingInputs.keys()].sort((a, b) => a - b);
      for (const k of keys.slice(0, keys.length - 256)) {
        this.pendingInputs.delete(k);
      }
    }
    if (this.send) this.send(frame, input);
    // **预测**：本地立刻应用，不等服务端确认。
    // 这就是"手感"的来源 —— 没有这一步，按键要等半个 RTT 才有反应。
    if (this.predict) this.predictStep(input);
    return frame;
  }

  /**
   * 收到服务端的一批帧 + 权威快照 + **权威用过的输入**。
   *
   * 预测模式下做三件事（顺序不能换）：
   *   ① 把本地退回权威快照那一刻
   *   ② 用**权威用过的输入**重放到"服务端确认到的那一帧"
   *   ③ 再把**本地还没被确认的输入**接着预测上去
   *
   * 为什么要第 ③ 步：玩家按键到服务端确认之间有半个 RTT，
   * 这段时间的操作不能白等 —— 那就是"手感"的全部。
   *
   * ⚠️ 回滚**必须**用权威给的 inputs，不能拿本地记的凑。
   *    本地只知道自己的输入，不知道对手的；用错的话重放结果和权威不一致，
   *    表现是"每次快照都回滚、每次都对不上"，画面一直抖。
   */
  receiveFrames(frames, snapshot, authInputs) {
    if (!Array.isArray(frames) || !frames.length) return 0;
    const last = frames[frames.length - 1];
    const ackTo = last.tick;                 // 服务端确认到这一帧

    /* ⚠️ **丢掉过期的快照**（乱序网络下必须做）。
       网络会乱序：一个旧快照完全可能在新快照**之后**才到。
       不过滤的话，它会把客户端**倒退**回旧状态 —— 而且因为本地已经确认到更新的帧，
       再也不会有人把它纠回来，两边就此分叉。

       ⚠️⚠️ 判据必须是「**和上一次应用的快照比**」，**不能**和 ackFrame 比。
          同一批消息里，`snapshot.tick` 和 `frames` 里最后一帧的 tick 是**相等的**
           （服务端就是先推进到那一帧、再取快照）。
          拿它和 ackFrame（= 最后一帧的 tick）比，第一条快照就会被判成"过期"扔掉；
           而 ackFrame 只增不减，于是**后面每一条都被扔掉**，
           客户端永远不应用快照 —— 本地状态就此冻结。
           （实机表现：房主端 tick 卡在 767 不动，另一端还在推进。
             我上一轮怀疑"两个连接抢 pump 的并发问题"，方向完全错了。） */
    const snapTick = snapshot && typeof snapshot.tick === 'number'
      ? snapshot.tick : null;
    if (snapTick !== null
        && this.appliedSnapTick !== null
        && snapTick <= this.appliedSnapTick) {
      this.staleSnapshots += 1;
      return 0;                              // 比我**已经应用过的**还旧，扔
    }
    /* ⚠️ "回滚"的判据不能是"应用快照前后指纹变了"。
       客户端本来就**领先**服务端几帧，每批快照都会让指纹变 —— 那样每批都算回滚
       （实测理想网络下 320/400 次，看着像"一直在抖"，其实一切正常）。

       正确的判据：**权威的第 N 帧，和我之前预测的第 N 帧，是不是同一个状态。**
       所以我按帧存了预测指纹（predictedHashes），这里拿它和权威的比。 */
    const predictedAt = (this.predictedHashes && snapTick !== null)
      ? this.predictedHashes.get(snapTick) : undefined;

    if (snapshot) {
      // ① 退回权威状态
      this.engine.restoreState(this.state, snapshot);
      this.snapshots += 1;
      this.appliedSnapTick = snapTick;       // 记住"已应用到哪一帧快照"

      // ② 用权威输入重放（快照的 tick 到确认帧之间的那几帧）
      if (Array.isArray(authInputs) && authInputs.length) {
        const from = snapshot.tick || (ackTo - authInputs.length);
        for (let i = 0; i < authInputs.length; i += 1) {
          const target = from + i + 1;
          if (target > ackTo) break;
          this.engine.step(this.state, authInputs[i]);
        }
      }
      /* ⚠️ 没给 authInputs 时**什么都别做**。
         快照本身就是那一刻的完整权威状态，再 step 一下就多推了一帧 ——
         表现是"没预测也和服务端对不上"（authority_test 里那条
         "本地状态和权威逐位一致"就是这么挂的）。 */
    }

    /* ③ 把尚未确认的本地输入接着**预测**上去。
       ⚠️ 这一步必须判 `this.predict`。
          不判的话，不预测模式也在偷偷跑预测 —— 于是
          `predictedFrames > 0`、回滚计数不再是 0，
          而且"完全不预测"这个承诺也就破了
          （测试里"不预测时不产生回滚"就是这么挂的）。 */
    this.predictedFrames = 0;
    if (this.predict) {
      const unacked = [...this.pendingInputs.keys()]
        .filter((k) => k > ackTo).sort((a, b) => a - b);
      for (const k of unacked) {
        this.predictStep(this.pendingInputs.get(k));
      }
    }

    this.lastFrame = last;
    this.ackFrame = ackTo;
    for (const k of [...this.pendingInputs.keys()]) {
      if (k <= ackTo) this.pendingInputs.delete(k);
    }
    if (this.netFrame < ackTo) this.netFrame = ackTo;

    // 对账：权威否掉了我当时的预测 → 记一次回滚
    if (predictedAt !== undefined) {
      const authHash = this.engine.hashState(this.state);
      if (authHash !== predictedAt) this.rollbacks += 1;
      this.predictedHashes.delete(snapTick);
    }
    return frames.length;
  }

  /**
   * 本地预测推进一步（**不等服务端**）。
   * 对手的输入不知道，就用最后一次收到的那个顶着 ——
   * 权威快照回来时会纠正，所以猜错不要紧；猜对的概率越高，回滚越少。
   */
  predictStep(localInput) {
    const pair = [];
    for (let s = 0; s < 2; s += 1) {
      pair.push(s === this.side ? localInput : (this.lastRemoteInput || {}));
    }
    this.engine.step(this.state, pair);
    this.predictedFrames += 1;
    // 记下"我预测的这一帧长什么样"，用来判断下一批快照是不是否掉了我
    if (!this.predictedHashes) this.predictedHashes = new Map();
    this.predictedHashes.set(this.state.tick, this.hash());
    if (this.predictedHashes.size > 512) {
      const ks = [...this.predictedHashes.keys()].sort((a, b) => a - b);
      for (const k of ks.slice(0, ks.length - 512)) this.predictedHashes.delete(k);
    }
    return this.state;
  }

  /** 服务端把某人的输入也捎过来时（可选：用于本地插值/预测） */
  receiveInput(side, frame, input) {
    if (side === this.side) return false;
    // 预测时用它顶着（猜对手还在按同一个键）；权威快照回来会纠正
    this.lastRemoteInput = input;
    this.events.push({ type: 'remote-input', frame, input });
    return true;
  }

  /** 这一帧该渲染什么（没有新帧就返回上一次的） */
  view() {
    return this.lastFrame;
  }

  hash() {
    return this.engine.hashState(this.state);
  }

  stats() {
    return {
      netFrame: this.netFrame,
      ackFrame: this.ackFrame,
      lag: Math.max(0, this.netFrame - this.ackFrame),
      snapshots: this.snapshots,
      rollbacks: this.rollbacks,
      predict: this.predict,
      predicted: this.predictedFrames,
      stale: this.staleSnapshots,
      appliedSnapTick: this.appliedSnapTick,
      pending: this.pendingInputs.size,
    };
  }
}

/**
 * 和 `LockstepSession` **同形**的外壳。
 *
 * 为什么要这东西：`arena.js` 里到处都是 `this.session.state` / `.hash()` /
 * `.stats()` / `.pumpLocal()` / `.advance()`。权威模式的语义完全不同
 * （推进由服务端帧驱动，不是本地累加器），但**只要能对上这几个方法名**，
 * arena 那一千行就一行都不用改 —— 换引擎/换协议的改动面越小越安全，
 * 这是前面几轮反复吃过的教训。
 *
 * 和真正 LockstepSession 的差别（都在注释里标了）：
 *   · `pumpLocal(now, input)` 只**上报输入**（本地预测在 pushInput 里做）
 *   · `advance()` **什么都不做** —— 权威模式不靠本地时钟推进
 *   · `receiveFrames()` 是新增的，由 WS 的 snap 消息喂进来
 */
export class AuthoritySessionShim {
  constructor({ seed, breeds, side, send, engine = null, predict = false }) {
    this.client = new AuthorityClient({ seed, breeds, side, send, engine, predict });
    this.seed = seed;
    this.side = side;
    this.opponentSide = 1 - side;
    this.engine = this.client.engine;
    this.inputs = new Map();      // 兼容：有些地方会读它
    this.inputLog = [];
    this.peerGone = false;
    this.stallFrames = 0;
    this.remoteSource = null;     // 权威模式下没有"假远端"这回事
    this.byAuthority = true;
  }

  get state() { return this.client.state; }
  get netFrame() { return this.client.netFrame; }
  set netFrame(v) { this.client.netFrame = v; }
  get ackFrame() { return this.client.ackFrame; }

  useLocalOpponent() { /* 权威模式：对手由服务端给，忽略 */ }

  /** 只上报。**不推进**（推进等服务端的帧）。 */
  pumpLocal(nowMs, currentInput) {
    this.lastNow = nowMs;
    if (this.peerGone) return;
    this.inputLog.push(currentInput);
    this.client.pushInput(currentInput);
  }

  /** 权威模式**没有**本地推进 —— 留着是为了兼容 arena 的调用。 */
  advance() { return 0; }

  /** WS 收到 snap 时调它 */
  receiveFrames(frames, snapshot, inputs) {
    const n = this.client.receiveFrames(frames, snapshot, inputs);
    this.stallFrames = 0;
    return n;
  }

  receiveInput(side, frame, input) {
    return this.client.receiveInput(side, frame, input);
  }

  receive(msg) {
    if (!msg) return false;
    if (msg.type === 'snap') {
      this.receiveFrames(msg.frames || [], msg.snap, msg.inputs);
      return true;
    }
    if (msg.type === 'peer_left') { this.peerGone = true; return true; }
    return false;
  }

  hash() { return this.client.hash(); }
  snapshot() { return this.client.snapshot ? this.client.snapshot() : null; }

  stats() {
    const s = this.client.stats();
    return { ...s, buffered: 0, hash: this.client.hash(),
             stallFrames: this.stallFrames };
  }

  isStalling() { return false; }        // 权威模式不会"等对手"
  peerLeft(reason = '') { this.client.peerLeft?.(reason); this.peerGone = true; }
  stop() { this.client.stop?.(); }
}

export { step, createState, hashState, snapshotState, restoreState };
