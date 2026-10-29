/* 品种形象包：分层 SVG（版画/印章风格）
   ------------------------------------------------------------
   为什么是这个风格：羊皮纸 + 墨线 + 印章的语境下，写实画法容易显得廉价，
   而"木刻版画"式的实心剪影 + 墨线描边天然契合，且用简单形状就能做得体面。

   分层结构（真实图片到位后按同名图层替换即可，见 docs/形象包规范.md）：
     layer-shadow / layer-tail / layer-body / layer-legs / layer-head
     layer-ears / layer-face / layer-marking / layer-collar

   traits 决定品种的"骨架"（耳型、尾型、体型），palette 决定毛色。
   这两者分开，是为了让换色/换皮肤不必重画形状。
   */

export const BREED_TRAITS = {
  samoyed:        { ears: 'erect',  tail: 'curl',   build: 'plush',  muzzle: 'short' },
  border_collie:  { ears: 'semi',   tail: 'long',   build: 'lean',   muzzle: 'long',  markings: 'blaze' },
  golden:         { ears: 'drop',   tail: 'plume',  build: 'sturdy', muzzle: 'medium' },
  corgi:          { ears: 'big',    tail: 'stub',   build: 'low',    muzzle: 'medium', markings: 'chest' },
  shiba:          { ears: 'erect',  tail: 'curl',   build: 'lean',   muzzle: 'pointed', markings: 'chest' },
  german_shepherd:{ ears: 'pointy', tail: 'long',   build: 'sturdy', muzzle: 'long',  markings: 'saddle' },
  husky:          { ears: 'erect',  tail: 'plume',  build: 'sturdy', muzzle: 'medium', markings: 'mask' },
  bichon:         { ears: 'drop',   tail: 'curl',   build: 'plush',  muzzle: 'short' },
};

const DEFAULT_TRAITS = { ears: 'erect', tail: 'long', build: 'sturdy', muzzle: 'medium' };

export const LEVEL_TIERS = [
  { min: 30, code: 'legend', color: 'var(--tier-legend)', hex: '#b8892f', label: '传说' },
  { min: 20, code: 'epic', color: 'var(--tier-epic)', hex: '#7a3fa8', label: '史诗' },
  { min: 10, code: 'rare', color: 'var(--tier-rare)', hex: '#2447d8', label: '稀有' },
  { min: 1, code: 'common', color: 'var(--tier-common)', hex: '#6b6560', label: '普通' },
];

export function tierOf(level = 1) {
  return LEVEL_TIERS.find((t) => level >= t.min) || LEVEL_TIERS[LEVEL_TIERS.length - 1];
}

/* 画布渲染用的是独立 SVG 文档，CSS 变量在里面解析不了，
   所以一律用具体色值；主题切换由调用方传 theme 进来。 */
export const THEMES = {
  day: { ink: '#111211', paper: '#f5f1e8' },
  night: { ink: '#efe9dc', paper: '#1b1a17' },
  print: { ink: '#2b2a26', paper: '#fffdf8' },   // 导出图片用（纯白底）
};

/* ---------------- 各部件路径 ---------------- */

function bodyPath(build) {
  // 侧面坐姿：后臀抬高、前胸下沉
  const shapes = {
    plush:  'M46 168 C34 150 40 112 64 98 C86 85 118 84 138 96 C156 107 160 132 152 168 Z',
    lean:   'M50 168 C40 150 46 116 68 102 C88 89 116 88 134 100 C150 111 154 134 148 168 Z',
    sturdy: 'M44 168 C32 148 38 110 62 96 C86 82 120 82 140 94 C158 105 162 132 154 168 Z',
    low:    'M42 172 C30 154 36 122 60 108 C84 95 118 94 140 106 C158 116 164 142 156 172 Z',
  };
  return shapes[build] || shapes.sturdy;
}

function headGeom(build) {
  const g = {
    plush:  { cx: 140, cy: 76, r: 29 },
    lean:   { cx: 138, cy: 76, r: 26 },
    sturdy: { cx: 139, cy: 75, r: 28 },
    low:    { cx: 142, cy: 82, r: 28 },
  };
  return g[build] || g.sturdy;
}

function earsSVG(type, { cx, cy, r }, fur, line) {
  const stroke = `stroke="${line}" stroke-width="2.4" stroke-linejoin="round"`;
  switch (type) {
    case 'big':
      return `<path d="M${cx - 22} ${cy - 18} L${cx - 26} ${cy - 52} L${cx + 4} ${cy - 30} Z"
                fill="${fur}" ${stroke}/>
              <path d="M${cx + 2} ${cy - 22} L${cx + 6} ${cy - 48} L${cx + 24} ${cy - 26} Z"
                fill="${fur}" ${stroke}/>`;
    case 'pointy':
      return `<path d="M${cx - 20} ${cy - 20} L${cx - 14} ${cy - 50} L${cx + 2} ${cy - 26} Z"
                fill="${fur}" ${stroke}/>
              <path d="M${cx + 4} ${cy - 24} L${cx + 16} ${cy - 48} L${cx + 22} ${cy - 22} Z"
                fill="${fur}" ${stroke}/>`;
    case 'semi':
      return `<path d="M${cx - 20} ${cy - 18} L${cx - 16} ${cy - 44} L${cx - 2} ${cy - 24} L${cx - 8} ${cy - 16} Z"
                fill="${fur}" ${stroke}/>`;
    case 'drop':
      return `<path d="M${cx - 24} ${cy - 12} C${cx - 40} ${cy + 2} ${cx - 38} ${cy + 26} ${cx - 22} ${cy + 28}
                C${cx - 10} ${cy + 29} ${cx - 12} ${cy + 4} ${cx - 16} ${cy - 10} Z"
                fill="${fur}" ${stroke}/>
              <path d="M${cx + 14} ${cy - 20} C${cx + 30} ${cy - 8} ${cx + 30} ${cy + 18} ${cx + 16} ${cy + 20}
                C${cx + 6} ${cy + 21} ${cx + 6} ${cy - 2} ${cx + 8} ${cy - 16} Z"
                fill="${fur}" ${stroke}/>`;
    case 'erect':
    default:
      return `<path d="M${cx - 22} ${cy - 16} L${cx - 18} ${cy - 48} L${cx + 2} ${cy - 26} Z"
                fill="${fur}" ${stroke}/>
              <path d="M${cx + 6} ${cy - 24} L${cx + 16} ${cy - 46} L${cx + 24} ${cy - 20} Z"
                fill="${fur}" ${stroke}/>`;
  }
}

function tailSVG(type, fur, accent, line) {
  const stroke = `stroke="${line}" stroke-width="2.4" stroke-linejoin="round"`;
  // 同 collage：需要换粗细的地方必须用不含 stroke-width 的版本
  const strokeThin = `stroke="${line}" stroke-linejoin="round"`;
  switch (type) {
    case 'curl':
      return `<path d="M52 128 C24 122 14 96 32 82 C46 71 64 80 62 96
                C61 106 50 108 46 101" fill="none" ${strokeThin} stroke-width="17"
                stroke-linecap="round"/>
              <path d="M52 128 C24 122 14 96 32 82 C46 71 64 80 62 96
                C61 106 50 108 46 101" fill="none" stroke="${accent}" stroke-width="7"
                stroke-linecap="round" opacity=".55"/>`;
    case 'plume':
      return `<path d="M50 124 C18 126 6 92 26 76 C40 65 58 76 54 94"
                fill="${fur}" ${stroke}/>`;
    case 'stub':
      return `<path d="M52 140 C36 138 32 128 40 122 C48 117 58 124 58 132 Z"
                fill="${fur}" ${stroke}/>`;
    case 'long':
    default:
      return `<path d="M52 126 C26 132 12 152 20 172 C26 165 34 160 44 158"
                fill="${fur}" ${stroke}/>`;
  }
}

function markingSVG(kind, { cx, cy, r }, accent, fur, line) {
  switch (kind) {
    case 'blaze':
      return `<path d="M${cx - 4} ${cy - r} C${cx + 4} ${cy - r + 10} ${cx + 6} ${cy + 6}
                ${cx + 18} ${cy + 14} L${cx + 10} ${cy + 20} C${cx - 2} ${cy + 8}
                ${cx - 8} ${cy - 6} ${cx - 12} ${cy - r + 4} Z" fill="${accent}"/>`;
    case 'chest':
      return `<ellipse cx="126" cy="140" rx="20" ry="24" fill="${accent}" opacity=".85"/>`;
    case 'saddle':
      return `<path d="M60 100 C90 84 124 82 146 94 C138 106 108 112 78 112 Z"
                fill="${line}" opacity=".55"/>`;
    case 'mask':
      return `<path d="M${cx - 20} ${cy - 6} C${cx - 12} ${cy + 10} ${cx + 6} ${cy + 14}
                ${cx + 16} ${cy + 10} C${cx + 12} ${cy - 6} ${cx - 6} ${cy - 14} ${cx - 20} ${cy - 6} Z"
                fill="${accent}" opacity=".9"/>`;
    default:
      return '';
  }
}

/* ---------------- 主入口 ---------------- */

/**
 * 生成一只狗的 SVG 字符串。
 * @param {object} breed   { code, name, palette:{fur,accent,nose} }
 * @param {object} opts    { level, theme, size }
 */
export function portraitSVG(breed = {}, opts = {}) {
  const traits = { ...DEFAULT_TRAITS, ...(BREED_TRAITS[breed.code] || {}) };
  const pal = breed.palette || {};
  const fur = pal.fur || '#cfc6b4';
  const accent = pal.accent || '#f4efe4';
  const nose = pal.nose || '#2b2a26';
  const th = THEMES[opts.theme] || THEMES.day;
  const line = th.ink;
  const level = opts.level ?? 1;
  const tier = tierOf(level);
  const tierColor = tier.hex;
  const head = headGeom(traits.build);
  const stroke = `stroke="${line}" stroke-width="2.6" stroke-linejoin="round"`;
  // 项圈那条线要细一点，所以需要一个不含 stroke-width 的版本——
  // 直接拼 ${stroke} 再写一次 stroke-width 会让属性重复、SVG 不再是合法 XML，
  // 而 <img> 加载非法 SVG 会直接失败（三维场景里的立牌就是这么消失的）。
  const strokeThin = `stroke="${line}" stroke-linejoin="round"`;

  return `<svg viewBox="0 0 200 200" width="200" height="200" role="img"
      aria-label="${escapeAttr(breed.name || '机械狗')}"
      xmlns="http://www.w3.org/2000/svg" class="dog-portrait">
    <g id="layer-shadow">
      <ellipse cx="100" cy="182" rx="56" ry="7" fill="${line}" opacity=".14"/>
    </g>
    <g id="layer-tail">${tailSVG(traits.tail, fur, accent, line)}</g>
    <g id="layer-legs">
      <rect x="120" y="138" width="15" height="42" rx="6" fill="${fur}" ${stroke}/>
      <rect x="138" y="140" width="14" height="40" rx="6" fill="${fur}" ${stroke}/>
      <ellipse cx="127" cy="180" rx="11" ry="6" fill="${fur}" ${stroke}/>
      <ellipse cx="145" cy="180" rx="11" ry="6" fill="${fur}" ${stroke}/>
    </g>
    <g id="layer-body">
      <path d="${bodyPath(traits.build)}" fill="${fur}" ${stroke}/>
    </g>
    <g id="layer-marking">${markingSVG(traits.markings, head, accent, fur, line)}</g>
    <g id="layer-head">
      <circle cx="${head.cx}" cy="${head.cy}" r="${head.r}" fill="${fur}" ${stroke}/>
      <ellipse cx="${head.cx + 22}" cy="${head.cy + 12}" rx="15" ry="11"
               fill="${accent}" ${stroke}/>
      <ellipse cx="${head.cx + 33}" cy="${head.cy + 9}" rx="5.5" ry="4.5" fill="${nose}"/>
      <circle cx="${head.cx + 6}" cy="${head.cy - 4}" r="3.4" fill="${line}"/>
      <path d="M${head.cx + 18} ${head.cy + 20} q6 5 12 1" fill="none"
            stroke="${line}" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g id="layer-ears">${earsSVG(traits.ears, head, fur, line)}</g>
    <g id="layer-collar">
      <rect x="${head.cx - 24}" y="${head.cy + 18}" width="30" height="9" rx="4"
            fill="${tierColor}" ${strokeThin} stroke-width="2"/>
      <circle cx="${head.cx - 18}" cy="${head.cy + 32}" r="6" fill="${tierColor}"
              ${strokeThin} stroke-width="2"/>
    </g>
  </svg>`;
}

function escapeAttr(s) {
  return String(s).replace(/[<>"&]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c]));
}

/** 只要一个能塞进 <img>/背景的 data URI（导出/分享用） */
export function portraitDataURI(breed, opts) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(portraitSVG(breed, opts));
}
