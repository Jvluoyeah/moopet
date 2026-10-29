/* 把 fix_overlap 打印的 (F, R) 换算成场景文件里的世界坐标 (x, z)
   ============================================================
   为什么需要这一步：
     fix_overlap.mjs 打印的是 **屏幕坐标 (F, R)**（"前方多少、左右多少"），
     而场景文件写的是**世界坐标** `prop(x, z)`。
     直接照着 (F,R) 改文件会改错。

   换算公式和 fix_overlap.mjs / layout_check.mjs 里那个 at() 完全一致：
     fx = -sin(yaw), fz = -cos(yaw)     前方单位向量
     rx =  cos(yaw), rz = -sin(yaw)     右方单位向量
     x = spawn.x + F*fx + R*rx
     z = spawn.z + F*fz + R*rz

   用法：node tools/fr2world.mjs <场景名> <F> <R>
         node tools/fr2world.mjs plaza 55 -614
*/

import { sceneOf } from '../src/world/scenes/index.js';

const [name, Fs, Rs] = process.argv.slice(2);
if (!name || Fs === undefined || Rs === undefined) {
  console.log('用法：node tools/fr2world.mjs <场景名> <F> <R>');
  process.exit(1);
}
const scene = sceneOf(name);
if (!scene) {
  console.log('没有这个场景：', name);
  process.exit(1);
}
const yaw = scene.camera?.yaw ?? -0.18;
const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
const rx = Math.cos(yaw), rz = -Math.sin(yaw);
const F = Number(Fs), R = Number(Rs);
const x = Math.round(scene.spawn.x + F * fx + R * rx);
const z = Math.round(scene.spawn.z + F * fz + R * rz);
console.log(`${name}  spawn=(${scene.spawn.x},${scene.spawn.z})  yaw=${yaw}`);
console.log(`  (F=${F}, R=${R})  →  prop(${x}, ${z}, …)`);
