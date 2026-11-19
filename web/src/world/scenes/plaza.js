/* 场景数据：长夜月广场
   ------------------------------------------------------------
   设计参照：明日方舟奇迹巡展那种"斜俯视广场"——
   一圈房子围着开阔的砖地，狗在里面自由走动。

   ⚠️ 布局规则（踩了七八次坑才摸清，改布局前务必读一遍）

   1) **本文件的位置是世界坐标**：`prop(x, z, …)` / `box(x, z, …)`，
      第一个数是世界 x、第二个是世界 z。**不要写 at(前方, 左右)** ——
      那是 others.js 的写法。两边的坐标系不一样，写混了就是双重转换。
      （2026-09 修：原来这段写的是"一律用 at()"，和下面的实际代码矛盾，
        已经按实际代码改正。别人看到旧说明会把坐标写错。）
      为什么本文件不用 at()：楼在世界里是轴对齐盒子，而 F/R 相对世界轴
      转了约 10°，按屏幕坐标排一排楼，换算到世界里就是斜着互插的
      —— 招牌叠招牌、屋檐压屋檐。

   2) 三个数字决定一栋楼在画面上好不好看：**楼脚% / 占高% / 顶%**。
      ⚠️ 别再手算公式，也别信经验公式 —— 用 `node tools/layout_check.mjs plaza`
      量。它用的是和渲染器逐字一致的投影（相机位置/朝向/fov 都照 camera.js）。
      **判据**：`顶% ≥ 0`（屋顶不被上边缘锯掉）且 `占高% ≤ 楼脚%`。
      现在主街四栋是 楼脚 54~71%、占高 37~47%、顶% +8~+33。
        摆太近：近墙糊脸，只剩一堵墙
        摆太远：楼脚跑到画面 20% 以上，只剩屋顶（而且越远越容易顶出上缘）

   3) 出生点前方 300 以内、身后一律不放东西。斜俯视的透视放大全集中在
      画面底部（狗身后那一小块），在那儿放什么都会被放大成"横在镜头前的巨物"。

   4) 左右别超出画面半宽（F=300 时约 ±780），否则会被裁成半截——
      裁切在左/右边缘尤其像 bug。

   5) 占地要按**真实占用**算：路灯半宽 26、NPC(local) 半径 90、
      长椅 200×90、喷泉 半径 r、传送圈 130。摆之前先跑工具，别凭感觉。
   
   验证：改完一定跑 `node tools/layout_check.mjs plaza`（穿模 + 取景），
   再跑 `python tests/world_shots.py <url> <前缀> plaza` 出图确认。
   */

import { placer } from './place.js';
import { EXPANSION_KIT, FLOWER_KIT, kitProp } from './expansion.js';

export const PLAZA = {
  code: 'plaza',
  name: '长夜月广场',
  desc: '绕过月塔就是长街夜市，沿南边的花庭走到望月亭。',
  sky: '#141d33',          // 深夜蓝（世界永远是晚上）

  size: { w: 4300, d: 2900 },
  spawn: { x: 1400, z: 1380 },
  /* 相机 pitch=0.95（54°）/ dist=1700 是**刻意设计**，别动 pitch：
     e2e_world.py 有一条验收「相机有斜俯角（45~60°，看不到地平线）」——
     这个游戏要的是俯视跟随视角，不是平视。我一度压到 36° 想露出天空，
     结果那条断言直接挂掉（38/39）。
     ⚠️ 但 pitch > 半视场角(17.5°) 意味着**地平线永远在画面之上**，所以
     "越远越高的东西"会一直往画面上缘爬 —— 主街四栋原本占画面 60~76% 高
     （`layout_check` 用真投影量的），屋顶全部被上边缘锯掉，截图里就是
     一排被切断的屋檐。pitch 动不了，唯一的杠杆是 **dist**：1700 → 2500 后
     占高回到 37~47%，顶% 由 -30~+10 变成 +8~+33，整排屋顶都进画面。 */
  camera: { dist: 3300, yaw: -0.18, pitch: 0.95 },
  roofKit: 'models/landmark/plaza-roofs.glb',
  sceneryKit: 'models/landmark/plaza-architecture.glb',
  extensionKit: EXPANSION_KIT,
  flowerKit: FLOWER_KIT,
  moonCompass: true,
  districts: {
    market: { x: 2730, z: 586, w: 1215, d: 924 },
    pavilion: { x: 3530, z: 2110, r: 378 },
    garden: { x: 2627, z: 2390, r: 347 },
  },
  lighting: { ambientColor: 0x9aacc2, ambientIntensity: 0.63, moonIntensity: 0.93, fillIntensity: 0.25 },

  // 场地外围延续广场的错缝石砖，中心额外绘制月塔罗盘镶嵌。
  ground: {
    kind: 'brick',
    colors: ['#829096', '#5d6d75'],      // 场地外围的石砖延续广场的冷灰色
    tile: 300,
    border: '#9ea9a7',
  },
};

// 位置换算：at(前方, 左右) → { x, z }
const at = placer(PLAZA.spawn, PLAZA.camera.yaw);

/**
 * ⚠️ 建筑改用**显式世界坐标**摆，不再走 at(前方, 左右)。
 *
 * 为什么换：at() 写的是"屏幕坐标"，看着直观，但建筑在世界里是 **460×380 的
 * 轴对齐盒子**，而 F/R 相对世界轴转了 10°。于是按屏幕坐标排一排楼，
 * 换算到世界里就是斜着插在一起的——招牌叠招牌、屋檐压屋檐，
 * 看上去"楼挤楼 + 错位"（用户直接截图指出来的就是这个）。
 *
 * 现在的排法是**正交网格**：
 *   主街三栋沿 x 一字排开，z 相同，间距 = 楼宽 + 220 的走道
 *   背街一栋在更靠里（z 更小）的位置
 *   左右各一栋侧楼，夹住出生点
 * 每栋的占地都在注释里标了，改之前先算一下会不会压到隔壁。
 */
function box(x, z, w, d, h, opts = {}) {
  return {
    kind: 'building',
    x, z, w, d, h,
    color: opts.color || '#f0eade',
    roof: opts.roof === false ? false : (opts.roof || '#8c3b2e'),
    roofH: opts.roofH,
    roofStyle: opts.roofStyle,
    eave: opts.eave,
    shutter: opts.shutter || null,
    sign: opts.sign || null,
    awning: opts.awning || null,
    wall: opts.wall || 'plaster',
    /* ⚠️ 这个函数是**逐字段拼对象**的，新字段必须手动转发 —— 少一行就是
       "写了 rot 但完全没效果"，而且**不报错**。我给外圈那三栋写了
       rot: Math.PI/2 / -Math.PI/2 / Math.PI，量出来全是 0，就是漏了这一行。 */
    rot: opts.rot || 0,
  };
}

/** 道具 / 可交互物：直接用世界坐标 */
const prop = (x, z, o) => ({ ...o, x, z });
const streetLamp = { kind: 'lamp', pool: 265, poolTint: 0xffc98b, poolOpacity: 0.58 };
const laneLamp = { ...streetLamp, modelScale: 0.66, pool: 395, poolOpacity: 0.54 };
const trailSign = (x, z, label) => prop(x, z, { kind: 'portalsign', label, h: 74, color: '#765840' });
const stall = (x, z, asset, rot = 0) => kitProp(x, z, asset, 293, 224, 285,
  { rot, solid: [[0, 0, 0.9, 0.71]] });
const columnsAndRails = [[-0.386, 0, 0.19, 0.90], [0.386, 0, 0.19, 0.90]];

// —— 主街：z=760 一横排（楼身 z 570–950），楼前沿离出生点 250，正对着玩家
//    每栋的 x 范围写在注释里；相邻两栋至少留 60 的缝，招牌才不会叠在一起
PLAZA.blocks = [
  /* ============ 外圈 · 六栋，全部**正面朝中间** ============
     朝向怎么来的：楼默认正面朝 +z（招牌/雨棚/卷帘门都在那一面）。
       rot = 0     正面朝 +z（南）→ 放在**北边**
       rot = +π/2  正面朝 +x（东）→ 放在**西边**
       rot = -π/2  正面朝 -x（西）→ 放在**东边**
       rot = π     正面朝 -z（北）→ 放在**南边**
     排布按"画面能装下多少"来定：相机可见宽度约 1800，所以北排只放 3 栋
     （3×400 + 2×140 = 1480 ✓ 居中），其余分到东西和南侧。 */

  // —— 北排 3 栋（正面朝南，正对中间的活动区）——
  box(714, 360, 400, 380, 460, {                       // x  360– 760
    color: '#f3ead9', roof: '#b76248', roofH: 150, roofStyle: 'Gable', awning: '#a8332a',
    shutter: 0x8c3b2e, sign: { text: '汪记小馆', color: '#a8332a' },
  }),
  box(1400, 360, 400, 380, 430, {                      // x  900–1300，正对出生点
    color: '#efe6d2', roof: '#9f7651', roofH: 170, roofStyle: 'Gambrel', shutter: 0x2447d8,
    sign: { text: '狗窝旅店', color: '#2447d8', vertical: true },
  }),
  box(2086, 360, 400, 380, 420, {                      // x 1440–1840
    color: '#f1ebdd', roof: '#628065', roofH: 160, roofStyle: 'Hipped', shutter: 0x4a6b4f,
    sign: { text: '训练场', color: '#4a6b4f' },
  }),

  // —— 西侧：正面朝东（朝内）——
  box(384, 1080, 400, 380, 470, {                       // 旋转后占 x 110–490, z 680–1120
    color: '#efe9db', roof: '#ac7950', roofStyle: 'Hipped', awning: '#b8892f', shutter: 0xb8892f, rot: Math.PI / 2,
    sign: { text: '狗粮铺', color: '#b5791f' },
  }),
  // —— 东侧：正面朝西（朝内）——
  box(2289, 1080, 420, 300, 210, {                      // 旋转后占 x 1650–1950, z 690–1110
    color: '#f0e8d8', roof: '#677eaa', roofH: 60, roofStyle: 'Gable', awning: '#2447d8', shutter: 0x2447d8,
    rot: -Math.PI / 2,
    sign: { text: '玩具屋', color: '#2447d8' },
  }),
  // —— 南侧：正面朝北（朝内）。在相机背后，转身往传送圈走时才看到 ——
  //    它同样是外圈的一部分，只是这个机位拍不到。
  box(2289, 1620, 460, 300, 240, {                     // 占 x 1570–2030, z 1200–1500
    color: '#f6efe0', roof: '#a85747', roofH: 90, roofStyle: 'Gambrel', rot: Math.PI,
    sign: { text: '骨头餐车', color: '#a8332a' },
  }),
];

/* ============ 中间：玩家活动区 ============
   四周的楼都推到外圈之后，中间这块（约 x 600–1600, z 500–1350）是空的：
   喷泉、长椅、路灯、公告板、店主都在这里，三个传送圈排在它南侧。 */
PLAZA.props = [
  /* 中间是**玩家活动区**。摆位按区域算，不凭感觉：
       传送圈三个在 z=1230（半径 150）→ z∈[1080,1380]
       南侧骨头餐车占地 z[1390,1690]
       北排三栋前沿 z=510（含台基），西侧狗粮铺正面 x=590
     道具都落在这几条线之外。 */
  /* ---- 月塔：广场正中的地标（设定上这个世界永远是晚上）----
     塔基 520 见方，占 x[840,1360] z[520,1040]，周围的道具都让开了。 */
  // 塔高 1294 → 900、塔基 520 → 362：原来比楼高两倍多又杵在正中，太堵
  prop(1400, 936, { kind: 'moontower', h: 900, w: 362, d: 362 }),

  prop(917, 1056, { kind: 'fountain', r: 110 }),              // 喷泉偏左南

  prop(1146, 1500, { kind: 'bench', rot: Math.PI }),
  prop(965, 1650, { kind: 'bench', rot: Math.PI / 2 }),    // 给月塔端口和南侧通道留出空间

  prop(1756, 648, streetLamp), prop(2226, 672, streetLamp),
  prop(638, 1380, streetLamp), prop(2187, 1380, streetLamp),

  // 花坛放北排两栋之间偏东 —— 西边要让开喷泉(x≤870)和老板娘(x≤650)
  // 花坛塞进北排三栋之间的两条缝（缝只有 140 宽，所以花坛做小一点）
  prop(1743, 1380, { kind: 'planter', w: 140, d: 90 }),  // 塔南侧

  // 南侧与空档的点缀（都在传送圈范围之外）
  prop(384, 1680, { kind: 'tree' }),
  prop(300, 1500, { kind: 'tree' }),   // 原来在 (1781,1560)，挡住公告板视线
  prop(2226, 1980, { kind: 'bush' }),


  /* 传送路牌（独立道具）。放在各自传送圈左边 r*1.05 = 157 处。
     ⚠️ 路牌本身也要在传送圈的判定之外 —— 它是"可互相压"的贴花类，
     所以 layout_check 不会报，但视觉上它就在圈边上，这是有意的。 */
  prop(820, 1944, { kind: 'portalsign', label: '去公园' }),      // →park
  prop(312, 1944, { kind: 'portalsign', label: '回狗窝' }),      // →kennel
  prop(1582, 1944, { kind: 'portalsign', label: '去竞技场' }),   // →arena

  // 东侧的夜市小街。摊档沿外缘摆开，中央灯串下留一条贯通的路。
  trailSign(2460, 1314, '长街夜市'), trailSign(2845, 1850, '望月亭'),
  stall(2905, 728, 'MarketAmber'), stall(3345, 710, 'MarketJade'),
  stall(3785, 728, 'MarketAmber'), stall(3835, 1265, 'MarketJade', -Math.PI / 2),
  kitProp(3345, 1020, 'LanternSpan', 1330, 72, 386,
    { solid: [[-0.465, 0, 0.044, 0.82], [0.465, 0, 0.044, 0.82]] }),
  prop(2600, 1250, laneLamp), prop(2630, 565, laneLamp), prop(3995, 1190, laneLamp),
  prop(3010, 1390, { kind: 'bench', h: 103, rot: Math.PI }),
  prop(2780, 1555, { kind: 'planter', w: 200, d: 93 }),
  prop(3595, 1480, { kind: 'planter', w: 216, d: 102 }),
  prop(3190, 529, { kind: 'tree', h: 392 }), prop(3605, 520, { kind: 'tree', h: 378 }),
  prop(3920, 950, { kind: 'flowers', w: 134, d: 100, h: 36 }),

  // 南侧花庭到望月亭。亭子前后开放，栏杆只围两侧。
  kitProp(3530, 2110, 'MoonPavilion', 538, 465, 445, { solid: columnsAndRails }),
  prop(2940, 1970, laneLamp), prop(3850, 1860, laneLamp), prop(3330, 2500, laneLamp),
  prop(2470, 2290, laneLamp),
  prop(2627, 2390, { kind: 'fountain', r: 91 }),
  prop(2340, 2510, { kind: 'bench', h: 100, rot: 0.12 }),
  prop(2835, 2530, { kind: 'bench', h: 100, rot: -0.23 }),
  prop(3910, 2290, { kind: 'bench', h: 107, rot: -Math.PI / 2 }),
  prop(2160, 2420, { kind: 'tree', h: 350 }), prop(2770, 2190, { kind: 'tree', h: 337 }),
  prop(3060, 2510, { kind: 'tree', h: 408 }), prop(3860, 2510, { kind: 'tree', h: 435 }),
  prop(3900, 1650, { kind: 'tree', h: 430 }),
  prop(2300, 2250, { kind: 'flowers', w: 220, d: 105, h: 40 }),
  prop(2470, 2596, { kind: 'flowers', w: 150, d: 95, h: 42 }),
  prop(2820, 2650, { kind: 'flowers', w: 207, d: 102, h: 48 }),
  prop(3210, 2260, { kind: 'flowers', w: 187, d: 88, h: 40 }),
  prop(3750, 2515, { kind: 'flowers', w: 169, d: 102, h: 46 }),
  prop(4140, 2260, { kind: 'bush', h: 118 }), prop(3190, 1715, { kind: 'bush', h: 94 }),
];

PLAZA.locals = [
  prop(825, 1330, { id: 'board', kind: 'board', label: '公告板', modelScale: 0.93,
    hint: '看看今天有什么任务' }),

  /* 月塔端口：守在广场上的一台终端 —— 按 E 直接进「月塔端口」那一页
     （盖章 / 摸签 / 翻册子上的日记）。和网页端**共用同一套后端**，
     两边看到的是同一份数据。 */
  prop(1620, 1560, { id: 'tower-port', kind: 'towerport', label: '月塔端口',
    hint: '接上去看看', w: 150, h: 300 }),

  /* 月塔问询：和端口**并排的另一台**终端，按 E 直接进「月塔问询」那一页。
     为什么另起一台而不是让端口页里拐一下：用户要的是"在游戏里也能直接进去"，
     拐一次就成了两层菜单；两台并排站着，一眼看得出月塔有两件事可做。
     位置挨着端口（前一后一），都在塔的南侧空地上。 */
  prop(1820, 1560, { id: 'quiz-port', kind: 'towerport', label: '月塔问询',
    hint: '它要问一句', w: 150, h: 300 }),

  /* 店主站在**自家店门口正前方**：
       汪记小馆(560,300) 前沿 z=510 → 站 z=620
       训练场  (1640,300) 同上
       狗粮铺在西侧、正面朝东（前沿 x=590）→ 站 x=700 */
  prop(790, 744, { id: 'shop-food', kind: 'npc', label: '汪记小馆·老板娘',
    hint: '来点吃的？', look: 'shiba' }),
  prop(2086, 744, { id: 'trainer', kind: 'npc', label: '训练场·教官',
    hint: '想练练就去训练场', look: 'german_shepherd' }),
  prop(308, 720, { id: 'shop-toy', kind: 'npc', label: '狗粮铺·老板',
    hint: '新到的狗粮在这边', look: 'corgi' }),
  prop(3330, 1168, { id: 'plaza-market', kind: 'viewpoint', label: '长街夜市',
    hint: '站到灯串下看看', note: '灯串下的摊子摆着磨牙饼干、牵引绳和手缝的小布球。' }),
  prop(3530, 2125, { id: 'plaza-pavilion', kind: 'viewpoint', label: '望月亭',
    hint: '进亭子看月亮', note: '从亭檐下面看出去，月塔的尖顶刚好露在花庭上方。' }),
];

/* 传送圈：三个一排，在活动区南侧（z=1230）。
   出生点在 z=1000，所以它们在狗**身后** 230 格 —— 往前走是去逛街，
   不会一迈步就误踩传送。 */
PLAZA.portals = [
  { to: 'park', x: 1019, z: 1944, r: 150, label: '去公园' },
  { to: 'kennel', x: 511, z: 1944, r: 150, label: '回狗窝' },
  { to: 'arena', x: 1781, z: 1944, r: 150, label: '去竞技场' },
];

/* NPC 巡游路线。⚠️ 这里必须返回**坐标对数组** [[x,z], …]，
   不是 [{x,z}, …] —— world.js 的 _spawnNpcs 里是 `r.path.map(([x, z]) => …)`，
   给它对象数组会直接抛 `TypeError: object is not iterable` **整个世界页面白屏**。
   （others.js 里的 path 因为要用 at() 换算，返回的也是 [x,z] 对，形状一致。） */
const path = (...pts) => pts;

PLAZA.npcRoutes = [
  { look: 'samoyed', name: '雪团', level: 18, speed: 70,
    path: path([900, 820], [1300, 820], [1300, 960], [900, 960]) },
  { look: 'border_collie', name: '阿牧', level: 27, speed: 88,
    path: path([560, 1150], [1640, 1150], [1640, 1240], [560, 1240]) },
  { look: 'corgi', name: '短腿', level: 15, speed: 62,
    path: path([850, 1440], [1350, 1440], [1350, 1560], [850, 1560]) },
  { look: 'golden', name: '栗子', level: 16, speed: 75,
    path: path([2940, 1175], [3330, 1290], [3645, 1145], [3490, 938], [3060, 920]) },
];

export default PLAZA;
