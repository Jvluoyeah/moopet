/* 对战提示冷却（智力 → 抢先手）的自检。
 *
 * 这条机制横跨三种语言的三处代码，任何一处走偏都会**静默失灵**：
 *   ① 前端唯一真源：src/game/growth.js 的 duelHintMs()
 *   ② 服务端实现：server/app/api/quiz.py 的 DUEL_HINT_* 与 duel_hint_ms()
 *   ③ 对局房间：server/app/ws/quiz_routes.py 的 ROUND_MS（一回合多长）
 *
 * 所以这里**直接读那两个 .py 文件**，把常数抠出来对比 —— 不靠"我记得同步过了"。
 *
 * ⚠️ 还有一条最容易漏的不变量：
 *     提示冷却的**上限必须小于一回合的限时**。
 *     原来单人问询那套是 40 秒档，直接搬到对战里的话，
 *     一回合 12 秒根本等不到提示 —— "智力换先手"就等于没有。
 *
 * 跑法：cd w6/web && node tests/duel_hint_test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { duelHintMs } from '../src/game/growth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiPy = path.resolve(here, '../../server/app/api/quiz.py');
const wsPy = path.resolve(here, '../../server/app/ws/quiz_routes.py');

let bad = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) bad++;
}

function numFrom(src, name) {
  const m = new RegExp(`^${name}\\s*=\\s*([0-9_]+)`, 'm').exec(src);
  return m ? Number(m[1].replace(/_/g, '')) : null;
}

const apiSrc = fs.readFileSync(apiPy, 'utf8');
const wsSrc = fs.readFileSync(wsPy, 'utf8');

const BASE = numFrom(apiSrc, 'DUEL_HINT_BASE_MS');
const PER = numFrom(apiSrc, 'DUEL_HINT_PER_WISDOM_MS');
const MIN = numFrom(apiSrc, 'DUEL_HINT_MIN_MS');
const MAX = numFrom(apiSrc, 'DUEL_HINT_MAX_MS');
const ROUND = numFrom(wsSrc, 'ROUND_MS');

console.log('\n[服务端常数读得到吗]');
check('api/quiz.py 里四个常数都在', [BASE, PER, MIN, MAX].every((v) => v !== null),
  `base=${BASE} per=${PER} min=${MIN} max=${MAX}`);
check('ws/quiz_routes.py 里有回合限时', ROUND !== null, `round=${ROUND}`);

console.log('\n[前端和服务端是不是同一份数值]');
// 前端写死在函数里（9000 - w*45，夹 3000~9000），这里用几组采样值反推，
// 这样前端改了数、服务端没跟上（或反过来）都会当场红。
const samples = [[1, 8955], [30, 7650], [50, 6750], [70, 5850], [95, 4725], [140, 3000], [200, 3000]];
for (const [w, want] of samples) {
  check(`智力 ${w} → ${want} 毫秒`, duelHintMs(w) === want, duelHintMs(w));
}
check('前端公式等价于"基础 9 秒、每点 -45ms"',
  BASE === 9000 && PER === 45, `base=${BASE} per=${PER}`);
check('前端夹的上下界和服务端一致',
  duelHintMs(1) <= MAX && duelHintMs(999) === MIN,
  `min=${MIN} max=${MAX} → 低智力 ${duelHintMs(1)} / 极高智力 ${duelHintMs(999)}`);

console.log('\n[机制本身立得住吗]');
check('**提示上限 < 一回合限时**（不然提示永远等不到，机制等于没有）',
  MAX < ROUND, `提示最多 ${MAX}ms vs 一回合 ${ROUND}ms`);
check('智力越高，提示越早（单调）',
  duelHintMs(30) > duelHintMs(50) && duelHintMs(50) > duelHintMs(95)
  && duelHintMs(95) > duelHintMs(140),
  [30, 50, 95, 140].map((w) => `${w}:${duelHintMs(w)}`).join(' > '));
check('最聪明的狗也要等一会儿（不能开局就给提示）',
  MIN >= 2000, `${MIN}ms`);
check('单人问询那套（40 秒档）和对战这套**不是一份数**',
  MAX < 40000, `对战上限 ${MAX}ms`);

console.log(`\n${bad ? `失败 ${bad} 项 ✗` : '全部通过 ✓'}`);
process.exit(bad ? 1 : 0);
