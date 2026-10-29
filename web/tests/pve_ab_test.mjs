/* 剧情关卡（PvE）在新引擎上的状态机
   ============================================================
   验的是关卡的**节奏**，不是画面：

     ① 开局：对手未登场、玩家在场地左端、phase=advance
     ② 往右走到闸门 → 对手登场、phase=fight
     ③ 打赢这一波 → 进下一波（对手重置到下一道闸门之后）
     ④ 打完最后一波 → phase=clear、over、winner=0
     ⑤ 玩家倒下 → phase=fail、winner=1（不是"时间到比血量"）
     ⑥ **快照/回滚要带上 pve 状态** —— 不然联机和回放会分叉
        （这是 goal ⑥ 明确要求的：旧引擎的 hash feed 里有 wave/cleared/phase）
*/

import {
  createState, step, hashState, snapshotState, restoreState,
} from '../src/game/simAB.js';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); }
  else { failures.push(name); console.log(`  FAIL ${name}  ${detail}`); }
}

console.log('剧情关卡状态机（PvE → simAB）');

const BREEDS = [{ code: 'samoyed' }, { code: 'husky' }];
const LEVEL = {
  code: 'L1', name: '测试关', startX: 220,
  waves: [
    { gate: 300, unit: { hp: 60, profile: 'chaser' } },
    { gate: 900, unit: { hp: 80, profile: 'roller' } },
    { gate: 1500, unit: { hp: 120, boss: true, profile: 'drone', flying: true } },
  ],
};
const WALK = { mx: 1, skill: -1, btn: 0 };
const IDLE = { mx: 0, skill: -1, btn: 0 };

const game = () => createState(7, BREEDS, { pve: LEVEL });

/* ---------------- ① 开局 ---------------- */
{
  const st = game();
  check('开局建出 pve 状态', !!st.pve, JSON.stringify({
    phase: st.pve && st.pve.phase, wave: st.pve && st.pve.wave,
  }));
  check('玩家从**场地左端**出发（不是中场）', st.units[0].x === 220 * 256,
    String(st.units[0].x));
  check('第一波：对手还没登场', st.units[1].active === false);
  check('phase=advance、wave=0', st.pve.phase === 'advance' && st.pve.wave === 0,
    `${st.pve.phase}/${st.pve.wave}`);
  check('闸门位置来自关卡定义', st.pve.gateX === 300 * 256, String(st.pve.gateX));
}

/* ---------------- ② 走到闸门 → 对手登场 ---------------- */
{
  const st = game();
  let ticks = 0;
  while (st.pve.phase === 'advance' && ticks < 2000) { step(st, [WALK, IDLE]); ticks += 1; }
  check('往右走能触发对手登场（advance → fight）',
    st.pve.phase === 'fight', `phase=${st.pve.phase} ticks=${ticks}`);
  check('对手被激活了', st.units[1].active === true);
  check('玩家确实走到了闸门附近', st.units[0].x >= st.pve.gateX - 256,
    `x=${st.units[0].x} gate=${st.pve.gateX}`);
  check('对手出现在闸门更右边', st.units[1].x > st.pve.gateX,
    `foe.x=${st.units[1].x}`);
  check('登场那一刻产生了 wave 事件',
    st.events.some((e) => e.kind === 'wave') || st.fx.some((f) => f.kind === 'wave'));
}

/* ---------------- ③ 打赢一波 → 进下一波 ---------------- */
{
  const st = game();
  let t = 0;
  while (st.pve.phase === 'advance' && t < 2000) { step(st, [WALK, IDLE]); t += 1; }
  const gate0 = st.pve.gateX;
  st.units[1].hp = 0;                       // 直接判它倒下
  step(st, [IDLE, IDLE]);
  check('打赢第一波 → wave 前进到 1', st.pve.wave === 1, String(st.pve.wave));
  check('cleared 计数 +1', st.pve.cleared === 1, String(st.pve.cleared));
  check('闸门换到第二波的位置', st.pve.gateX !== gate0,
    `${gate0} → ${st.pve.gateX}`);
  check('回到 advance（要先走过去才打第二波）', st.pve.phase === 'advance',
    st.pve.phase);
  check('下一波的对手重置了（血满、未激活）',
    st.units[1].active === false && st.units[1].hp === 80,
    `active=${st.units[1].active} hp=${st.units[1].hp}`);
  check('第二波的 profile 生效', st.units[1].profile === 'roller',
    st.units[1].profile);
}

/* ---------------- ④ 打完最后一波 → clear ---------------- */
{
  const st = game();
  for (let w = 0; w < LEVEL.waves.length; w += 1) {
    let t = 0;
    while (st.pve.phase === 'advance' && t < 3000) { step(st, [WALK, IDLE]); t += 1; }
    if (w === LEVEL.waves.length - 1) {
      check('最后一波是 Boss', st.units[1].isBoss === true);
      check('飞行的对手不吃重力（drone）', st.units[1].flying === true);
    }
    st.units[1].hp = 0;
    step(st, [IDLE, IDLE]);
  }
  check('全清 → phase=clear', st.pve.phase === 'clear', st.pve.phase);
  check('全清 → over 且玩家赢', st.over === true && st.winner === 0,
    `over=${st.over} winner=${st.winner}`);
  check('cleared 等于波数', st.pve.cleared === LEVEL.waves.length,
    String(st.pve.cleared));
}

/* ---------------- ⑤ 玩家倒下 = 失败 ---------------- */
{
  const st = game();
  for (let t = 0; t < 60; t += 1) step(st, [IDLE, IDLE]);
  st.units[0].hp = 0;
  step(st, [IDLE, IDLE]);
  check('玩家倒下 → phase=fail', st.pve.phase === 'fail', st.pve.phase);
  check('玩家倒下 → over 且对手赢', st.over === true && st.winner === 1,
    `over=${st.over} winner=${st.winner}`);
}

/* ---------------- ⑥ 快照 / 哈希必须带上 pve ---------------- */
{
  const st = game();
  for (let t = 0; t < 200; t += 1) step(st, [WALK, IDLE]);
  const h1 = hashState(st);
  const snap = snapshotState(st);
  const blob = JSON.stringify(snap);

  check('快照里带上了 pve 状态', snap.pve !== undefined && snap.pve !== null,
    snap.pve ? `wave=${snap.pve.wave} phase=${snap.pve.phase}` : '缺 pve');
  check('快照能过 JSON（联机要传）', blob.length > 200, `${blob.length} 字节`);

  // 推进一段再恢复，指纹必须回到那一刻
  for (let t = 0; t < 120; t += 1) step(st, [WALK, IDLE]);
  restoreState(st, snap);
  check('恢复之后指纹和快照那一刻逐位一致', hashState(st) === h1,
    `${hashState(st)} vs ${h1}`);

  // pve 的进度变了，指纹必须跟着变（说明它进了哈希）
  const st2 = game();
  for (let t = 0; t < 200; t += 1) step(st2, [WALK, IDLE]);
  const h2 = hashState(st2);
  check('两个同种子同输入的关卡状态指纹相同', h1 === h2, `${h1} vs ${h2}`);
  st2.pve.cleared = 99;
  check('**改动 pve.cleared 会改变指纹**（说明它在哈希里）',
    hashState(st2) !== h2, `${hashState(st2)} vs ${h2}`);
  st2.pve.cleared = 0;
  st2.pve.wave = 2;
  check('**改动 pve.wave 会改变指纹**', hashState(st2) !== h2);
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('剧情关卡状态机通过 ✅');
