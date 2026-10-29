/* 品种形象包的"可渲染性"测试（Node 直接跑）
   ============================================================
   为什么需要它：形象是**分层 SVG**，要同时用在两处——
     * DOM 内联（图鉴卡、档案页）→ 浏览器按 HTML 解析，很宽容
     * <img> / WebGL 纹理（三维场景里的立牌）→ 必须**合法 XML**，否则直接加载失败
   历史上就栽在这上面：collar 图层把 stroke-width 写了两次，
   内联看着一切都好，三维世界里的狗却全是隐形的。

   这份测试专抓那一类问题（重复属性、CSS 变量、标签不配对…）。
   跑法：cd w6/web && node tests/art_test.mjs
   */

import { portraitSVG, portraitDataURI, BREED_TRAITS, THEMES, tierOf, LEVEL_TIERS }
  from '../src/lib/breedArt.js';

let passed = 0;
const failures = [];
function check(label, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ok   ${label}`); }
  else { failures.push(`${label} ${detail}`); console.log(`  FAIL ${label}  ${detail}`); }
}

const BREEDS = [
  { code: 'samoyed', name: '萨摩耶', palette: { fur: '#F7F4EC', accent: '#D8D2C4', nose: '#2B2A28' } },
  { code: 'border_collie', name: '边境牧羊犬', palette: { fur: '#25231F', accent: '#F5F2EA', nose: '#1A1917' } },
  { code: 'golden', name: '金毛寻回犬', palette: { fur: '#E4C07A', accent: '#F2E0B6', nose: '#2E2A22' } },
  { code: 'corgi', name: '柯基', palette: { fur: '#E8A85C', accent: '#FBF6EC', nose: '#33291F' } },
  { code: 'shiba', name: '柴犬', palette: { fur: '#C9762F', accent: '#F6EFE2', nose: '#2C2620' } },
  { code: 'german_shepherd', name: '德国牧羊犬', palette: { fur: '#5B4630', accent: '#2A231B', nose: '#181510' } },
  { code: 'husky', name: '哈士奇', palette: { fur: '#6E7480', accent: '#F4F6F8', nose: '#242830' } },
  { code: 'bichon', name: '比熊', palette: { fur: '#FBF8F2', accent: '#E9E2D6', nose: '#332E28' } },
];

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=/g;

/** 找出所有元素里重复出现的属性名（这正是当年那个 bug） */
function duplicateAttributes(svg) {
  const bad = [];
  const tagRe = /<([a-zA-Z][\w:-]*)((?:"[^"]*"|[^>"])*?)\/?>/g;
  let m;
  while ((m = tagRe.exec(svg))) {
    const tag = m[1];
    const attrs = [...m[2].matchAll(ATTR_RE)].map((x) => x[1]);
    const seen = new Set();
    for (const a of attrs) {
      if (seen.has(a)) bad.push(`<${tag}> 里 ${a} 出现了两次`);
      seen.add(a);
    }
  }
  return bad;
}

/** 极简 XML 良构检查：标签必须正确闭合（SVG 里没有 CDATA/注释，够用） */
function unbalancedTags(svg) {
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(svg))) {
    const closing = m[1] === '/';
    const name = m[2];
    const selfClosing = m[4] === '/';
    if (closing) {
      const top = stack.pop();
      if (top !== name) return [`</${name}> 与 <${top}> 不匹配`];
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  return stack.length ? [`未闭合：${stack.join(', ')}`] : [];
}

console.log('品种形象包可渲染性测试');

/* ---------------- 1. 每个品种的 SVG 都必须是合法 XML ---------------- */
{
  let dupTotal = 0, unbalTotal = 0, noXmlns = 0;
  for (const b of BREEDS) {
    const svg = portraitSVG(b, { level: 12, theme: 'day' });
    const dup = duplicateAttributes(svg);
    const unbal = unbalancedTags(svg);
    dupTotal += dup.length;
    unbalTotal += unbal.length;
    if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) noXmlns += 1;
    if (dup.length || unbal.length) {
      check(`${b.name} 的 SVG 良构`, false, [...dup, ...unbal].join('; '));
    }
  }
  check('八个品种都没有重复属性（曾因此导致 <img> 加载失败）', dupTotal === 0,
        `${dupTotal} 处`);
  check('八个品种标签都配对', unbalTotal === 0, `${unbalTotal} 处`);
  check('八个品种都带 xmlns（<img> 加载的前提）', noXmlns === 0);
}

/* ---------------- 2. 不能依赖 CSS 变量 ---------------- */
{
  // Canvas / WebGL 里的 SVG 是独立文档，var(--x) 解析不了
  let bad = [];
  for (const b of BREEDS) {
    const svg = portraitSVG(b, { level: 1, theme: 'day' });
    if (/var\(--/.test(svg)) bad.push(b.code);
  }
  check('SVG 里没有 CSS 变量（画布里解析不了）', bad.length === 0, bad.join(','));

  for (const themeName of Object.keys(THEMES)) {
    const svg = portraitSVG(BREEDS[0], { level: 1, theme: themeName });
    check(`主题 ${themeName} 也产出具体色值`, !/var\(--/.test(svg));
  }
}

/* ---------------- 3. 分层结构完整（真实插画要按图层替换） ---------------- */
{
  const need = ['layer-shadow', 'layer-tail', 'layer-legs', 'layer-body',
                'layer-head', 'layer-ears', 'layer-collar'];
  const svg = portraitSVG(BREEDS[0], { level: 3, theme: 'day' });
  const missing = need.filter((id) => !svg.includes(`id="${id}"`));
  check('必备图层齐全（替换插画时按同名图层）', missing.length === 0, missing.join(','));
}

/* ---------------- 4. 等级档位只改项圈颜色 ---------------- */
{
  const colors = LEVEL_TIERS.map((t) => t.hex);
  let ok = true, seen = new Set();
  for (const lv of [1, 12, 22, 35]) {
    const svg = portraitSVG(BREEDS[0], { level: lv, theme: 'day' });
    const tier = tierOf(lv);
    if (!svg.includes(tier.hex)) ok = false;
    seen.add(tier.hex);
  }
  check('不同等级用不同档位颜色', ok && seen.size >= 3, `用到 ${seen.size} 种`);
  check('档位色都在预设表里', [...seen].every((c) => colors.includes(c)));
}

/* ---------------- 5. 品种差异真的体现在形状上 ---------------- */
{
  const shapes = new Set();
  for (const b of BREEDS) {
    const svg = portraitSVG(b, { level: 5, theme: 'day' });
    // 用 body 路径 + 耳型片段做指纹
    const body = (svg.match(/id="layer-body"><path d="([^"]+)"/) || [])[1] || '';
    const ears = (svg.match(/id="layer-ears">([\s\S]*?)<\/g>/) || [])[1] || '';
    shapes.add(`${body.slice(0, 40)}|${ears.slice(0, 60)}`);
  }
  check('八个品种的形状不全一样', shapes.size >= 4, `只有 ${shapes.size} 种不同形状`);
  check('品种都有耳型/尾型配置',
        BREEDS.every((b) => BREED_TRAITS[b.code]), '有品种缺 traits');
}

/* ---------------- 6. data URI 可用 ---------------- */
{
  const uri = portraitDataURI(BREEDS[0], { level: 8, theme: 'day' });
  check('data URI 前缀正确', uri.startsWith('data:image/svg+xml;charset=utf-8,'));
  check('data URI 里没有裸的 # （必须编码）', !uri.slice(30).includes('#'));
  const decoded = decodeURIComponent(uri.split(',').slice(1).join(','));
  check('解码后仍是完整 SVG', decoded.startsWith('<svg') && decoded.endsWith('</svg>'));
  check('解码后依然没有重复属性', duplicateAttributes(decoded).length === 0);
}

/* ---------------- 7. 特殊字符不会被写坏 ---------------- */
{
  const weird = { code: 'x', name: '狗 "引号" & <尖括号>', palette: {} };
  const svg = portraitSVG(weird, { level: 1, theme: 'day' });
  check('品种名里的特殊字符被转义', !/aria-label="[^"]*<[^"]*"/.test(svg),
        svg.slice(0, 90));
  check('特殊字符版也良构',
        duplicateAttributes(svg).length === 0 && unbalancedTags(svg).length === 0);
}

/* ---------------- 8. 极端等级不炸 ---------------- */
{
  let ok = true;
  for (const lv of [0, 1, 9, 10, 19, 20, 29, 30, 100, 999]) {
    const svg = portraitSVG(BREEDS[3], { level: lv, theme: 'night' });
    if (duplicateAttributes(svg).length || unbalancedTags(svg).length) ok = false;
  }
  check('极端等级值也产出良构 SVG', ok);
}

/* ---------------- 9. 真实形象资源（breedAssets） ----------------
   真图能不能加载只能在浏览器里验（Node 没有 Image），
   所以在 Node 里只测这条契约：**没有 DOM 时不炸、并干净地退回 SVG**。
   浏览器端的验证在 e2e_smoke / e2e_pvp 里（断言贴图真的换成了 PNG）。 */
{
  const mod = await import('../src/lib/breedAssets.js');
  const r = await mod.preloadBreedArt();
  check('没有 DOM 时预载不抛错（Node 里应当安全退出）',
        r && typeof r.loaded === 'number' && Array.isArray(r.failed));
  check('没有 DOM 时标记为已就绪，避免调用方一直等', mod.artReady() === true);
  check('没有图时 breedImage 返回 null（调用方据此退回 SVG）',
        mod.breedImage('samoyed', 'sit') === null);
  const asset = mod.formAsset('corgi', { form: 'sit', level: 12, theme: 'print' });
  check('formAsset 在没图时给出 SVG 回退',
        asset.kind === 'svg' && /^<svg/.test(asset.svg || ''));
  check('四个形态的名字是固定的四个', mod.FORMS.join(',') === 'sit,face,paw,lie');
  mod._resetBreedArt();
}

console.log(`\n${passed}/${passed + failures.length} 通过`);
if (failures.length) {
  console.log('失败：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('形象包可渲染性测试通过 ✅');
