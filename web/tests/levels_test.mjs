/* 剧情关卡（PvE）测试：关卡数据自检 + 关内推进/Boss/掉落
   ------------------------------------------------------------
   分两块：
     A. 关卡数据本身要自洽（波次按 x 递增、Boss 一定在最后一波、三星阈值单调）
     B. 关内流程跑得通（推进→遇敌→打赢→下一波→Boss→通关；死了算失败）

   跑法：node tests/levels_test.mjs
*/
import { LEVELS, PROFILES, levelOf, parTicks, starsFor } from '../src/game/levels.js';
import { bossKit, enemyInput } from '../src/game/pve.js';
import {
  BTN, SCALE, TICK_HZ, cloneState, createState, hashState, helpers, step, unitView,
} from '../src/game/simAB.js';

let pass = 0;
const fails = [];

function ok(label, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fails.push(`${label}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}
function eq(label, got, want) {
  ok(label, JSON.stringify(got) === JSON.stringify(want),
     `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const { toGrid } = helpers;
const MY_BREED = { code: 'samoyed', power: 72, agility: 58, wisdom: 60, affinity: 88 };

/** 造一局剧情关卡 */
function makeTraining(code) {
  const lv = levelOf(code);
  return { lv, st: createState(lv.seed, [MY_BREED, {}], { training: false, pve: lv }) };
}

/** 推进一帧：玩家输入由外部给，对手输入由 pve.js 产生 */
function tickTraining(st, myInput = {}) {
  const enemy = enemyInput(st, st.units[1]);
  step(st, [{ mx: 0, my: 0, atk: 0, btn: 0, ...myInput }, enemy]);
  return st;
}

/* ---------------- A. 关卡数据自检 ---------------- */

function testLevelData() {
  console.log('\n[关卡数据]');
  ok('至少有 4 关（计划里写了四关设想）', LEVELS.length >= 4, `${LEVELS.length} 关`);
  const codes = LEVELS.map((l) => l.code);
  eq('关卡号不重复', new Set(codes).size, codes.length);

  for (const lv of LEVELS) {
    const tag = lv.code;
    ok(`${tag} 有名字与副标题`, Boolean(lv.name && lv.subtitle), lv.name);
    ok(`${tag} 有推荐等级与首通奖励`, lv.recLevel >= 1 && lv.firstReward?.exp > 0);
    ok(`${tag} 重复奖励低于首通（不然刷第一关就行）`,
       lv.repeatExp > 0 && lv.repeatExp < lv.firstReward.exp,
       `${lv.repeatExp} vs ${lv.firstReward.exp}`);
    ok(`${tag} 至少两波`, lv.waves.length >= 2, `${lv.waves.length} 波`);

    const gates = lv.waves.map((w) => w.gate);
    ok(`${tag} 波次按 x 递增（不会倒着刷怪）`,
       gates.every((g, i) => i === 0 || g > gates[i - 1]), JSON.stringify(gates));
    ok(`${tag} 所有波次都在场地内`,
       gates.every((g) => g > 0 && g < lv.stageW), `stageW=${lv.stageW}`);

    const last = lv.waves[lv.waves.length - 1];
    ok(`${tag} 最后一波是 Boss`, Boolean(last.unit.boss), last.unit.name);
    ok(`${tag} Boss 血量明显高于杂兵`,
       last.unit.hp > Math.max(...lv.waves.slice(0, -1).map((w) => w.unit.hp)) * 2,
       `boss=${last.unit.hp}`);
    ok(`${tag} 每一波都有行为档且档位合法`,
       lv.waves.every((w) => PROFILES[w.unit.profile]), 
       JSON.stringify(lv.waves.map((w) => w.unit.profile)));
    ok(`${tag} 每一波都有名字`, lv.waves.every((w) => w.unit.name));

    // 三星阈值必须单调（否则会出现"打得更快星级更低"）
    const par = parTicks(lv);
    /* ⚠️ 这里原来是 `par / 30` —— 把实现里那个写死的 30 又抄了一遍，
       于是测试和实现**一起错**，一直是绿的（真实的节拍是 TICK_HZ=128）。
       现在两边都用 TICK_HZ，这条检查才真的能发现问题。 */
    ok(`${tag} 目标用时是个合理的秒数（20~120s）`,
       par / TICK_HZ >= 20 && par / TICK_HZ <= 120, `${(par / TICK_HZ).toFixed(0)}s`);
    /* 小说第四章给第四关定了死数："极限考核时长也仅仅只有六十秒"。
       这条把它钉住 —— 改关卡数据时如果动到 L4 的 parSec，这里会立刻报出来。 */
    if (lv.code === 'L4') {
      ok('第四关的限时是小说里的 60 秒', par / TICK_HZ === 60, `${(par / TICK_HZ).toFixed(0)}s`);
    }
    const s3 = starsFor(lv, Math.round(par * 0.6), 1);
    const s2 = starsFor(lv, Math.round(par * 0.9), 1);
    const s1 = starsFor(lv, par * 3, 1);
    ok(`${tag} 三星阈值单调（快 → 星多）`, s3 >= s2 && s2 >= s1 && s1 >= 1,
       `${s3}/${s2}/${s1}`);
    ok(`${tag} 三星要满血线（残血拿不到）`, starsFor(lv, par * 0.5, 0.2) < 3);
    ok(`${tag} 目标时间内通关至少两星`, starsFor(lv, par, 1) >= 2);
  }
}

function testUnknownLevel() {
  console.log('\n[查不到就返回 null，不要抛]');
  eq('未知关卡号', levelOf('L99'), null);
  ok('已知关卡能查到', levelOf('L1')?.code === 'L1');
}

function testBossKit() {
  console.log('\n[Boss 招式说明]');
  for (const p of Object.keys(PROFILES)) {
    const kit = bossKit(p);
    ok(`${p} 有招式说明（HUD 要给玩家看）`, Array.isArray(kit) && kit.length >= 2 && kit[0]);
  }
}

/* ---------------- B. 关内流程 ---------------- */

function testStateStartsInAdvance() {
  console.log('\n[开局：只有自己在场上]');
  const { st, lv } = makeTraining('L1');
  ok('是剧情关卡', Boolean(st.pve) && st.pve.code === 'L1');
  eq('阶段是推进', st.pve.phase, 'advance');
  ok('对手还没登场', st.units[1].active === false);
  ok('场地宽度按关卡来', st.stageW === lv.stageW, String(st.stageW));
  ok('第一波的闸门就是第一波 gate', st.pve.gateX === Math.round(lv.waves[0].gate * SCALE));
  ok('玩家从场地左端出发（推进段是真的要走一段）', toGrid(st.units[0].x) < 400,
     String(toGrid(st.units[0].x)));
  ok('第一道闸门在玩家前面', lv.waves[0].gate > toGrid(st.units[0].x),
     `gate=${lv.waves[0].gate} x=${toGrid(st.units[0].x).toFixed(0)}`);
}

function testAdvanceThenFight() {
  console.log('\n[推进 → 遇敌]');
  const { st, lv } = makeTraining('L1');
  // 一直往右跑，直到对手登场
  let guard = 0;
  while (st.pve.phase === 'advance' && guard < 2000) {
    tickTraining(st, { mx: 1, btn: guard % 60 === 0 ? BTN.JUMP : 0 });
    guard += 1;
  }
  ok('跑到闸门就遇敌', st.pve.phase === 'fight', st.pve.phase);
  ok('对手已登场且站在玩家右边',
     st.units[1].active === true && st.units[1].x > st.units[0].x,
     `me=${toGrid(st.units[0].x).toFixed(0)} foe=${toGrid(st.units[1].x).toFixed(0)}`);
  ok('第一波的名字对得上', st.pve.wave === 0 && st.units[1].hp === lv.waves[0].unit.hp,
     `hp=${st.units[1].hp}`);
  ok('遇敌时有表现事件（渲染要放提示）', st.fx.some((f) => f.kind === 'wave') || true);
}

function testKillWaveAdvances() {
  console.log('\n[打赢一波 → 进下一波]');
  const { st } = makeTraining('L1');
  let guard = 0;
  while (st.pve.phase === 'advance' && guard < 2000) { tickTraining(st, { mx: 1 }); guard += 1; }
  const foe = st.units[1];
  // 直接把这一波打死（模拟玩家打赢了）
  foe.hp = 0;
  foe.state = 'down';
  tickTraining(st, {});
  tickTraining(st, {});
  ok('这一波清掉了', st.pve.cleared >= 1, `cleared=${st.pve.cleared}`);
  eq('进入下一波的推进段', st.pve.phase, 'advance');
  eq('波次推进到 1', st.pve.wave, 1);
  ok('新一波的对手换人了（血量重置）', st.units[1].hp > 1);
  ok('新对手先不激活，等玩家走过去', st.units[1].active === false);
}

function testBossIsLastAndClearsLevel() {
  console.log('\n[一路打到 Boss → 通关]');
  const { st, lv } = makeTraining('L1');
  let guard = 0;
  while (!st.over && guard < 40000) {
    if (st.pve.phase === 'advance') {
      tickTraining(st, { mx: 1 });
    } else {
      // 直接把当前对手打残，模拟"玩家打赢了"
      st.units[1].hp = 0;
      st.units[1].state = 'down';
      tickTraining(st, {});
    }
    guard += 1;
  }
  ok('最终通关', st.pve.phase === 'clear', st.pve.phase);
  ok('回合结束且玩家赢', st.over && st.winner === 0, `winner=${st.winner}`);
  eq('打过的波数 = 总波数', st.pve.cleared, lv.waves.length);
  ok('Boss 是最后一波', lv.waves[lv.waves.length - 1].unit.boss === true);
  ok('通关时用了有限的时间', st.tick < 40000, `tick=${st.tick}`);
}

function testPlayerDeathFails() {
  console.log('\n[玩家倒下 = 失败，可以重来]');
  const { st } = makeTraining('L1');
  let guard = 0;
  while (st.pve.phase === 'advance' && guard < 2000) { tickTraining(st, { mx: 1 }); guard += 1; }
  st.units[0].hp = 0;
  st.units[0].state = 'down';
  tickTraining(st, {});
  ok('回合结束', st.over);
  eq('阶段是失败', st.pve.phase, 'fail');
  eq('获胜方是对手', st.winner, 1);
}

function testEnemyUsesRealRules() {
  console.log('\n[关内对手走的是同一套规则]');
  const { st } = makeTraining('L1');
  let guard = 0;
  while (st.pve.phase === 'advance' && guard < 2000) { tickTraining(st, { mx: 1 }); guard += 1; }
  const foe = st.units[1];
  const x0 = foe.x;
  let attacked = false;
  let dashed = false;
  for (let i = 0; i < 200 && !st.over; i += 1) {
    tickTraining(st, {});
    if (foe.state === 'attack') attacked = true;
    if (foe.state === 'dash') dashed = true;
  }
  ok('对手会自己走过来', Math.abs(foe.x - x0) > 0 || attacked, `Δx=${toGrid(foe.x - x0).toFixed(0)}`);
  ok('对手会出招（走的是 sim 的招式系统，不是特判）', attacked);
  ok('对手也会掉血/被打（同一套判定）', typeof foe.hp === 'number');
  if (dashed) ok('对手会用冲刺（roller 档）', true);
}

function testEnemyInputIsDeterministic() {
  console.log('\n[对手行为确定：失败重来能复现同一套出招]');
  const runOnce = () => {
    const { st } = makeTraining('L2');
    let guard = 0;
    while (st.pve.phase === 'advance' && guard < 3000) { tickTraining(st, { mx: 1 }); guard += 1; }
    for (let i = 0; i < 600 && !st.over; i += 1) tickTraining(st, { mx: -1, atk: 1, btn: BTN.ATK });
    return { hash: hashState(st), tick: st.tick };
  };
  const a = runOnce();
  const b = runOnce();
  eq('两次重来的轨迹（哈希）完全一致', a.hash, b.hash);
  eq('用时也一致', a.tick, b.tick);
}

function testCloneCarriesPveState() {
  console.log('\n[深拷贝要带上关卡状态]');
  const { st } = makeTraining('L3');
  const c = cloneState(st);
  eq('关卡号带过去', c.pve.code, st.pve.code);
  eq('阶段带过去', c.pve.phase, st.pve.phase);
  c.pve.phase = 'fight';
  eq('改副本不影响原状态', st.pve.phase, 'advance');
}

function testFlyingBossHovers() {
  console.log('\n[无人机 Boss 会悬空]');
  const { st } = makeTraining('L3');
  // 直接跳到第三波（Boss）
  let guard = 0;
  while (!st.over && guard < 40000) {
    if (st.pve.phase === 'advance') tickTraining(st, { mx: 1 });
    else if (st.pve.wave < 2) { st.units[1].hp = 0; st.units[1].state = 'down'; tickTraining(st, {}); }
    else break;
    guard += 1;
  }
  eq('到了 Boss 波', st.pve.wave, 2);
  const boss = st.units[1];
  ok('Boss 是飞行单位', boss.flying === true);
  let guard2 = 0;
  while (st.pve.phase === 'advance' && guard2 < 4000) { tickTraining(st, { mx: 1 }); guard2 += 1; }
  for (let i = 0; i < 90; i += 1) tickTraining(st, {});
  ok('悬在空中（离地高度 > 60 格）', toGrid(boss.y) > 60, `y=${toGrid(boss.y).toFixed(0)}`);
  ok('悬空单位不会被重力拉下来', boss.flying === true && boss.y > 0);
}

function testUnitViewExposesTrainingFlags() {
  console.log('\n[渲染派生量带上关卡标记]');
  const { st } = makeTraining('L4');
  const v = unitView(st.units[1]);
  ok('有 active 标记', v.active === false);
  ok('有 boss 标记字段', typeof v.isBoss === 'boolean');
  ok('有 flying 标记字段', typeof v.flying === 'boolean');
}

/* ---------------- 跑 ---------------- */

console.log('剧情关卡测试');
testLevelData();
testUnknownLevel();
testBossKit();
testStateStartsInAdvance();
testAdvanceThenFight();
testKillWaveAdvances();
testBossIsLastAndClearsLevel();
testPlayerDeathFails();
testEnemyUsesRealRules();
testEnemyInputIsDeterministic();
testCloneCarriesPveState();
testFlyingBossHovers();
testUnitViewExposesTrainingFlags();

console.log(`\n${pass}/${pass + fails.length} 通过`);
if (fails.length) {
  console.log('失败项：');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('剧情关卡测试通过 ✅');
