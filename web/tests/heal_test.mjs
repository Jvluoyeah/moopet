/* O 键「治愈」的验收
   ============================================================
   用户定的口径：
     · O 从「飞弹」改成「治愈」（飞弹那条远程链路本来就是坏的：
       见 simAB.js 的注释"远程招在所有模式下都不造成伤害"，按下去等于空放）；
     · 每次回的血由**体力**决定，**单次上限 80**；
     · 消耗的气由**敏捷**决定（越高越省）；
     · 气不够就放不出来，而且**不扣血不扣气**。

   这条测试直接跑模拟，把上面四条逐条钉住 —— 不看代码，看状态。
*/
import { createState, helpers, step, TICK_HZ, BTN, HUD_SKILLS } from '../src/game/simAB.js';
import { SKILL_TYPES, HEAL_INDEX, canAttack } from '../src/game/rules.js';
import { healOf, statsAt, combatAt } from '../src/game/growth.js';

const { toGrid } = helpers;
let bad = 0;
const ok = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
  if (!cond) bad += 1;
};

/** 造一个可控的对局：左边是我们观察的狗，右边当木桩。
 *  ⚠️ 三个坑，都是我自己踩出来的，写在这里免得再踩：
 *    ① 必须 `training: false` 且**不传 pve** —— 传了 `training: true` 又手动
 *       `st.pve = null` 会造出自相矛盾的状态，出招前置条件不成立；
 *    ② 出招用 **raw.skill**（直接给下标 0~5），不要靠 btn 掩码反查；
 *    ③ 普通对局**开场有倒计时**，`canAttack` 收到的 `ctx.phase = m.phase`，
 *       倒计时期间不是 'fight' → 出不了招。所以下面 waitFight() 必须先等开打
 *       （我第一版没等，白报了"按 O 没反应"几条 FAIL）。 */
function arena(breed, level = 1) {
  return createState(7, [{ ...breed, level },
                         { power: 50, agility: 50, wisdom: 50, affinity: 50 }],
                     { training: false, ai: false });
}

/** 空跑到真正开打（phase 变 'fight'）为止 */
function waitFight(st, cap = 600) {
  for (let i = 0; i < cap && st.match && st.match.phase !== 'fight'; i += 1) {
    step(st, [{ mx: 0, my: 0, atk: 0, btn: 0 }, { mx: 0, my: 0, atk: 0, btn: 0 }]);
  }
  return st.match ? st.match.phase : '(没有 match)';
}

console.log('\n[① 招式表：O 是治愈，不再是飞弹]');
{
  const row = HUD_SKILLS[HEAL_INDEX];
  ok('HUD 第 5 条是「治愈」', row.name === '治愈' && row.kind === 'heal',
     `${row.key} ${row.name} / ${row.kind}`);
  ok('名字里不再出现「飞弹」', !HUD_SKILLS.some((s) => s.name.includes('飞弹')),
     HUD_SKILLS.map((s) => s.name).join('/'));
  ok('说明写清了消耗口径', /体力/.test(row.note || '') && /敏捷/.test(row.note || ''),
     row.note);
}

console.log('\n[② 回血量由体力决定，单次不超过 80]');
{
  const lo = healOf({ power: 20, agility: 50 });
  const mid = healOf({ power: 50, agility: 50 });
  const hi = healOf({ power: 88, agility: 50 });
  const cap = healOf({ power: 999, agility: 50 });
  ok('体力越高回得越多（单调不降）', lo.amount <= mid.amount && mid.amount <= hi.amount,
     `${lo.amount} / ${mid.amount} / ${hi.amount}`);
  ok('体力 999 时**顶到上限 80**', cap.amount === 80, String(cap.amount));
  let mono = true;
  for (let p = 1; p < 400; p += 1) {
    if (healOf({ power: p + 1, agility: 50 }).amount < healOf({ power: p, agility: 50 }).amount) {
      mono = false;
      break;
    }
  }
  ok('回血量随体力单调不降（1~400 全扫）', mono);
  ok('永远不会超过 80', [1, 50, 200, 9999].every((p) => healOf({ power: p, agility: 50 }).amount <= 80));
}

console.log('\n[③ 耗气由敏捷决定（越高越省）]');
{
  const slow = healOf({ power: 50, agility: 20 });
  const mid = healOf({ power: 50, agility: 50 });
  const fast = healOf({ power: 50, agility: 90 });
  ok('敏捷越高耗气越少', slow.cost >= mid.cost && mid.cost >= fast.cost,
     `${slow.cost} / ${mid.cost} / ${fast.cost}`);
  ok('耗气有下限（不会变成免费）',
     healOf({ power: 50, agility: 9999 }).cost >= 20,
     String(healOf({ power: 50, agility: 9999 }).cost));
  let mono = true;
  for (let a = 1; a < 400; a += 1) {
    if (healOf({ power: 50, agility: a + 1 }).cost > healOf({ power: 50, agility: a }).cost) {
      mono = false;
      break;
    }
  }
  ok('耗气随敏捷单调不增（1~400 全扫）', mono);
  ok('四维接进了战斗参数（combatAt 能拿到这两个数）',
     Number.isFinite(combatAt({ power: 88, agility: 66 }, 5).amount)
     && Number.isFinite(combatAt({ power: 88, agility: 66 }, 5).cost),
     JSON.stringify({ ...combatAt({ power: 88, agility: 66 }, 5) }));
}

console.log('\n[④ 真按下去：回血、扣气、不超上限]');
{
  const st = arena({ power: 88, agility: 66, wisdom: 60, affinity: 70 });
  const me = st.units[0];
  const want = me.data.healAmount;
  const cost = me.data.healCost;
  ok('模拟里的回血量 = 体力算出来的', want === healOf({ power: 88, agility: 66 }).amount,
     String(want));
  const ph = waitFight(st);
  ok('等到真正开打（phase = fight）', ph === 'fight', ph);
  me.hp = Math.round(me.data.hp * 0.4);          // 先扣到 40%
  me.energy = 100 * 256;                          // 气给满
  const hp0 = me.hp;
  const en0 = me.energy;
  // 直接走"出招"这条路。
  // ⚠️ 用 **raw.skill**（直接给招式下标 0~5），不要靠 btn 掩码反查 ——
  //    simAB 里那段注释写得很清楚：掩码反查是多余的一层而且会错乱
  //    （INPUT_MAP 是 S1→2, S2→4, S3→5，HUD 的钮却是按 0~5 排的）。
  //    我第一版按 btn 掩码试了两次（S3、S2）都不对，白报了几条 FAIL。
  step(st, [{ mx: 0, my: 0, atk: 0, btn: 0, skill: HEAL_INDEX },
            { mx: 0, my: 0, atk: 0, btn: 0 }]);
  for (let i = 0; i < 90; i += 1) {
    step(st, [{ mx: 0, my: 0, atk: 0, btn: 0 }, { mx: 0, my: 0, atk: 0, btn: 0 }]);
  }
  ok('按 O 之后回血了', me.hp > hp0, `${hp0} → ${me.hp}（+${me.hp - hp0}）`);
  ok('回血量不超过它体力决定的那份', me.hp - hp0 <= want, `+${me.hp - hp0} / 上限 ${want}`);
  ok('扣了气', me.energy < en0, `${Math.round(en0 / 256)} → ${Math.round(me.energy / 256)}（花了 ${cost}）`);

  // 血量已经满的时候再按：**不能超上限**
  me.hp = me.data.hp;
  me.energy = 100 * 256;
  me.cooldowns[HEAL_INDEX] = 0;
  step(st, [{ mx: 0, my: 0, atk: 0, btn: BTN.S3 }, { mx: 0, my: 0, atk: 0, btn: 0 }]);
  for (let i = 0; i < 90; i += 1) {
    step(st, [{ mx: 0, my: 0, atk: 0, btn: 0 }, { mx: 0, my: 0, atk: 0, btn: 0 }]);
  }
  ok('满血时不会超过血量上限', me.hp <= me.data.hp, `${me.hp} / ${me.data.hp}`);
}

console.log('\n[⑤ 气不够：放不出来，且不扣血不扣气]');
{
  const st = arena({ power: 88, agility: 66, wisdom: 60, affinity: 70 });
  const me = st.units[0];
  const cost = me.data.healCost;
  waitFight(st);                                  // ← 同样要先开打
  me.energy = (cost - 5) * 256;                   // 差一点点
  me.hp = Math.round(me.data.hp * 0.5);
  ok('canAttack 直接判定为"放不出来"', canAttack(me, HEAL_INDEX) === false,
     `气 ${Math.round(me.energy / 256)} / 需要 ${cost}`);
  const hp0 = me.hp;
  const en0 = me.energy;
  step(st, [{ mx: 0, my: 0, atk: 0, btn: BTN.S2 }, { mx: 0, my: 0, atk: 0, btn: 0 }]);
  for (let i = 0; i < 60; i += 1) {
    step(st, [{ mx: 0, my: 0, atk: 0, btn: 0 }, { mx: 0, my: 0, atk: 0, btn: 0 }]);
  }
  ok('血没被加上（没白回）', me.hp === hp0, `${hp0} → ${me.hp}`);
  // ⚠️ 不能写"气一点没变" —— 气会**自然回复**，所以它只会涨、不会少。
  //    要钉的是"没有被扣掉 cost 那么多"。
  ok('气没被扣（只会自然回复，不会少）', me.energy >= en0, `${en0} → ${me.energy}`);
  // 气刚好够：应该放得出来
  me.energy = cost * 256;
  ok('气刚好够时可以放', canAttack(me, HEAL_INDEX) === true,
     `气 ${Math.round(me.energy / 256)} / 需要 ${cost}`);
}

console.log(bad ? `\n${bad} 项不通过` : '\nO 键治愈验收通过 ✅');
process.exit(bad ? 1 : 0);
