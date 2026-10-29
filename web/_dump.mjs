
import { sceneOf } from './src/world/scenes/index.js';
const s = sceneOf(process.argv[2]);
// 找规则模块里用的 AABB 计算：退回用 w/d + 位置
const out = [];
const push = (kind, name, x, z, w, d) => out.push({ kind, name, x, z, w: w || 0, d: d || 0 });
for (const b of (s.blocks || [])) push('block', b.label || b.kind, b.x, b.z, b.w, b.d);
for (const p of (s.props || [])) push('prop', p.kind + (p.id ? ':' + p.id : ''), p.x, p.z, p.w, p.d);
for (const p of (s.locals || [])) push('local', p.id || p.label, p.x, p.z, p.w, p.d);
for (const p of (s.portals || [])) push('portal', p.to, p.x, p.z, p.r * 2, p.r * 2);
console.log(JSON.stringify({ spawn: s.spawn, camera: s.camera, items: out }));
