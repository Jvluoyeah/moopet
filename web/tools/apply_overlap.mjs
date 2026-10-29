/* 把 fix_overlap 算出来的新坐标**落到场景文件里**
   ============================================================
   为什么需要一个应用器：37 处改动，人工一个个找很容易改错位
   （场景文件里同一行常常并排放两个 prop）。

   ⚠️ 这里有**两个必须同时满足的前提**，错一个就改坏文件：

   ① **坐标系**：两个文件不一样！
        plaza.js   → prop(x, z, …)   **世界坐标**（没有 at()）
        others.js  → prop(F, R, …)   相机坐标，`const prop = (F,R,o) => ({...o, ...at(F,R)})`
      往 others.js 写世界坐标会被 at() 又转一次，道具直接飞出场景
      （rug 曾落到 x=1594，而房间右墙在 1415）。所以 **others.js 要用 F/R**。

   ② **替换顺序**：必须**从后往前**改。
      第一版从头往后改，改完第一个之后后面记录的偏移量就全错位了，
      结果是"没删掉旧的、又插了新的"，产生 `prop(…),prop(…,,` 这种畸形，
      整份文件语法错误。

   用法：node tools/apply_overlap.mjs <场景名> [--dry]
*/

import fs from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
const dry = process.argv.includes('--dry');
if (!name) {
  console.log('用法：node tools/apply_overlap.mjs <场景名> [--dry]');
  process.exit(1);
}

/* 文件 + **这个文件用哪种坐标系** */
const SPEC = {
  plaza: { file: 'plaza.js', coords: 'world' },
  park: { file: 'others.js', coords: 'fr' },
  kennel: { file: 'others.js', coords: 'fr' },
  arena: { file: 'others.js', coords: 'fr' },
};
const spec = SPEC[name] || { file: `${name}.js`, coords: 'fr' };
const file = path.join(process.cwd(), 'src', 'world', 'scenes', spec.file);
let src = fs.readFileSync(file, 'utf-8');

const MOVES = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'tools', `moves-${name}.json`), 'utf-8'));

function sceneSlice() {
  if (spec.file !== 'others.js') return { start: 0, end: src.length };
  const re = /export const (\w+)\s*=\s*\{/g;
  const marks = [];
  let m;
  while ((m = re.exec(src))) marks.push({ name: m[1], start: m.index });
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].start;
    const end = i + 1 < marks.length ? marks[i + 1].start : src.length;
    if (new RegExp(`code:\\s*'${name}'`).test(src.slice(start, end))) {
      return { start, end };
    }
  }
  throw new Error(`在 ${spec.file} 里找不到 code: '${name}'`);
}

function arrayRange(scope, key) {
  const body = src.slice(scope.start, scope.end);
  const m = new RegExp(`\\.${key}\\s*=\\s*\\[`).exec(body);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  while (i < body.length && depth > 0) {
    if (body[i] === '[') depth += 1;
    else if (body[i] === ']') depth -= 1;
    i += 1;
  }
  return { start: scope.start + m.index + m[0].length, end: scope.start + i - 1 };
}

const scope = sceneSlice();
console.log(`场景 ${name} → ${spec.file}（坐标系：${spec.coords}）`);

let applied = 0;
let missed = 0;
for (const key of ['portals', 'locals', 'props']) {
  const list = MOVES.filter((m) => m.group === key);
  if (!list.length) continue;
  const r = arrayRange(scope, key);
  if (!r) { console.log(`  !! 没有 .${key} 数组`); continue; }
  let body = src.slice(r.start, r.end);

  const isPortal = key === 'portals';
  const calls = isPortal
    ? [...body.matchAll(/\bat\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g)]
    : [...body.matchAll(/\bprop\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,/g)];

  /* ⚠️ 从后往前改：改前面的会让后面的偏移量失效（第一版就是这么改坏的） */
  for (const m of [...list].sort((a, b) => b.index - a.index)) {
    const c = calls[m.index];
    if (!c) { console.log(`  !! ${key}[${m.index}] ${m.name} 没找到`); missed += 1; continue; }
    const nx = (isPortal || spec.coords === 'fr') ? m.F : m.x;
    const nz = (isPortal || spec.coords === 'fr') ? m.R : m.z;
    const newText = c[0].replace(/(-?\d+)(\s*,\s*)(-?\d+)/,
      (_, a, sep, b) => `${nx}${sep}${nz}`);
    body = body.slice(0, c.index) + newText + body.slice(c.index + c[0].length);
    applied += 1;
    console.log(`  ${key}[${m.index}] ${m.name}: ${c[0].trim()} → ` +
      (isPortal ? `at(${nx}, ${nz})` : `prop(${nx}, ${nz},`));
  }
  src = src.slice(0, r.start) + body + src.slice(r.end);
}

if (dry) {
  console.log(`\n（dry run，没写文件）会改 ${applied} 处，漏 ${missed} 处`);
} else {
  fs.writeFileSync(file, src);
  console.log(`\n已改 ${applied} 处，漏 ${missed} 处 → ${spec.file}`);
}
