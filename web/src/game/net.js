/* 锁步会话：把"两个人各自跑同一份模拟"这件事做成一个可测的纯逻辑对象
   ============================================================
   刻意与传输解耦：构造函数只收一个 `send` 回调，收到的消息用 `receive()` 喂进来。
   于是：
     * 浏览器里 send 走 WebSocket；
     * Node 测试里 send 只是把消息推给对面那个 session —— **不需要浏览器也能测联机逻辑**。

   锁步的核心规则只有一句：
       **只有拿到双方对第 N 帧的输入，才可以推进第 N 帧。**
   拿不到就停在那里等（stall），而不是自己猜——猜了就会两端分叉。

   输入延迟的来源：本地输入按墙上时钟产出并立刻发出去，对手的要过半个 RTT 才到，
   所以模拟天然落后于墙上时钟若干帧。这正是锁步"局域网丝滑、公网有延迟感"的原因。
   */

/* ⚠️ 这里**不再 import 旧引擎**了。
   原来默认值是 `engine || { ...sim.js 那一套... }` ——
   于是"忘记传引擎"会**静默退回旧引擎**：页面用新引擎读状态、
   会话里跑的却是旧的，两边字段对不上（历史上挂过三项 e2e）。
   现在引擎是**必填**：没传就直接报错，问题在第一现场暴露。 */

/* ⚠️ 节拍不能写成模块级常量。
   原来是 `const TICK_MS = 1000 / TICK_HZ`，TICK_HZ 来自 sim.js（30Hz）。
   把引擎做成可注入之后，注入 128Hz 的新引擎时节拍还是按 30Hz 算的——
   表现是"跑 1400 次只推进了 328 帧"，因为累加器每一拍都不够一帧。
   所以改成从 this.engine.TICK_HZ 实时算。 */
const tickMs = (session) => 1000 / session.engine.TICK_HZ;

export class LockstepSession {
  /**
   * @param {object} opts
   *   seed        对局种子（服务端下发，两端必须一致）
   *   breeds      [我的品种, 对手品种]（四维影响手感，两端必须一致）
   *   side        我在哪一侧（0/1）
   *   send        (frame, input) => void，把本地输入发出去
   *   aiSkill     掉线接管时 AI 的水平
   *   engine      **可注入的引擎**，默认用 sim.js。
   *               移植 abstract-brawl 那套的时候，就是靠这个口子把 33 项锁步测试
   *               原封不动地架到新引擎上跑——不然"换引擎会不会破坏联机"只能靠猜。
   *               契约就 4 样：createState / step / hashState / cloneState（+ TICK_HZ）。
   */
  constructor({ seed = 1, breeds = [], side = 0, send = null, aiSkill = 0.62,
                engine = null } = {}) {
    this.seed = seed;
    this.breeds = breeds;
    this.side = side;
    this.opponentSide = 1 - side;
    this.send = send;
    this.engine = engine || { createState, step, hashState, cloneState, TICK_HZ,
                              createAI, aiInput };

    this.state = this.engine.createState(seed, breeds);
    this.inputs = new Map();        // frame -> {0: input, 1: input}
    this.nextFrame = 0;             // 下一个待推进的帧
    this.netFrame = 0;              // 下一个要产出的本地输入帧
    this.acc = 0;
    this.lastNow = null;

    this.peerGone = false;
    this.stallFrames = 0;           // 连续等待帧数（用于 UI 提示"等待对手"）
    this.inputLog = [];             // 完整输入日志：回放/对账都用它
    this.remoteSource = null;       // 本地 AI 对战时的"假远端"
    // AI 从注入的引擎里取（默认还是旧 ai.js）——契约是 6 样，见 simAB.js 的说明
    this.ai = this.engine.createAI(this.opponentSide, aiSkill);
    this.events = [];               // ['stall'] / ['resumed'] / ['peer_left']
  }

  /** AI / 影子模式：远端输入由本地函数产生，不走网络 */
  useLocalOpponent(fn) {
    this.remoteSource = fn;
    return this;
  }

  // ---------------- 网络侧 ----------------
  /** 收到对手的消息（由 WebSocket 或测试直接调用） */
  receive(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === 'input') {
      const frame = Number(msg.frame);
      if (!Number.isFinite(frame) || frame < 0) return false;
      const side = Number.isInteger(msg.side) ? msg.side : this.opponentSide;
      if (side === this.side) return false;         // 自己的回声，忽略
      const slot = this.inputs.get(frame) || {};
      slot[side] = normalizeInput(msg.keys ?? msg.input);
      this.inputs.set(frame, slot);
      return true;
    }
    if (msg.type === 'peer_left') {
      this.peerLeft(msg.reason);
      return true;
    }
    return false;
  }

  /** 对手掉线：之后的对手输入由 AI 接管（对局不卡死） */
  peerLeft(reason = '') {
    if (this.peerGone) return;
    this.peerGone = true;
    this.events.push(['peer_left', reason]);
  }

  // ---------------- 本地输入 ----------------
  /**
   * 按墙上时钟产出本地输入。每过 1/30 秒产出一帧并立刻发出。
   * @param {number} nowMs performance.now()
   * @param {object} currentInput 当前按键快照 {mx,my,atk}
   */
  pumpLocal(nowMs, currentInput) {
    const TICK_MS = tickMs(this);
    if (this.lastNow === null) this.lastNow = nowMs - TICK_MS;
    this.acc += nowMs - this.lastNow;
    this.lastNow = nowMs;
    let produced = 0;
    // 一次最多补 5 帧，避免切后台回来时爆炸
    while (this.acc >= TICK_MS && produced < 5) {
      this.acc -= TICK_MS;
      const frame = this.netFrame;
      const input = normalizeInput(currentInput);
      const slot = this.inputs.get(frame) || {};
      slot[this.side] = input;
      this.inputs.set(frame, slot);
      if (this.send) this.send(frame, input);
      this.netFrame += 1;
      produced += 1;
    }
    return produced;
  }

  // ---------------- 推进 ----------------
  /**
   * 尽量推进模拟：只要有双方输入就往前走，缺一方就停下等。
   * @returns {number} 本次推进了几帧
   */
  advance() {
    let stepped = 0;
    const CAP = 240;                              // 单次调用最多推进这么多帧
    while (!this.state.over && stepped < CAP) {
      const frame = this.nextFrame;
      const slot = this.inputs.get(frame);
      let local = slot ? slot[this.side] : undefined;
      let remote = slot ? slot[this.opponentSide] : undefined;

      if (local === undefined) break;               // 本地还没产出这一帧
      if (remote === undefined) {
        if (this.remoteSource) {
          remote = normalizeInput(this.remoteSource(this.state, frame));
        } else if (this.peerGone) {
          remote = normalizeInput(this.engine.aiInput(this.ai, this.state));   // 掉线接管
        } else {
          this.stallFrames += 1;
          if (this.stallFrames === 3) this.events.push(['stall']);
          break;                                    // 等对手，绝不自己猜
        }
      }
      if (this.stallFrames >= 3) this.events.push(['resumed', this.stallFrames]);
      this.stallFrames = 0;

      const pair = this.side === 0 ? [local, remote] : [remote, local];
      this.engine.step(this.state, pair);
      this.inputLog.push({ frame, 0: pair[0], 1: pair[1] });
      this.inputs.delete(frame);
      this.nextFrame += 1;
      stepped += 1;
    }
    return stepped;
  }

  /** 等对手等太久了（UI 用来提示网络问题） */
  isStalling() {
    return this.stallFrames > this.engine.TICK_HZ;  // 超过 1 秒
  }

  hash() {
    return this.engine.hashState(this.state);
  }

  snapshot() {
    return this.engine.cloneState(this.state);
  }

  /** 未消费的输入帧数（用于看缓冲深度） */
  buffered() {
    return this.inputs.size;
  }

  stats() {
    return {
      frame: this.state.tick, nextFrame: this.nextFrame, netFrame: this.netFrame,
      buffered: this.buffered(), stallFrames: this.stallFrames,
      peerGone: this.peerGone, hash: this.hash(),
      log: this.inputLog.length, over: this.state.over,
    };
  }
}

/** 输入规范化：一律裁到合法范围，避免脏数据破坏确定性。
 *
 *  线上格式是**四个数** [mx, my, atk, btn]：
 *    mx   -1/0/1    水平输入
 *    my   -1/0/1    纵向输入（v1 俯视用；横板已不用，留着兼容旧录像）
 *    atk  0/1       普攻
 *    btn  0..255    位掩码，见 sim.js 的 BTN（跳跃/冲刺/防御/四个技能都在这里）
 *  为什么要位掩码：一帧最多 8 个按键，用 8 个布尔要 8 个字段，
 *  打包成一个整数省一半字节（一局 1800 帧 × 2 人）。 */
export function normalizeInput(v) {
  if (!v) return { mx: 0, my: 0, atk: 0, btn: 0, skill: -1 };
  if (Array.isArray(v)) {
    return {
      mx: clampInt(v[0], -1, 1),
      my: clampInt(v[1], -1, 1),
      atk: v[2] ? 1 : 0,
      btn: clampInt(v[3], 0, 255) & 255,
      // 第 5 位是**招式下标**（0~5，-1 表示不出招）。
      // 原来只传到 btn（位掩码），下游还要用 firstSkill() 反查一遍，
      // 而那层映射是错乱的 —— 六招制下按第 3 个钮会放成第 5 招。
      // 直传下标之后，"标签写什么就放什么"。
      skill: clampInt(v[4] === undefined ? -1 : v[4], -1, 5),
    };
  }
  let btn = clampInt(v.btn, 0, 255) & 255;
  const skill = clampInt(v.skill === undefined ? -1 : v.skill, -1, 5);
  // 也接受"写开"的形式，页面传输入时更直观
  if (v.jump) btn |= 1;
  if (v.dash) btn |= 4;
  if (v.guard) btn |= 8;
  return {
    mx: clampInt(v.mx, -1, 1),
    my: clampInt(v.my, -1, 1),
    atk: v.atk ? 1 : 0,
    btn,
    skill,
  };
}

/** 紧凑的线上格式（数组比对象省一半字节，一局约 1800 帧） */
export function encodeInput(input) {
  const n = normalizeInput(input);
  return [n.mx, n.my, n.atk, n.btn, n.skill === undefined ? -1 : n.skill];
}

function clampInt(v, lo, hi) {
  const n = Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0;
  return n < lo ? lo : (n > hi ? hi : n);
}
