/* 开放世界的 WebSocket 连接。
   ------------------------------------------------------------
   和 lib/ws.js（对战）分开写，因为两者关心的事情不一样：

     对战 MatchSocket        世界 WorldLink
     ─────────────────       ──────────────────────────────
     一条连接一局             一条连接一个场景，换场景要重连
     断线要重试（局还没打完）  断线就重试，但**换场景时是主动断**，不该重连旧房间
     必须保证登录态           同样带 token

   世界这边最容易出的 bug 是"连上了但场景不对"：
   goto() 先 world.setScene() 再 net.reconnect()，如果旧连接的 onclose
   在 reconnect 之后才回来，它会把新连接的状态改回 closed。
   所以这里用 generation（世代号）作废过期回调——老连接的 onclose 直接忽略。
*/

import { token } from '../lib/api.js';

const MAX_RETRY = 4;

export function worldWsUrl(scene) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const q = token.get() ? `?token=${encodeURIComponent(token.get())}` : '';
  // 走同源：开发时 Vite 代理 /ws，部署时反代
  return `${proto}//${location.host}/ws/world/${encodeURIComponent(scene)}${q}`;
}

/**
 * 把一条 WebSocket 接到 WorldSession 上。
 * @returns {{reconnect(scene):void, close():void, status():string, detail():string}}
 */
export function createWorldLink(session, { onStatus } = {}) {
  let ws = null;
  let generation = 0;
  let retries = 0;
  let closedByUs = false;
  let scene = session.scene || 'plaza';
  let status = 'idle';
  let detail = '';

  function setStatus(s, d = '') {
    status = s;
    detail = d;
    onStatus?.(s, d);
  }

  function open(gen) {
    closedByUs = false;
    setStatus('connecting');
    let sock;
    try {
      sock = new WebSocket(worldWsUrl(scene));
    } catch (e) {
      setStatus('failed', String(e));
      return;
    }
    ws = sock;

    sock.onopen = () => {
      if (gen !== generation) return;      // 过期的连接，别动新状态
      retries = 0;
      setStatus('open');
    };
    sock.onmessage = (ev) => {
      if (gen !== generation) return;
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch { return; }
      session.receive(msg);
    };
    sock.onerror = () => { /* onclose 一定会跟着来，统一在那里处理 */ };
    sock.onclose = (ev) => {
      if (gen !== generation) return;      // 主动换场景时旧连接的关闭，忽略
      if (closedByUs) { setStatus('closed'); return; }
      const code = ev?.code || 0;
      if ([4401, 4404, 4409].includes(code)) {
        setStatus('failed', `连接被拒绝（${code}）`);
        return;
      }
      if (retries < MAX_RETRY) {
        retries += 1;
        const wait = 500 * retries;
        setStatus('connecting', `第 ${retries} 次重连…`);
        setTimeout(() => { if (gen === generation) open(gen); }, wait);
      } else {
        setStatus('failed', '连接已断开');
      }
    };
  }

  function reconnect(next = scene) {
    generation += 1;                     // 作废旧连接的一切回调
    closedByUs = true;
    try { ws?.close(1000, 'switch scene'); } catch { /* 忽略 */ }
    ws = null;
    scene = next;
    retries = 0;
    session.setScene(next);
    open(generation);
  }

  function close() {
    generation += 1;
    closedByUs = true;
    try { ws?.close(1000, 'leave world'); } catch { /* 忽略 */ }
    ws = null;
    setStatus('closed');
  }

  // session 发东西时走这条连接。连接没起来就丢掉——
  // 世界的位置帧没有"补发"的意义，攒着一起发反而会让别人看到瞬移。
  session.send = (payload) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  };

  open(generation);

  return {
    reconnect,
    close,
    status: () => status,
    detail: () => detail,
    scene: () => scene,
  };
}
