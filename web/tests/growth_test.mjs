/* 养成映射的自检（纯函数，不碰浏览器）
   ============================================================
   这条测试钉住目标里写明的四件事：
     ① 同等级不同品种有**可测差异**；
     ② 升级后**确实变强**；
     ③ 四维 → 战斗参数**单调**（属性↑ 收益不会回头）；
     ④ **极端数值不崩**（四维全是 1 或全是 999 也不会秒杀/打不动）。

   还顺手钉一条"别把老手感改掉"：出厂四维的中位数附近，
   四项参数应该贴着接上之前的写死值（血量 400 / 速度 260 / 伤害 ×1）。
*/
import { BASE, GROWTH, STAT_LABEL, combatAt, combatOf, growthAt, hintDelayMs,
         quizExpFor, statsAt } from '../src/game/growth.js';

let bad = 0;
function ok(label, cond, detail = '') {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
  if (!cond) bad += 1;
}

// 八个原型的出厂四维（和 server/app/seeds.py 一致）
const BREEDS = {
  萨摩耶: { power: 72, agility: 58, wisdom: 60, affinity: 88 },
  边境牧羊犬: { power: 60, agility: 82, wisdom: 95, affinity: 64 },
  金毛: { power: 76, agility: 62, wisdom: 74, affinity: 86 },
  柯基: { power: 64, agility: 70, wisdom: 72, affinity: 80 },
  柴犬: { power: 58, agility: 84, wisdom: 70, affinity: 52 },
  德国牧羊犬: { power: 88, agility: 66, wisdom: 84, affinity: 70 },
  哈士奇: { power: 80, agility: 80, wisdom: 54, affinity: 68 },
  比熊: { power: 48, agility: 74, wisdom: 66, affinity: 92 },
};

console.log('\n[① 同等级不同品种要有可测差异]');
{
  const rows = Object.entries(BREEDS).map(([name, b]) => [name, combatAt(b, 10)]);
  const hp = rows.map(([, c]) => c.hpMax);
  const sp = rows.map(([, c]) => c.speed);
  const cd = rows.map(([, c]) => c.cdMul);
  ok('血量有高有低（不是同一个数）', Math.max(...hp) - Math.min(...hp) >= 30,
     `${Math.min(...hp)} ~ ${Math.max(...hp)}`);
  ok('速度有快有慢', Math.max(...sp) - Math.min(...sp) >= 20,
     `${Math.min(...sp)} ~ ${Math.max(...sp)}`);
  ok('冷却有长有短', Math.max(...cd) - Math.min(...cd) >= 0.08,
     `${Math.min(...cd)} ~ ${Math.max(...cd)}`);
  const sorted = [...rows].sort((a, b) => b[1].hpMax - a[1].hpMax).map((r) => r[0]);
  ok('血最厚的是德牧（体力 88 全表最高）', sorted[0] === '德国牧羊犬', sorted.slice(0, 3));
  const fastest = [...rows].sort((a, b) => b[1].speed - a[1].speed)[0][0];
  ok('跑最快的是柴犬或边牧（敏捷 84/82）', ['柴犬', '边境牧羊犬'].includes(fastest), fastest);
  const smartest = [...rows].sort((a, b) => a[1].cdMul - b[1].cdMul)[0][0];
  ok('冷却最短的是边牧（智力 95）', smartest === '边境牧羊犬', smartest);
}

console.log('\n[② 升级后确实变强]');
{
  const b = BREEDS.萨摩耶;
  const l1 = combatAt(b, 1);
  const l10 = combatAt(b, 10);
  const l30 = combatAt(b, 30);
  ok('血量随等级涨', l1.hpMax < l10.hpMax && l10.hpMax < l30.hpMax,
     `${l1.hpMax} → ${l10.hpMax} → ${l30.hpMax}`);
  ok('伤害倍率随等级涨', l1.damageMul < l10.damageMul && l10.damageMul < l30.damageMul,
     `${l1.damageMul} → ${l10.damageMul} → ${l30.damageMul}`);
  ok('冷却随等级变短', l1.cdMul > l10.cdMul && l10.cdMul > l30.cdMul,
     `${l1.cdMul} → ${l10.cdMul} → ${l30.cdMul}`);
  const g = growthAt(b, 5);
  ok('能算出"这一级涨了什么"（档案卡要用）',
     g.delta.power > 0 && Object.keys(g.delta).length === 4,
     JSON.stringify(g.delta));
  ok('四维名字有一份统一的中文（不许各写各的）',
     STAT_LABEL.power === '体力' && STAT_LABEL.affinity === '亲和');
}

console.log('\n[③ 单调：属性越高，收益不会回头]');
{
  let mono = true;
  let detail = '';
  for (let v = 1; v <= 160; v += 3) {
    const c = combatOf({ power: v, agility: v, wisdom: v, affinity: v });
    const c2 = combatOf({ power: v + 3, agility: v + 3, wisdom: v + 3, affinity: v + 3 });
    if (!(c2.hpMax >= c.hpMax && c2.damageMul >= c.damageMul && c2.speed >= c.speed
          && c2.cdMul <= c.cdMul && c2.energyMul >= c.energyMul)) {
      mono = false;
      detail = `v=${v} 处回头了`;
      break;
    }
  }
  ok('血量/伤害/速度/气力 单调不降，冷却单调不增', mono, detail);
  // 单独检查：只涨一维时，只该动它管的那两项
  const a = combatOf({ power: 50, agility: 50, wisdom: 50, affinity: 50 });
  const b = combatOf({ power: 90, agility: 50, wisdom: 50, affinity: 50 });
  ok('只涨体力时，速度与冷却不动',
     b.speed === a.speed && b.cdMul === a.cdMul,
     `speed ${a.speed}→${b.speed}  cd ${a.cdMul}→${b.cdMul}`);
  ok('只涨体力时，血量与伤害都涨',
     b.hpMax > a.hpMax && b.damageMul > a.damageMul, `${a.hpMax}→${b.hpMax}`);
}

console.log('\n[④ 极端数值不崩]');
{
  const lo = combatOf({ power: 1, agility: 1, wisdom: 1, affinity: 1 });
  const hi = combatOf({ power: 999, agility: 999, wisdom: 999, affinity: 999 });
  ok('最低配也有下限（不会 0 血/不动）', lo.hpMax >= 200 && lo.speed >= 150,
     JSON.stringify(lo));
  ok('最高配也有上限（不会一击必杀）',
     hi.damageMul <= 1.6 && hi.hpMax <= BASE.hpMax * 1.6 + 1, JSON.stringify(hi));
  ok('最高配/最低配的差距在一倍以内（不是天壤之别）',
     hi.damageMul / lo.damageMul <= 3 && hi.speed / lo.speed <= 2,
     `伤害 ×${(hi.damageMul / lo.damageMul).toFixed(2)} 速度 ×${(hi.speed / lo.speed).toFixed(2)}`);
  const nan = combatOf({});
  ok('缺字段/脏数据不产生 NaN', Object.values(nan).every((v) => Number.isFinite(v)),
     JSON.stringify(nan));
}

console.log('\n[⑤ 别把老手感改掉]');
{
  // 出厂四维的中位数附近，四项参数应贴着接上之前写死的值
  const mid = combatOf({ power: 50, agility: 50, wisdom: 50, affinity: 50 });
  ok('体力 50 → 血量 = 基准 400', mid.hpMax === BASE.hpMax, String(mid.hpMax));
  ok('敏捷 50 → 速度 = 基准 260', mid.speed === BASE.speed, String(mid.speed));
  ok('体力 50 → 伤害倍率 = 1（接上之前那个恒为 1 的乘法）', mid.damageMul === 1,
     String(mid.damageMul));
  const l1 = combatAt(BREEDS.萨摩耶, 1);
  ok('出厂萨摩耶 LV.1 与基准的偏差在 ±20% 以内',
     Math.abs(l1.hpMax / BASE.hpMax - 1) < 0.2 && Math.abs(l1.speed / BASE.speed - 1) < 0.2,
     JSON.stringify(l1));
  ok('四维上限生效（160）', statsAt(BREEDS.边境牧羊犬, 999).wisdom <= GROWTH.maxStat,
     String(statsAt(BREEDS.边境牧羊犬, 999).wisdom));
}

console.log('\n[⑥ 智力 → 提示冷却]');
{
  /* 数值在用户要求"设长一点"之后整体上调过一轮
     （20s 档 → 40s 档，下限 4s → 12s）。这里钉的是**当前口径**：
     中位 26 秒、聪明的狗 14 秒以内、最笨也给得起（≤40 秒）、下限 12 秒。 */
  ok('智力 50（中位）→ 26 秒', hintDelayMs(50) === 26000, String(hintDelayMs(50)));
  ok('智力 95（边牧）等在 14 秒以内', hintDelayMs(95) <= 14000, String(hintDelayMs(95)));
  ok('智力 1（最笨）也给得起提示（≤40 秒）', hintDelayMs(1) <= 40000,
     String(hintDelayMs(1)));
  let mono = true;
  let detail = '';
  for (let w = 1; w < 200; w += 1) {
    // 智力越高，等待**不能变长**
    if (hintDelayMs(w + 1) > hintDelayMs(w)) {
      mono = false;
      detail = `智力 ${w} → ${w + 1} 处回头了：${hintDelayMs(w)} → ${hintDelayMs(w + 1)}`;
      break;
    }
  }
  ok('等待时间随智力单调不增', mono, detail);
  ok('下限守住 12 秒（再聪明也得自己先想想）', hintDelayMs(999) === 12000,
     String(hintDelayMs(999)));
  ok('提示冷却比"很快就能看"要长（用户要求设长一点：中位 ≥20 秒）',
     hintDelayMs(50) >= 20000, String(hintDelayMs(50)));
  ok('脏数据不产生 NaN', Number.isFinite(hintDelayMs(undefined))
     && Number.isFinite(hintDelayMs('abc')), String(hintDelayMs('abc')));
  // 同一只狗升级之后提示会来得更早（等级 → 智力 → 冷却，整条链）
  const lv1 = hintDelayMs(statsAt(BREEDS['边境牧羊犬'], 1).wisdom);
  const lv20 = hintDelayMs(statsAt(BREEDS['边境牧羊犬'], 20).wisdom);
  ok('边牧练到 20 级，提示来得更早', lv20 < lv1, `${lv1}ms → ${lv20}ms`);
}

console.log('\n[⑦ 答题经验：答对有、答错没有（不惩罚）]');
{
  ok('答对给经验，越难给得越多',
     quizExpFor(1) > 0 && quizExpFor(5) > quizExpFor(1),
     `难度1 ${quizExpFor(1)} → 难度5 ${quizExpFor(5)}`);
  ok('难度越界也夹在 1~5 里，不会算成 0 或爆掉',
     quizExpFor(0) === quizExpFor(1) && quizExpFor(99) === quizExpFor(5),
     `${quizExpFor(0)} / ${quizExpFor(99)}`);
}

console.log('\n[⑧ 接口给的是**嵌套** stats —— 别按平铺读]');
{
  /* 真实接口（/api/breeds、/api/dogs/{id}/card）返回的是
     `{code, name, stats:{power, agility, wisdom, affinity}}`。
     我一开始只按平铺读，档案卡上四维就全成了默认的 50 →
     31 级显示成"体力/敏捷/智力/亲和 全是 68"（用户截图指出的）。
     这条用**真实形状**钉住它。 */
  const nested = { code: 'samoyed', name: '萨摩耶',
                   stats: { power: 72, agility: 58, wisdom: 60, affinity: 88 } };
  const s = statsAt(nested, 1);
  ok('嵌套形状读得出来（不是全落到默认 50）',
     s.power === 72 && s.agility === 58 && s.wisdom === 60 && s.affinity === 88,
     JSON.stringify(s));
  ok('四项不可能完全一样（除非品种本身就一样）',
     new Set([s.power, s.agility, s.wisdom, s.affinity]).size === 4,
     JSON.stringify(s));
  const flat = statsAt({ power: 72, agility: 58, wisdom: 60, affinity: 88 }, 1);
  ok('平铺形状也照样读（老调用方别被我改坏）',
     JSON.stringify(flat) === JSON.stringify(s), JSON.stringify(flat));
  // 高等级下四项也必须保持各自的差别
  const hi = statsAt(nested, 31);
  ok('31 级时四项仍各不相同（用户看到的"全 68"就是这么来的）',
     new Set([hi.power, hi.agility, hi.wisdom, hi.affinity]).size === 4,
     JSON.stringify(hi));
}

console.log(bad ? `\n${bad} 项不通过` : '\n养成映射自检通过 ✅');
process.exit(bad ? 1 : 0);
