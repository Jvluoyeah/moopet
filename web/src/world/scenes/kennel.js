import { EXPANSION_KIT, FLOWER_KIT, kitProp } from './expansion.js';

const prop = (x, z, kind, options = {}) => ({ x, z, kind, ...options });
const lamp = (x, z) => prop(x, z, 'lamp', { modelScale: 0.53, pool: 300, poolTint: 0xffd6a3, poolOpacity: 0.60 });
const wall = (x, z, w, h, rot = 0, lit = false) => kitProp(x, z, lit ? 'WindowPanel' : 'WallPanel',
  w, 52, h, { rot, solid: true });
const fence = (x, z, w, rot = 0) => kitProp(x, z, 'YardFence', w, 27, 92, { rot, solid: true });
const rug = (x, z, w, d, color) => prop(x, z, 'rug', { w, d, color });

export const KENNEL = {
  code: 'kennel',
  name: '我的狗窝',
  desc: '坐一会儿，去档案角翻册子，或者穿过侧门到庭院玩。',
  sky: '#263246',
  size: { w: 2900, d: 2000 },
  spawn: { x: 920, z: 1200 },
  camera: { dist: 2470, yaw: -0.17, pitch: 0.95 },
  extensionKit: EXPANSION_KIT,
  flowerKit: FLOWER_KIT,
  groundMargin: 880,
  ground: { kind: 'wood', colors: ['#c8a778', '#a1815c'], tile: 180, border: '#8c8c74' },
  lighting: { ambientColor: 0xbfc4c1, ambientIntensity: 0.82, moonIntensity: 0.85, fillIntensity: 0.28 },
  kennelLayout: {
    house: { x: 223, z: 258, w: 1560, d: 1310 },
    archive: { x: 1150, z: 298, w: 578, d: 493 },
    yard: { x: 1840, z: 410, w: 890, d: 1195 },
  },
  blocks: [],
  props: [
    // 北墙分成三扇带窗的模块，南面的矮墙留正门，东墙留花园门。
    wall(470, 277, 494, 320, 0, true), wall(964, 277, 494, 320, 0, true),
    wall(1491, 277, 560, 320, 0, true),
    wall(243, 544, 471, 196, Math.PI / 2), wall(243, 1043, 486, 172, Math.PI / 2),
    wall(243, 1418, 240, 125, Math.PI / 2),
    wall(1750, 591, 555, 181, -Math.PI / 2), wall(1750, 922, 92, 155, -Math.PI / 2),
    wall(1750, 1460, 180, 123, -Math.PI / 2),
    wall(484, 1538, 428, 105), wall(1460, 1538, 522, 105),
    wall(1100, 451, 235, 120, Math.PI / 2),
    // 暖色起居室，家具靠外摆，留出从正门到书桌和侧门的宽通道。
    kitProp(480, 760, 'CushionSeat', 340, 152, 163, { rot: Math.PI / 2, solid: true }),
    rug(674, 847, 572, 390, '#a96059'),
    kitProp(466, 430, 'ReadingShelf', 327, 132, 177, { solid: true }),
    prop(945, 390, 'planter', { w: 110, d: 78 }),
    prop(389, 1144, 'bowl', { r: 52, color: '#92a8b2' }),
    prop(534, 1161, 'bowl', { r: 48, color: '#b58863' }),
    prop(373, 1342, 'planter', { w: 94, d: 87 }),
    rug(1486, 679, 364, 222, '#688688'),
    kitProp(1540, 425, 'ReadingShelf', 283, 119, 205, { solid: true }),
    prop(1582, 922, 'planter', { w: 110, d: 85 }),
    prop(585, 577, 'lightpool', { r: 330, tint: 0xffd2a0, opacity: 0.39 }),
    prop(1450, 545, 'lightpool', { r: 269, tint: 0xffd2a0, opacity: 0.45 }),
    prop(730, 1630, 'portalsign', { label: '出门去广场', h: 73 }),
    prop(1860, 1370, 'portalsign', { label: '游戏庭院', h: 65, color: '#6f5640' }),
    // 庭院的围栏没有盖住侧门。隧道的两侧挡路，中间可以跑过去。
    fence(2080, 461, 430), fence(2530, 461, 430),
    fence(2690, 736, 450, Math.PI / 2), fence(2690, 1206, 450, Math.PI / 2),
    fence(2490, 1560, 380), fence(2050, 1560, 380),
    kitProp(2285, 989, 'ToyTunnel', 326, 262, 220, { solid: [
      [-0.42, 0, 0.16, 0.94], [0.42, 0, 0.16, 0.94],
    ] }),
    prop(2050, 675, 'tree', { h: 320 }),
    prop(2540, 645, 'tree', { h: 310 }),
    prop(2537, 1191, 'bench', { h: 93, rot: -Math.PI / 2 }),
    prop(2110, 1463, 'flowers', { w: 173, d: 83, h: 39 }),
    prop(2490, 1440, 'flowers', { w: 187, d: 88, h: 42 }),
    prop(2590, 863, 'bush', { h: 95 }),
    prop(2368, 572, 'bush', { h: 83 }),
    prop(2536, 1380, 'rock', { h: 70 }),
    lamp(1920, 1010), lamp(2450, 1480),
  ],
  locals: [
    prop(1070, 696, 'deskset', { id: 'gal', label: '摊开的档案册', hint: '翻开看看', w: 246, d: 124, h: 126,
      rot: Math.PI, solid: true, openBook: true }),
    prop(1219, 550, 'board', { id: 'diary', label: '成长日记', hint: '翻翻这些天的记录',
      boardStyle: 'diary', modelScale: 0.82 }),
    prop(1540, 449, 'board', { id: 'shelf', label: '徽章架', hint: '看看解锁了哪些徽章',
      boardStyle: 'shelf', modelScale: 0.89, y: 205 }),
    prop(695, 890, 'viewpoint', { id: 'kennel-lounge', label: '起居室', hint: '在毛毯边歇一会儿', note: '窗子还亮着，毯子也被晒得暖烘烘的。' }),
    prop(2285, 1270, 'viewpoint', { id: 'kennel-yard', label: '游戏庭院', hint: '看看爪印小路', note: '爪印一路通进玩具隧道，从另一头也能跑出来。' }),
  ],
  portals: [{ to: 'plaza', x: 950, z: 1750, r: 115, label: '出门去广场' }],
  npcRoutes: [],
};

export default KENNEL;
