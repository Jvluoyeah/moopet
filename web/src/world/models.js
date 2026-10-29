/* 场景模型：Kenney Nature Kit（CC0，可商用、无需署名）
   ------------------------------------------------------------
   为什么用它：我手搓的圆植树/方块石头确实是"白模阶段"的观感。
   这套模型是**低多边形 + 纯顶点色 + KHR_materials_unlit**——
   没有贴图、29 个文件合计不到 300 KB，而且平涂的质感正好贴合版画风。

   许可：Kenney（kenney.nl）全部素材为 CC0 1.0，可自由商用、无需署名。
   这里仍保留来源说明，方便交接时追溯（见 public/models/CREDITS.md）。

   加载策略：模型很小，**进场时一次性预载完**，
   这样 buildScene 可以同步取用，不需要"先占位再替换"的复杂逻辑。
   */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PROP } from './scale.js';

const BASE = 'models/nature/';

/** 模型名 → 实际 URL。
 *  裸名字（'tree_default.glb'）按自然物件处理，走 `models/nature/`；
 *  名字里带 '/' 的当**相对 models/ 的子路径**（'landmark/moontower.glb'），
 *  这样地标类资产能放自己的目录，不用硬塞进 nature/。
 *  ⚠️ 第一版写成"带 '/' 就当完整 URL"，结果少了 `models/` 前缀 → 404 →
 *  塔**静默不出现**（连控制台报错都没有，因为加载失败是被 catch 掉的）。 */
function modelURL(name) {
  return name.includes('/') ? 'models/' + name : BASE + name;
}
const cache = new Map();

/** 每类道具可用的模型变体（按场景里的序号轮换，避免整条街长得一样） */
export const MODELS_BY_KIND = {
  // 月塔：地标建筑，不走 nature/ 那套自然物件
  moontower: ['landmark/moontower.glb'],
  tree: ['tree_default.glb', 'tree_oak.glb', 'tree_detailed.glb',
         'tree_pineDefaultA.glb', 'tree_fat.glb', 'tree_cone.glb',
         'tree_pineRoundA.glb', 'tree_blocks.glb', 'tree_tall.glb',
         'tree_pineTallA.glb', 'tree_thin.glb'],
  bush: ['plant_bush.glb', 'plant_bushDetailed.glb', 'plant_bushLarge.glb'],
  grass: ['grass.glb', 'grass_large.glb'],
  flower: ['flower_purpleA.glb', 'flower_redA.glb'],
  mushroom: ['mushroom_red.glb', 'mushroom_redGroup.glb'],
  rock: ['rock_largeA.glb', 'rock_largeB.glb', 'rock_smallA.glb',
         'rock_smallB.glb', 'rock_tallA.glb'],
  stone: ['stone_largeA.glb', 'stone_smallA.glb'],
  stump: ['stump_round.glb', 'stump_square.glb'],
};

/** 各类型在世界里的目标高度（世界单位）。
 *  一律取自 scale.js 的 PROP 表——不要在别处再写一套数字。 */
export const TARGET_HEIGHT = {
  tree: PROP.tree, bush: PROP.bush, grass: PROP.grass, flower: PROP.flower,
  mushroom: PROP.mushroom, rock: PROP.rock, stone: PROP.stone, stump: PROP.stump,
  // 塔的模型本身就是按世界尺度建的（1294 高），缩放比 = 1
  moontower: 1294,
};

/**
 * 这几个种类**不能按高度归一化** —— 它们的模型是"矮胖"的。
 * 实测比例（`_refs/blender_audit.py` 打出来的）：
 *     rock_tallA   宽:深:高 = 0.99 : 0.69 : 1     ← 高瘦，按高度算没问题
 *     rock_largeA  宽:深:高 = 3.02 : 3.91 : 1     ← 扁平，一按高度就被放大成板子
 *     stone_largeA 同上；stone_smallA 1.89 : 1.89 : 1
 * 按高度算 `scale = 目标高 / 高`，扁的会变成：
 *     石头目标高 160 → 成品 **780 × 160 × 723**（5.8 个狗长，一眼就是 bug）
 * 改成按**最长边**归一化，同类里高瘦的和扁平的最终都落在同一个量级：
 *     rock_tallA  → 227 × 230 × 158
 *     rock_largeA → 175 ×  59 × 230
 */
export const NORMALIZE_BY_MAX = new Set(['rock', 'stone']);

export function allModelNames() {
  return [...new Set(Object.values(MODELS_BY_KIND).flat())];
}

/**
 * 预载全部模型。失败不抛错（没网/404 时自动退回程序生成的占位道具）。
 * @returns {Promise<{loaded:number, failed:string[]}>}
 */
export async function preloadModels(extraUrls = []) {
  const loader = new GLTFLoader();
  const names = allModelNames();
  const failed = [];
  await Promise.all(names.map((name) => new Promise((resolve) => {
    loader.load(modelURL(name),
      (gltf) => { cache.set(name, gltf.scene); resolve(); },
      undefined,
      () => { failed.push(name); resolve(); });
  })));
  /* 外部搭好的整个场景（scene.imported.url，见 build.js 的说明）。
     缓存键就是完整 URL，和上面的模型名不会撞。路径是相对于 public/ 的。 */
  await Promise.all(extraUrls.map((url) => new Promise((resolve) => {
    loader.load(url,
      (gltf) => { cache.set(url, gltf.scene); resolve(); },
      undefined,
      () => { failed.push(url); resolve(); });
  })));
  return { loaded: cache.size, failed };
}

/**
 * 取一份外部场景的实例（克隆）。
 * `buildScene` 是同步的，所以外部场景必须在进场前和模型一起预载完
 * —— 加载是异步的，不能等到 buildScene 里再去 load。
 *
 * ⚠️ 这里**不碰模型自身的变换**（不重置 position/rotation/scale）：
 * 在 Blender 里为了方便缩放物体再导出是常规操作，那些 scale 就落在节点上。
 * 只把**最外层**挪到世界原点 —— 外部场景按世界坐标搭，原点即世界原点。
 * 需要统一尺寸就用 `imported.normalize`（见 build.js），不要手动 reset。
 *
 * @returns {THREE.Object3D|null}
 */
export function instanceSceneImport(url) {
  const src = cache.get(url);
  if (!src) return null;
  const obj = src.clone(true);
  return obj;
}

/** 某个场景声明了外部场景却没有载入成功时，给个能看的报错。 */
export function hasSceneImport(url) {
  return cache.has(url);
}

/**
 * 配色覆盖表：材质名（Kenney 的命名）→ 我们的色板。
 *
 * 为什么必须换色：Kenney 的 baseColorFactor 是**线性空间**的数值，
 * 经 glTF 规范转成 sRGB 后显示出来偏淡——叶片是 `#70e6d6`（淡青），
 * 树干是 `#f2be9e`（浅橙），在米色纸地上几乎看不见，看着像"没有树叶的枯枝"。
 * 换成本项目的纸/墨/木/苔绿之后，既保住真实低模的细节，
 * 又和手搓的"纸盒"建筑是同一套色彩语言。
 */
export const MATERIAL_PALETTE = {
  woodBark: [0x8a6a45, 0x7c5e3c, 0x96754e],
  woodBarkDark: [0x6b4f36, 0x5e4530],
  woodInner: [0xc9a97e, 0xbfa072],
  leafsGreen: [0x6d8a5c, 0x5f7a52, 0x7c9a68],
  leafsDark: [0x53694a, 0x475c3f],
  grass: [0x7c9a68, 0x8aa672],
  dirt: [0xb08e63, 0xa5865c],
  stone: [0xa8a49a, 0x9a968c, 0xb3afa4],
  colorRed: [0xa8332a],
  colorPurple: [0x7a3fa8],
  _defaultMat: [0xbfa072],

  /* ---- 夜景用的"发光"材质 ------------------------------------------
     世界改成永远是夜晚之后，灯窗、灯罩、门洞这些**光源本身**不能再用
     受光的 Lambert —— 夜里会被环境光压暗，看着像没开灯。
     这几个名字会走 MeshBasicMaterial（不受光照影响），见下面的 GLOW_MATERIALS。 */
  // ⚠️ 这里的色值才是最终显示的 —— 模型自己的颜色会被按名字覆盖掉。
  //    第一版 0x4a5468 太暗，夜里整座塔是黑的，配上亮窗像鬼屋。
  //    提亮过两次：0x4a5468（黑）→ 0x7c879c（还是暗）→ 0xb9c3d4。
  //    原因：受光材质在夜里要**乘**上昏暗的月光，基色不够亮看着就是黑塔。
  towerStone: [0xb9c3d4],                       // 塔身：月光下"最亮的石头"
  towerStoneDark: [0x8f9aad],                   // 暗部/分带
  windowGlow: [0xffd98a, 0xffc46a, 0xffe6ad],   // 亮着的窗
  windowDark: [0x1b2230],                       // 没亮的窗（黑洞洞的）
  doorGlow: [0xdcecff],                         // 塔底的拱门（冷白）
  lampGlow: [0xffe6a8],                         // 路灯灯罩
};

/** 这些材质名做成**不受光照影响**的（MeshBasicMaterial）。
 *  夜景里"光源本身"必须这样处理，否则被环境光一压就变成脏色。 */
export const GLOW_MATERIALS = new Set(['windowGlow', 'doorGlow', 'lampGlow']);

/** 按材质名换色；同一模型内按序号取不同深浅，避免一整片一个色 */
function recolor(obj, seed = 0) {
  let i = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const name = o.material.name || '_defaultMat';
    const colors = MATERIAL_PALETTE[name] || MATERIAL_PALETTE._defaultMat;
    const color = colors[(seed + i) % colors.length];
    /* ⚠️ 受光材质一律**双面**。
       Kenney 这套模型是**单面**的（树的树冠、灌木、草的叶片都是单面片），
       从背面看直接被剔除 —— 表现就是"树顶是空的/树干穿出树冠"
       （用户截图圈出来的那棵大树）。斜俯视会同时看到这些片的正反两面，
       所以双面是必须的。低模 + 双面这点填充率完全吃得消。 */
    o.material = GLOW_MATERIALS.has(name)
      ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    i += 1;
  });
}

/** 取一个模型实例（带缩放与朝向），没有就返回 null 让调用方退回占位实现 */
export function instanceModel(name, targetHeight, opts = {}) {
  const src = cache.get(name);
  if (!src) return null;
  const obj = src.clone(true);          // 静态模型，普通 clone 足够
  if (opts.recolor !== false) recolor(obj, opts.seed || 0);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = true;
  });

  /* ---- 归一化 ----
     ⚠️ 归一化**必须只作用在一层新的包装节点上，绝不能改模型自身的变换**。

     原来的写法是：
         obj.scale.setScalar(s);
         obj.position.y = -box.min.y * s;
         if (opts.rotY) obj.rotation.y = opts.rotY;
     这里 obj 是 gltf.scene 的克隆。如果外部模型把 scale 落在**根节点**上
     （在 Blender 里为了方便缩放物体再导出，非常常见），那么：
       · box 是按"已缩放后的尺寸"算的 → s = 目标高 / 实际高 ✓
       · 但 setScalar(s) 会把那个 scale **顶掉** → 成品尺寸差一个原 scale 倍 ✗
     position.y / rotation.y 同理，会把模型自带的位置和朝向覆盖掉。

     现在改成包一层 Group：模型的变换原样保留，缩放/贴地/旋转都加在包装层。
     这样无论 scale 落在根节点、子节点，还是嵌套好几层，结果都对。 */
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  // 归一化的**基准轴**：默认按高度（size.y）；矮胖的种类按最长边，
  // 否则扁模型会被放大成一块大板子（见 NORMALIZE_BY_MAX 的说明）。
  const base = opts.byMax ? Math.max(size.x, size.y, size.z) : size.y;
  const s = targetHeight / (base || 1);
  const wrap = new THREE.Group();
  wrap.add(obj);
  wrap.scale.setScalar(s);
  wrap.position.y = -box.min.y * s;        // 脚底贴地（用缩放前的包围盒 × 缩放比）
  if (opts.rotY) wrap.rotation.y = opts.rotY;
  return wrap;
}

/** 按类型 + 序号挑一个变体名（确定性：同一个位置每次都是同一棵） */
export function pickModelName(kind, index = 0) {
  const list = MODELS_BY_KIND[kind];
  if (!list || !list.length) return null;
  return list[Math.abs(index) % list.length];
}

export function makeModelPropNode(p, index) {
  const kind = p.kind;
  const name = pickModelName(kind, (p.seed ?? index) + (p.variant ?? 0));
  if (!name) return null;
  const obj = instanceModel(name, (p.h || TARGET_HEIGHT[kind] || 200) * (p.scale || 1), {
    rotY: p.rotY !== undefined ? p.rotY : index * 1.7,
    seed: index,
    byMax: NORMALIZE_BY_MAX.has(kind),
  });
  if (!obj) return null;
  obj.position.x += p.x;
  obj.position.z += p.z;
  return obj;
}

export function modelStats() {
  return { cached: cache.size, total: allModelNames().length };
}
