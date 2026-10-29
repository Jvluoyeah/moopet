/* 场景搭建：把场景数据变成 Three.js 物体
   ------------------------------------------------------------
   全部程序生成 + Kenney 的 CC0 低模，不用任何需要署名的资源：
     * 建筑 = 纸色盒体 + 台基 + 出檐 + 墨线描边 + Canvas 纹理招牌
     * 道具 = 基本几何体按 scale.js 的尺子拼（树/长椅/遮阳伞/路灯…）
     * 地面 = Canvas 画的棋盘格/草地/木地板 + 纸纤维噪点，重复平铺

   ⚠️ 上一版有两个把人坑惨的地方，改这里的代码请先读这两条：
   ① 地面 PlaneGeometry 是**以原点为中心**的，而场景坐标是 0..w / 0..d，
      所以第一版有 3/4 的场地根本没有地板，狗是在背景色上跑。
      现在统一 floor.position.set(w/2, 0, d/2)。
   ② 所有道具尺寸一律走 scale.js，不要在函数里随手写数字——
      第一版就是各处自己拍脑袋，最后遮阳伞比房子还高。
*/

import * as THREE from 'three';
import { TARGET_HEIGHT, makeModelPropNode, pickModelName } from './models.js';
import { instanceSceneImport, hasSceneImport } from './models.js';
import { signFont } from '../lib/fonts.js';
import { DOOR, PROP, GROUND_MARGIN } from './scale.js';

const INK = 0x111211;
const LINE_OPACITY = 0.5;

/* 纸色系：地面/墙面共用，保证整个场景是一张纸上的东西 */
const PAPER = {
  floorA: '#f8f3e7',
  floorB: '#e5dac1',
  kerb: 0xc9bb9c,
  wood: 0xb08356,
  woodDark: 0x8a6a45,
  woodLight: 0xd8b075,
  leaf: 0x6d8a5c,
  leafDark: 0x53694a,
  stone: 0xbdb4a3,
  water: 0x9ec4d8,
  seal: 0xa8332a,
  blue: 0x2447d8,
  gold: 0xb8892f,
  cream: 0xf3ecdc,
};

/** 颜色可能是 '#8c3b2e' 也可能是 0x8c3b2e（场景数据两种都写过），统一成 CSS 串。
 *  这里踩过一次：字符串调 toString(16) 不会转进制，拼出来是 '##8c3b2e'，
 *  fillStyle 收到非法值直接退回黑色——屋顶整片变黑就是这么来的。 */
function toHex(v, fallback) {
  if (typeof v === 'string') return v.startsWith('#') ? v : `#${v}`;
  if (typeof v === 'number') return '#' + v.toString(16).padStart(6, '0');
  return fallback;
}

/* ---------------- 地面纹理 ---------------- */
function groundTexture(ground) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const g = c.getContext('2d');
  const [a, b] = ground.colors || [PAPER.floorA, PAPER.floorB];
  const half = size;

  if (ground.kind === 'checker' || ground.kind === 'wood' || ground.kind === 'ring') {
    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        g.fillStyle = (i + j) % 2 === 0 ? a : b;
        g.fillRect(i * half, j * half, half, half);
      }
    }
    if (ground.kind === 'wood') {
      g.strokeStyle = 'rgba(107,79,54,.16)';
      g.lineWidth = 2;
      for (let y = 0; y < size * 2; y += 22) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(size * 2, y); g.stroke();
      }
    }
    if (ground.kind === 'ring') {
      g.strokeStyle = 'rgba(17,18,17,.16)';
      g.lineWidth = 6;
      g.strokeRect(6, 6, size * 2 - 12, size * 2 - 12);
    }
  } else if (ground.kind === 'brick') {
    /* 石砖：**错缝铺法**（每一行错开半块），砖缝用深色底透出来。
       每块砖再叠一层很淡的黑/白，做出"一块块石头"的微差 ——
       比整片纯色像铺过的地面，也不像棋盘那样规整得假。 */
    const bw = size / 2;              // 砖宽
    const bh = size / 4;              // 砖高
    g.fillStyle = b;                  // 缝色
    g.fillRect(0, 0, size * 2, size * 2);
    let k = 0;
    for (let row = 0; row * bh < size * 2; row += 1) {
      const off = (row % 2) * (bw / 2);
      for (let x = -bw; x < size * 2 + bw; x += bw) {
        k += 1;
        g.fillStyle = a;
        g.fillRect(x + off + 3, row * bh + 3, bw - 6, bh - 6);
        // 确定性微差：同一个 k 每次画同一个明暗，刷新不会跳
        g.fillStyle = (k * 37) % 3 === 0 ? 'rgba(255,255,255,.05)'
          : ((k * 53) % 3 === 0 ? 'rgba(0,0,0,.07)' : 'rgba(0,0,0,.02)');
        g.fillRect(x + off + 3, row * bh + 3, bw - 6, bh - 6);
      }
    }
  } else {
    // 草地：底色 + 随机草点（确定性伪随机，刷新一百次也是同一张图）
    g.fillStyle = a;
    g.fillRect(0, 0, size * 2, size * 2);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 900; i += 1) {
      g.fillStyle = rnd() > 0.5 ? b : 'rgba(120,140,95,.26)';
      const x = rnd() * size * 2, y = rnd() * size * 2;
      g.fillRect(x, y, 3 + rnd() * 5, 2 + rnd() * 3);
    }
  }

  // 砖缝：一层淡墨网格，让地面有"块"的感觉
  g.strokeStyle = 'rgba(17,18,17,.06)';
  g.lineWidth = 2;
  for (let i = 0; i <= 2; i += 1) {
    g.beginPath(); g.moveTo(i * half, 0); g.lineTo(i * half, size * 2); g.stroke();
    g.beginPath(); g.moveTo(0, i * half); g.lineTo(size * 2, i * half); g.stroke();
  }

  // 纸纤维：和前端那套羊皮纸底纹同一招（噪点 + 淡色斑），
  // 让 3D 地面跟页面的纸不是一个"塑料板"而是一张纸
  let s2 = 987654321;
  const rnd2 = () => { s2 = (s2 * 1664525 + 1013904223) % 4294967296; return s2 / 4294967296; };
  for (let i = 0; i < 2600; i += 1) {
    const x = rnd2() * size * 2, y = rnd2() * size * 2;
    const dark = rnd2() > 0.5;
    g.fillStyle = dark ? 'rgba(90,72,48,.055)' : 'rgba(255,252,244,.075)';
    g.fillRect(x, y, 1 + rnd2() * 3, 1 + rnd2() * 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ---------------- 招牌纹理 ---------------- */
function signTexture(text, color, vertical = false) {
  const pad = 34;
  const font = vertical ? signFont(64) : signFont(74);
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const chars = [...text];
  if (vertical) {
    const w = 96, h = chars.length * 82 + pad * 2;
    c.width = w; c.height = h;
    const g2 = c.getContext('2d');
    g2.fillStyle = '#fbf7ec';
    g2.fillRect(0, 0, w, h);
    g2.strokeStyle = color; g2.lineWidth = 6;
    g2.strokeRect(5, 5, w - 10, h - 10);
    g2.fillStyle = color;
    g2.font = font;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.lineJoin = 'round';
    g2.lineWidth = 3;
    g2.strokeStyle = color;
    chars.forEach((ch, i) => {
      g2.strokeText(ch, w / 2, pad + 41 + i * 82);
      g2.fillText(ch, w / 2, pad + 41 + i * 82);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, aspect: w / h };
  }
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  const h = 128;
  c.width = w; c.height = h;
  const g2 = c.getContext('2d');
  g2.fillStyle = '#fbf7ec';
  g2.fillRect(0, 0, w, h);
  g2.strokeStyle = color; g2.lineWidth = 6;
  g2.strokeRect(5, 5, w - 10, h - 10);
  g2.fillStyle = color;
  g2.font = font;
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  // 描一圈同色边当加粗：霞鹜新致宋只带了 Regular，canvas 的假粗体很脏
  g2.lineJoin = 'round';
  g2.lineWidth = 3;
  g2.strokeStyle = color;
  g2.strokeText(text, w / 2, h / 2 + 4);
  g2.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}

/* ---------------- 零件 ---------------- */

/** 墙面：淡木纹/灰泥的细线 + 纸噪点，让纯色盒子不至于太"塑料" */
function wallTexture(color, kind = 'plaster') {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(17,18,17,.075)';
  g.lineWidth = 2;
  if (kind === 'brick') {
    for (let y = 0; y < s; y += 24) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      const off = (y / 24) % 2 ? 0 : 24;
      for (let x = off; x < s; x += 48) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 24); g.stroke();
      }
    }
  } else {
    for (let y = 0; y < s; y += 30) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
    }
  }
  let seed = 20240607;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 900; i += 1) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(90,72,48,.05)' : 'rgba(255,252,244,.07)';
    g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const SHARED_MATS = new Map();
function lambert(color, key) {
  if (key && SHARED_MATS.has(key)) return SHARED_MATS.get(key);
  const m = new THREE.MeshLambertMaterial({ color });
  if (key) SHARED_MATS.set(key, m);
  return m;
}

function paperBox(w, h, d, color, opts = {}) {
  const grp = new THREE.Group();
  let material;
  if (opts.texture) {
    const tex = wallTexture(color, opts.texture);
    tex.repeat.set(Math.max(1, w / 300), Math.max(1, h / 300));
    material = new THREE.MeshLambertMaterial({ map: tex });
  } else {
    material = opts.shared ? lambert(color, opts.shared) : new THREE.MeshLambertMaterial({ color });
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.y = h / 2;
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = true;
  grp.add(mesh);
  if (opts.edges !== false) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: LINE_OPACITY }));
    edges.position.copy(mesh.position);
    grp.add(edges);
  }
  return grp;
}

/** 一片窗（玻璃 + 墨框 + 十字棂 + 两扇百叶），复用在四面墙上。
 *  窗户别做大——第一版做成一整块冷蓝大玻璃，远看像墙上的洞。 */
function windowUnit(w, h, shutter) {
  const grp = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({ color: 0xd8c795 }));
  grp.add(glass);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)),
    new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.6 }));
  grp.add(frame);
  const barV = new THREE.Mesh(new THREE.PlaneGeometry(4, h),
    new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.32 }));
  barV.position.z = 0.6;
  grp.add(barV);
  if (shutter) {
    for (const sx of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.34, h * 1.06),
        new THREE.MeshLambertMaterial({ color: shutter }));
      sh.position.set(sx * (w * 0.5 + w * 0.18), 0, 0.8);
      grp.add(sh);
      const se = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(w * 0.34, h * 1.06)),
        new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 }));
      se.position.copy(sh.position);
      grp.add(se);
    }
  }
  return grp;
}

/** 哪一面墙朝外就画哪一面：门在正面（+Z），窗在正面与两侧 */
function facadeDetail(b) {
  const grp = new THREE.Group();
  const zFront = b.d / 2 + 2;

  // 台阶 + 门
  const step = paperBox(Math.min(220, b.w * 0.42), 26, 70, PAPER.stone);
  step.position.set(0, 0, b.d / 2 + 34);
  grp.add(step);
  const step2 = paperBox(Math.min(180, b.w * 0.34), 26, 52, PAPER.stone);
  step2.position.set(0, 26, b.d / 2 + 26);
  grp.add(step2);

  const doorW = Math.min(150, b.w * 0.24);
  const doorH = Math.min(DOOR, b.h * 0.62);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH),
    new THREE.MeshLambertMaterial({ color: 0x7a5a3c }));
  door.position.set(0, doorH / 2 + 52, zFront);
  door.castShadow = false;
  grp.add(door);
  const doorFrame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(doorW, doorH)),
    new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.65 }));
  doorFrame.position.copy(door.position);
  grp.add(doorFrame);

  // 正面窗：门的左右
  const winH = Math.min(140, b.h * 0.24);
  const winW = winH * 1.05;
  const wy = b.h * 0.6;
  const shutter = b.shutter || null;
  for (const dx of [-b.w * 0.31, b.w * 0.31]) {
    if (Math.abs(dx) < doorW * 0.9) continue;
    const win = windowUnit(winW, winH, shutter);
    win.position.set(dx, wy, zFront);
    grp.add(win);
  }
  // 侧面窗：贴着长边的中段
  const sideCount = Math.max(1, Math.round(b.d / 260));
  for (const sx of [-1, 1]) {
    for (let i = 0; i < sideCount; i += 1) {
      const zz = b.d * (sideCount === 1 ? 0 : (i / (sideCount - 1) - 0.5) * 0.55);
      const win = windowUnit(winW, winH, shutter);
      win.rotation.y = sx * Math.PI / 2;
      win.position.set(sx * (b.w / 2 + 2), wy, zz);
      grp.add(win);
    }
  }
  return grp;
}

function makeBuilding(b) {
  const grp = new THREE.Group();
  grp.position.set(b.x, 0, b.z);

  // 台基：比楼身宽一圈的石色矮台，把房子"压"在地面上（也顺便挡住接缝）
  const plinth = paperBox(b.w + 40, 34, b.d + 40, PAPER.stone);
  grp.add(plinth);

  const body = paperBox(b.w, b.h - 34, b.d, b.color, { texture: b.wall || 'plaster' });
  body.position.y = 34;
  grp.add(body);

  // 出檐：一圈比楼身宽的薄板，房子立刻不像盒子
  const eave = paperBox(b.w + 70, 34, b.d + 70, b.eave || 0x8a6a45);
  eave.position.y = b.h;
  grp.add(eave);

  if (b.roof !== false) {
    // 四坡屋顶：四棱锥压扁，比平顶有"屋子"感。
    // 斜俯视是从上往下看，屋顶占了房子一半的像素——
    // 所以屋顶必须有瓦纹、有屋脊、有个烟囱，不然就是一块纯色大平面。
    const rh = b.roofH || Math.min(260, b.w * 0.34);
    const roofHex = toHex(b.roof, '#8c3b2e');
    const roofTex = wallTexture(roofHex, 'brick');
    roofTex.repeat.set(Math.max(2, b.w / 90), Math.max(2, b.d / 90));
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, rh, 4),
      // ⚠️ 贴图里已经画了屋顶颜色，材质就不能再乘一次 color，
      // 否则线性空间下会平方（0.28² ≈ 0.08），屋顶直接变全黑。
      new THREE.MeshLambertMaterial({ map: roofTex }));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set((b.w + 90) * 1.42, 1, (b.d + 90) * 1.42);
    roof.position.y = b.h + 17 + rh / 2;
    roof.castShadow = true;
    roof.receiveShadow = true;
    grp.add(roof);
    grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(roof.geometry),
      new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.4 }))
      .translateY(b.h + 17 + rh / 2));
    /* ⚠️ 这里原来还有一根"屋脊"：
         const ridge = paperBox(b.w * 0.9, 22, 26, ...);
         ridge.position.y = b.h + 17 + rh * 0.72;
       注释写的是"压在两坡交界上的深色梁"，但屋顶是**四棱锥**
       （ConeGeometry(rh, 4)）—— 四棱锥没有屋脊线，只有一个尖，
       于是这根占楼宽 90% 的长条就横在斜屋面上，看着像凭空多出一根横木。
       用户直接指出来了，删掉。真要做双坡屋顶得换几何，不是加一根梁。 */
    /* ⚠️ 这里原来有一个**烟囱**：
         const chim = paperBox(56, rh * 0.9 + 90, 56, 0xb08356, ...);
         chim.position.set(b.w * 0.26, b.h + rh * 0.5, -b.d * 0.2);
       注释写的是"有它就是住人的房子"，但在斜俯视下它就是从屋顶戳出来的
       一根**光秃秃的柱子** —— 用户在截图上一个个圈出来要求删掉。
       屋顶本身（四棱锥 + 瓦纹）已经够了，层次不需要靠一根柱子上来。 */
  } else {
    // 平顶 + 女儿墙
    const parapet = paperBox(b.w + 40, 46, b.d + 40, b.color);
    parapet.position.y = b.h + 34;
    grp.add(parapet);
  }

  grp.add(facadeDetail(b));

  // 腰线：楼身下三分之一处一条深色横向木带。
  // 纯色盒子最大的问题就是"一整面墙"，加一条腰线立刻分出层。
  const belt = paperBox(b.w + 16, 26, b.d + 16, b.eave || 0x8a6a45, { shared: 'belt' });
  belt.position.y = b.h * 0.42;
  grp.add(belt);

  /* ⚠️ 这里原来是"挑出来的挂招牌"：一根 14×14×150 的横杆挑出墙外，
     下面挂一块竖着的招牌。用户说它像"莫名其妙的横木"，直接去掉。
     店面**不会因此没了招牌** —— 下面 `if (b.sign)` 那段仍然会在正面墙上
     画一块平贴的招牌（y = b.h + 60）。挑出来的那套是多余的。 */

  if (b.awning) {
    // 遮阳篷：条纹雨棚撑在门上方
    for (let i = 0; i < 5; i += 1) {
      const stripe = paperBox(b.w * 0.78 / 5 - 4, 16, 150,
        i % 2 ? 0xf6f0e2 : b.awning);
      stripe.position.set(-b.w * 0.39 + (i + 0.5) * (b.w * 0.78 / 5), b.h * 0.42, b.d / 2 + 78);
      stripe.rotation.x = -0.22;
      grp.add(stripe);
    }
    const edge = paperBox(b.w * 0.78, 34, 18, b.awning);
    edge.position.set(0, b.h * 0.42 - 44, b.d / 2 + 148);
    grp.add(edge);
  }
  if (b.sign) {
    const { tex, aspect } = signTexture(b.sign.text, b.sign.color, b.sign.vertical);
    const hgt = b.sign.vertical ? Math.min(b.h * 0.56, 420) : 104;
    const wid = hgt * aspect;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(wid, hgt),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    if (b.sign.vertical) {
      plane.position.set(-b.w / 2 - 26, b.h * 0.5, b.d / 2 - 40);
      plane.rotation.y = -0.35;
    } else {
      plane.position.set(0, b.h + 60, b.d / 2 + 20);
    }
    grp.add(plane);
  }
  // 碰撞盒 = 台基（楼身 +40），**不含门前的台阶**。
  // 为什么台阶不算：它只有 26 高（狗 135 高），狗站在台阶上是正常的，
  // 把它算进碰撞盒会让店面门口变成一堵无形的墙——出生点正对中街那栋楼时，
  // 玩家往前只能挪 15 格就被挡住（e2e 里就是这条挂掉的）。
  // 该挡的是**墙**：台基 34 高再加上楼身，那是真的走不过去。
  const PLINTH = 40;
  /* 旋转：给 0 / ±90° 用（"房子摆外圈、正面朝中间"就需要侧边的楼转 90°）。
     旋转之后占地的**长宽要对调**，否则碰撞盒会横过来 —— 用旋转量算 AABB：
     |w·cos| + |d·sin| 与 |w·sin| + |d·cos|，90° 时正好是精确对调。 */
  const rot = b.rot || 0;
  if (rot) grp.rotation.y = rot;
  const ca = Math.abs(Math.cos(rot)), sa = Math.abs(Math.sin(rot));
  const cw = (b.w + PLINTH) * ca + (b.d + PLINTH) * sa;
  const cd = (b.w + PLINTH) * sa + (b.d + PLINTH) * ca;
  grp.userData.collider = {
    x: b.x - cw / 2,
    z: b.z - cd / 2,
    w: cw,
    d: cd,
  };
  return grp;
}

function makeTree(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(20, 30, 210, 6),
    lambert(PAPER.woodDark, 'bark'));
  trunk.position.y = 105;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  grp.add(trunk);
  // 三层树冠：比单个圆锥像树。
  // ⚠️ 尺寸是**对着楼**定的：主街最高的那栋 430 + 屋顶 170 = 600。
  // 第一版树高 810、树冠 380 宽，比楼还高一截、宽度快赶上楼身，
  // 摆在主街前面就是几座绿塔，把整条街都挡住了（用户截图直接指出来的）。
  // 现在总高约 540、树冠最宽 240，是"比楼矮一点的树"该有的比例。
  const layers = [
    { r: 120, h: 190, y: 270, c: 0x5f7a52, k: 'leaf1' },
    { r: 96, h: 165, y: 375, c: 0x6d8a5c, k: 'leaf2' },
    { r: 70, h: 140, y: 470, c: 0x7c9a68, k: 'leaf3' },
  ];
  for (const L of layers) {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(L.r, L.h, 7), lambert(L.c, L.k));
    crown.position.y = L.y;
    crown.castShadow = true;
    crown.receiveShadow = true;
    grp.add(crown);
    grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(crown.geometry),
      new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.22 }))
      .translateY(L.y));
  }
  return grp;
}

function makeBench(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  grp.rotation.y = p.rot || 0;
  const B = PROP.bench;
  const seat = paperBox(B.len, 22, B.depth * 0.62, PAPER.woodLight, { shared: 'benchSeat' });
  seat.position.y = B.seat;
  grp.add(seat);
  const back = paperBox(B.len, B.back - B.seat, 20, PAPER.woodLight, { shared: 'benchSeat' });
  // 靠背底 = 坐面高（paperBox 原点在底面，写中点会整块抬上去）
  back.position.set(0, B.seat, -B.depth * 0.36);
  grp.add(back);
  for (const dx of [-B.len * 0.42, B.len * 0.42]) {
    for (const dz of [-B.depth * 0.26, B.depth * 0.26]) {
      // 腿落地、而且正好顶到坐面（原来 y=(seat-22)/2=20 → 悬空 20，还差 11 够不着）
      const leg = paperBox(24, B.seat, 24, PAPER.woodDark, { shared: 'benchLeg' });
      leg.position.set(dx, 0, dz);
      grp.add(leg);
    }
  }
  return grp;
}

function makeUmbrella(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  const U = PROP.umbrella;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(60, 74, 34, 10),
    lambert(PAPER.stone, 'stone'));
  base.position.y = 17;
  base.castShadow = true; base.receiveShadow = true;
  grp.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, U.pole, 8),
    lambert(PAPER.woodDark, 'bark'));
  pole.position.y = U.pole / 2 + 20;
  pole.castShadow = true;
  grp.add(pole);
  const top = new THREE.Mesh(new THREE.ConeGeometry(U.radius, U.canopy, 8),
    new THREE.MeshLambertMaterial({ color: p.color ? p.color : PAPER.seal }));
  top.position.y = U.pole + 20 + U.canopy / 2 - 10;
  top.castShadow = true;
  grp.add(top);
  grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(top.geometry),
    new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.3 }))
    .translateY(top.position.y));
  return grp;
}

function makePlanter(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  grp.rotation.y = p.rot || 0;
  const w = p.w || 400, d = p.d || 150;
  const P = PROP.planter;
  grp.add(paperBox(w, P.box, d, 0xb08e63, { shared: 'planterBox' }));
  const bush = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, P.bush, d * 0.72),
    lambert(PAPER.leaf, 'hedge'));
  bush.position.y = P.box + P.bush / 2;
  bush.castShadow = true; bush.receiveShadow = true;
  grp.add(bush);
  grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(bush.geometry),
    new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.25 }))
    .translateY(bush.position.y));
  return grp;
}

/** 绿篱：一路方块树丛，用来分隔场地（比花箱长得多，适合围边） */
function makeHedge(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  grp.rotation.y = p.rot || 0;
  const L = p.w || 600, D = p.d || 120;
  const n = Math.max(2, Math.round(L / 130));
  for (let i = 0; i < n; i += 1) {
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(L / n - 6, (p.h || 170) * (0.86 + (i % 2) * 0.14), D),
      lambert(i % 2 ? PAPER.leaf : PAPER.leafDark, i % 2 ? 'hedge' : 'hedgeD'));
    seg.position.set(-L / 2 + (i + 0.5) * (L / n), seg.geometry.parameters.height / 2 + 34, 0);
    seg.castShadow = true; seg.receiveShadow = true;
    grp.add(seg);
    const kerb = paperBox(L / n - 6, 34, D + 24, PAPER.stone, { shared: 'kerbStone' });
    kerb.position.set(-L / 2 + (i + 0.5) * (L / n), 0, 0);
    grp.add(kerb);
  }
  return grp;
}

function makeLamp(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  const L = PROP.lamp;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(34, 46, 60, 8), lambert(0x6b4f36, 'lampBase'));
  base.position.y = 30;
  base.castShadow = true; base.receiveShadow = true;
  grp.add(base);
  // 杆要够粗：11~17 在 2500 的距离下不足一个像素，远看只剩灯箱飘着
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(20, 30, L.pole, 8), lambert(0x6b4f36, 'lampBase'));
  pole.position.y = 60 + L.pole / 2;
  pole.castShadow = true;
  grp.add(pole);
  /* 灯箱：暖黄玻璃 + 墨色顶盖。
     ⚠️ 用 `MeshBasicMaterial`（**不受光照**）—— 原来是有 emissive 的 Lambert，
        但全局夜光很暗，受光材质乘下来灯箱是灰的，看着像"没开灯"。
        灯箱本身是光源，就该按 unlit 画。 */
  const glass = new THREE.Mesh(new THREE.BoxGeometry(L.glass, L.glass * 1.15, L.glass),
    new THREE.MeshBasicMaterial({ color: 0xffeec4 }));
  glass.position.y = L.total - 40;
  glass.castShadow = true;
  grp.add(glass);
  grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry),
    new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.7 }))
    .translateY(glass.position.y));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(L.glass * 1.15, 46, 4), lambert(0x4a3b2a, 'lampCap'));
  cap.position.y = L.total + 26;
  cap.rotation.y = Math.PI / 4;
  cap.castShadow = true;
  grp.add(cap);
  /* 地面光斑：灯下那一圈暖光。
     ⚠️ 做进**灯自己**里，而不是让每个场景各写一个 lightpool ——
        广场的路灯原本一个光效都没有（公园的灯有、竞技场有光锥，就它没有），
        用户直接指出"给广场的灯做一点灯效"。做进构件之后，
        四个场景里所有路灯都自动有灯效，不用逐个补。
     renderOrder 用负值：必须画在**角色之下**（见 makeLightPool 的说明）。 */
  const pool = new THREE.Mesh(new THREE.PlaneGeometry((p.pool || 300) * 2, (p.pool || 300) * 2),
    new THREE.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true,
                                  blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 5;
  pool.renderOrder = -6;
  grp.add(pool);
  return grp;
}

function makePond(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  const r = Math.min(p.w, p.d) / 2;
  const water = new THREE.Mesh(new THREE.CircleGeometry(r, 40),
    new THREE.MeshLambertMaterial({ color: PAPER.water }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 10;
  water.scale.set(p.w / Math.min(p.w, p.d), p.d / Math.min(p.w, p.d), 1);
  water.receiveShadow = true;
  grp.add(water);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 46, 40), lambert(PAPER.stone, 'stone'));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 6;
  ring.receiveShadow = true;
  ring.scale.copy(water.scale);
  grp.add(ring);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 30, 16, 6, 44), lambert(0xcfc4ab, 'pondRim'));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 14;
  rim.scale.copy(water.scale);
  rim.castShadow = true;
  grp.add(rim);
  return grp;
}

/** 喷泉：广场的视觉中心，比空一块地强多了 */
function makeFountain(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  const r = p.r || 300;
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, 90, 24),
    lambert(0xcfc4ab, 'pondRim'));
  basin.position.y = 45;
  basin.castShadow = true; basin.receiveShadow = true;
  grp.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(r * 0.88, 28),
    new THREE.MeshLambertMaterial({ color: PAPER.water }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 86;
  water.receiveShadow = true;
  grp.add(water);
  const tier = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.42, 60, 16),
    lambert(0xcfc4ab, 'pondRim'));
  tier.position.y = 110;
  tier.castShadow = true;
  grp.add(tier);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(26, 40, 300, 12), lambert(0xcfc4ab, 'pondRim'));
  col.position.y = 260;
  col.castShadow = true;
  grp.add(col);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.46, r * 0.2, 46, 16),
    lambert(0xcfc4ab, 'pondRim'));
  bowl.position.y = 430;
  bowl.castShadow = true;
  grp.add(bowl);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(34, 12, 10), lambert(PAPER.blue, 'blue'));
  finial.position.y = 490;
  finial.castShadow = true;
  grp.add(finial);
  grp.userData.collider = { x: p.x - r, z: p.z - r, w: r * 2, d: r * 2 };
  return grp;
}

/** 摊位：一张桌子 + 四根柱子 + 条纹雨棚，广场上最出戏的小道具 */
function makeStall(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  grp.rotation.y = p.rot || 0;
  const w = p.w || 260, d = p.d || 170;
  const H = p.h || 300;
  grp.add(paperBox(w, 60, d, PAPER.woodDark, { shared: 'benchLeg' }));
  const top = paperBox(w * 1.06, 24, d * 1.06, PAPER.woodLight, { shared: 'benchSeat' });
  top.position.y = 60;
  grp.add(top);
  for (const dx of [-w * 0.46, w * 0.46]) {
    for (const dz of [-d * 0.42, d * 0.42]) {
      const post = paperBox(16, H, 16, PAPER.woodDark, { shared: 'benchLeg' });
      post.position.set(dx, 0, dz);   // 立柱落地（原点在底面，写 H/2 会抬高半根）
      grp.add(post);
    }
  }
  // 条纹雨棚：一条深一条浅，比一整块色板像"棚子"
  for (let i = 0; i < 4; i += 1) {
    const stripe = paperBox(w * 1.24 / 4 - 4, 18, d * 1.34,
      i % 2 ? 0xf6f0e2 : (p.color || PAPER.seal));
    stripe.position.set(-w * 0.62 + (i + 0.5) * (w * 1.24 / 4), H + 10, 0);
    grp.add(stripe);
  }
  grp.userData.collider = { x: p.x - w / 2, z: p.z - d / 2, w, d };
  return grp;
}

/** 擂台：竞技场中间那块圆形场地。
 *  刻意做成**平的**（只在地上画圈）——狗一直站在 y=0，
 *  做成有高度的台子会陷进去，腿都看不见。 */
function makeStage(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  const r = p.r || 400;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 48),
    lambert(0xe6dcc4, 'stageDisc'));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 6;
  disc.receiveShadow = true;
  grp.add(disc);
  const rings = [
    { a: r * 0.98, b: r * 0.955, c: INK, o: 0.3 },
    { a: r * 0.62, b: r * 0.60, c: INK, o: 0.22 },
    { a: r * 0.30, b: r * 0.275, c: 0xa8332a, o: 0.35 },
  ];
  for (const R of rings) {
    const line = new THREE.Mesh(new THREE.RingGeometry(R.b, R.a, 64),
      new THREE.MeshBasicMaterial({ color: R.c, transparent: true, opacity: R.o,
                                    side: THREE.DoubleSide }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 9;
    grp.add(line);
  }
  return grp;
}

/* ================= 室内竞技场的构件 =================
   参考图是一间**室内球馆**：两侧木看台、顶上几盏吊灯打光锥、
   地上一圈灯光斑 + 白色球场线、尽头一张桌椅。下面五个就是照它做的。

   为什么天空盒要"做好"其实是"把墙做高"：相机是斜俯视，画面顶边永远朝上，
   室内的做法不是贴天空盒，而是**让四周的墙足够高、足够暗**，顶边看到的是墙。
   真正的天空（scene.sky）只要留一点极暗的兜底色即可。 */

/** 看台：一排排升高的木台阶，每级探出一条浅色**坐板**。
 *
 * ⚠️ 坐板必须**外挑**（往前伸过踏面一点点），否则看着就是一架光楼梯，
 *    不像"一排排座位" —— 用户直接指出"看台要朝里面"。
 *    外挑之后从场地里看过去，每一级都有一条清楚的座位边，
 *    再加一条**踢脚**（立板前的深色挡板），朝向就一眼可辨了。 */
function makeBleachers(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, p.y || 0, p.z);
  grp.rotation.y = p.rot || 0;
  const rows = p.rows || 6;
  const stepH = p.stepH || 46;
  const stepD = p.stepD || 78;
  const len = p.len || 900;
  const deep = p.deep || 30;
  const nose = deep * 0.55;            // 坐板往前探出的量
  for (let i = 0; i < rows; i += 1) {
    const zc = -stepD * i - stepD / 2;
    // 台体（深色木头）
    const box = paperBox(len, stepH * (i + 1), stepD, 0x5e4530, { shared: 'bleacher' });
    box.position.set(0, 0, zc);
    grp.add(box);
    // 踢脚：贴着下一级立面的深色挡板，让"座位朝哪边"更明确
    const riser = paperBox(len, stepH * 0.72, 12, 0x4a3728, { shared: 'benchLeg' });
    riser.position.set(0, stepH * (i + 1) - stepH * 0.72, zc + stepD / 2 - 6);
    grp.add(riser);
    // 坐板（浅色，**往前外挑**）
    const seat = paperBox(len, deep, stepD * 0.66 + nose, 0xb08356, { shared: 'benchSeat' });
    seat.position.set(0, stepH * (i + 1), zc + nose / 2);
    grp.add(seat);
  }
  return grp;
}

/** 顶灯：吊杆 + 灯罩 + **光锥**。光锥用加色混合的开口圆锥，做出"空气里有光"的感觉。 */
function makeCeilingLamp(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, p.y || 0, p.z);
  const top = p.top || 1500;          // 吊点多高
  const len = p.len || 420;           // 吊杆长度
  const rad = p.r || 150;             // 光锥口半径
  const rod = paperBox(16, len, 16, 0x2a2a2e, { shared: 'benchLeg' });
  rod.position.y = top + len;
  grp.add(rod);
  // 灯罩：倒扣的小圆锥
  const shade = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.42, 90, 12, 1, true),
    new THREE.MeshLambertMaterial({ color: 0x3a3a40, side: THREE.DoubleSide }));
  shade.position.y = top;
  grp.add(shade);
  // 灯泡：一个小小的自发光面（不受光照，夜里才亮）
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.3, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff3d0 }));
  bulb.rotation.x = Math.PI / 2;
  bulb.position.y = top - 30;
  grp.add(bulb);
  /* 光锥：从灯罩往下张开的开口圆锥，加色混合 + 越往下越淡。
     ① `side: DoubleSide` —— 只画外侧的话，从上方俯视会看穿；
     ② `depthWrite: false` —— 不写深度，免得把底下的地面挡掉；
     ③ 顶点色渐变：靠上亮、靠下透明。 */
  const coneH = top;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(rad, coneH, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe9bb, transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide,
    }));
  cone.position.y = top - coneH / 2;
  // 和地面光斑一样：必须在**角色之下**（否则加色混合会照亮角色贴图的方块边缘）
  cone.renderOrder = -3;
  grp.add(cone);
  return grp;
}

/** 灯下那圈暖光的贴图（径向渐变，中间亮、边上化开）。
 *  做成**缓存**：路灯构件和独立的 lightpool 都用它，每个灯新建一张 canvas 太浪费。 */
let _poolTexCache = null;
function lightPoolTexture() {
  if (_poolTexCache) return _poolTexCache;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, size * 0.06,
                                      size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, 'rgba(255,244,220,0.85)');
  grad.addColorStop(0.55, 'rgba(255,240,210,0.42)');
  grad.addColorStop(1, 'rgba(255,235,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _poolTexCache = tex;
  return tex;
}

/** 地面光斑：灯打在地上的一圈亮。加色混合，中间亮、边上化开。 */
function makeLightPool(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, (p.y || 0) + 5, p.z);
  const r = p.r || 620;
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true,
                                  blending: THREE.AdditiveBlending,
                                  depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  /* ⚠️⚠️ 图层必须**在角色之下**（renderOrder 负值）。
     加色混合的光斑画在角色**上面**时，会把狗的贴图方块整个照亮 ——
     于是"狗走进光晕里就看到一块图片边缘"（用户报的就是这个）。
     角色默认 renderOrder 是 0，所以这里给负值；地面是不透明物体，
     永远先画，所以负值不会让光斑沉到地板底下去。
     白线同理（-4），光锥也在角色之下（-3）。 */
  disc.renderOrder = -6;
  grp.add(disc);
  return grp;
}

/** 球场白线：贴地的细长条（参考图地板上那些白线）。 */
function makeCourtLine(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, (p.y || 0) + 7, p.z);
  grp.rotation.y = p.rot || 0;
  const w = p.w || 1200;
  const t = p.t || 16;
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, t),
    new THREE.MeshBasicMaterial({ color: 0xe8e4d6, transparent: true, opacity: 0.5,
                                  depthWrite: false }));
  bar.rotation.x = -Math.PI / 2;
  // 同样在角色之下（见 makeLightPool 的说明）
  bar.renderOrder = -4;
  grp.add(bar);
  return grp;
}

/** 登记台：一张桌子 + 一把椅子（参考图尽头那套，位置也在尽头）。 */
function makeDeskSet(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, p.y || 0, p.z);
  grp.rotation.y = p.rot || 0;
  const tw = p.w || 260;
  const td = p.d || 120;
  const th = p.h || 150;
  for (const dx of [-tw * 0.42, tw * 0.42]) {
    for (const dz of [-td * 0.34, td * 0.34]) {
      const leg = paperBox(18, th, 18, 0x6b4f36, { shared: 'benchLeg' });
      leg.position.set(dx, 0, dz);
      grp.add(leg);
    }
  }
  const top = paperBox(tw, 20, td, 0xb08356, { shared: 'benchSeat' });
  top.position.y = th;
  grp.add(top);
  /* 椅子在桌子**靠里那一侧**（局部 +z），人坐下**面朝场地**（局部 −z）。
     ⚠️ 第一版整个写反了：椅子摆在临场那侧、靠背还在更外面 ——
        结果"人坐着面朝墙"，用户一眼就看出来了。
        桌子的 rot 已经让局部 +z 指向远墙，所以椅子放 +z 就是"在桌子里面"。 */
  const chairZ = td * 0.95;
  const seat = paperBox(80, 16, 80, 0xa9835c, { shared: 'benchSeat' });
  seat.position.set(0, 70, chairZ);
  grp.add(seat);
  const back = paperBox(80, 74, 14, 0xa9835c, { shared: 'benchSeat' });
  back.position.set(0, 86, chairZ + 36);
  grp.add(back);
  for (const dx of [-30, 30]) {
    const leg = paperBox(12, 70, 12, 0x6b4f36, { shared: 'benchLeg' });
    leg.position.set(dx, 0, chairZ);
    grp.add(leg);
  }
  return grp;
}

/* ---------------- 小径 ----------------
   参考图里最显眼的就是那条**从远处弯过来**的土路，两边点着路灯。
   ⚠️ `path` 这个 kind 一直挂在"贴花名单"里，**但从来没有构件** ——
      场景里写 `{kind:'path'}` 什么都不会画，而且不报错（静默失效）。
      这里补上。

   做法：把折线每一段做成一个贴地的四边形（直接算顶点，不用旋转平面 ——
   平面先绕 X 转 90° 再绕 Z 转的轴向很容易搞错）。
   贴图是横着来的：U 沿路走、V 横跨路面，V 方向两头透明 —— 路缘自然虚掉。 */
function pathTexture() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  // 横向（V 轴）两端透明、中间实
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(150,124,88,0)');
  grad.addColorStop(0.22, 'rgba(158,131,94,0.95)');
  grad.addColorStop(0.78, 'rgba(150,124,88,0.95)');
  grad.addColorStop(1, 'rgba(150,124,88,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // 沙砾斑点（确定性：用坐标当伪随机，避免每次刷新路面不一样）
  for (let i = 0; i < 90; i += 1) {
    const x = (i * 37) % size;
    const y = (i * 53) % size;
    const v = (i * 29) % 40;
    g.fillStyle = `rgba(${120 + v},${100 + v},${72 + v},0.5)`;
    g.fillRect(x, y, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makePath(p) {
  const grp = new THREE.Group();
  const pts = p.points || [];
  if (pts.length < 2) return grp;
  const w = p.w || 190;
  const y = (p.y || 0) + 4;
  const tex = pathTexture();
  tex.repeat.set(1, 1);
  const pos = [];
  const uv = [];
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (w / 2), nz = (dx / len) * (w / 2);
    // 每段往两头各多伸半个路宽，拐弯处不会裂开
    const ex = (dx / len) * (w / 2), ez = (dz / len) * (w / 2);
    const ax = x1 - ex, az = z1 - ez, bx = x2 + ex, bz = z2 + ez;
    const quad = [
      [ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz],
      [ax + nx, az + nz], [bx - nx, bz - nz], [ax - nx, az - nz],
    ];
    const uvQuad = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
    for (let k = 0; k < 6; k += 1) {
      pos.push(quad[k][0], y, quad[k][1]);
      uv.push(uvQuad[k][0] * (len / 128), uvQuad[k][1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  // 和光斑/白线一样：必须画在**角色之下**，否则加色/半透明的面会盖住角色贴图
  mesh.renderOrder = -7;
  grp.add(mesh);
  return grp;
}

/* ---------------- 天空盒（three.js 手册的 background 用法）----------------
   手册：https://threejs.org/manual/#backgrounds
   做法就是 `scene.background = 贴图`，贴图用**等距柱状投影**（equirectangular，
   宽高 2:1），并且把 `mapping` 设成 `EquirectangularReflectionMapping` ——
   这样 three 会把它当成环绕整个场景的天空球来采样，而不是贴在一块平面上。
   （另一条路是 CubeTexture 六面图，这里没必要：程序生成一张 2:1 的就行。）

   ⚠️⚠️ **但这个机位下天空基本看不到**，这不是实现问题，是几何决定的：
       相机 pitch 45~60°、fov 35°（半角 17.5°）→ 画面覆盖的是
       pitch±17.5° = **27.5°~77.5° 的俯角**，整幅都在地平线以下。
       所以：
         · 天空盒只在"地面不够大、画面顶边越过地面远端"的那一条里露出来；
         · 参考图里那轮月亮要看得见，只能把它画在**地平线略下方**（约 -25°），
           因为那才是这个机位能采样到的方向。
       地面留不留边、留多少，由场景的 `groundMargin` 决定（见 buildScene）。 */
let _skyCache = null;

function makeSkyTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // 等距柱状：上半天是天空、下半天是地面，地平线在正中间
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, '#05070f');
  sky.addColorStop(0.55, '#0d1730');
  sky.addColorStop(1, '#1d2c4d');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H / 2);
  // 地平线以下（俯视机位能看到的那一半）压暗，当作"远处的夜色"
  const below = g.createLinearGradient(0, H / 2, 0, H);
  below.addColorStop(0, '#16233c');
  below.addColorStop(0.25, '#0d1626');
  below.addColorStop(1, '#070c16');
  g.fillStyle = below;
  g.fillRect(0, H / 2, W, H / 2);

  // 星：确定性伪随机（同一个 i 每次画在同一处，刷新不会跳）
  for (let i = 0; i < 260; i += 1) {
    const x = ((i * 733) % W);
    const y = ((i * 197) % (H * 0.48));
    const r = 0.6 + ((i * 37) % 10) / 10;
    g.fillStyle = `rgba(255,252,240,${0.25 + ((i * 53) % 60) / 100})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  /* 月亮：画在**地平线略下方**。
     因为相机整幅都在地平线以下，画在正上方的话这个机位永远采样不到。 */
  const mx = W * 0.30, my = H * 0.56, mr = H * 0.075;
  const glow = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 4.2);
  glow.addColorStop(0, 'rgba(255,250,225,0.42)');
  glow.addColorStop(1, 'rgba(255,250,225,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(mx, my, mr * 4.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fdf8e3';
  g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(226,220,196,0.5)';
  for (const [dx, dy, rr] of [[-0.3, -0.2, 0.16], [0.24, 0.1, 0.12], [-0.05, 0.34, 0.1]]) {
    g.beginPath();
    g.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2);
    g.fill();
  }

  /* 地平线上的城市剪影（贴在 H/2 那条线上，正好是"远处"）
     灯窗是暖黄的，和参考图里那条天际线一个意思。 */
  g.fillStyle = '#0a1018';
  let x = 0;
  let seed = 7;
  while (x < W) {
    const bw = 40 + ((seed * 61) % 90);
    const bh = 18 + ((seed * 29) % 62);
    g.fillRect(x, H / 2 - bh, bw, bh);
    seed += 13;
    x += bw + 6 + ((seed * 17) % 26);
  }
  for (let i = 0; i < 150; i += 1) {
    const lx = (i * 313) % W;
    const ly = H / 2 - 6 - ((i * 71) % 46);
    g.fillStyle = i % 4 === 0 ? 'rgba(255,214,140,0.85)' : 'rgba(255,226,168,0.42)';
    g.fillRect(lx, ly, 2.5, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // 关键一步：当成"天空球"来采样（手册里 background 的两种映射之一）
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

export function skyTexture() {
  if (!_skyCache) _skyCache = makeSkyTexture();
  return _skyCache;
}

/** 月塔端口：世界里那个能盖章/摸签/翻日记的终端。
 *
 *  世界观：月塔是吞吐整座城市数据的主机（小说序章），它给每个记录员开一个端口。
 *  外形就照这个意思做 —— 一根柱子顶着一块**亮着的屏**（屏用不受光的材质，
 *  夜里才像"通着电"），旁边挂一块小牌子写明它是什么。
 *
 *  ⚠️ 和登记台一样，它必须是 `locals` 里的**可交互物**才会被登记
 *     （见 build.js 的 locals 循环：任何有构件的 kind 都行）。 */
function makeTowerPort(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, p.y || 0, p.z);
  grp.rotation.y = p.rot || 0;
  const hgt = p.h || 300;
  const wid = p.w || 150;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(46, 58, 60, 8), lambert(0x6b4f36, 'lampBase'));
  base.position.y = 30;
  base.castShadow = true; base.receiveShadow = true;
  grp.add(base);
  const pole = paperBox(30, hgt, 30, 0x6b4f36, { shared: 'benchLeg' });
  pole.position.y = 0;
  grp.add(pole);
  // 屏：不受光（MeshBasicMaterial）—— 夜里它自己亮着，像还通着电
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(wid, wid * 0.72),
    new THREE.MeshBasicMaterial({ color: 0xbfe3ff, side: THREE.DoubleSide }));
  screen.position.set(0, hgt + wid * 0.36, 4);
  screen.rotation.x = -0.12;
  grp.add(screen);
  // 屏框
  const frame = paperBox(wid + 26, wid * 0.72 + 26, 22, 0x2a2a2e, { shared: 'benchLeg' });
  frame.position.set(0, hgt - 13 - 6, -10);
  grp.add(frame);
  return grp;
}

function makeBed(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  grp.add(paperBox(p.w || 420, 60, p.d || 320, 0xb98f6a, { shared: 'bedBase' }));
  const cushion = paperBox((p.w || 420) * 0.9, 70, (p.d || 320) * 0.84, 0xe0c9a6, { shared: 'cushion' });
  cushion.position.y = 60;
  grp.add(cushion);
  return grp;
}

function makeBowl(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  const r = PROP.bowl;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.72, r * 0.7, 14),
    new THREE.MeshLambertMaterial({ color: PAPER.seal }));
  bowl.position.y = r * 0.35;
  bowl.castShadow = true;
  grp.add(bowl);
  const food = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, r * 0.2, 14),
    new THREE.MeshLambertMaterial({ color: PAPER.gold }));
  food.position.y = r * 0.62;
  grp.add(food);
  return grp;
}

function makeShelf(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  grp.add(paperBox(p.w || 420, 300, p.d || 100, 0xa9835c, { shared: 'shelf' }));
  for (let i = 0; i < 4; i += 1) {
    const badge = new THREE.Mesh(new THREE.CircleGeometry(32, 12),
      new THREE.MeshLambertMaterial({ color: [0xb8892f, 0x2447d8, 0x7a3fa8, 0x4a6b4f][i] }));
    badge.position.set(-120 + i * 80, 190, (p.d || 100) / 2 + 4);
    grp.add(badge);
  }
  return grp;
}

function makeRug(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, 0, p.z);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(p.w || 480, p.d || 380),
    new THREE.MeshLambertMaterial({ color: 0xd8c19a }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 5;
  rug.receiveShadow = true;
  grp.add(rug);
  return grp;
}

const PROP_BUILDERS = {
  tree: makeTree, bench: makeBench, umbrella: makeUmbrella, planter: makePlanter,
  lamp: makeLamp, pond: makePond, bed: makeBed, bowl: makeBowl,
  shelf: makeShelf, rug: makeRug, hedge: makeHedge, fountain: makeFountain,
  stall: makeStall, stage: makeStage, portalsign: makePortalSign,
  // 室内竞技场的构件（照参考图做的：看台/顶灯光锥/地面光斑/球场线/登记桌椅）
  bleachers: makeBleachers, ceilinglamp: makeCeilingLamp, lightpool: makeLightPool,
  courtline: makeCourtLine, deskset: makeDeskSet,
  // 公园的土路（原来只登记在贴花名单里、没有构件，写了也不画）
  path: makePath,
  // 月塔端口：世界里那个能盖章/摸签/翻日记的终端
  towerport: makeTowerPort,
};

/* 用真实模型（Kenney，CC0）替换手搓几何的道具类型。
   模型没载入时自动退回下面的占位实现，所以离线也能跑。 */
/* ⚠️ 用外部模型的 kind 必须登记在这里，**只加 MODELS_BY_KIND 是不够的**。
   漏了的话这个道具会**静默地什么都不画** —— 不报错、不警告，场景里就是少一块。
   （我自己就栽在这：加了 kind、加了 TARGET_HEIGHT，结果场景里量不到东西。）
   下面 props 循环里有一段兜底，会把这种情况用 console.warn 报出来。 */
const MODEL_KINDS = new Set(['tree', 'bush', 'grass', 'flower', 'mushroom',
                             'rock', 'stone', 'stump', 'moontower']);

function makeModelProp(p, index) {
  return makeModelPropNode(p, index);
}

/* ---------------- 地块：可交互物 / 传送点 ---------------- */
function makeBoard(local) {
  const grp = new THREE.Group();
  grp.position.set(local.x, 0, local.z);
  grp.rotation.y = local.rot || 0;
  // 公告板别做太大：它离相机近，做大了就是一块白板压在画面中间
  // ⚠️ 两条腿必须分开写坐标。原来 post 用 `position.y = 85`、post2 用
  // `position.set(0, 85, 0)` —— 两根**完全重合**，等于两个一样的盒子占同一块
  // 空间：每个面都在 z-fighting，而且画面上只看得到一条腿。
  // 面板宽 240，腿放在 ±100（腿宽 24，正好落在面板边缘内侧）。
  const post = paperBox(24, 170, 24, PAPER.woodDark, { shared: 'benchLeg' });
  /* ⚠️ 腿的 y 必须是 **0**，不是 85。
     paperBox 的 group 原点在**底面**（内部 mesh.position.y = h/2），
     写 85 会让整条腿浮在离地 85 的地方 —— 实测世界 y[85,255]，
     用户截图里的"公告板浮空"就是这个。 */
  post.position.set(-100, 0, 0);
  grp.add(post);
  const post2 = paperBox(24, 170, 24, PAPER.woodDark, { shared: 'benchLeg' });
  post2.position.set(100, 0, 0);
  grp.add(post2);
  // 面板要**压在腿顶上**：腿高 170，所以面板底 = 170（不是 250）
  const panel = paperBox(240, 170, 26, 0xf6f0e2, { shared: 'boardPanel' });
  panel.position.y = 170;
  grp.add(panel);
  const { tex, aspect } = signTexture(local.label.slice(0, 4), '#111211');
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(170, 170 / aspect * 0.62),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  plane.position.set(0, 255, 15);   // 面板中心 = 170 + 170/2
  grp.add(plane);
  return grp;
}

/** 传送点：**只有地上的一圈蓝环**（功能触发区的可视部分）。
 *  ⚠️ 路牌已拆出去，见下面 makePortalSign 的说明 —— portals 现在纯粹是功能。 */
function makePortal(portal) {
  const grp = new THREE.Group();
  grp.position.set(portal.x, 0, portal.z);
  const r = portal.r || PROP.portal.radius;
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.62, r * 0.82, 40),
    new THREE.MeshBasicMaterial({ color: 0x2447d8, transparent: true, opacity: 0.4,
                                  side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 8;
  grp.add(ring);
  const rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r, 40),
    new THREE.MeshBasicMaterial({ color: 0x2447d8, transparent: true, opacity: 0.2,
                                  side: THREE.DoubleSide }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 7;
  grp.add(rim);
  // 中间一个箭头：告诉玩家"往里走"
  const arrow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.3, 3),
    new THREE.MeshBasicMaterial({ color: 0x2447d8, transparent: true, opacity: 0.28,
                                  side: THREE.DoubleSide }));
  arrow.rotation.x = -Math.PI / 2;
  arrow.rotation.z = Math.PI / 2;
  arrow.position.y = 9;
  grp.add(arrow);
  return grp;
}

/* 传送路牌已拆成入口（见下面的 PORTAL_SIGN / 场景数据里的 kind: 'portalsign'）。

   原来 makePortal 顺手画了一块"旁边的木牌"，位置是 `(-r * 1.05, 130, 0)`
   写死的 —— 距离还跟着触发半径 r 变，而且牌子是 billboard，连转向都做不到。
   用户要"牌子和功能性传送解绑、各自独立管理"，所以：
     · portals     = 纯功能（to / 位置 / 半径），不再画任何牌子
     · portalsign  = 独立道具，自己 x/z/rot/y/label
   迁移时把每块牌子按原位置 `(portal.x - r*1.05, portal.z)` 补成了独立道具，
   视觉和以前一致；之后它就能单独挪、单独转了。 */

/** 传送路牌：独立道具，和传送点没有任何绑定。
 *  `label` 牌面文字 · `rot` 朝向 · `y` 抬高 · `post` 杆高(默认 260) ·
 *  `h` 字高(默认 130) · `color` 文字色(默认蓝 #2447d8) ·
 *  `billboard: false` 时牌子跟着 `rot` 转（默认 true：斜俯视下牌子不面朝
 *  相机会歪得看不清字）。 */
function makePortalSign(p) {
  const grp = new THREE.Group();
  grp.position.set(p.x, p.y || 0, p.z);
  /* ⚠️ **没有柱子**。用户明确要求把路牌的立柱删掉 —— 那些深色高杆在街景里
     看着就是一根根孤零零的柱子。现在牌子直接**立在地上**：底边离地 8 格、
     略向后仰 12°（像插在路边的小告示牌），不再有杆子。
     代价：牌子矮了，俯视下不如以前醒目 —— 但传送圈本身还在地上发光，
     位置不会找不到。 */
  const h = p.h || 130;
  const { tex, aspect } = signTexture(p.label || '', p.color || '#2447d8');
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true,
                                  side: THREE.DoubleSide }));
  plane.position.y = h / 2 + 8;
  plane.rotation.x = -0.12;                 // 略后仰，看着是"立"着的
  if (p.billboard === false) grp.rotation.y = p.rot || 0;
  else plane.userData.billboard = true;
  grp.add(plane);
  return grp;
}

/* 需要碰撞体的道具类型（长条形/占地方的） */
const SOLID_PROPS = new Set(['planter', 'bed', 'shelf', 'hedge', 'stall',
                             'fountain', 'moontower',
                             // 看台和登记台要挡路；顶灯在头顶、光斑与白线是贴地装饰
                             'bleachers', 'deskset', 'towerport']);

/** 碰撞体默认尺寸表（场景数据没写 w/d 时用） */
const SOLID_DEFAULT = {
  planter: [400, 150], bed: [420, 320], shelf: [420, 100],
  hedge: [600, 120], stall: [320, 200], fountain: [600, 600],
  moontower: [520, 520],
  bleachers: [900, 500], deskset: [300, 180],
};

/* ---------------- 主入口 ---------------- */
/** 各类小东西在地面上的半宽/半深（要和 tools/layout_check.mjs 的 footprint 一致） */
const FOOT = {
  tree: [90, 90], lamp: [26, 26], bench: [100, 45], hedge: [150, 45],
  planter: [140, 140], fountain: [180, 180], umbrella: [130, 130],
  bush: [100, 100], rock: [100, 100], stump: [100, 100],
  stall: [120, 100], portal: [130, 130], local: [90, 90],
  // 路牌只有杆子占地（牌子是悬在 260 高的 billboard，不占地面）
  portalsign: [20, 20],
  // 室内竞技场：光斑和白线是**贴地装饰**（不占地，见 FOOT_SOFT）；
  // 顶灯整个在头顶（吊杆 1500 以上），占地按一根杆算。
  lightpool: [10, 10], courtline: [10, 10], ceilinglamp: [20, 20],
  bleachers: [450, 250], deskset: [150, 90], towerport: [90, 90],
};
const FOOT_SOFT = new Set(['flowers', 'grass', 'decal', 'path', 'portalsign',
                           // 贴地装饰：不参与"压没压到"的检查，也不算障碍
                           'lightpool', 'courtline', 'ceilinglamp']);

/**
 * 把压在建筑占位里的小东西推出去（确定性，不用随机）。
 *
 * 为什么要这层兜底：场景是手写的"屏幕坐标构图"，一次改动（比如给楼加台基、
 * 改台基宽度）就可能让几十个道具陷进楼里，靠人一个个核对不现实。
 * 这里保证**几何上一定不打架**；而"作者写的位置本身该改"这件事，
 * 由 tools/layout_check.mjs 继续报清单，慢慢收敛。
 *
 * 只挪小东西，**绝不挪建筑**——建筑一挪，辛苦调好的画面构图就散了。
 *
 * @returns {number} 挪动了几个
 */
export function alignToBlocks(scene, colliders, margin = 24) {
  const boxes = colliders.map((c) => ({ x0: c.x, x1: c.x + c.w, z0: c.z, z1: c.z + c.d }));
  if (!boxes.length) return 0;

  const half = (kind, o) => {
    if (kind === 'fountain') { const r = o.r || 180; return [r, r]; }
    return FOOT[kind] || [(o.w || 200) / 2, (o.d || 200) / 2];
  };

  const sp = scene.spawn || { x: 0, z: 0 };
  const fix = (o, kind) => {
    if (FOOT_SOFT.has(o.kind)) return false;
    const [hw, hd] = half(kind, o);
    const ox = o.x, oz = o.z;
    for (let pass = 0; pass < 3; pass += 1) {
      for (const b of boxes) {
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        const dx = o.x - cx, dz = o.z - cz;
        const needX = (b.x1 - b.x0) / 2 + hw + margin;
        const needZ = (b.z1 - b.z0) / 2 + hd + margin;
        const penX = needX - Math.abs(dx);
        const penZ = needZ - Math.abs(dz);
        if (penX <= 0 || penZ <= 0) continue;
        // ⚠️ 只处理**明确陷在楼里**的（重叠超过自身尺寸的 60%），擦边的不管。
        // 这条阈值是必需的：自动避让会挪动道具，而端到端测试是沿着
        // "从出生点/道具出发走直线"来验碰撞的——把擦边的道具也一起挪，
        // 就会在走道上凭空多出一个障碍物，测试挂掉（"撞上建筑会停下""花箱会挡路"
        // 两条都这么挂过一次）。宁可按兵不动，也不要动到不该动的。
        const deep = Math.min(penX, penZ) > Math.min(hw, hd) * 1.2;
        if (!deep) continue;
        // 沿最短出门方向推，位移最小
        if (penX < penZ) o.x = cx + Math.sign(dx || 1) * needX;
        else o.z = cz + Math.sign(dz || 1) * needZ;
      }
    }
    return Math.abs(o.x - ox) > 0.5 || Math.abs(o.z - oz) > 0.5;
  };

  let moved = 0;
  for (const p of scene.props || []) if (fix(p, p.kind)) moved += 1;
  for (const l of scene.locals || []) if (fix(l, 'local')) moved += 1;
  for (const pt of scene.portals || []) if (fix(pt, 'portal')) moved += 1;
  if (moved && typeof console !== 'undefined') {
    console.info(`[world] ${scene.code}: 自动避让挪开了 ${moved} 个压在建筑上的东西`
      + '（场景文件里写的位置偏了；跑 node tools/layout_check.mjs 看清单）');
  }
  return moved;
}

/**
 * 背景幕布：把一张画好的"远景图"贴在一个大平面上，立在场地远端。
 *
 * 为什么不用天空盒：这个相机是**斜俯视**（45~60°），画面里几乎全是地面，
 * 天空盒在画面上根本看不到。只有**有限距离**的平面才会随相机移动产生
 * 正确的视差 —— 近处的东西动得快、幕布动得慢，这就是"移动时的视觉效果"。
 *
 * 两个坑：
 * ① 材质必须是 `MeshBasicMaterial`（不吃光照）。它本身就是一张画好的夜景图，
 *    再被"月光"压一次就糊成一团黑。
 * ② 贴图要设 SRGBColorSpace，否则线性空间下颜色会发灰。
 */
function makeBackdrop(b) {
  const w = b.w || 5600;
  const h = b.h || 3200;
  const tex = new THREE.TextureLoader().load(b.url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  /* 站位：`floorRatio` 是"图里地平线在高度上的位置"（从顶往下量，0~1）。
     让它正好落在 y=0（3D 地面的高度）—— 图下半部分的草地就会**被 3D 地面挡住**，
     只露出地平线以上的天空/月亮/城市天际线，这正是俯视相机下能看到的那一条。 */
  const fr = b.floorRatio === undefined ? 0.5 : b.floorRatio;
  mesh.position.set(b.x, (0.5 - fr) * h + (b.y || 0), b.z);
  mesh.rotation.y = b.yaw || 0;
  mesh.name = 'backdrop';
  mesh.frustumCulled = false;      // 它比默认视锥大，别被裁掉
  return mesh;
}

export function buildScene(scene) {
  const root = new THREE.Group();
  const colliders = [];
  const interactables = [];
  const portals = [];

  const cx = scene.size.w / 2, cz = scene.size.d / 2;

  // 地面：比玩法区域外扩一圈，走到边上也不会看到"世界尽头"。
  // ⚠️ 一定要以场景中心为中心（第一版放在原点，3/4 的场地没有地板）
  /* 外扩量可以按场景覆盖（`scene.groundMargin`）。
     为什么需要这个：斜俯视相机整幅都在地平线以下，**天空盒只有在
     "画面顶边越过地面远端"时才会露出来**。想让公园露出夜空和月亮，
     就得把地面收窄一点（小到甚至为负）—— 收窄之后"世界尽头"会露边，
     所以配合天空盒用：露出来的那一截正好是夜空，不是黑边。 */
  const margin = scene.groundMargin === undefined ? GROUND_MARGIN : scene.groundMargin;
  const gw = scene.size.w + margin * 2;
  const gd = scene.size.d + margin * 2;
  const tex = groundTexture(scene.ground);
  const tile = scene.ground.tile || 210;
  tex.repeat.set(gw / (tile * 2), gd / (tile * 2));
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(gw, gd),
    new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  root.add(floor);

  // 场地边界：一圈矮石缘，明确"玩到这儿为止"
  const kerbColor = scene.ground.border ? scene.ground.border : PAPER.kerb;
  const kerbW = 40;
  const edges = [
    { x: cx, z: 0, w: scene.size.w + kerbW, d: kerbW },
    { x: cx, z: scene.size.d, w: scene.size.w + kerbW, d: kerbW },
    { x: 0, z: cz, w: kerbW, d: scene.size.d + kerbW },
    { x: scene.size.w, z: cz, w: kerbW, d: scene.size.d + kerbW },
  ];
  /* 路缘只在**地面没被收窄**时画。
     margin < 0 的场景（公园为了露天空收了 −700）里，路缘会落在**地面之外**，
     从别的角度看就是一个浮在空中的灰框（用户截图里那个）。这种场景的边界
     交给天空盒：地面之外是夜空，不是黑边。 */
  if (margin >= 0) {
    for (const e of edges) {
      const k = paperBox(e.w, 26, e.d, kerbColor, { shared: 'kerb' });
      k.position.set(e.x, 0, e.z);
      root.add(k);
    }
  }

  // 背景幕布：先加，深度测试会把它放到所有东西后面
  if (scene.backdrop) root.add(makeBackdrop(scene.backdrop));

  for (const b of scene.blocks || []) {
    const g = makeBuilding(b);
    if (b.y) g.position.y += b.y;      // 抬升；不写就是贴地（默认 0）
    root.add(g);
    colliders.push(g.userData.collider);
  }

  /* ---- 外部搭好的整个场景（Blender 导出 glb）----
     场景数据里写：
       PLAZA.imported = {
         url: 'models/scenes/plaza.glb',        // 相对 public/
         colliders: [{ x, z, w, d }, …],        // 挡路的盒子，**必须自己声明**
       };
     ⚠️ 两条前提，先说清楚：
       1) 外部网格只是**静态装饰**，进不了编辑器、也不吃参数化那一套
          （改一个招牌要回 Blender 重导）。它和 blocks/props **可以共存**，
          通常的做法是：外部场景铺大体（地形、道路、大件），
          blocks/props 继续放要参与玩法的东西（传送门、交互物、NPC）。
       2) **碰撞不会自动算**。这里的几何是任意网格，推不出轴对齐盒子，
          所以挡路的地方必须在 `colliders` 里手写。不写就是可以穿过去。
     加载是异步的，但 buildScene 是同步的 —— 所以外部场景由页面在
     `preloadModels()` 里一起预载（见 models.js）。加载失败时这里会
     在控制台报一条明确的错，而不是静默空白。 */
  const imp = scene.imported;
  if (imp && imp.url) {
    const node = instanceSceneImport(imp.url);
    if (node) {
      /* 归一化：外部场景套一层包装节点再缩放，**不动模型自身的变换**
         —— 在 Blender 里为了方便缩放物体再导出是常规操作，那些 scale
         落在节点上，直接改根节点的 scale 会把它们顶掉（详见 models.js）。
         `normalize` 用来自动对齐尺寸，省得手算倍率：
             imported: { url, normalize: { axis: 'x', to: 2200 } }
         意思"把外部场景的 x 跨度缩放到 2200"（一般填场景 size.w，和地面板块对齐）。 */
      const wrap = new THREE.Group();
      wrap.add(node);
      let k = imp.scale || 1;
      if (imp.normalize?.axis && imp.normalize.to) {
        const b0 = new THREE.Box3().setFromObject(node);
        const cur = b0.getSize(new THREE.Vector3())[imp.normalize.axis];
        if (cur > 0) k *= imp.normalize.to / cur;
      }
      wrap.scale.setScalar(k);
      // 脚底贴地：把整个外部场景的最低点抬到 y=0（`ground: false` 可关掉）
      if (imp.ground !== false) {
        const b1 = new THREE.Box3().setFromObject(wrap);
        wrap.position.y = -b1.min.y;
      }
      if (imp.y) wrap.position.y += imp.y;
      root.add(wrap);
    } else if (!hasSceneImport(imp.url)) {
      console.error(`[world] 场景「${scene.code}」声明了外部场景 ${imp.url}，`
        + '但它没有预载成功 —— 检查文件是否在 public/ 下、'
        + '以及 pages/world.js 是否把它的 url 传给了 preloadModels()。');
    }
    for (const c of imp.colliders || []) {
      if (!c || c.w === undefined || c.d === undefined) continue;
      colliders.push({ x: c.x - c.w / 2, z: c.z - c.d / 2, w: c.w, d: c.d });
    }
  }

  // ---- 关于"压在楼里的道具" ----
  // 这里曾经调用 alignToBlocks()，在运行时把陷进楼里的道具自动推出去。
  // **已经撤销**：运行时悄悄挪东西是错的做法——它会往玩家出生点正前方的走道上
  // 塞进新的障碍物，把"撞上建筑会停下""道具（花箱）也会挡路"这两条端到端检查弄挂，
  // 而且这种改动在场景文件里完全看不出来，下次谁改都不明白那东西为什么在那儿。
  // 正确做法是**直接改场景文件里的坐标**。工具链已经齐了：
  //   node tools/layout_check.mjs         查出所有重叠（含"谁和谁重叠多少格"）
  //   node tools/fix_overlap.mjs <场景名>  算出每一处该挪到哪，照着改场景文件
  // alignToBlocks 保留备用（比如以后写批量迁移脚本），但不再自动跑。
  //
  // 已经改对的那一条：碰撞盒口径。台阶只有 26 高，狗能站上去，所以
  // **不把台阶算进碰撞盒**，只算台基（楼身 +40）——那才是真的走不过去的墙。

  for (const [i, p] of (scene.props || []).entries()) {
    // 优先用真实模型；没有就退回手搓几何
    let node = MODEL_KINDS.has(p.kind) ? makeModelProp(p, i) : null;
    if (!node) {
      const fn = PROP_BUILDERS[p.kind];
      node = fn ? fn(p) : null;
    }
    // 兜底：这个 kind 有外部模型、却没进 MODEL_KINDS —— 上面那行会直接跳过它，
    // 场景里就**静默地少一块**（不报错、不警告）。这个坑我自己踩过，报出来。
    if (!node && pickModelName(p.kind, 0)) {
      console.warn(`[world] 道具 kind "${p.kind}" 在 models.js 里有模型，`
        + '但它不在 build.js 的 MODEL_KINDS 里，这一件被跳过了（画不出来）。'
        + '把 kind 加进 MODEL_KINDS 即可。');
    }
    if (node) {
      /* ---- 垂直位置（y）----
         这个场景格式**原本没有 y 轴**：所有 maker 都硬写
         `grp.position.set(p.x, 0, p.z)`，物件贴地生成、靠内部偏移往上叠，
         想抬一个东西只能去改它 maker 里的几何。
         现在数据里写 `y: 300` 就能整体抬起来（不写 = 0 = 保持原样，
         所以对已有场景完全没有影响）。 */
      if (p.y) node.position.y += p.y;
      root.add(node);
    }
    /* 抬到狗头顶之上就不再挡路。
       碰撞盒是**二维的**（只有 x/z），表达不了"从底下走过去"这件事，
       所以悬空物的碰撞体直接丢掉。180 的来历：狗显示高 135
       （DOG 100 × DOG_SCALE 1.35），底面抬到 180 以上狗一定过得去。 */
    const airborne = (p.y || 0) >= 180;
    if (!airborne && node && node.userData.collider) {
      colliders.push(node.userData.collider);
    } else if (!airborne && SOLID_PROPS.has(p.kind)) {
      const [dw, dd] = SOLID_DEFAULT[p.kind] || [200, 200];
      const w = p.w || dw, d = p.d || dd;
      colliders.push({ x: p.x - w / 2, z: p.z - d / 2, w, d });
    }
  }
  for (const l of scene.locals || []) {
    if (l.kind === 'board') {
      const b = makeBoard(l);
      if (l.y) b.position.y += l.y;
      root.add(b);
    } else if (PROP_BUILDERS[l.kind]) {
      /* 其他构件也能当交互物。
         原来是写死的 `kind === 'board'` —— 于是"桌子/椅子"这类想做成入口的
         构件只能摆在 props 里，当不了交互物（用户要求"在桌子处设置一个可以
         跳转到竞技场页面的功能"，卡的就是这一条）。 */
      const node = PROP_BUILDERS[l.kind](l);
      if (l.y) node.position.y += l.y;
      root.add(node);
    }
    interactables.push(l);
  }
  for (const pt of scene.portals || []) {
    const m = makePortal(pt);
    if (pt.y) m.position.y += pt.y;
    root.add(m);
    portals.push(pt);
  }

  // 阴影开关统一在这里收口，省得每个零件都写一遍
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o === floor) { o.castShadow = false; o.receiveShadow = true; return; }
    if (o.material && o.material.isMeshBasicMaterial) { o.castShadow = false; return; }
    o.castShadow = true;
    o.receiveShadow = true;
  });

  return { root, colliders, interactables, portals };
}

export { INK, PAPER, signTexture };
