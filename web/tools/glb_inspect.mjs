/* 读一个 .glb，打印把它接进场景所需的全部信息。
 *
 * 为什么需要它：外部模型接进这个世界，卡点不在"加载"（管线早就有了），
 * 而在**换算**——
 *   · instanceModel 会按包围盒把高度归一化，所以模型的绝对尺寸没意义，
 *     但它的**比例**决定它缩放后占多宽多深；
 *   · 而碰撞盒（如果它要挡路）必须写成**世界单位**，也就是
 *     "模型本地尺寸 × (TARGET_HEIGHT / 模型高度)"。
 *   这个乘法人来算是很容易错的，交给工具。
 *
 * 零依赖：GLB 容器 = 12 字节头 + JSON chunk + BIN chunk，
 * POSITION accessor 的 min/max 是 glTF 规范要求必填的，够算包围盒了。
 * （缺 min/max 的导出器会退化到直接读 BIN 里的 float32。）
 *
 * 用法：
 *   node tools/glb_inspect.mjs <文件.glb> [目标高度]
 *   node tools/glb_inspect.mjs public/models/nature/tree_default.glb 540
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('用法: node tools/glb_inspect.mjs <文件.glb> [目标高度]');
  process.exit(2);
}
const targetH = process.argv[3] ? Number(process.argv[3]) : null;

const buf = readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546C67) throw new Error('不是 glb（magic 不是 glTF）');
let off = 12;
let json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(data));
  else if (type === 0x004E4942) bin = data;
  off += 8 + len + ((4 - (len % 4)) % 4);
}
if (!json) throw new Error('glb 里没有 JSON chunk');
const g = json;

/* ---------- 4x4 矩阵（列主序，和 glTF 一致） ---------- */
const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {                       // a * b
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}
function trs(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation || [0, 0, 0];
  const q = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const xform = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

/** POSITION accessor 的 [min,max]；没有就退回去读 BIN 里的 float32。 */
function posRange(accIdx) {
  const a = g.accessors[accIdx];
  if (a.min && a.max) return [a.min, a.max];
  const bv = g.bufferViews[a.bufferView];
  const stride = bv.byteStride || 12;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < a.count; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      const v = bin.readFloatLE(base + i * stride + c * 4);
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return [min, max];
}

const out = [];
let tris = 0, meshes = 0;
const mats = new Set();

function walk(idx, parent) {
  const n = g.nodes[idx];
  const world = mul(parent, trs(n));
  if (n.mesh !== undefined) {
    const mesh = g.meshes[n.mesh];
    meshes += 1;
    for (const prim of mesh.primitives || []) {
      if (prim.indices !== undefined) tris += g.accessors[prim.indices].count / 3;
      else tris += g.accessors[prim.attributes.POSITION].count / 3;
      if (prim.material !== undefined && g.materials?.[prim.material]) {
        mats.add(g.materials[prim.material].name || `#${prim.material}`);
      }
      if (prim.attributes.POSITION === undefined) continue;
      const [mn, mx] = posRange(prim.attributes.POSITION);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let b = 0; b < 8; b += 1) {
        const p = xform(world, [b & 1 ? mx[0] : mn[0], b & 2 ? mx[1] : mn[1],
                                b & 4 ? mx[2] : mn[2]]);
        for (let c = 0; c < 3; c += 1) { if (p[c] < lo[c]) lo[c] = p[c];
                                         if (p[c] > hi[c]) hi[c] = p[c]; }
      }
      out.push({ name: n.name || mesh.name || `node${idx}`, lo, hi });
    }
  }
  for (const c of n.children || []) walk(c, world);
}

const scene = g.scenes?.[g.scene ?? 0];
for (const root of scene?.nodes || []) walk(root, I());

if (!out.length) { console.log('没有网格（空场景？）'); process.exit(0); }
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const o of out) {
  for (let c = 0; c < 3; c += 1) { if (o.lo[c] < lo[c]) lo[c] = o.lo[c];
                                   if (o.hi[c] > hi[c]) hi[c] = o.hi[c]; }
}
const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
const r2 = (v) => Math.round(v * 100) / 100;

console.log(`文件    ${file}   ${(buf.length / 1024).toFixed(1)} KB`);
console.log(`内容    节点网格 ${meshes} 个 · 三角面 ${Math.round(tris)} · 材质 ${mats.size} 个`);
console.log(`材质名  ${[...mats].join(', ') || '（无）'}`);
// 单/双面很关键：草、花这类"片状"模型很多是靠双面渲染的，
// 丢了 doubleSided 就会变成"从背后看不见"
const ds = (g.materials || []).map((m) => `${m.name || '?'}=${m.doubleSided ? '双面' : '单面'}`);
console.log(`面朝向  ${ds.join(', ') || '（无材质）'}`);
console.log(`包围盒  x[${r2(lo[0])}, ${r2(hi[0])}] y[${r2(lo[1])}, ${r2(hi[1])}]`
  + ` z[${r2(lo[2])}, ${r2(hi[2])}]  （模型本地单位）`);
console.log(`原始尺寸 ${r2(size[0])} × ${r2(size[1])} × ${r2(size[2])}`
  + `（宽 × 高 × 深）`);

console.log('\n各组件的包围盒（世界 = 模型本地，还没缩放）:');
for (const o of out) {
  console.log(`  ${o.name.padEnd(22)}`
    + ` x[${r2(o.lo[0])}, ${r2(o.hi[0])}] y[${r2(o.lo[1])}, ${r2(o.hi[1])}]`
    + ` z[${r2(o.lo[2])}, ${r2(o.hi[2])}]`);
}

if (targetH) {
  const s = targetH / (size[1] || 1);
  console.log(`\n按目标高度 ${targetH} 缩放（×${r2(s)}）后的世界尺寸：`);
  console.log(`  占地（碰撞盒用）  w = ${Math.round(size[0] * s)}   d = ${Math.round(size[2] * s)}`);
  console.log(`  高度              ${Math.round(size[1] * s)}`);
  console.log(`  脚底对齐          y = ${r2(-lo[1] * s)}（instanceModel 自动做，不用管）`);
  console.log('\n如果它要挡路，场景数据里这样写（x/z 是你摆放的位置）：');
  console.log(`  colliders: [{ x: <摆放x>, z: <摆放z>, w: ${Math.round(size[0] * s)},`
    + ` d: ${Math.round(size[2] * s)} }]`);
  console.log('  或者按 §0.3 A 登记成道具 kind，用 SOLID_PROPS 让它参与碰撞。');
} else {
  console.log('\n（想算"缩放到某个高度后占多宽多深"，把目标高度当第二个参数传进来，'
    + '例如 `… tree_default.glb 540`）');
}
