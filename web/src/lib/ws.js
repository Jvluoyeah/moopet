/* 对战 WebSocket 客户端。
   只负责"把字节送到 / 收回来"，锁步逻辑在 game/net.js —— 这样联机逻辑可以在 Node 里测。 */

import { token } from './api.js';
import { encodeInput } from '../game/net.js';

const MAX_RETRY = 3;

export class MatchSocket {
  /**
   * @param {string} room  房间号
   * @param {object} handlers { onMessage, onOpen, onClose, onError, onStatus }
   */
  constructor(room, handlers = {}) {
    this.room = room;
    /* 路径可覆盖：权威模式走 `/ws/match-auth/{room}`。
       默认保持锁步那条 /ws/match/{room} —— **不动默认值**，
       这样"换协议"的风险被限制在显式开启的那条路上。 */
    this.path = handlers.path || '/ws/match';
    this.h = handlers;
    this.ws = null;
    this.retries = 0;
    this.closedByUs = false;
    this.queued = [];
    this.status = 'idle';        // idle | connecting | open | closed | failed
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const q = token.get() ? `?token=${encodeURIComponent(token.get())}` : '';
    // 走同源：开发时 Vite 代理 /ws，部署时 Nginx 反代
    return `${proto}//${location.host}${this.path}/${this.room}${q}`;
  }

  _setStatus(s, detail = '') {
    this.status = s;
    this.h.onStatus?.(s, detail);
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return this;
    }
    this.closedByUs = false;
    this._setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(this.url());
    } catch (e) {
      this._setStatus('failed', String(e));
      this.h.onError?.(e);
      return this;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this._setStatus('open');
      this.h.onOpen?.();
      // 断线期间攒下的帧补发（服务端只转发，不解释）
      const pending = this.queued.splice(0);
      for (const msg of pending) this.send(msg);
    };
    ws.onmessage = (ev) => {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg && msg.type === 'error') this.h.onError?.(new Error(msg.detail || '连接出了点问题，请刷新重试'));
      this.h.onMessage?.(msg);
    };
    ws.onclose = (ev) => {
      if (this.closedByUs) { this._setStatus('closed'); return; }
      const code = ev?.code || 0;
      // 鉴权/房间类错误重连也没用，直接失败
      if ([4401, 4404, 4409].includes(code)) {
        this._setStatus('failed', `连接被拒绝（${code}）`);
        this.h.onClose?.(ev);
        return;
      }
      if (this.retries < MAX_RETRY) {
        this.retries += 1;
        const wait = 400 * this.retries;
        this._setStatus('connecting', `第 ${this.retries} 次重连…`);
        setTimeout(() => this.connect(), wait);
      } else {
        this._setStatus('failed', '连接已断开');
        this.h.onClose?.(ev);
      }
    };
    ws.onerror = (e) => this.h.onError?.(e);
    return this;
  }

  send(obj) {
    const data = JSON.stringify(obj);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      return true;
    }
    // 还没连上：最多攒 120 帧（约 4 秒），避免内存无限涨
    if (this.queued.length < 120) this.queued.push(obj);
    return false;
  }

  /**
   * 权威模式的输入上报。
   *
   * ⚠️ **不能用 sendInput()**：那个是锁步协议的，会把输入序列化成
   *    `{type:'input', frame, keys:[...]}` —— `keys` 是**按键位图数组**。
   *    而权威模式要的是 `{mx, skill, btn}` 这个**对象**。
   *    混用之后服务端拿到一个 list，`got.get("mx")` 直接抛
   *    `AttributeError: 'list' object has no attribute 'get'` ——
   *    而推进循环当时只有 `except CancelledError`，于是**静默死掉**，
   *    表现就是"服务端一声不吭、socket 还开着、客户端画面不动"。
   *    （这个错查了四轮。）
   */
  sendAuthInput(frame, input) {
    this.send({ type: 'input', frame, keys: input || {} });
  }

  sendInput(frame, input) {
    // 用 game/net.js 的 encodeInput，别在这里手写数组——
    // v2 加了第 4 个字段 btn（跳跃/冲刺/防御/技能位掩码），
    // 手写的 [mx,my,atk] 会把所有按键**静默丢掉**：本地人跳了、对面看他没跳，
    // 两端哈希从此对不上。这个 bug 是靠 e2e 的"两端哈希一致"抓出来的。
    return this.send({ type: 'input', frame, keys: encodeInput(input) });
  }

  close() {
    this.closedByUs = true;
    try { this.ws?.close(1000, 'client done'); } catch { /* 忽略 */ }
    this._setStatus('closed');
  }
}

/** 轮询等服务端把对手安排进来（PVP 建房后要等第二个人） */
export async function waitForOpponent(api, room, { timeoutMs = 120000, intervalMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const m = await api.match(room);
    const foe = (m.players || []).find((p) => p.side === 1);
    if (foe && foe.dog_id) return m;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
