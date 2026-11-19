/* 场景数据：竞技场
   ------------------------------------------------------------
   ⚠️ 布局规则和 plaza.js 完全一样，抄一遍省得来回翻：
     位置一律用 `at(前方, 左右)` 写，不要直接写世界坐标；
     楼中心放前方 300~360、进深 380、楼高 420~480 最耐看
     （楼脚落画面 45%~50%、占高 45%~50%、占宽 27%~29%，一屏正好三栋）；
     出生点前方 300 以内、身后一律空着（那一块会被透视放大成巨物）；
     左右别超出画面半宽（F=300 时约 ±780）。
   改完跑 `node tools/layout_check.mjs` 核对。
   */

import { placer } from './place.js';
import PARK from './park.js';
import KENNEL from './kennel.js';

export { PARK, KENNEL };

function building(w, d, h, opts = {}) {
  return { kind: 'building', w, d, h,
           color: opts.color || '#f0eade',
           roof: opts.roof === false ? false : (opts.roof || '#8c3b2e'),
           roofH: opts.roofH, eave: opts.eave, shutter: opts.shutter || null,
           sign: opts.sign || null, awning: opts.awning || null,
           wall: opts.wall || 'plaster' };
}

/* ---------------- 竞技场：走入圆台即可开战 ---------------- */
export const ARENA = {
  code: 'arena',
  name: '月光竞技场',
  desc: '闸机后是石砖铺的场地。免伤自检协议已载入——输了不会真的坏掉。',
  /* 全部推翻重建：照参考图做成一间**室内球馆**。
     · sky 只剩一点极暗的兜底色 —— 室内看不到天，靠的是四周的高墙；
     · 地面是水泥大板 + 白色球场线 + 一圈灯光斑；
     · 两侧木看台、顶上吊灯打光锥、尽头门洞里一张登记桌。
     视角：斜俯视（验收要求 45~60°），俯角大一点才看得见地板上的光斑与白线。 */
  sky: '#0a0c11',
  size: { w: 2600, d: 2000 },
  spawn: { x: 1300, z: 1450 },
  camera: { dist: 2300, yaw: -0.12, pitch: 0.95 },
  // 水泥大板：tile 给大一点，'ring' 的边线正好当板缝
  ground: { kind: 'ring', colors: ['#4b4f55', '#454950'], tile: 430, border: '#2f3238' },
};

{
  const at = placer(ARENA.spawn, ARENA.camera.yaw);
  const prop = (F, R, o) => ({ ...o, ...at(F, R) });
  /* ⚠️ 墙用 `rot: yaw`：building 的 w 是**世界 x**，不转的话一堵沿 R 方向的墙
     会横过来。转了之后 w 沿 R、d 沿 F —— 下面所有墙都按这个口径写。 */
  const YAW = ARENA.camera.yaw;
  const wall = (F, R, w, d, h, o) =>
    ({ ...building(w, d, h, { roof: false, rot: YAW, ...o }), ...at(F, R) });
  const bld = (F, R, w, d, h, o) => ({ ...building(w, d, h, o), ...at(F, R) });

  ARENA.blocks = [
    /* ---- 四面的墙。-300 是相机背后那面（画面里看不到，但要挡住"世界尽头"）。
       尽头那面留一个 520 宽的门洞 —— 参考图里就是这个构图。 ---- */
    wall(1180, -930, 1240, 130, 1150, { color: '#3c4048', wall: 'brick' }),   // 远墙 · 左段
    wall(1180, 930, 1240, 130, 1150, { color: '#3c4048', wall: 'brick' }),    // 远墙 · 右段
    /* ⚠️ 近墙必须在**相机背后**。相机在 dist 2300 / 54° 时大约在 F≈-1350，
       第一版把它放在 F=-360 —— 正好夹在相机和狗中间，画面下半部整块被它堵死
       （一堵深蓝色的墙占了半个屏幕）。放到 F=-1780 之后它只在最边上兜底。
       高度也可以压矮：它在画面外，只负责挡住"世界尽头"。 */
    wall(-1780, 0, 3200, 130, 620, { color: '#2b2f35', wall: 'brick' }),      // 近墙（相机背后）
    wall(410, -1560, 140, 1680, 1000, { color: '#383c43', wall: 'brick' }),   // 左墙
    wall(410, 1560, 140, 1680, 1000, { color: '#383c43', wall: 'brick' }),    // 右墙
    /* 门洞后面还垫一层更暗的板，做出"门里是黑的"（参考图那个黑门洞） */
    wall(1240, 0, 560, 90, 900, { color: '#14161a' }),
  ];

  /* ============ 馆内的东西，全部照参考图摆 ============
     参考图：两侧木看台、顶上四盏吊灯打光锥、地上一圈灯光斑 + 白色球场线、
     尽头门洞前一张登记桌。原来那三栋楼（对战登记处/训练关卡/观战席）
     **全部舍弃** —— 用户要求"现在的竞技场的样子完全舍弃"。 */
  ARENA.props = [
    // ---- 两侧看台：台阶朝场地里升起，**坐板朝向场地中心** ----
    /* ⚠️ rot 的符号我第一版写反了：局部 +z 是坐板外挑的方向，
       而 `rot = YAW ∓ π/2` 会让它指向 −R / +R 的**外侧** ——
       结果两侧看台都是"朝墙坐"、台阶还朝场地升 ✗
       用户画了两个朝里的箭头指出来。对调之后：
         左侧(R−) 用 YAW + π/2 → 局部 +z 指 +R（朝场地里）
         右侧(R+) 用 YAW − π/2 → 局部 +z 指 −R（朝场地里） */
    /* 看台长度要**避开远墙**：远墙内面在 F=1115，原来 len=1500 中心 F=400
       会伸到 1150，插进墙里 35 格（用户看出来了）。1280 之后收到 F=1040。 */
    prop(360, -820, { kind: 'bleachers', rot: YAW + Math.PI / 2,
                      rows: 7, len: 1280, stepH: 52, stepD: 88 }),
    prop(360, 820, { kind: 'bleachers', rot: YAW - Math.PI / 2,
                    rows: 7, len: 1280, stepH: 52, stepD: 88 }),

    // ---- 地上一圈灯光斑 + 白色球场线（参考图的正中）----
    // 半径和长度都要**收在两条看台之间**（看台内缘在 |R|=520 左右），
    // 铺过头的话光斑和白线会画到看台底下去。
    prop(430, 0, { kind: 'lightpool', r: 540 }),
    prop(430, 0, { kind: 'courtline', w: 1000, rot: YAW }),                // 横线
    prop(430, 0, { kind: 'courtline', w: 1700, rot: YAW + Math.PI / 2 }),  // 竖线

    // ---- 顶上的四盏吊灯（连光锥）----
    prop(320, -430, { kind: 'ceilinglamp', top: 1200, len: 300, r: 210 }),
    prop(320, 430, { kind: 'ceilinglamp', top: 1200, len: 300, r: 210 }),
    prop(880, -430, { kind: 'ceilinglamp', top: 1200, len: 260, r: 190 }),
    prop(880, 430, { kind: 'ceilinglamp', top: 1200, len: 260, r: 190 }),

    prop(-160, 0, { kind: 'portalsign', label: '回广场' }),
  ];
  ARENA.locals = [
    /* 尽头门洞前的登记桌：**它就是进对战页的入口**（走过去按 E）。
       ⚠️ 必须在 locals 里、不在 props 里 —— 只有 locals 会被登记成可交互物。
          （第一版我注释写着"摆进 locals"，代码却写进了 props，
            结果按 E 没反应、测试直接挂。）
       build.js 的 locals 循环原来只认 kind==='board'，已经改成"任何有构件的
       kind 都行"，桌子这种入口才做得出来。 */
    /* 桌子往前挪一点，给桌后的登记员留出位置 ——
       原来桌子 F=980、店员 F=1040，两人占地压在一起（检查器报"登记员和
       登记台重叠 172×120"），画面上就是**人站在桌子里**。 */
    prop(900, 0, { id: 'arena-desk', kind: 'deskset', label: '对战登记台',
                   hint: '登记一场对拍', w: 300, d: 130, h: 150,
                   rot: YAW + Math.PI }),
    // 站在桌后（靠远墙那侧）的登记员，只是说话；入口在桌子上
    prop(1080, 0, { id: 'arena-clerk', kind: 'npc', label: '对战登记员',
      hint: '桌上的册子摊开着', look: 'german_shepherd' }),
    // 教官在场边空地（原来是 R=620，正好压在看台上）
    /* 小说版里守在竞技场后方训练场的是**老记录员** ——
       "白发佝偻，手持旧搪瓷缸与软皮册子的老兵"。
       原来这里叫"训练场教官"，是个功能称呼；改成小说里的身份。 */
    prop(-420, -360, { id: 'stage-desk', kind: 'npc', label: '老记录员',
      hint: '他手里那只搪瓷缸还冒着气', look: 'border_collie' }),
  ];
  ARENA.portals = [
    { to: 'plaza', ...at(-240, 0), r: 150, label: '回广场' },
  ];
  ARENA.npcRoutes = [];
}

export const SCENES = { park: PARK, kennel: KENNEL, arena: ARENA };

export default SCENES;
