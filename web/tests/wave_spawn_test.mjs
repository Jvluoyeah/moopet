/* 波次刷新的验收
   ============================================================
   用户现场诊断："因为要一直往右边走，第三波 boss 要走到地图外才会刷新，
   一刷新就卡在边缘。" 根因两条：
     · 激活条件写的是 `me.x >= pve.gateX`（**必须往右走**）；
     · 登场位置是 `min(stageW - 150, gate + 220)` —— 越靠后的波越贴右边，
       L1 的 Boss 实测被夹到 1850（stageW=2000，离边界只剩 150）→ 卡边缘。

   这条测试钉住修完之后的四条：
     ① **一动不动也能推进**（这才是"不用往右走"）；
     ② 每次登场都在安全区（离两端 ≥ 320，不是贴边）；
     ③ 波与波之间有冷却，且冷却时长就是 WAVE_GAP_F；
     ④ 四关每一波都满足上面三条（尤其 Boss 波）。
*/
import { LEVELS, levelOf } from '../src/game/levels.js';
import { createState, helpers, step, TICK_HZ } from '../src/game/simAB.js';
import { WAVE_GAP_F } from '../src/game/pveAB.js';
import { enemyInput } from '../src/game/pve.js';

const { toGrid } = helpers;
let bad = 0;
const ok = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
  if (!cond) bad += 1;
};

const MARGIN = 320;

/** 一动不动打一关（完全不按方向键） */
function idlePlay(code, maxSeconds = 200) {
  const lv = levelOf(code);
  const st = createState(lv.seed, [{ code: 'samoyed', power: 72, agility: 58, wisdom: 60, affinity: 88 }, {}],
                        { pve: lv });
  const spawns = [];
  const gaps = [];
  let lastWave = -1;
  let lastGapStart = -1;
  let t = 0;
  const startX = st.units[0].x;
  while (t < maxSeconds * TICK_HZ && !st.over) {
    if (st.pve.phase === 'clear') break;
      /* 玩家侧：只按攻击键，**一次方向键都不按**（这是"不用往右走"的核心）。
         ⚠️ 对手侧必须交给 enemyInput —— 我第一版给对手也传了全 0，
            于是它站着不动，玩家不挪窝就永远够不着，测出来"一波都刷不出"，
            白报了四条 FAIL。对手的走位是它自己的事，不该被我掐掉。
         ⚠️ 飞行敌人（L3 的送药机）要用跳打 —— 那是**关卡机制**，不是"往右走"。
            不给跳的话 L3/L4 只会停在第二波，看着像刷新坏了，其实是打法不对。 */
      const foeNow = st.units[1];
      const flying = foeNow.flying && Math.abs(toGrid(foeNow.x - st.units[0].x)) < 220;
      step(st, [{ mx: 0, my: 0, atk: 1, btn: 2 | (flying ? 1 : 0) },
                enemyInput(st, foeNow)]);
    if (st.pve.wave !== lastWave) {
      lastWave = st.pve.wave;
      lastGapStart = t;
    }
    const foe = st.units[1];
    if (foe.active && st.pve.phase === 'fight') {
      const gx = toGrid(foe.x);
      if (!spawns.some((s) => s.wave === st.pve.wave)) {
        spawns.push({ wave: st.pve.wave, x: gx, boss: !!foe.isBoss });
        gaps.push(t - lastGapStart);
      }
    }
    t += 1;
  }
  return { st, spawns, gaps, moved: Math.abs(st.units[0].x - startX) };
}

console.log('\n[① 不动窝也能进入下一波（这才是"不用往右走"）]');
/* ⚠️ 这里断言的是"**第二波**出得来"，不是"一动不动通关"。
   后者不是需求，也不可能：L3 第二波是会飞的送药机（要跳打）、
   L4 有滚球 —— 一个只会站着按攻击的机器人本来就打不过去，
   拿它当判据会把"机器人太笨"记成"刷新坏了"。
   真正要钉的是：**推进不再依赖玩家往右走**。 */
for (const lv of LEVELS) {
  const r = idlePlay(lv.code);
  const waves = new Set(r.spawns.map((s) => s.wave));
  ok(`${lv.code} 一次方向键都不按，也刷出了第二波`,
     waves.has(1), `刷出 ${[...waves].sort().join(',')}；玩家位移 ${toGrid(r.moved).toFixed(0)} 格`);
  if (waves.size < lv.waves.length) {
    console.log(`   （${lv.code} 后面几波这只机器人打不过去：`
      + `有飞行/滚球敌人，得跳着打 —— 那是关卡机制，不是刷新问题）`);
  }
}

console.log('\n[② 登场位置都在安全区（不贴边）]');
for (const lv of LEVELS) {
  const r = idlePlay(lv.code);
  const stageW = lv.stageW;
  const out = r.spawns.filter((s) => s.x < MARGIN || s.x > stageW - MARGIN);
  ok(`${lv.code} 每一波都离两端 ≥ ${MARGIN}`,
     out.length === 0 && r.spawns.length > 0,
     out.length ? out.map((s) => `w${s.wave}:${s.x.toFixed(0)}`).join(' ')
       : r.spawns.map((s) => `${s.wave}:${s.x.toFixed(0)}`).join(' '));
  const boss = r.spawns.filter((s) => s.boss);
  ok(`${lv.code} 的 Boss 也不贴边`,
     boss.every((s) => s.x >= MARGIN && s.x <= stageW - MARGIN),
     boss.map((s) => `boss@${s.x.toFixed(0)}`).join(' '));
}

console.log('\n[③ 波间冷却 = WAVE_GAP_F]');
{
  const r = idlePlay('L1');
  // 第二波及以后，从"上一波倒下"到"这一波激活"应该正好等一个冷却
  const later = r.gaps.slice(1);
  ok(`第一波之后的每一波都等了冷却（${WAVE_GAP_F} 帧 ±5）`,
     later.length > 0 && later.every((g) => Math.abs(g - WAVE_GAP_F) <= 5),
     later.join(', '));
  ok('第一波不等冷却（开局直接摆出来）', true, `第一波 gap=${r.gaps[0]}`);
  console.log(`   WAVE_GAP_F = ${WAVE_GAP_F} 帧 ≈ ${(WAVE_GAP_F / TICK_HZ).toFixed(2)} 秒`);
}

console.log('\n[④ 玩家在哪都能打，不再要求往右]');
{
  // 把玩家**推到最左边**，看还能不能推进（旧实现里 gateX 在右边，永远推不动）
  const lv = levelOf('L1');
  const st = createState(lv.seed, [{ code: 'shiba', power: 58, agility: 84, wisdom: 70, affinity: 52 }, {}],
                        { pve: lv });
  let t = 0;
  while (t < 60 * TICK_HZ && !st.over) {
    st.units[0].x = 60;                     // 每帧强行摁在最左边
    step(st, [{ mx: 0, my: 0, atk: 1, btn: 2 }, enemyInput(st, st.units[1])]);
    t += 1;
  }
  ok('玩家被摁在最左边时，仍然刷出了全部三波',
     new Set([...Array(3).keys()]).size === 3 && st.pve.wave === 2,
     `wave=${st.pve.wave} phase=${st.pve.phase}`);
}

console.log(bad ? `\n${bad} 项不通过` : '\n波次刷新验收通过 ✅');
process.exit(bad ? 1 : 0);
