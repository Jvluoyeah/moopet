/* 世界里的"演员"：狗立牌 + 头顶名牌 + 脚下阴影
   ------------------------------------------------------------
   形象沿用现有分层 SVG 资源（breedArt.js）——世界、档案卡、对战三处长得一样，
   美术只做一次。立牌用 Sprite（永远朝向相机），这正是参考图里那种"2D 角色站在 3D 场景里"。
   */

import * as THREE from 'three';
import { portraitDataURI, THEMES } from '../lib/breedArt.js';
import { FORMS, actionFrames, breedAction, breedImage, hasActions } from '../lib/breedAssets.js';
import { signFont } from '../lib/fonts.js';

const _texCache = new Map();
const RASTER = 256;          // 光栅化分辨率

/**
 * 狗的贴图。
 *
 * ⚠️ 这里必须**把 SVG 光栅化到 canvas，再用 CanvasTexture**，
 * 不能直接 `TextureLoader.load(数据URI)` —— 那条路在 WebGL 上传时静默失败：
 * 贴图对象、图片都"加载成功"（complete=true、width=150），但屏幕上什么都不画。
 * 症状极具迷惑性：脚下的阴影（CanvasTexture）正常显示，狗却是隐形的。
 * 光栅化之后就走与阴影同一条已验证的路径，顺带消掉了异步竞态。
 */
function dogTexture(breed, level, theme, form = 'sit', flip = false) {
  const key = `${breed?.code || 'x'}:${level >= 30 ? 'l' : level >= 20 ? 'e' : level >= 10 ? 'r' : 'c'}:${theme}:${form}:${flip ? 'L' : 'R'}`;
  let tex = _texCache.get(key);
  if (tex) return tex;

  // ⚠️ 动作帧（run_02 这种）走的是**另一个缓存**（actions/index.json 那套，
  //    预载在 breedAssets 的 actionCache 里），不是 forms 的 images。
  //    早先这里只查 breedImage()，动作帧永远取不到 → 退回 SVG 占位，
  //    表现就是"战斗里玩家长大了的那只狗整个不见了"。
  const m = /^([a-z]+)_(\d+)$/.exec(form);
  if (m) {
    const tex2 = actionTexture(breed, level, theme, m[1], Number(m[2]) - 1, flip);
    if (tex2) { _texCache.set(key, tex2); return tex2; }
  }

  const cv = document.createElement('canvas');
  cv.width = cv.height = RASTER;
  const g = cv.getContext('2d');
  if (flip) { g.translate(RASTER, 0); g.scale(-1, 1); }   // 镜像靠画，不靠负缩放
  // 先画一个占位剪影，图片没解码完也不会是空白
  g.fillStyle = 'rgba(107,79,54,.18)';
  g.beginPath();
  g.ellipse(RASTER / 2, RASTER * 0.72, RASTER * 0.2, RASTER * 0.26, 0, 0, Math.PI * 2);
  g.fill();

  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  _texCache.set(key, tex);

  // 优先用用户提供的真实形象（public/breeds/<code>/forms/*.png）；
  // 没切图/加载失败就退回程序生成的木刻 SVG。两条路都光栅化到 canvas，
  // 走的是同一条"已验证能被 WebGL 上传"的路径。
  /* ⚠️ 判据是"有没有品种码"，**不是**"图加载好了没"。
     原来写的是 `const real = breedImage(code, form); if (real) {...}`，
     没加载好就退回程序生成的木刻 SVG —— 于是**真图明明存在、只是慢一步，
     画面上却先闪出一只假的卡通狗**（用户原话："莫名其妙就会跳出来"）。
     更糟的是贴图是**缓存**的：一旦某次退回 SVG，那只狗就一直是假的。

     现在：有品种码就直接指向真图文件（浏览器自己加载，加载完刷新贴图）；
     没品种码就留空 —— 空着比画一张假的强。 */
  const code = breed?.code;
  if (code) {
    const real = breedImage(code, form);
    if (real) {
      g.clearRect(0, 0, RASTER, RASTER);
      g.drawImage(real, 0, 0, RASTER, RASTER);
      tex.needsUpdate = true;
      return tex;
    }
    const img = new Image();
    img.onload = () => {
      g.clearRect(0, 0, RASTER, RASTER);
      // 真图是 512×512 的方形画布，直接铺满；脚底基线由 mesh 那边对齐
      g.drawImage(img, 0, 0, RASTER, RASTER);
      tex.needsUpdate = true;
    };
    img.onerror = () => console.warn('[world] 品种形象加载失败：', code);
    /* ⚠️ 形态要**先过滤**再拼路径，不然必然 404。
       实测：对战里受击那一刻会传进来 `hurt_01`（动作帧那套的命名），
       而品种目录里只有四张形态图 `{sit,face,paw,lie}` —— 于是每个品种
       每次受击都请求一个不存在的文件。原版这里直接拼 `forms/${form}.png`，
       `breedImage(code, form)` 返回 null 也照样拼（返回 null 只影响走不走
       下面这条"加载后刷新"的路，不影响拼 URL），所以控制台里一直有 404，
       e2e_smoke 还因此以非 0 退出（它是"有 console 报错就算失败"）。
       现在：不在名单里的形态**退回 sit**（看得见狗，也不会去要一个没有的文件）。 */
    const safeForm = FORMS.includes(form) ? form : 'sit';
    img.src = `breeds/${code}/forms/${safeForm}.png`;
    return tex;
  }
  // 没有品种码：留空，不画假狗
  return tex;
}

/**
 * 动作帧贴图：`run` 的第 idx 帧（第二批出图，见 docs/出图提示词_萨摩耶.md）。
 * 没出图（还没画 / 加载失败）就返回 null，调用方据此退回静态形态。
 * 和 dogTexture 走同一条路：先画到 canvas 再当 CanvasTexture。
 */
/**
 * 把一张图光栅化成贴图。
 *
 * ⚠️ `flip` 是**把图像本身画成镜像**，不是给 Sprite 设负的 scale.x。
 * 踩过的坑：一开始用 `sprite.scale.x = -scale` 来翻面，看着像是标准做法，
 * 实际**完全没用**——three.js 的 Sprite 走的是自己的顶点着色器
 * （`(position.xy - center) * scale`），负缩放不会翻转 UV，画出来还是原图。
 * 用像素比对验过：左走和右走两帧的差异 48.48 vs 49.82，基本就是同一张图。
 * 所以只能老老实实画两份，按朝向换。
 */
function rasterize(img, flip) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = RASTER;
  const g = cv.getContext('2d');
  if (flip) { g.translate(RASTER, 0); g.scale(-1, 1); }
  g.drawImage(img, 0, 0, RASTER, RASTER);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function actionTexture(breed, level, theme, action, idx, flip = false) {
  const code = breed?.code;
  const list = breedAction(code, action);
  if (!list || !list.length) return null;
  const i = ((idx % list.length) + list.length) % list.length;
  const key = `act:${code}:${action}:${i}:${theme}:${flip ? 'L' : 'R'}`;
  let tex = _texCache.get(key);
  if (tex) return tex;
  tex = rasterize(list[i], flip);
  _texCache.set(key, tex);
  return tex;
}

export function clearActorCache() {
  _texCache.clear();
}

/** 名牌：Canvas 画一张小牌子，做成 Sprite */
export function namePlateTexture(text, color = '#111211', bg = 'rgba(255,253,248,.92)') {
  const pad = 12;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = signFont(30);      // 名牌也用霞鹜新致宋，和世界里的招牌统一
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  const h = 46;
  c.width = w; c.height = h;
  const g2 = c.getContext('2d');
  g2.fillStyle = bg;
  g2.fillRect(0, 0, w, h);
  g2.strokeStyle = color;
  g2.globalAlpha = 0.5;
  g2.lineWidth = 2;
  g2.strokeRect(1, 1, w - 2, h - 2);
  g2.globalAlpha = 1;
  g2.fillStyle = color;
  g2.font = font;
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}

/** 对话气泡图标（墨线画，不用 emoji） */
export function bubbleTexture(kind = 'talk') {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#d5ff52';
  g.strokeStyle = '#111211';
  g.lineWidth = 6;
  // 圆角气泡
  const x = 14, y = 14, w = 100, h = 74, r = 18;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.lineTo(x + 52, y + h);
  g.lineTo(x + 40, y + h + 22);      // 小尾巴
  g.lineTo(x + 36, y + h);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
  g.stroke();
  if (kind === 'talk') {
    g.fillStyle = '#111211';
    for (let i = 0; i < 3; i += 1) {
      g.beginPath();
      g.arc(46 + i * 18, 51, 5.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 脚下阴影（一张径向渐变贴图，避免用真实光照） */
let _shadowTex = null;
let _dustTex = null;
/** 扬尘：疾跑时在脚后根冒的小土团。
 *  为什么值得做：跑和走的速度差再大，画面上也只是"平移快一点"，
 *  没有参照物时人眼分辨不出来——用户就会觉得"按 Shift 没反应"。
 *  一串往身后飘的土团比数字直观得多。 */
function dustTexture() {
  if (_dustTex) return _dustTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(214,196,160,.85)');
  grd.addColorStop(0.55, 'rgba(206,186,148,.45)');
  grd.addColorStop(1, 'rgba(200,180,142,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  _dustTex = new THREE.CanvasTexture(c);
  _dustTex.colorSpace = THREE.SRGBColorSpace;
  return _dustTex;
}

const DUST_N = 7;
const DUST_LIFE = 0.55;

/** 给一只狗挂一串土团（对象池，不每帧新建材质） */
function attachDust(group, scale) {
  const pool = [];
  for (let i = 0; i < DUST_N; i += 1) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dustTexture(), transparent: true, depthWrite: false, opacity: 0 }));
    sp.scale.set(1, 1, 1);
    sp.visible = false;
    group.add(sp);
    pool.push({ sp, life: 0 });
  }
  let cursor = 0;
  return {
    /** @param str 0..1 强度（跑=1，走=0.35） */
    puff(t, str) {
      const d = pool[cursor];
      cursor = (cursor + 1) % DUST_N;
      d.life = DUST_LIFE;
      d.max = DUST_LIFE;
      const base = scale * 0.12;
      d.size = base * (0.7 + Math.random() * 0.6) * (0.6 + str);
      d.sp.position.set((Math.random() - 0.5) * scale * 0.16, 8 + Math.random() * 8, 0);
      d.sp.visible = true;
    },
    update(dt) {
      for (const d of pool) {
        if (d.life <= 0) continue;
        d.life -= dt;
        const k = Math.max(0, d.life / d.max);
        d.sp.material.opacity = k * 0.75;
        const grow = 1 + (1 - k) * 1.6;
        d.sp.scale.set(d.size * grow, d.size * grow, 1);
        d.sp.position.y += dt * 26;
        if (d.life <= 0) d.sp.visible = false;
      }
    },
  };
}

function shadowTexture() {
  if (_shadowTex) return _shadowTex;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(17,18,17,.34)');
  grd.addColorStop(1, 'rgba(17,18,17,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  _shadowTex = new THREE.CanvasTexture(c);
  return _shadowTex;
}

/**
 * 造一个狗演员（立牌 + 阴影 + 名牌）。
 * @returns {{group, sprite, plate, bubble, setLevel, setFacing, setName}}
 */
export function makeDogActor({ breed, level = 1, name = '', theme = 'day',
                               scale = 150, showPlate = true }) {
  let levelCur = level;
  const group = new THREE.Group();

  const shadow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.scale.set(scale * 0.72, scale * 0.28, 1);
  shadow.center.set(0.5, 0.5);
  shadow.position.y = 6;
  group.add(shadow);

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dogTexture(breed, level, theme), transparent: true }));
  sprite.scale.set(scale, scale, 1);
  sprite.center.set(0.5, 0.06);          // 脚底对齐
  group.add(sprite);

  let plate = null;
  if (showPlate && name) {
    const { tex, aspect } = namePlateTexture(name);
    plate = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false }));
    const h = scale * 0.26;              // 名牌随立牌缩放，别让它在小狗头上显得巨大
    plate.scale.set(h * aspect, h, 1);
    plate.center.set(0.5, 0);
    plate.position.y = scale * 0.96;
    group.add(plate);
  }

  let bubble = null;
  let curForm = 'sit';            // 当前贴图是哪一张，切图时用它去重
  let curFacing = 1;              // 1 = 朝右（原图方向），-1 = 朝左（画成镜像的那张）
  const dust = attachDust(group, scale);
  let dustAcc = 0;

  /** 按 (当前形态, 当前朝向) 换贴图。换朝向也走这里——因为镜像必须换图，
   *  不能靠 sprite.scale.x 取负（见 rasterize 的注释）。 */
  const useTexture = () => {
    const tex = dogTexture(breed, levelCur, theme, curForm, curFacing < 0);
    if (tex) { sprite.material.map = tex; sprite.material.needsUpdate = true; }
  };

  const actor = {
    group, sprite, plate,
    get bubble() { return bubble; },
    setFacing(sign) {
      const f = sign >= 0 ? 1 : -1;
      if (f === curFacing) return;
      curFacing = f;
      useTexture();               // 镜像靠换图，不靠 scale.x 取负
    },
    setLevel(lv) {
      level = lv;
      useTexture();
    },
    setName(text) {
      if (!text) return;
      const t = namePlateTexture(text);
      if (!plate) {
        plate = new THREE.Sprite(new THREE.SpriteMaterial({
          map: t.tex, transparent: true, depthWrite: false }));
        plate.center.set(0.5, 0);
        plate.position.y = scale * 0.96;
        group.add(plate);
      } else {
        plate.material.map = t.tex;
        plate.material.needsUpdate = true;
      }
      plate.scale.set(scale * 0.26 * t.aspect, scale * 0.26, 1);
    },
    showBubble(on = true, kind = 'talk') {
      if (on && !bubble) {
        bubble = new THREE.Sprite(new THREE.SpriteMaterial({
          map: bubbleTexture(kind), transparent: true, depthWrite: false }));
        bubble.scale.set(52, 52, 1);
        bubble.center.set(0.5, 0);
        bubble.position.y = scale * 1.32;
        group.add(bubble);
      } else if (!on && bubble) {
        group.remove(bubble);
        bubble = null;
      }
    },
    swim(t) {
      // 轻微上下浮动，让站着不动也不像贴图
      sprite.position.y = Math.sin(t * 2.2) * 3;
    },

    /**
     * 按状态换图 —— 大世界复用战斗的动作帧。
     *
     * 为什么要这么做：以前世界里所有狗都是**一张静止贴图在滑行**，
     * 站着还好（有 swim 的轻微起伏），一跑起来就是"贴纸在平移"，
     * 特别假。战斗那边本来就切好了一套 run/idle 动作帧，
     * 直接拿过来按速度切帧，两个场景的狗还长得一样。
     *
     * 没有动作帧的品种（其余 7 个）自动退回原来的"单图 + 起伏"，
     * 所以这是一步步到位的，不会青黄不接。
     *
     * @param {'idle'|'walk'|'run'|'jump'|'down'} kind
     * @param {number} t 秒（用来推进帧序，跟模拟无关，纯表现）
     */
    pose(kind, t, dir = 'down') {
      // 拖尘：跑起来每几帧在脚后根冒一团，走路的频率低、土团小
      if (kind === 'run' || kind === 'walk') {
        dustAcc += 1;
        const gap = kind === 'run' ? 3 : 9;
        if (dustAcc >= gap) { dustAcc = 0; dust.puff(t, kind === 'run' ? 1 : 0.35); }
      } else {
        dustAcc = 99;
      }
      if (!hasActions(breed?.code)) { actor.swim(t); return; }

      // 四向挑图。立牌是**侧面像**，所以：
      //   左右 → run/idle 帧（靠 setFacing 镜像）
      //   往画面里走（up）→ 有背面帧就用背面，这是"看着像在往那个方向走"的关键
      //   朝观众走（down）→ 用正面/坐姿
      let key;
      if (kind === 'idle') {
        key = dir === 'up' && actionFrames(breed.code, 'back') ? 'back_01' : 'sit';
      } else if (kind === 'run' || kind === 'walk') {
        if (dir === 'up' && actionFrames(breed.code, 'back')) {
          key = 'back_01';                       // 背对着镜头跑
        } else {
          const n = actionFrames(breed.code, 'run') || 0;
          if (n > 0) {
            const fps = kind === 'run' ? 11 : 7;  // 跑比走翻得快
            key = `run_${String(1 + (Math.floor(t * fps) % n)).padStart(2, '0')}`;
          }
        }
      } else if (kind === 'jump') key = 'jump_01';
      else if (kind === 'down') key = 'down_01';
      if (!key) { actor.swim(t); return; }

      if (key !== curForm) { curForm = key; useTexture(); }
      // 上下起伏：跑动比走路幅度大、频率高，腿动起来才不飘
      sprite.position.y = kind === 'jump' ? 0
        : Math.abs(Math.sin(t * (kind === 'run' ? 9 : 6))) * 5;
    },
    /** 每个演员每帧都要调：推进拖尘这类纯表现的东西 */
    tick(dt) {
      dust.update(dt);
    },
    dispose() {
      group.parent?.remove(group);
    },
  };
  return actor;
}

export { dogTexture, actionTexture };