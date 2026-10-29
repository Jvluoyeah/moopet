#!/usr/bin/env node
/* 权威模拟宿主（服务端侧）
   ============================================================
   服务端（Python）跑一份**唯一的**对局模拟，客户端只发输入、收快照 ——
   这就是"服务端权威"（方案 C）的核心。

   为什么用 Node 子进程承载、而不是把引擎移植成 Python：
     引擎（fx/rules/match/simAB）是**已经验证过确定性**的 JS 代码
     （15 个单测套件压着它）。移植成 Python = 把同一套规则写第二遍，
     两份实现迟早会漂 —— 而"漂"在对战里就是两端打架。
     所以：**保持一份实现，换个进程跑它**。

   协议：stdin / stdout 各一行一个 JSON（方便 Python 那边读写）。
     收：{"cmd":"new","seed":123,"breeds":[...],"ai":false}
         {"cmd":"step","inputs":[[i0,i1],...]}   一次可推进多帧
         {"cmd":"snapshot"}                      要一份完整快照
         {"cmd":"restore","snap":{...}}          从快照恢复（回滚/重连用）
         {"cmd":"hash"}                          要指纹（对账用）
         {"cmd":"quit"}
     发：{"ok":true,...} / {"ok":false,"err":"..."}

   注意：这个进程**只管模拟**，不碰网络、不碰数据库。
   网络在 Python 那边（FastAPI + WebSocket），职责分得干净些。
*/

import { createInterface } from 'node:readline';
import {
  createState, step, hashState, snapshotState, restoreState, unitView, TICK_HZ,
} from '../src/game/simAB.js';

let st = null;

/** 每帧要广播给客户端的东西（客户端拿它渲染；不含内部字段） */
function publicFrame() {
  const m = st.match;
  return {
    tick: st.tick,
    phase: m.phase,
    round: m.round,
    wins: [...m.wins],
    timeF: m.timeF,
    banner: m.banner,
    over: st.over,
    winner: st.winner,
    units: st.units.map(unitView),
  };
}

const out = (o) => { process.stdout.write(JSON.stringify(o) + '\n'); };

function handle(msg) {
  switch (msg.cmd) {
    case 'new': {
      st = createState(msg.seed, msg.breeds || [], {
        training: Boolean(msg.training),
        ai: Boolean(msg.ai),
      });
      return { ok: true, tick: st.tick, tickHz: TICK_HZ };
    }
    case 'step': {
      if (!st) return { ok: false, err: '还没开局' };
      const inputs = msg.inputs || [];
      const frames = [];
      for (const pair of inputs) {
        step(st, pair);
        frames.push(publicFrame());
      }
      return { ok: true, frames, hash: hashState(st) };
    }
    case 'snapshot':
      if (!st) return { ok: false, err: '还没开局' };
      return { ok: true, snap: snapshotState(st), hash: hashState(st) };
    case 'restore': {
      if (!st) return { ok: false, err: '还没开局' };
      restoreState(st, msg.snap);
      return { ok: true, tick: st.tick, hash: hashState(st) };
    }
    case 'hash':
      if (!st) return { ok: false, err: '还没开局' };
      return { ok: true, hash: hashState(st) };
    case 'quit':
      process.exit(0);
      return null;
    default:
      return { ok: false, err: `不认识的命令：${msg.cmd}` };
  }
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try {
    msg = JSON.parse(t);
  } catch (e) {
    out({ ok: false, err: `JSON 解析失败：${e.message}` });
    return;
  }
  try {
    const r = handle(msg);
    if (r) out(r);
  } catch (e) {
    out({ ok: false, err: String(e && e.message || e) });
  }
});
rl.on('close', () => process.exit(0));

// 就绪信号：Python 那边等这一行再开始发命令
out({ ok: true, ready: true, tickHz: TICK_HZ });
