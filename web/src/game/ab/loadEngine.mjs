/* 移植基准（oracle）：把 abstract-brawl 的格斗引擎原样跑在 Node 里
   ============================================================
   来源：https://github.com/XzJoshZ/abstract-brawl （XzJoshZ，非商业学习交流许可）
   本目录下的 .js 是**原样拷贝**，只做这一件事：当作"参照实现"。
   为什么要留着它：把浮点引擎改写成定点确定性，唯一靠得住的做法是
   **拿原实现的逐帧结果当基准对账**——自己看着改，改完"感觉差不多"，
   那是没法验的。tests/ab_golden_test.mjs 就是干这个的。

   不要在这些文件里改逻辑。要改就改我们的移植版 src/game/rules.js。

   本文件做的事：
     1. 给 Node 造一个最小的 window/document 环境（引擎是浏览器脚本）
     2. 按 fight.html 的顺序加载那几个和"规则"有关的文件
     3. 关掉渲染与音频（引擎本来就把它们分开了）
*/

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));

/** fight.html 的加载顺序里，和"规则"有关的那几个。
 *  渲染/sprite 数据/音频/触控一律不加载：
 *    animations.js (475KB 立绘数据)、meme-art.js、meme-visuals.js、
 *    music.js、touch-input.js、ui.js、assets.js、stages.js
 */
const RULE_FILES = [
  'assets.js',        // roster 会引用里面的 ASSETS 清单（虽然我们不用它的图）
  'roster.js',
  'meme-roster.js',
  'roster-revision3.js',
  'meme-combat.js',
  'animation-player.js',
  'engine.js',
];

/**
 * 造一个最小浏览器环境并把引擎加载进去。
 * @returns {{FightGame: Function, sandbox: object}}
 */
export function loadEngine() {
  const listeners = new Map();
  const documentStub = {
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({
      getContext: () => null, width: 0, height: 0,
    }),
    querySelector: () => null,
    body: { appendChild: () => {} },
  };

  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Map,
    Set,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Error,
    isNaN,
    parseFloat,
    parseInt,
    document: documentStub,
    // 引擎里用 `window.X = ...` 挂载，也读 `window.FighterAnimation` / `window.MemeCombat`
    requestAnimationFrame: (fn) => setTimeout(() => fn(0), 0),
    cancelAnimationFrame: () => {},
    performance: { now: () => 0 },
    addEventListener: (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const f of RULE_FILES) {
    const code = readFileSync(join(HERE, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: `ab/${f}` });
  }
  if (typeof sandbox.FightGame !== 'function') {
    throw new Error('引擎没挂上 window.FightGame，加载顺序可能不对');
  }
  return { FightGame: sandbox.FightGame, sandbox };
}

/** 确定性随机源：锁步要求同一份输入得到同一份结果，Math.random 不能用。
 *  用 mulberry32，32 位整数运算，跨平台逐位一致。 */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 造一局无渲染的对战：canvas 传 null，音频空实现，随机源固定种子 */
export function makeMatch({ characters, mode = 'cpu', difficulty = 1, seed = 1 } = {}) {
  const { FightGame, sandbox } = loadEngine();
  const roster = sandbox.ROSTER || [];
  const chars = characters || [roster[0], roster[1]];
  if (chars.length < 2 || !chars[0] || !chars[1]) {
    throw new Error(`角色表取不到两只：ROSTER 长度 ${roster.length}`);
  }
  const game = new FightGame(null, chars, {
    mode, difficulty,
    random: seededRandom(seed),
    audio: { play() {} },
  });
  return { game, sandbox, roster };
}

/** 逐帧推进并记录轨迹。dt 固定 1/120（引擎自己的固定步长）。 */
export function runTicks(game, { ticks = 600, dt = 1 / 120, script = null } = {}) {
  const trace = [];
  for (let t = 0; t < ticks; t += 1) {
    if (script) script(game, t);
    game.step(dt);
    trace.push(snapshot(game, t));
  }
  return trace;
}

/** 一帧的可对账状态：只取"规则产生的量"，不含渲染字段 */
export function snapshot(game, t) {
  return {
    t,
    phase: game.phase,
    hitstop: round(game.hitstop),
    fighters: game.fighters.map((f) => ({
      id: f.id,
      maxHp: f.data.hp,
      x: round(f.x), y: round(f.y),
      vx: round(f.vx), vy: round(f.vy),
      facing: f.facing,
      hp: f.hp, energy: round(f.energy), guard: round(f.guard),
      stun: round(f.stun), combo: f.combo,
      state: f.animState,
      attack: f.attack ? f.attack.index : null,
      knocked: round(f.knocked),
    })),
    projectiles: game.projectiles.length,
  };
}

const round = (n) => (typeof n === 'number' ? Math.round(n * 1000) / 1000 : n);
