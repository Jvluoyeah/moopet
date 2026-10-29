/* 四维真的进战斗了吗 —— 直接看模拟里的数与打完的结果
   ============================================================
   growth_test.mjs 验的是"映射算得对"；这条验的是"映射**真的接进模拟了**"。
   两件事不一样：接漏一个字段（比如忘传 level、或者 rules.js 没读 cdMul），
   映射测试照样全绿，但打起来还是八个原型一个样。

   做法：同一关、同一个脚本玩家、八只品种各打一遍 —— 结果必须不同。
*/
import { LEVELS, levelOf } from '../src/game/levels.js';
import { createState, helpers, step, TICK_HZ, BTN } from '../src/game/simAB.js';
import { enemyInput } from '../src/game/pve.js';
import { SKILL_TYPES } from '../src/game/rules.js';
import { combatAt } from '../src/game/growth.js';

const { toGrid } = helpers;
const BREEDS = {
  萨摩耶: { code: 'samoyed', power: 72, agility: 58, wisdom: 60, affinity: 88 },
  边境牧羊犬: { code: 'border_collie', power: 60, agility: 82, wisdom: 95, affinity: 64 },
  金毛: { code: 'golden', power: 76, agility: 62, wisdom: 74, affinity: 86 },
  柯基: { code: 'corgi', power: 64, agility: 70, wisdom: 72, affinity: 80 },
  柴犬: { code: 'shiba', power: 58, agility: 84, wisdom: 70, affinity: 52 },
  德国牧羊犬: { code: 'german_shepherd', power: 88, agility: 66, wisdom: 84, affinity: 70 },
  哈士奇: { code: 'husky', power: 80, agility: 80, wisdom: 54, affinity: 68 },
  比熊: { code: 'bichon', power: 48, agility: 74, wisdom: 66, affinity: 92 },
};

let bad = 0;
const ok = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
  if (!cond) bad += 1;
};

/** 一只狗（带等级）打一关，返回过程 */
function play(breed, level, code = 'L1', maxSeconds = 240) {
  const lv = levelOf(code);
  const st = createState(lv.seed, [{ ...breed, level }, {}], { training: false, pve: lv });
  const maxTicks = maxSeconds * TICK_HZ;
  let t = 0;
  while (!st.over && st.pve.phase !== 'clear' && t < maxTicks) {
    const me = st.units[0];
    const foe = st.units[1];
    const inp = { mx: 0, my: 0, atk: 0, btn: 0 };
    if (st.pve.phase === 'advance') inp.mx = 1;
    else if (foe.active !== false) {
      const dist = Math.abs(toGrid(foe.x - me.x));
      const reach = (me.act && (me.act.range || me.act.reach)) || SKILL_TYPES.light.range;
      if (dist > reach * 0.8) inp.mx = toGrid(foe.x - me.x) >= 0 ? 1 : -1;
      if (dist <= reach) { inp.atk = 1; inp.btn |= BTN.ATK; }
      if (foe.flying && dist < reach * 3) inp.btn |= BTN.JUMP;
    }
    step(st, [inp, enemyInput(st, st.units[1])]);
    t += 1;
  }
  return {
    won: st.pve.phase === 'clear',
    ticks: t,
    hpLeft: st.units[0].hp / st.units[0].maxHp,
    hpMax: st.units[0].data.hp,
    speed: st.units[0].data.speed,
    power: st.units[0].data.power,
    cdMul: st.units[0].data.cdMul,
  };
}

console.log('\n[一、模拟里读到的参数：八个原型各不同]');
const rows = [];
for (const [name, b] of Object.entries(BREEDS)) {
  const r = play(b, 10);
  rows.push([name, r]);
  console.log(`  ${name.padEnd(6)} 血 ${r.hpMax}  速 ${r.speed}  伤害 ×${r.power}  冷却 ×${r.cdMul}`);
}
const uniq = (f) => new Set(rows.map(([, r]) => r[f])).size;
ok('血量在模拟里确实不同', uniq('hpMax') >= 5, `${uniq('hpMax')} 种`);
ok('速度在模拟里确实不同', uniq('speed') >= 5, `${uniq('speed')} 种`);
ok('伤害倍率确实接上了（不是恒为 1）', uniq('power') >= 5, `${uniq('power')} 种`);
ok('冷却倍率确实接上了', uniq('cdMul') >= 4, `${uniq('cdMul')} 种`);

console.log('\n[二、打完的结果：同等级不同品种应该不同]');
/* 用**战斗过程**衡量，而不是胜负 —— 这条是实测校准出来的：
   拿"低等级打难关"看品种差异，结果是 0/8（全灭）。
   原因不是属性没接上（上面四项已证），而是**等级是主门槛**：
   ±13% 的血与伤害在"能不能过"这个阶跃问题上不够翻盘。
   所以这里量的是连续量：同样都通关，**用时与承伤差多少**。 */
const times = rows.filter(([, r]) => r.won).map(([, r]) => r.ticks);
const lefts = rows.filter(([, r]) => r.won).map(([, r]) => r.hpLeft);
ok('八个原型都能通第一关（第一关就该人人能过）', times.length === rows.length,
   `${times.length}/8`);
if (times.length > 1) {
  const spread = (Math.max(...times) - Math.min(...times)) / TICK_HZ;
  ok('通关用时差得出来（同一个脚本玩家、同一关）', spread >= 2,
     `${(Math.min(...times) / TICK_HZ).toFixed(1)}s ~ ${(Math.max(...times) / TICK_HZ).toFixed(1)}s（差 ${spread.toFixed(1)}s）`);
  const hpSpread = (Math.max(...lefts) - Math.min(...lefts)) * 100;
  ok('打完剩下的血也不一样', hpSpread >= 5, `残血差 ${hpSpread.toFixed(0)} 个百分点`);
  const fastest = rows.filter(([, r]) => r.won).sort((a, b) => a[1].ticks - b[1].ticks)[0][0];
  const tankiest = rows.filter(([, r]) => r.won).sort((a, b) => b[1].hpLeft - a[1].hpLeft)[0][0];
  console.log(`   最快打完：${fastest}   打完剩血最多：${tankiest}`);
}

console.log('\n[三、升级真的会变强（同一只狗 LV.1 vs LV.12）]');
{
  const b = BREEDS.萨摩耶;
  const a = play(b, 1);
  const c = play(b, 12);
  ok('血量涨了', c.hpMax > a.hpMax, `${a.hpMax} → ${c.hpMax}`);
  ok('伤害倍率涨了', c.power > a.power, `${a.power} → ${c.power}`);
  ok('速度涨了', c.speed > a.speed, `${a.speed} → ${c.speed}`);
  console.log(`   LV.1 → LV.12：血 ${a.hpMax}→${c.hpMax}  速 ${a.speed}→${c.speed}  伤害 ×${a.power}→×${c.power}`);
}

console.log('\n[四、映射与模拟一致（别接错字段）]');
{
  const b = { ...BREEDS.德国牧羊犬, level: 10 };
  const expect = combatAt(b, 10);
  const got = play(BREEDS.德国牧羊犬, 10);
  ok('模拟里的血量 = 映射算出来的', got.hpMax === expect.hpMax,
     `${got.hpMax} vs ${expect.hpMax}`);
  ok('模拟里的速度 = 映射算出来的', got.speed === expect.speed,
     `${got.speed} vs ${expect.speed}`);
  ok('模拟里的伤害倍率 = 映射算出来的', got.power === expect.damageMul,
     `${got.power} vs ${expect.damageMul}`);
}

console.log(bad ? `\n${bad} 项不通过` : '\n四维已真正接入战斗 ✅');
process.exit(bad ? 1 : 0);
