/* 场景重叠自动修正器
   ============================================================
   背景：场景位置是按"屏幕坐标" at(前方 F, 左右 R) 写的，写起来直观；
   但建筑在世界里是 **460×380 的轴对齐盒子**，而 F/R 相对世界轴转了 10°。
   于是"摆在店门口"的东西（NPC、长椅、花坛、喷泉、传送点）
   实际上落进了楼体的占位里——屏幕上看着位置对，几何上插进墙里了。

   这个脚本做一件事：把每个压在建筑占位里的小东西，沿**最短的出门方向**
   推出建筑（外扩一圈余量），再把修正后的世界坐标换回 (F, R) 打印出来。
   直接照着输出的数字改场景文件即可。

   用法：node tools/fix_overlap.mjs [scene]
   ------------------------------------------------------------
   为什么不用手改：一共三十多处重叠，人眼一个个算"往哪个方向挪多少格"，
   既慢又容易把原本调好的画面构图弄乱。让机器算最短位移，构图基本不动。
*/

import { SCENE_LIST, sceneOf } from '../src/world/scenes/index.js';

const MARGIN = 40;     // 推出后额外留的余量（格）

const at = (scene, F, R) => {
  const yaw = scene.camera?.yaw ?? -0.18;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return { x: scene.spawn.x + F * fx + R * rx, z: scene.spawn.z + F * fz + R * rz };
};
const toFR = (scene, x, z) => {
  const yaw = scene.camera?.yaw ?? -0.18;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const dx = x - scene.spawn.x, dz = z - scene.spawn.z;
  return { F: Math.round(dx * fx + dz * fz), R: Math.round(dx * rx + dz * rz) };
};

/** 和 layout_check.mjs / build.js 保持一致的地面占位 */
function footprint(kind, o) {
  switch (kind) {
    case 'block': {
      // 和 build.js / layout_check.mjs 一致：台阶只朝局部 +z 伸，占地非对称
      // 只算台基：门前的台阶只有 26 高，狗能站上去，不算障碍（见 build.js）
      return { hw: o.w / 2 + 20, hd: o.d / 2 + 20 };
    }
    case 'tree': return { hw: 90, hd: 90 };
    case 'fountain': { const r = o.r || 180; return { hw: r, hd: r }; }
    case 'stall': return { hw: (o.w || 240) / 2, hd: (o.d || 200) / 2 };
    case 'lamp': return { hw: 26, hd: 26 };
    case 'bench': return { hw: (o.w || 200) / 2, hd: (o.d || 90) / 2 };
    case 'hedge': return { hw: (o.w || 300) / 2, hd: (o.d || 90) / 2 };
    case 'planter': return { hw: (o.w || 140) / 2, hd: (o.d || 140) / 2 };
    case 'umbrella': return { hw: 130, hd: 130 };
    case 'portal': return { hw: 130, hd: 130 };
    case 'local': return { hw: 90, hd: 90 };
    case 'bush':
    case 'rock':
    case 'stump': return { hw: 100, hd: 100 };
    default: return { hw: (o.w || 200) / 2, hd: (o.d || 200) / 2 };
  }
}

const SOFT = new Set(['flowers', 'grass', 'decal', 'path']);

function fixScene(scene) {
  const blocks = (scene.blocks || []).map((b) => ({
    label: b.sign?.text || '建筑', x: b.x, z: b.z, ...footprint('block', b),
  }));

  /* ⚠️ 这里原来只把道具推出**建筑**的占地，于是"道具 vs 道具"全漏了：
       修复报告里 14 条 tree↔bench / hedge↔portal / lamp↔管理员 就是这类。
       现在把**所有实体**（建筑 + 道具 + NPC + 传送点）都当成推开的对象，
       每个东西推离**它和别人的所有重叠**。

     为什么要迭代好几轮：推开 A 可能撞上 C，再推开就得回头看 B ——
     一轮收敛不了。pass 上限给到 8，跑完再看 layout_check 复核。 */
  const moves = [];
  const push = (group, list, nameOf, kindOf, sizeOf) => {
    for (const o of list) {
      if (SOFT.has(o.kind)) continue;
      const kind = kindOf(o);
      const fp = sizeOf(o);
      let { x, z } = o;
      let moved = false;
      for (let pass = 0; pass < 8; pass += 1) {
        let hit = false;
        for (const b of blocks) {
          const dx = x - b.x, dz = z - b.z;
          const ox = (fp.hw + b.hw + MARGIN) - Math.abs(dx);
          const oz = (fp.hd + b.hd + MARGIN) - Math.abs(dz);
          if (ox <= 0 || oz <= 0) continue;
          if (ox < oz) x = b.x + Math.sign(dx || 1) * (fp.hw + b.hw + MARGIN);
          else z = b.z + Math.sign(dz || 1) * (fp.hd + b.hd + MARGIN);
          hit = true; moved = true;
        }
        for (const e of solids) {
          if (e.o === o) continue;               // 别推自己
          const dx = x - e.x, dz = z - e.z;
          const ox = (fp.hw + e.hw) - Math.abs(dx);
          const oz = (fp.hd + e.hd) - Math.abs(dz);
          if (ox <= 0 || oz <= 0) continue;
          if (ox < oz) x = e.x + Math.sign(dx || 1) * (fp.hw + e.hw);
          else z = e.z + Math.sign(dz || 1) * (fp.hd + e.hd);
          hit = true; moved = true;
        }
        if (!hit) break;
      }
      if (moved) moves.push({ group, index: list.indexOf(o), name: nameOf(o), kind, x, z, o });
    }
  };

  /* 所有实体（含建筑），供"推开别人"用。建筑已经有 blocks 了，这里补道具那一半。 */
  const solids = [];
  const collect = (list, sizeOf) => {
    for (const o of list) {
      if (SOFT.has(o.kind)) continue;
      const fp = sizeOf(o);
      solids.push({ o, x: o.x, z: o.z, hw: fp.hw, hd: fp.hd });
    }
  };

  collect(scene.props || [], (p) => footprint(p.kind, p));
  collect(scene.locals || [], (l) => footprint('local', l));
  collect(scene.portals || [], (p) => footprint('portal', p));

  push('props', scene.props || [], (p) => p.kind, (p) => p.kind === 'fountain' ? 'fountain' : p.kind,
       (p) => footprint(p.kind, p));
  push('locals', scene.locals || [], (l) => l.label || l.id, () => 'local',
       (l) => footprint('local', l));
  push('portals', scene.portals || [], (p) => `→${p.to}`, () => 'portal',
       (p) => footprint('portal', p));

  console.log(`\n=== ${scene.name}（${scene.code}） 需要挪 ${moves.length} 处 ===`);
  for (const m of moves) {
    const { F, R } = toFR(scene, m.x, m.z);
    const before = toFR(scene, m.o.x, m.o.z);
    const extra = m.kind === 'portal' ? `, r: ${m.o.r || 150}, label: '${m.o.label || ''}'`
      : (m.kind === 'npc' ? `, id: '${m.o.id}', kind: 'npc', label: '${m.o.label}'`
        : (m.kind === 'board' ? `, id: '${m.o.id}', kind: 'board', label: '${m.o.label}'` : ''));
    /* ⚠️ 输出的最后一段是**世界坐标** —— 那才是场景文件里写的那个。
       原来只打 (F,R)，而文件里是 prop(x, z)，两边坐标系不同（相机轴相对世界轴
       转了约 10°），照着 (F,R) 改文件会改错，得人工再换算一次。
       之所以两边都打：看构图用 (F,R) 直观，改文件用 (x,z) 准确。 */
    console.log(`  ${m.group}[${m.index}] ${m.name}  (F=${before.F}, R=${before.R})`
      + ` → F=${F}, R=${R}`
      + `\n      →  scene-file:  prop(${m.x}, ${m.z}${extra})`);
  }
  return moves.length;
}

const only = process.argv[2];
const list = only ? [sceneOf(only)] : SCENE_LIST.map((s) => sceneOf(s.code));
let total = 0;
for (const s of list) total += fixScene(s);
console.log(`\n共需挪动 ${total} 处`);
