/* 品种真实形象资源（用户提供的原图，由 tools/slice_breeds.py 切好）
   ============================================================
   目录：web/public/breeds/<code>/forms/{sit,face,paw,lie}.png
        web/public/breeds/<code>/art.json

   四张的语义（战斗里直接按状态换）：
     sit   坐   待机 / 图鉴 / 档案卡 / 大世界立牌
     face  正面 面向镜头（结算、对话、被击退时的转身帧）
     paw   挥手 打招呼 / 撒娇 / 放技能
     lie   趴下 休息 / 倒地（KO）

   三条约束，和 tools/slice_breeds.py 是一套：
   1) 画布统一 512×512，脚底压在同一条基线（art.json 的 baseline=470），
      所以换图不会跳。
   2) 四张按同一个系数缩放过，**相对大小是可信的**——
      不要在前端再各自 fit 到某个高度，那样趴下会变成巨狗。
   3) 加载失败（图没切/路径不对）时全链路退回程序生成的 SVG，
      所以这个模块**不允许抛异常**，也不允许在 import 时就动手。
*/

import { BREED_TRAITS, portraitSVG, THEMES } from './breedArt.js';

const BASE = 'breeds/';
export const FORMS = ['sit', 'face', 'paw', 'lie'];

/** code -> { art, images: {form: HTMLImageElement}, actions } */
const cache = new Map();
let ready = false;
let loading = null;

const hasDOM = typeof window !== 'undefined' && typeof Image !== 'undefined';

export function artReady() {
  return ready;
}

export function artInfo(code) {
  return cache.get(code)?.art || null;
}

function rec(code) {
  let r = cache.get(code);
  if (!r) { r = { art: null, images: {}, actions: null }; cache.set(code, r); }
  return r;
}

/**
 * 取一张已经加载好的图。
 * @param {string} form 'sit'|'face'|'paw'|'lie' —— 四形态
 *                      或 'run_02' 这种**动作帧名**（战斗里按状态选，见 game/pose.js）
 * 没加载好返回 null，调用方自己退回 SVG。
 */
export function breedImage(code, form = 'sit') {
  const img = cache.get(code)?.images[form];
  return img && img.complete && img.naturalWidth ? img : null;
}

/** 这个品种有没有动作帧（没有就退回四形态——其余 7 个品种现在就是这种情况） */
export function hasActions(code) {
  return actionCache.has(code);
}

/**
 * 预载全部品种的四个形态。
 * 失败不抛错：任何一张没加载上，对应位置就用回程序生成的占位形象。
 * @returns {Promise<{loaded:number, total:number, failed:string[]}>}
 */
export function preloadBreedArt(codes) {
  if (loading) return loading;
  if (!hasDOM) {
    // Node（单元测试）里没有 Image：直接当"没有真实图"，一切走 SVG 回退
    ready = true;
    return Promise.resolve({ loaded: 0, total: 0, failed: [] });
  }
  const list = codes && codes.length ? codes : Object.keys(BREED_TRAITS);
  const failed = [];
  let loaded = 0;

  const loadImg = (code, key, url) => new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { loaded += 1; resolve(true); };
    img.onerror = () => { failed.push(`${code}/${key}`); resolve(false); };
    img.src = url;
    rec(code).images[key] = img;
  });
  const loadForm = (code, form) => loadImg(code, form, `${BASE}${code}/forms/${form}.png`);

  loading = (async () => {
    // art.json 只用来读 baseline / 高度，读不到也不影响出图
    await Promise.all(list.map(async (code) => {
      try {
        const res = await fetch(`${BASE}${code}/art.json`);
        if (res.ok) rec(code).art = await res.json();
      } catch { /* 没有 art.json 就只看图 */ }
    }));
    await Promise.all(list.flatMap((code) => FORMS.map((f) => loadForm(code, f))));


    ready = true;
    return { loaded, total: list.length * FORMS.length, failed };
  })();
  return loading;
}

/**
 * 把某一张形态画到 canvas 上，返回 canvas（贴图/裁切都用它）。
 * 没图就返回 null。
 */
export function formCanvas(code, form = 'sit', size = 256) {
  const img = breedImage(code, form);
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, size, size);
  return c;
}

/**
 * 形象包的"对外呈现"：优先真实图，其次程序生成的 SVG。
 * @returns {{kind:'image'|'svg', url?:string, svg?:string}}
 */
export function formAsset(code, opts = {}) {
  const form = opts.form || 'sit';
  const img = breedImage(code, form);
  if (img) return { kind: 'image', url: `${BASE}${code}/forms/${form}.png` };
  return { kind: 'svg', svg: portraitSVG(opts.breed || { code }, {
    level: opts.level, theme: opts.theme,
  }) };
}

/** 主题色（给编辑器/调试用；真实图是固定配色的，切不了） */
export function themeInk(theme = 'day') {
  return (THEMES[theme] || THEMES.day).ink;
}

/** 仅供测试：清空缓存 */
export function _resetBreedArt() {
  cache.clear();
  actionCache.clear();
  ready = false;
  loading = null;
  actionsLoading = null;
}

/* ================= 动作帧（第二批出图） =================
   目录：web/public/breeds/<code>/actions/
        index.json          { actions: { run: {frames:4}, attack: {frames:3}, ... } }
        run_01.png ...     一帧一个文件
   没出图的动作**直接查不到**，调用方据此退回静态形态（sit/face/paw/lie）——
   所以可以一批一批出，不会青黄不接。 */

const actionCache = new Map();     // code -> { run: [Image, ...], attack: [...] }
let actionsLoading = null;

export function breedAction(code, action) {
  return actionCache.get(code)?.[action] || null;
}

export function actionFrames(code, action) {
  const list = breedAction(code, action);
  return list ? list.length : 0;
}

/** 预载所有品种的动作帧。没有 index.json 就跳过（= 还没出图），不报错。 */
export function preloadActions(codes) {
  if (actionsLoading) return actionsLoading;
  if (!hasDOM) return Promise.resolve({ breeds: 0, frames: 0 });
  const list = codes && codes.length ? codes : Object.keys(BREED_TRAITS);

  const loadImg = (url) => new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

  actionsLoading = (async () => {
    let breeds = 0;
    let frames = 0;
    await Promise.all(list.map(async (code) => {
      let meta = null;
      try {
        const res = await fetch(`${BASE}${code}/actions/index.json`);
        if (res.ok) meta = await res.json();
      } catch { /* 没出图就跳过 */ }
      if (!meta || !meta.actions) return;
      const rec = {};
      for (const [action, info] of Object.entries(meta.actions)) {
        const n = Math.max(1, Number(info?.frames) || 0);
        const imgs = await Promise.all(
          Array.from({ length: n }, (_, i) =>
            loadImg(`${BASE}${code}/actions/${action}_${String(i + 1).padStart(2, '0')}.png`)));
        const ok = imgs.filter(Boolean);
        if (ok.length) { rec[action] = ok; frames += ok.length; }
      }
      if (Object.keys(rec).length) { actionCache.set(code, rec); breeds += 1; }
    }));
    return { breeds, frames };
  })();
  return actionsLoading;
}
