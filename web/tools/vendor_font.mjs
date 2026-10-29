/* 把中文 webfont（cn-font-split 切好的子集包）从 node_modules vendor 到 public/fonts。
   ============================================================
   为什么要 vendor 而不是直接从 node_modules 引：
   字体是**运行时要按需请求的静态资源**（unicode-range 命中哪一段才下哪一段），
   Vite 只会处理被 JS/CSS 引用到的文件，上百个 woff2 子集不会被自动带上。
   放到 public/ 下最直接，也方便部署时单独缓存（字体基本不会变）。

   当前用的是「霞鹜文楷 Bright」（LXGW Bright，文楷 Lite + Ysabeau 拉丁。
   上游 lxgw/LxgwBright，OFL-1.1，可商用）。

   用法：node tools/vendor_font.mjs
   产物：web/public/fonts/<slug>/{*.css, *.woff2, SOURCE.md}
*/

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');

/**
 * 每套字体一条配置。`pick` 决定从包里挑哪些文件进 public：
 *   - 有的包是"平铺"的（css 和 woff2 在同一层）
 *   - 有的是按字重/斜体分目录的（@daihaus/lxgw-bright 就是），
 *     css 在根上、图片在 400-normal/ 里，所以要把子目录也带上。
 */
const FONTS = [
  {
    slug: 'lxgw-bright',
    pkg: '@daihaus/lxgw-bright',
    title: '霞鹜文楷 Bright（LXGW Bright）',
    home: 'https://github.com/lxgw/LxgwBright',
    license: 'OFL-1.1',
    family: 'LXGW Bright',
    // 只用 400 正体：权重靠描边（canvas）和浏览器合成（DOM），
    // 多带一个 500 会让磁盘和首屏都翻倍，不值。
    files: ['400-normal.css'],
    dirs: ['400-normal'],
    rename: { '400-normal.css': 'font.css' },
    // CSS 里是 url("./400-normal/xxx.woff2") —— 双引号 + "./" 前缀。
    // 第一版只写了 url('400-normal/ （单引号、无 ./），一条都没匹配上，
    // 结果 CSS 指向一个已经被拍平的子目录，浏览器一张字体都下不到。
    // 保留原来的引号风格，只把中间的目录段去掉。
    rewrite: [[/url\((["']?)\.?\/?400-normal\//g, 'url($1']],
  },
];

for (const f of FONTS) {
  const src = join(WEB, 'node_modules', ...f.pkg.split('/'));
  if (!existsSync(src)) {
    console.error(`找不到字体包：${src}\n先跑：npm i -D ${f.pkg}`);
    process.exit(1);
  }
  const out = join(WEB, 'public', 'fonts', f.slug);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  let n = 0;
  let bytes = 0;
  for (const d of f.dirs || []) {
    const from = join(src, d);
    if (!existsSync(from)) continue;
    for (const file of readdirSync(from)) {
      if (!file.endsWith('.woff2')) continue;
      cpSync(join(from, file), join(out, file));
      n += 1;
      bytes += statSync(join(from, file)).size;
    }
  }
  for (const file of f.files || []) {
    const from = join(src, file);
    if (!existsSync(from)) { console.error(`包里没有 ${file}`); process.exit(1); }
    let css = readFileSync(from, 'utf8');
    for (const [re, to] of f.rewrite || []) css = css.replace(re, to);
    writeFileSync(join(out, f.rename?.[file] || file), css, 'utf8');
  }
  writeFileSync(join(out, 'SOURCE.md'), `# ${f.title}

* 上游：${f.home}
* npm 包：\`${f.pkg}\`（用 cn-font-split 切成的 unicode-range 子集）
* 授权：${f.license}（免费可商用）
* 落地：\`node tools/vendor_font.mjs\` 从 node_modules 复制到这里

**不要手改这里的文件**：要升级就换 npm 包版本，再跑一次脚本。
`, 'utf8');
  console.log(`${f.slug}: ${n} 个 woff2 子集 + CSS → ${out}`);
  console.log(`  合计约 ${(bytes / 1024 / 1024).toFixed(2)} MB（按需加载：只下命中的子集）`);
}
