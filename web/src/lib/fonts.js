/* 字体：霞鹜文楷 Bright（LXGW Bright = 文楷 Lite + Ysabeau 拉丁）
   ============================================================
   为什么单独一个模块：**Canvas 不会自动等 webfont**。
   招牌、公告板、传送牌、头顶名牌都是拿 canvas 画完再当贴图的，
   如果字体还没下好就画，画出来的是回退字体（甚至方框），而且**画完就定死了**，
   字体随后加载完也不会自动重画——所以必须在建场景之前先把字体等出来。

   字体资源在 public/fonts/lxgw-bright/（cn-font-split 切好的 unicode-range 子集，
   由 tools/vendor_font.mjs 从 npm 包 vendor 过来），index.html 里已经挂了 font.css。
   子集是按 unicode-range 按需下载的，所以"加载字体"要带上**实际会画的文字**，
   否则只会下到空格那一段。这就是 ensureFonts(text) 要收一个文本参数的原因。
*/

export const SIGN_FONT = '"LXGW Bright", "LXGW WenKai", "Noto Serif SC", "Songti SC", "STSong", serif';

/**
 * Canvas 用的字号串统一在这里拼，免得各处写字重字。
 *
 * ⚠️ 权重只能是 **normal**：vendor 过来的 font.css 里上百条 @font-face
 * 都**没有声明 font-weight**（cn-font-split 的默认产物），也就是只有 400 这一档。
 * 写 `bold` 的话浏览器虽然会合成假粗体，但 `document.fonts.check('700 …')` 永远返回 false
 * （"字体没加载好"的假象），而 canvas 里的假粗体也不好看。
 * 要更重的标题就用**描边**加粗（signTexture 里就是这么做的），比假粗体干净。
 */
export function signFont(px, weight = 'normal') {
  return `${weight} ${px}px ${SIGN_FONT}`;
}

const hasDOM = typeof document !== 'undefined' && document.fonts;

/**
 * 等字体就绪。带上实际要画的文字，浏览器才会下对应的子集。
 * 失败不抛错——大不了回退到系统宋体，画面照样出得来。
 * @param {string} text 会被画到 canvas 上的所有文字拼起来
 */
export async function ensureFonts(text = '') {
  if (!hasDOM) return false;                 // Node 里没有 document，直接跳过
  const sample = String(text || '') || '机械狗档案册长夜月广场公园竞技场';
  try {
    await Promise.all([
      document.fonts.load(signFont(74), sample),
      document.fonts.load(signFont(30), sample),
      document.fonts.load(signFont(52), sample),
    ]);
    await document.fonts.ready;
    return true;
  } catch (e) {
    console.warn('[fonts] 霞鹜文楷加载失败，回退系统宋体：', e?.message || e);
    return false;
  }
}

/** 已经就绪了吗（画贴图前可以探一下，决定要不要挂重绘回调） */
export function fontsReady() {
  if (!hasDOM) return true;
  try {
    return document.fonts.check(signFont(74), '犬');
  } catch {
    return false;
  }
}

/**
 * 给"画完就定死"的 canvas 贴图用：先画一遍（用当前可用字体），
 * 字体就绪后再画一遍并通知外部（通常是 texture.needsUpdate = true）。
 * 这样即使 ensureFonts 没等到，画面最终也会变成正确的字体。
 */
export function redrawWhenReady(text, redraw) {
  if (!hasDOM) return;
  ensureFonts(text).then((ok) => { if (ok) redraw(); }).catch(() => {});
}
