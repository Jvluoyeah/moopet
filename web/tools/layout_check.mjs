/* 场景布局检查器（Node 直接跑，不需要浏览器）
   ------------------------------------------------------------
   做开放世界时最费时间的就是"摆完了截图一看全是空地/全是糊的"。
   这个脚本把 camera.js 的投影算一遍，直接告诉你每个东西会落在画面哪儿：

     F     在出生点前方多少格（负数=在狗身后，会被透视放大成巨物）
     R     在画面左右多少格
     楼脚  物体的底面落在画面从上往下百分之几处（>100% = 在画面下方以外）
     占高  物体高度占画面高度的百分比

   用法：
     node tools/layout_check.mjs             # 检查全部场景
     node tools/layout_check.mjs plaza       # 只检查一个
   ------------------------------------------------------------
   判定线（都是我踩坑总结的）：
     · F < 0 的道具会出现在画面底部并被放大 → 出生点周围 450 内不要放东西
     · 「楼脚」在 20%~60% 之间最好看；>75% 是贴脸，<15% 只剩屋顶
     · 「占高」超过 70% 的东西在近处会糊掉半个屏幕
*/

import { SCENE_LIST, sceneOf } from '../src/world/scenes/index.js';
// 占地尺子（footprint / overlapCheck）和浏览器里的场景编辑器共用一份
import { footprint, overlapCheck } from '../src/world/footprint.js';

/* ⚠️ 真实相机参数 —— 必须和 src/world/camera.js 一致，否则量出来的取景是假的。
   2026-09 对账（`_refs/_proj.py` 用页面里 THREE 的真矩阵投影同一批建筑）：
   旧的近似公式**把物体在画面里的位置整体算低了** ——
     狗窝旅店  表 楼脚50 / 顶+11   实际 40.3 / -6.1
     训练场    表 楼脚43 / 顶 +3   实际 34.1 / -15.7
   于是"把远景楼压低后顶%转正"是拿错尺子得到的假结论：主街四栋的屋顶
   其实全被上边缘锯掉（像素复核：画布顶行只有 4% 是天空色）。
   现在直接用相机的位置/朝向/fov 做真投影，不再用"地面距离 + 经验公式"。 */
const FOV = 35 * Math.PI / 180;
const ASPECT = 1.5385;        // 实测 camera3.aspect（画布 874x606 时）
const LEAD_FRAC = 0.28;       // WorldCamera.leadFrac
const LOOK_HEIGHT = 70;       // WorldCamera.lookHeight

function project(scene, wx, wz, cam, wy = 0) {
  const pitch = cam.pitch, yaw = cam.yaw, dist = cam.dist;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);      // 屏幕上方 = 世界方向
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);       // 屏幕右方

  const dx = wx - scene.spawn.x, dz = wz - scene.spawn.z;
  const F = dx * fx + dz * fz;                          // 前方（格）
  const R = dx * rx + dz * rz;                          // 右方（格）

  // 视线目标在出生点前方 lead 格、高度 lookHeight；相机从目标沿视线退回 dist。
  // 见 camera.js:61-67，逐字对应（复算出的相机位置和渲染器给的完全相同）。
  const lead = dist * cp * LEAD_FRAC;
  const tx = scene.spawn.x + fx * lead, tz = scene.spawn.z + fz * lead;
  const cx = tx - fx * cp * dist, cz = tz - fz * cp * dist, cy = sp * dist;
  const fy = (LOOK_HEIGHT - cy) / dist;                 // forward.y
  const upx = Math.sin(yaw) * fy, upy = cp, upz = Math.cos(yaw) * fy;

  const px = wx - cx, py = wy - cy, pz = wz - cz;
  const zv = px * fx * cp + py * fy + pz * fz * cp;     // 沿视线的深度
  const tanHalf = Math.tan(FOV / 2);
  if (zv <= 1) {                                        // 在相机后面
    return { F, R, d: zv, basePct: 200, unitPct: 0, halfW: 1 };
  }
  const yv = px * upx + py * upy + pz * upz;
  return { F, R, d: zv,
           basePct: (1 - yv / (zv * tanHalf)) / 2 * 100,
           unitPct: 50 / (zv * tanHalf),                // 每格高度占画面高的百分比
           halfW: tanHalf * ASPECT * zv };              // 该深度处的画面半宽
}

function checkScene(scene) {
  const cam = { pitch: 0.95, yaw: -0.18, leadFrac: 0.28, ...(scene.camera || {}) };
  // 允许临时换 dist 试取景：`node tools/layout_check.mjs plaza --dist=2400`。
  // dist 只有 900~3000（camera.js 的 minDist/maxDist），pitch 有 45~60° 的验收
  // 约束，所以"楼太大"这种问题通常只能靠 dist 解决。
  const distArg = process.argv.find((a) => a.startsWith('--dist='));
  if (distArg) cam.dist = Number(distArg.slice(7));
  const rows = [];
  const warn = [];

  /**
   * @param depth 物体沿视线方向的进深。**楼脚按最靠近相机的那个面算**——
   *   一栋 420 深的房子摆在 F=170，它的近墙其实落在 F=-40，也就是玩家脚边，
   *   屏幕上就是一堵墙。这是这个检查器最早漏掉、也最容易骗人的一点。
   */
  const push = (kind, label, x, z, hgt, halfWWorld, depth = 0) => {
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const near = project(scene, x - fx * depth / 2, z - fz * depth / 2, cam);
    const mid = project(scene, x, z, cam);
    // 屋顶要**投影真实顶点**（楼中心正上方 hgt 处）。之前用"近墙深度 × 每格
    // 百分比"推，等于把屋顶算在比它实际更近的位置，于是整体偏高（狗窝旅店
    // 算成 顶 -16%，实际 -6%）。楼脚仍然按近墙算——那是它真正贴地的地方。
    const topPt = project(scene, x, z, cam, hgt);
    const top = topPt.basePct;
    const hPct = near.basePct - topPt.basePct;
    const widthPct = (halfWWorld * 2) / (mid.halfW * 2) * 100;
    rows.push({ kind, label, F: Math.round(mid.F), Fnear: Math.round(near.F),
                R: Math.round(mid.R),
                base: Math.round(near.basePct), top: Math.round(top),
                hPct: Math.round(hPct), wPct: Math.round(widthPct) });
    if (kind === '狗') return;
    if (near.F > 0 && near.F < 130) {
      warn.push(`  ! ${label} 的近墙只在狗身前 ${Math.round(near.F)} 格（楼脚落画面 ${Math.round(near.basePct)}%），`
        + '基本等于贴脸，往远挪');
    }
    if (mid.F < 0 && near.basePct < 110) {
      warn.push(`  ! ${label} 在狗身后 ${Math.round(-mid.F)} 格，会被透视放大成画面底部的巨物`);
    }
    if (near.basePct < 14 && hgt > 0) {
      warn.push(`  ! ${label} 楼脚在画面 ${Math.round(near.basePct)}%（几乎只剩屋顶）`);
    }
    if (Math.abs(mid.R) - halfWWorld > mid.halfW) {
      warn.push(`  · ${label} 完全在画面外（R=${Math.round(mid.R)}，画面半宽 ${Math.round(mid.halfW)}），走过去才看得到`);
    }
  };

  for (const b of scene.blocks || []) {
    push('房', b.sign?.text || '建筑', b.x, b.z, b.h + (b.roofH || 0) + 120, b.w / 2, b.d);
  }
  // 参照物：狗本体（DOG_SCALE 之后的显示高度 135），用来判断主角在画面上够不够大
  push('狗', '玩家', scene.spawn.x, scene.spawn.z, 135, 65);
  for (const p of scene.props || []) {
    const hgt = { tree: 720, lamp: 700, fountain: 400, stall: 300, hedge: 170,
                  planter: 220, bench: 275, umbrella: 500 }[p.kind] || 150;
    const wide = p.kind === 'tree' ? 380
      : (p.w || (p.kind === 'fountain' ? (p.r || 180) * 2 : 200));
    push('景', p.kind, p.x, p.z, hgt, wide / 2,
         p.d || (p.kind === 'fountain' ? (p.r || 180) * 2 : 160));
  }

  console.log(`\n=== ${scene.name}（${scene.code}）  spawn=(${scene.spawn.x},${scene.spawn.z})  `
    + `dist=${cam.dist} yaw=${cam.yaw.toFixed(2)} pitch=${cam.pitch.toFixed(2)} ===`);
  console.log('  类型  名称          F  近墙F      R   楼脚%  顶%  占高%  占宽%');
  for (const r of rows) {
    const nm = r.label.padEnd(10, ' ');
    console.log(`  ${r.kind}   ${nm} ${String(r.F).padStart(4)} ${String(r.Fnear).padStart(5)}`
      + `  ${String(r.R).padStart(5)}   ${String(r.base).padStart(4)}  ${String(r.top).padStart(4)}`
      + `   ${String(r.hPct).padStart(4)}   ${String(r.wPct).padStart(4)}`);
  }

  // ---- 平面重叠检查 ----
  // 上面那些判据只看"投影到屏幕上好不好看"，管不了"两块几何体插在一起"。
  // 用户看到的"公园那块飞盘场牌子插进墙里""告示牌压在狗身上"就是这么漏掉的：
  // 它们在屏幕上位置都对，只是跟别的东西几何上撞了。
  const warn2 = overlapCheck(scene);

  if (warn.length || warn2.length) {
    console.log('  ---- 提醒 ----');
    for (const w of warn) console.log(w);
    for (const w of warn2) console.log(w);
  }
  return warn.length + warn2.length;
}

/** 每种东西在地面上的占地（半宽/半深）。数字要和 build.js 里画出来的一致，
 *  不然检查器会放过真问题、或者报一堆假问题。 */


const only = process.argv[2];
const list = only ? [sceneOf(only)] : SCENE_LIST.map((s) => sceneOf(s.code));
let total = 0;
for (const s of list) total += checkScene(s);
console.log(`\n共 ${total} 条提醒`);
