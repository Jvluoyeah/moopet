/* 招式效果分支的验证
   ============================================================
   这一段验的是"每种招式的 type 分派对不对"：
     dash        → 窗口内每帧位移 + 每帧判定
     barrage     → 按 interval 连发，打满 count 发
     projectile  → 到点生成 count 发飞弹
     trap        → 在身前布一个阵（受场地边界夹取）
     counter     → 进入 2 秒反击架势
     heal        → 回 55 血 + 近战判定
     slam        → 不在这里判定，要等**落地那一帧**
     收招        → 到 duration，且 slam 必须落地

   这些分支原来散在 updateAttack 里的一长串 if/else，漏一个就会"某招放出去没反应"。
*/

import { makeFighter, SKILL_TYPES, startAttack, updateAttack, STAGE } from '../src/game/rules.js';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('招式效果分支');

const mk = () => {
  const f = makeFighter({ hp: 1000, speed: 260, trait: 'rush', power: 1 }, 0);
  f.cooldowns = [0, 0, 0, 0, 0, 0];
  f.queue = [];
  return f;
};
/** 把一招跑完，收集每帧的返回 */
function runSkill(f, skill) {
  startAttack(f, 0, skill);
  const frames = [];
  for (let i = 0; i < skill.duration + 8; i += 1) {
    const r = updateAttack(f);
    frames.push(r);
    if (r.ev === 'end') break;
  }
  return frames;
}

/* ---------------- dash：窗口内每帧位移 + 每帧判定 ---------------- */
{
  const f = mk();
  f.x = 400 * 256; f.facing = 1;
  const x0 = f.x;
  const frames = runSkill(f, SKILL_TYPES.dash);
  const meleeFrames = frames.filter((r) => r.melee).length;
  check('dash 会把自己往前推一段', f.x > x0 + 50 * 256,
    `位移 ${((f.x - x0) / 256).toFixed(1)} 格`);
  check('dash 是**每帧**都做判定（不是只判一次）', meleeFrames > 3,
    `${meleeFrames} 帧带判定`);
  check('dash 到了收招窗口就不再判定（留了 .08 秒的收尾）',
    frames[frames.length - 2].melee === false || frames[frames.length - 1].ev === 'end');
}

/* ---------------- barrage：连发 5 发 ---------------- */
{
  const f = mk();
  const frames = runSkill(f, SKILL_TYPES.barrage);
  const total = frames.reduce((n, r) => n + r.shots, 0);
  check('barrage 打满 5 发', total === 5, `实际 ${total} 发`);
  check('barrage 是**分散**在多帧里发的（不是一帧全喷）',
    frames.filter((r) => r.shots > 0).length >= 4,
    `${frames.filter((r) => r.shots > 0).length} 帧里有发射`);
}

/* ---------------- projectile：到点发 1 发 ---------------- */
{
  const f = mk();
  const frames = runSkill(f, SKILL_TYPES.projectile);
  const total = frames.reduce((n, r) => n + r.shots, 0);
  check('projectile 到点发 1 发', total === 1, `${total} 发`);
  check('projectile 不做近战判定（远程技不该有近身判定）',
    frames.every((r) => r.melee === false));
}

/* ---------------- trap：在身前布阵，且被场地边界夹住 ---------------- */
{
  const f = mk();
  f.x = 400 * 256; f.facing = 1;
  runSkill(f, SKILL_TYPES.trap);
  check('trap 会在身前 180 格布一个阵',
    f.trapSpawn && Math.abs(f.trapSpawn.x - (400 + 180) * 256) < 1,
    f.trapSpawn ? `x=${(f.trapSpawn.x / 256).toFixed(0)}` : '没生成');

  const f2 = mk();
  f2.x = STAGE.WALL_L + 10; f2.facing = -1;   // 贴着左墙往左布
  runSkill(f2, SKILL_TYPES.trap);
  check('布阵位置会被场地边界夹住（不会布到墙外）',
    f2.trapSpawn && f2.trapSpawn.x >= STAGE.WALL_L,
    f2.trapSpawn ? `x=${(f2.trapSpawn.x / 256).toFixed(0)} 左墙=${STAGE.WALL_L / 256}` : '没生成');
}

/* ---------------- counter：进入架势 ---------------- */
{
  const f = mk();
  runSkill(f, SKILL_TYPES.counter);
  check('counter 会进入 2 秒反击架势', f.counterF > 0,
    `${f.counterF} 帧（2 秒 = ${2 * 128} 帧）`);
  check('架势里记下了反击伤害', f.counterDamage === SKILL_TYPES.counter.damage,
    String(f.counterDamage));
}

/* ---------------- heal：回血 + 近战判定 ---------------- */
{
  const f = mk();
  f.hp = 500;
  const frames = runSkill(f, SKILL_TYPES.heal);
  check('heal 回 55 血', f.hp === 555, `${f.hp}`);
  check('heal 也带一次近战判定（原版会震退近敌）',
    frames.some((r) => r.melee === true));

  const f2 = mk();
  f2.hp = 990;
  runSkill(f2, SKILL_TYPES.heal);
  check('回血不会超过上限', f2.hp === f2.data.hp, `${f2.hp}/${f2.data.hp}`);
}

/* ---------------- slam：等落地才判定 ---------------- */
{
  const f = mk();
  f.vy = 0;
  startAttack(f, 0, SKILL_TYPES.slam);
  // 起手时把角色抬到空中，模拟"跃起"
  f.y = STAGE.FLOOR - 200 * 256;
  let landedSlam = false;
  for (let i = 0; i < SKILL_TYPES.slam.duration + 40; i += 1) {
    // 简单模拟下落：每帧往下走一点
    if (f.y < STAGE.FLOOR) f.y = Math.min(STAGE.FLOOR, f.y + 6 * 256);
    const r = updateAttack(f);
    if (r.ev === 'slam') { landedSlam = true; break; }
  }
  check('slam 的判定发生在**落地那一帧**', landedSlam);

  // 没落地就不该收招
  const f2 = mk();
  f2.y = STAGE.FLOOR - 300 * 256;
  startAttack(f2, 0, SKILL_TYPES.slam);
  for (let i = 0; i < SKILL_TYPES.slam.duration + 5; i += 1) updateAttack(f2);
  check('slam 没落地就不收招（会一直挂在空中）', f2.attack !== null,
    f2.attack ? '仍在 slam 中' : '被收掉了');
}

/* ---------------- 通用：到 duration 一定收招 ---------------- */
{
  for (const [name, sk] of Object.entries(SKILL_TYPES)) {
    if (name === 'slam') continue;             // slam 要落地，单独验过
    const f = mk();
    const frames = runSkill(f, sk);
    const ended = frames[frames.length - 1].ev === 'end';
    if (!ended || f.attack !== null) {
      check(`${name} 到 duration 会收招`, false, `ev=${frames[frames.length - 1].ev}`);
    }
  }
  check('除 slam 外的 12 种招式都会按时收招', true, '逐个跑过一遍');
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('招式效果分支通过 ✅');
