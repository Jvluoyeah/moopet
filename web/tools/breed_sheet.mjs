/* 生成"品种形象参考图"：把 8 个品种的占位形象拼成一张联络表 PNG。
   用途：拿去给画师/出图工具当风格锚点（docs/狗形象设定与出图清单.md 里引用它）。

   用法：node tools/breed_sheet.mjs   → 写 tests/shots/50-breeds-sheet.png
*/
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { portraitSVG } from '../src/lib/breedArt.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../tests/shots');

// 与 server/app/seeds.py 的 BREEDS 保持一致（顺序也一样）
const BREEDS = [
  { code: 'samoyed', name: '萨摩耶', fur: '#F7F4EC', accent: '#D8D2C4', nose: '#2B2A28' },
  { code: 'border_collie', name: '边境牧羊犬', fur: '#25231F', accent: '#F5F2EA', nose: '#1A1917' },
  { code: 'golden', name: '金毛寻回犬', fur: '#E4C07A', accent: '#F2E0B6', nose: '#2E2A22' },
  { code: 'corgi', name: '柯基', fur: '#E8A85C', accent: '#FBF6EC', nose: '#33291F' },
  { code: 'shiba', name: '柴犬', fur: '#C9762F', accent: '#F6EFE2', nose: '#2C2620' },
  { code: 'german_shepherd', name: '德国牧羊犬', fur: '#5B4630', accent: '#2A231B', nose: '#181510' },
  { code: 'husky', name: '哈士奇', fur: '#6E7480', accent: '#F4F6F8', nose: '#242830' },
  { code: 'bichon', name: '比熊', fur: '#FBF8F2', accent: '#E9E2D6', nose: '#332E28' },
];

const cell = (b, level) => `
  <figure class="cell">
    <div class="art">${portraitSVG({ code: b.code, name: b.name, palette: b }, { level, theme: 'print' })}</div>
    <figcaption><b>${b.name}</b><span>${b.code}</span></figcaption>
    <div class="hex">${b.fur} / ${b.accent} / ${b.nose}</div>
  </figure>`;

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  :root { --paper:#f5f1e8; --ink:#111211; }
  * { box-sizing: border-box; }
  body { margin:0; padding:26px 30px 34px; background:var(--paper); color:var(--ink);
         font-family:"Noto Serif SC",serif; width:1240px; }
  h1 { font-size:26px; margin:0 0 4px; letter-spacing:-.02em; }
  .sub { font-size:13px; color:#6b6560; margin-bottom:18px; }
  .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .cell { margin:0; background:#fffdf8; border:1px solid #d8cfbc; padding:10px 10px 8px; }
  .art { height:190px; display:grid; place-items:center; }
  .art svg { width:180px; height:180px; }
  figcaption { display:flex; justify-content:space-between; align-items:baseline;
               font-size:13px; margin-top:4px; }
  figcaption span { font-family:ui-monospace,monospace; font-size:11px; color:#6b6560; }
  .hex { font-family:ui-monospace,monospace; font-size:10px; color:#8a8279; }
  .row { display:flex; gap:14px; margin-top:20px; align-items:flex-end; }
  .row .big { background:#fffdf8; border:1px solid #d8cfbc; padding:8px; }
  .row .big svg { width:320px; height:320px; }
  .note { font-size:12px; color:#6b6560; max-width:520px; line-height:1.7; }
</style></head><body>
  <h1>长夜月·机械狗 — 品种形象联络表</h1>
  <div class="sub">程序生成占位（木刻版画风）· 出图时请对齐这张的风格与比例 · 见 docs/狗形象设定与出图清单.md</div>
  <div class="grid">${BREEDS.map((b, i) => cell(b, [18, 27, 22, 15, 12, 24, 16, 8][i])).join('')}</div>
  <div class="row">
    <div class="big">${portraitSVG({ code: 'corgi', name: '柯基', palette: BREEDS[3] }, { level: 15, theme: 'print' })}</div>
    <div class="note">
      <b>看这一只就够：</b>粗墨线闭合轮廓、平涂实色、无渐变无写实毛发；<br>
      侧 3/4 坐姿、头朝右、脚底压在 200×200 画布的 y=182；<br>
      项圈颜色随等级档位变（这里是蓝色=稀有 10–19 级）。<br>
      出图时保持：同样的线宽、同样的留白、同样的脚底基线。
    </div>
  </div>
</body></html>`;

writeFileSync(resolve(OUT, '_breeds_sheet.html'), html, 'utf8');
console.log('已写出', resolve(OUT, '_breeds_sheet.html'));
