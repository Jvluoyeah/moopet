/* 经验引擎自检：等级曲线 + applyExp 的边界
   ============================================================
   为什么单独测：等级系统原来**整块没实现** —— 经验发下来没人加、等级永远是 LV.1
   （见 src/lib/exp.js 开头的说明）。补上之后至少要保证曲线本身是自洽的：
     · 单调：经验越多等级越高
     · 连续：正好卡在阈值上升级，差一点都不升
     · 不跳级、不回退
     · 纯函数：不改传入的对象（调用方还要拿原对象做对比）
*/
import { expToNext, levelFromExp, applyExp } from '../src/lib/exp.js';

let bad = 0;
function ok(label, cond, detail = '') {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
  if (!cond) bad += 1;
}

console.log('\n[曲线本身]');
ok('LV.1→2 要 60 点（服务端一局胜利也是 60，所以"赢一局升一级"）',
   expToNext(1) === 60, String(expToNext(1)));
ok('越往后越慢', expToNext(5) > expToNext(2),
   `${expToNext(2)} → ${expToNext(5)}`);
ok('等级有上限保护（99 级封顶）', expToNext(999) === expToNext(99));

console.log('\n[累计经验 → 等级]');
ok('0 经验 = LV.1', levelFromExp(0).level === 1, JSON.stringify(levelFromExp(0)));
ok('59 经验还没升级', levelFromExp(59).level === 1, JSON.stringify(levelFromExp(59)));
ok('正好 60 = LV.2', levelFromExp(60).level === 2, JSON.stringify(levelFromExp(60)));
ok('60+79=139 还是 LV.2（LV.2→3 要 80）', levelFromExp(139).level === 2,
   JSON.stringify(levelFromExp(139)));
ok('140 = LV.3', levelFromExp(140).level === 3, JSON.stringify(levelFromExp(140)));
{
  let prev = 1;
  let mono = true;
  for (let e = 0; e <= 20000; e += 7) {
    const lv = levelFromExp(e).level;
    if (lv < prev) mono = false;
    prev = lv;
  }
  ok('单调不回退（0~20000 每 7 点采一次）', mono);
}

console.log('\n[applyExp]');
{
  const dog = { level: 1, total_exp: 0 };
  const r = applyExp(dog, 60);
  ok('一局胜利（60）从 LV.1 升到 LV.2', r.level === 2 && r.leveledUp,
     JSON.stringify(r));
  ok('累计经验记下来了', r.total_exp === 60, String(r.total_exp));
  ok('不改传入的对象（纯函数）', dog.level === 1 && dog.total_exp === 0,
     JSON.stringify(dog));
}
{
  // ⚠️ 注意喂进去的状态要自洽：`{level:1, total_exp:60}` 本身就是矛盾的
  //    （60 点经验按曲线已经是 LV.2 了），拿它测"不升级"会得到反直觉的结果 ——
  //    这是我的期望值写错了，不是引擎错。
  const r = applyExp({ level: 2, total_exp: 60 }, 20);
  ok('没到阈值就不升级', r.level === 2 && !r.leveledUp, JSON.stringify(r));
  ok('进度给出来了（差多少到下一级）', r.into === 20 && r.need === 80,
     `into=${r.into} need=${r.need}`);
}
{
  const r = applyExp({ level: 1, total_exp: 0 }, -50);
  ok('负经验当成 0（不会被扣）', r.gained === 0 && r.total_exp === 0, JSON.stringify(r));
}
{
  // 一次给一大笔（首通 460）应该能连升。按曲线算：
  //   60(→2) + 80(→3) + 100(→4) + 120(→5) = 360，余 100 < 140
  //   → LV.5，进度 100/140
  const r = applyExp({ level: 1, total_exp: 0 }, 460);
  ok('一笔大经验会连升（首通 460 → LV.5）', r.level === 5, JSON.stringify(r));
  ok('连升之后进度也对', r.into === 100 && r.need === 140,
     `into=${r.into} need=${r.need}`);
}

console.log(bad ? `\n${bad} 项不通过` : '\n经验引擎自检通过 ✅');
process.exit(bad ? 1 : 0);
