/* 权威模拟宿主的协议测试
   ============================================================
   验的是"服务端能不能靠这个子进程跑一份权威模拟"：
     ① 协议能通（new / step / snapshot / restore / hash）
     ② **同一个种子 + 同一串输入 → 同一个指纹**（权威的前提）
     ③ 宿主输出的帧是"公开字段"，能直接发给客户端渲染
     ④ 回滚-重放能在这个进程里用（将来做延迟补偿要用）

   直接 spawn 它、按行读写 JSON —— 和 Python 那边一模一样的用法。
*/

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const HOST = join(here, '..', 'tools', 'engine_host.mjs');

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(name); console.log(`  FAIL ${name}  ${detail}`); }
}

/** 起一个宿主，返回 send/命令 和 收到的回复队列 */
function startHost() {
  const p = spawn(process.execPath, [HOST], { stdio: ['pipe', 'pipe', 'inherit'] });
  const waiters = [];
  const lines = [];
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d.toString();
    let i = buf.indexOf('\n');
    while (i >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) {
        const msg = JSON.parse(line);
        if (waiters.length) waiters.shift()(msg); else lines.push(msg);
      }
      i = buf.indexOf('\n');
    }
  });
  const next = () => (lines.length ? Promise.resolve(lines.shift())
    : new Promise((r) => waiters.push(r)));
  return {
    /** 等宿主那行 ready（第一条命令别把它吃掉） */
    ready: () => next(),
    async send(cmd) {
      p.stdin.write(JSON.stringify(cmd) + '\n');
      return next();
    },
    kill() { p.kill(); },
  };
}

console.log('权威模拟宿主（服务端侧的引擎进程）');

const BREEDS = [{ code: 'samoyed' }, { code: 'husky' }];
function script(n, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push([{ mx: Math.floor(rnd() * 3) - 1,
                skill: rnd() < 0.25 ? Math.floor(rnd() * 6) : -1 },
              { mx: Math.floor(rnd() * 3) - 1 }]);
  }
  return out;
}

const host = startHost();
// ⚠️ 先消费掉 ready 行 —— 否则第一条命令会把它当成回复
//    （第一版就是这么错的：`new` 收到的其实是上一条命令的回复）
const ready = await host.ready();
check('宿主起来了并报了 tickHz', ready.ready === true && ready.tickHz === 128,
  JSON.stringify(ready));

{
  const r = await host.send({ cmd: 'new', seed: 12345, breeds: BREEDS });
  check('能开一局', r.ok === true, JSON.stringify(r).slice(0, 60));
}

{
  const inputs = script(300, 3);
  const r = await host.send({ cmd: 'step', inputs });
  check('能一次推进 300 帧', r.ok && r.frames.length === 300,
    `${r.frames ? r.frames.length : 0} 帧`);
  const f = r.frames[r.frames.length - 1];
  check('帧里带客户端渲染要的字段',
    f && typeof f.tick === 'number' && Array.isArray(f.units)
    && f.units.length === 2 && f.units[0].x !== undefined,
    `tick=${f && f.tick} units=${f && f.units.length}`);
  check('帧里**没有**内部字段（不该发给客户端）',
    f && f.match === undefined && f.events === undefined,
    Object.keys(f).join(','));
  globalThis.__hashA = r.hash;
}

{
  // 另起一个宿主，同样种子同样输入 → 指纹必须一样
  const h2 = startHost();
  await h2.ready();
  await h2.send({ cmd: 'new', seed: 12345, breeds: BREEDS });
  const r2 = await h2.send({ cmd: 'step', inputs: script(300, 3) });
  h2.kill();
  check('两个宿主进程 + 同种子同输入 → 同一个指纹（权威的前提）',
    r2.hash === globalThis.__hashA, `${globalThis.__hashA} vs ${r2.hash}`);
}

{
  const r = await host.send({ cmd: 'snapshot' });
  check('能取快照（回滚/重连要用）', r.ok && r.snap && r.snap.tick === 300,
    `tick=${r.snap && r.snap.tick}`);
  globalThis.__snap = r.snap;
  globalThis.__hash300 = r.hash;

  await host.send({ cmd: 'step', inputs: script(50, 9) });
  const h = await host.send({ cmd: 'hash' });
  check('推进之后指纹变了', h.hash !== globalThis.__hash300, h.hash);

  const rr = await host.send({ cmd: 'restore', snap: globalThis.__snap });
  check('能回滚到快照那一刻', rr.ok && rr.hash === globalThis.__hash300,
    `${rr.hash} vs ${globalThis.__hash300}`);
}

{
  const bad = await host.send({ cmd: '乱写的命令' });
  check('不认识的命令会报错而不是崩', bad.ok === false && typeof bad.err === 'string',
    bad.err);
}

host.kill();

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('权威模拟宿主通过 ✅');
