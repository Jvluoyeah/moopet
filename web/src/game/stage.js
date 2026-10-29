/* 横板对战渲染：侧视正交 + 分层视差 + 顿帧抖动
   ============================================================
   和 v1 的俯视竞技场是两套完全不同的东西（那套已整体替换）。
   侧视的好处在这里体现得很直接：一条水平轴 + 一层层不同速度的背景，
   画面纵深全靠视差撑起来，不需要任何 3D 模型。

   坐标口径：**1 个 three 单位 = 1 格**，和 sim.js 的 `unitView()` 完全对齐，
   中间不做任何换算——换算层是 bug 的高发区。

   分层（从远到近，视差系数越大动得越快）：
     sky     0.08  天空纸底 + 远处山影
     far     0.30  远处房顶与树影
     mid     0.60  主街：房子、树、路灯
     ground  1.00  地面（和角色同速）
     near    1.25  前景草丛（比角色快，制造"镜头在里面"的感觉）
*/

import * as THREE from 'three';

const INK = 0x111211;
const PAPER = 0xf5f1e8;

/* ---------------- 画好的背景图（可选） ----------------
   竞技场 / 道场 / 训练关卡用 `public/backdrops/arena-hall.jpg` —— 一张"一点透视
   的室内大厅"：两侧木看台、顶上射灯、尽头一个门洞和桌椅。侧视对战配它正合适，
   选手就是站在大厅地板上打。

   **对位是关键**：图里的"墙脚线"（地板与远墙交界）在高度 55% 处（从上往下量），
   必须让这条线落在游戏的**地面线 y=0** 上 —— 这样图下半部分的地板才会正好
   被游戏自己的地面挡住。直接把图铺满的话，图里的地板会翘到选手身前，很怪。
   换图时重新量一下 floorRatio 即可。

   width 要够宽：背景层的位移是 `(camX − stageW/2) × (1 − parallax)`，
   相机在整条 stage 上平移时最多要移 (1−0.06)×stageW/2 ≈ 1100 格，
   再加上可见宽度，所以给到 4200 才不会被看出边缘。
*/
const BACKDROPS = {
  // 竞技场 / 道场 / 训练关卡三个页面共用这张（SideStage 是共用的）
  'arena-hall': {
    url: 'backdrops/arena-hall.jpg',   // JPEG：PNG 要 1.9MB，背景图不值得
    aspect: 1920 / 1080,     // 图的实际比例（geometry 要照它来，否则会拉伸变形）
    floorRatio: 0.55,        // "墙脚线"在高度上的位置
    // ⚠️ 宽度别贪大：铺到 4200 时图被放大 2.2 倍，两侧的木看台全被裁掉了 ——
    //    而看台正是这张图最有辨识度的部分。缩到 3000 后放大 1.56 倍，
    //    看台、顶灯、门洞、桌椅都在画面里，同时仍能覆盖相机的视差位移。
    width: 3000,
    parallax: 0.06,          // 越小越远、动得越慢
  },
};

/* ---------------- 程序生成的背景层 ---------------- */

function makeCanvas(w, hgt) {
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  return { c, g: c.getContext('2d') };
}

function texFrom(c, repeatX = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.x = repeatX;
  t.anisotropy = 4;
  return t;
}

/** 天空：一张纸，往下压一点暖色，再加几道云影与远山 */
function skyTexture() {
  const { c, g } = makeCanvas(512, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#eee7d6');
  grad.addColorStop(0.55, '#f4eddd');
  grad.addColorStop(1, '#f8f2e4');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  // 云影：几道横向的淡墨
  g.fillStyle = 'rgba(120,104,78,.055)';
  for (let i = 0; i < 7; i += 1) {
    const y = 40 + i * 34;
    const w = 140 + (i % 3) * 90;
    g.beginPath();
    g.ellipse(90 + i * 70, y, w, 12 + (i % 2) * 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  // 远山：两层折线，越远越淡
  for (const [base, amp, alpha] of [[330, 46, 0.10], [368, 34, 0.16]]) {
    g.fillStyle = `rgba(90,86,70,${alpha})`;
    g.beginPath();
    g.moveTo(0, 512);
    for (let x = 0; x <= 512; x += 32) {
      const y = base - Math.abs(Math.sin(x * 0.011 + base)) * amp;
      g.lineTo(x, y);
    }
    g.lineTo(512, 512);
    g.closePath();
    g.fill();
  }
  return texFrom(c);
}

/** 中景：一排房子剪影 + 树，用我们的纸墨色，别用纯黑（太跳） */
function midTexture() {
  const W = 1024; const H = 512;
  const { c, g } = makeCanvas(W, H);
  g.clearRect(0, 0, W, H);
  let seed = 20240918;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const house = (x, w, hgt, roof, wall) => {
    g.fillStyle = wall;
    g.fillRect(x, H - hgt, w, hgt);
    g.strokeStyle = 'rgba(17,18,17,.5)';
    g.lineWidth = 3;
    g.strokeRect(x, H - hgt, w, hgt);
    // 屋顶
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(x - 10, H - hgt);
    g.lineTo(x + w / 2, H - hgt - 44);
    g.lineTo(x + w + 10, H - hgt);
    g.closePath();
    g.fill();
    g.stroke();
    // 窗
    g.fillStyle = 'rgba(36,71,216,.35)';
    for (let i = 1; i < 3; i += 1) {
      const wx = x + (w / 3) * i - 12;
      g.fillRect(wx, H - hgt + 30, 24, 30);
      g.strokeRect(wx, H - hgt + 30, 24, 30);
    }
  };
  const tree = (x, hgt) => {
    g.fillStyle = '#8a6a45';
    g.fillRect(x - 6, H - hgt, 12, hgt);
    g.strokeRect(x - 6, H - hgt, 12, hgt);
    g.fillStyle = '#6d8a5c';
    for (let i = 0; i < 3; i += 1) {
      g.beginPath();
      g.arc(x, H - hgt - 10 - i * 26, 42 - i * 9, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  };
  const walls = ['#efe6d2', '#f3ead9', '#f1ebdd', '#f0e8d8'];
  const roofs = ['#8c3b2e', '#6b4f36', '#4a6b4f', '#a8332a'];
  let x = -40;
  while (x < W + 40) {
    const w = 120 + Math.round(rnd() * 90);
    const hgt = 150 + Math.round(rnd() * 130);
    house(x, w, hgt, roofs[Math.floor(rnd() * roofs.length)],
          walls[Math.floor(rnd() * walls.length)]);
    x += w + 10;
    if (rnd() < 0.45) { tree(x + 20, 120 + Math.round(rnd() * 70)); x += 90; }
  }
  return texFrom(c);
}

/** 地面：石板缝 + 纸纤维噪点，横向平铺 */
function groundTexture() {
  const W = 512; const H = 128;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = '#ddd2b8';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(17,18,17,.16)';
  g.lineWidth = 2;
  for (let x = 0; x < W; x += 64) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  g.beginPath(); g.moveTo(0, 16); g.lineTo(W, 16); g.stroke();
  let seed = 777;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let i = 0; i < 500; i += 1) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(90,72,48,.06)' : 'rgba(255,252,244,.08)';
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  return texFrom(c);
}

/** 前景草丛：贴着画面下缘的一条深色草叶，横向平铺 */
function nearTexture() {
  const W = 256; const H = 90;
  const { c, g } = makeCanvas(W, H);
  g.clearRect(0, 0, W, H);
  let seed = 31337;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 46; i += 1) {
    const x = rnd() * W;
    const hgt = 22 + rnd() * 52;
    g.strokeStyle = rnd() > 0.5 ? 'rgba(74,107,79,.85)' : 'rgba(83,105,74,.8)';
    g.lineWidth = 3 + rnd() * 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, H);
    g.quadraticCurveTo(x + (rnd() - 0.5) * 30, H - hgt * 0.6, x + (rnd() - 0.5) * 46, H - hgt);
    g.stroke();
  }
  return texFrom(c);
}

/** 墨点爆开：命中特效 */
function burstTexture() {
  const S = 128;
  const { c, g } = makeCanvas(S, S);
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#111211';
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (let i = 0; i < 11; i += 1) {
    const a = (i / 11) * Math.PI * 2;
    const r0 = 16 + (i % 3) * 5;
    const r1 = 34 + (i % 4) * 9;
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- 舞台 ---------------- */

export class SideStage {
  constructor(container, opts = {}) {
    this.container = container;
    this.stageW = opts.stageW || 2400;
    this.viewH = opts.viewH || 640;          // 可见高度（格）
    /* ⚠️ 背景名要**存在 this 上**：搭场景的代码在 `_init()` 这个独立方法里，
       那个作用域没有 `opts`（我第一版直接写 `opts.backdrop`，
       运行时报 "opts is not defined"，三个对战页面全白屏）。 */
    this.backdropName = opts.backdrop || null;
    /* ⚠️⚠️ 必须存在 `this` 上，**不能在 `_init()` 里直接读 `opts`** ——
       `_init()` 是独立方法，那个作用域里没有 `opts`，一读就是
       `ReferenceError: opts is not defined`。
       我在加"背景平铺"时又踩了一次（这个文件上面早就写着同一条教训：
       `opts.backdrop` 那次让三个对战页面全白屏）：一进关就抛，
       **舞台建不出来 → 主循环根本没起来 → tick 永远停在 0**，
       表现就是用户说的"卡在这里了"，以及 e2e_training 里
       "往右走会遇敌 / 打到 Boss 波 / 通关"整串失败。 */
    this.backdropTile = Math.max(1, opts.backdropTile || 1);
    this.shake = 0;
    /** 白闪强度 0~1。由引擎的事件驱动（原版必杀 `this.flash = .15`）。
     *  ⚠️ 这个值原来只声明、**从来没被读过** —— 也就是白闪根本没画出来。
     *  （和"受击闪白找 isBody 那个标记"是同一类：代码在跑，什么都没变。） */
    this.flash = 0;
    /** 由调用方注入：code → 贴图。不注入就退回纯色/占位 */
    this.textureFor = opts.textureFor || (() => null);
    this._init();
  }

  _init() {
    const w = this.container.clientWidth || 900;
    const hgt = this.container.clientHeight || Math.round(w * 0.5);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, hgt);
    this.renderer.setClearColor(PAPER, 1);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const aspect = w / hgt;
    const vh = this.viewH;
    this.camera = new THREE.OrthographicCamera(
      -(vh * aspect) / 2, (vh * aspect) / 2, vh / 2, -vh / 2, -4000, 6000);
    // 相机看向 y = vh*0.32：地面落在画面下缘往上一点，上方留出跳跃与背景
    this.camY = vh * 0.32;
    this.camera.position.set(0, this.camY, 1000);
    this.camera.lookAt(0, this.camY, 0);

    this.scene.add(new THREE.AmbientLight(0xfff6e6, 1.35));
    const key = new THREE.DirectionalLight(0xfff0d2, 0.95);
    key.position.set(-400, 900, 1200);
    this.scene.add(key);

    /* 背景层：
         · 有画好的背景图（竞技场）→ 只用它一层，并且**去掉**"远山/远处房顶"
           那些程序生成的层：室内大厅里不该出现远山和街景。
         · 没有（道场/训练关卡）→ 保持原来的三层。 */
    const bd = BACKDROPS[this.backdropName];
    const layers = [];
    if (bd) {
      const H = bd.width / bd.aspect;
      const tex = new THREE.TextureLoader().load(bd.url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      /* 幕布要不要**横向循环接起来**，由页面决定（`opts.backdropTile`，默认 1 = 不平铺）。
         ⚠️ 只有**剧情关卡**需要平铺：它的相机会跟着人走到场地两端之外
           （见 _updateCamera 的 EDGE_SLACK），单张幕布很快就到头、露出空白。
         ⚠️ 竞技场和道场**不要动**（用户明确要求："只有剧情模式要改背景，
           其他的对战不需要改"）—— 那两处的取景是固定的（焦点就在场地中心），
           相机不跑，单张幕布本来就够用。 */
      const TILE = this.backdropTile;
      if (TILE > 1) tex.wrapS = THREE.RepeatWrapping;
      layers.push({
        tex, parallax: bd.parallax, h: H, w: bd.width * TILE, rep: TILE, z: -900,
        // 让图里 floorRatio 那一行正好落在 y=0（地面线）上
        fixedY: (bd.floorRatio - 0.5) * H,
      });
    } else {
      layers.push({ tex: skyTexture(), parallax: 0.08, y: this.camY, h: this.viewH * 2.4, rep: 1, z: -900 });
      layers.push({ tex: midTexture(), parallax: 0.32, y: 0, h: 420, rep: 4, z: -600, anchor: 'ground' });
      // 前景草丛只在程序生成的户外场景里用。室内大厅放一丛草很违和，
      // 所以用背景图时整层去掉（近景纵深靠大厅自己的构图撑）。
      layers.push({ tex: nearTexture(), parallax: 1.28, y: 0, h: 84, rep: 8, z: 300, anchor: 'bottom' });
    }
    this.layers = [];
    for (const L of layers) {
      L.tex.repeat.x = L.rep;
      const wWorld = L.w || (L.anchor === 'bottom' ? this.viewW() * 1.6 : this.stageW * 2.4);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(wWorld, L.h),
        new THREE.MeshBasicMaterial({ map: L.tex, transparent: true, depthWrite: false }));
      // 前景草丛压到画面最下缘：盖住狗腿就看不清动作了，只留一点点当"镜头在里面"
      const ly = L.fixedY !== undefined ? L.fixedY
        : (L.anchor === 'ground' ? L.h / 2 - 30 : -L.h / 2 + 10);
      mesh.position.set(this.stageW / 2, ly, L.z);
      mesh.renderOrder = L.z < 0 ? -10 : 10;
      this.scene.add(mesh);
      this.layers.push({ mesh, parallax: L.parallax, baseX: mesh.position.x });
    }

    // 地面：和角色同速（parallax 1）
    const gt = groundTexture();
    gt.repeat.x = 40;
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.stageW * 3, 200),
      new THREE.MeshBasicMaterial({ map: gt }));
    this.ground.position.set(this.stageW / 2, -100, -100);
    this.scene.add(this.ground);

    // 地面上的墨线（让"站在这条线上"看得清楚）
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(this.stageW * 3, 4),
      new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.35 }));
    line.position.set(this.stageW / 2, 1, -90);
    this.scene.add(line);

    this.actorRoot = new THREE.Group();
    this.scene.add(this.actorRoot);
    this.fxRoot = new THREE.Group();
    this.scene.add(this.fxRoot);
    this._burstTex = burstTexture();
    this.effects = [];
    /* 白闪用 DOM 覆盖层：不碰 Three 场景图，而且 e2e 能直接读 opacity 验证。
       层级压在 HUD 下面（HUD 是 stage 的兄弟节点，不吃这个覆盖层）。 */
    const host = this.renderer.domElement.parentElement;
    if (host && !host.querySelector('.battle-flash')) {
      const el = document.createElement('div');
      el.className = 'battle-flash';
      host.appendChild(el);
      this.flashEl = el;
    }
    /* 飘字层：伤害数字 / "格挡" / "破防!" 这类。
       用 DOM 而不是画进 Three 场景：文字排版（字体、描边、阴凉）交给 CSS，
       不用为了几个数字去维护一个字体贴图。
       坐标要**投影**：逻辑坐标是世界坐标，得用相机换算成屏幕像素。 */
    if (host && !host.querySelector('.fx-text-root')) {
      const tr = document.createElement('div');
      tr.className = 'fx-text-root';
      host.appendChild(tr);
      this.textRoot = tr;
    }
    /** 火花粒子（有初速、受重力、会淡出） */
    this.particles = [];
    /** 突进残影 */
    this.ghosts = [];
    /** 飘字（伤害数字等） */
    this.texts = [];
    /** 表现层专用的随机流。**绝不能**和引擎的 rngSim 共用：
     *  粒子是纯表现，掉一帧少生成几颗，就会把后面所有随机决策顶偏。 */
    let seed = 0x9e3779b9;
    this._fxRand = () => {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5; seed >>>= 0;
      return seed / 4294967296;
    };
  }

  viewW() {
    const w = this.container.clientWidth || 900;
    const hgt = this.container.clientHeight || 450;
    return this.viewH * (w / hgt);
  }

  // ---------------- 演员 ----------------

  /**
   * 血量变化飘字（治愈 / 受伤）。**纯表现层**。
   *
   * 为什么放在表现层、而不是让引擎推 fx 事件：
   *   · 引擎的命中事件只有弹道那条路会写进 `m.hits`（见 simAB 的 resolveHit ——
   *     近战那条连返回值都没收），要补全得动引擎；
   *   · 而"血量涨了/掉了"本来就是**状态的事实**，每帧比一下就有，
   *     不需要引擎再报一次 —— 也就不必进哈希、不影响锁步。
   *
   * @param units 这一帧的单位视图（带 hp / x / y）
   */
  watchHp(units) {
    if (!this._hpSeen) this._hpSeen = [];
    for (let i = 0; i < units.length; i += 1) {
      const u = units[i];
      if (!u || typeof u.hp !== 'number') continue;
      const prev = this._hpSeen[i];
      this._hpSeen[i] = u.hp;
      if (typeof prev !== 'number' || prev === u.hp) continue;
      const delta = u.hp - prev;
      if (delta > 0) {
        // 治愈：绿色 +N，飘得高一点，一眼能认出来是"回过血"。
        // ⚠️ 这个色值要和 battle-hud.css 的 `.fx-text.is-heal` **保持一致** ——
        //    popText 是把颜色写成**内联样式**的，内联会盖住那条 CSS 规则，
        //    两边不一致的话"CSS 里改了颜色却没生效"（实测踩过：
        //    这里写 #8fd694、CSS 写 #63d67f，页面上永远是前者）。
        this.popText(`HP +${Math.round(delta)}`, u.x, u.y + 150, '#63d67f',
          { size: 22, life: 0.95, kind: 'heal' });
      } else if (delta <= -8) {
        // 掉血：只在掉得明显时飘，免得连续小伤害把屏幕塞满
        this.popText(`${Math.round(delta)}`, u.x + (i === 0 ? -18 : 18), u.y + 130,
          '#fff8e8', { size: Math.abs(delta) >= 60 ? 25 : 20, life: 0.85 });
      }
    }
  }

  /** 把一只狗挂到舞台上。texture 由调用方给（dogTexture 光栅化出来的） */
  attachActor(side, texture, facing = 1) {
    const grp = new THREE.Group();
    const H = 150;
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    // ⚠️ 必须是**正方形**面：贴图是 512×512 的正方形（狗只占中间 78%，四周是透明留白）。
    // 贴到 0.78:1 的窄面上会把狗横向压扁 22%，看着就像"被裁窄了"。
    const body = new THREE.Mesh(new THREE.PlaneGeometry(H, H), mat);
    body.position.y = H / 2;
    grp.add(body);
    // 落地阴影：椭圆墨点，比 3D 投影便宜且更贴版画风
    const sh = new THREE.Mesh(
      new THREE.CircleGeometry(46, 24),
      new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.18 }));
    sh.scale.set(1, 0.32, 1);
    sh.position.y = 4;
    grp.add(sh);
    grp.userData = { body, mat, shadow: sh, H };
    grp.scale.x = facing;
    this.actorRoot.add(grp);
    return grp;
  }

  /**
   * 换姿态。四张形态（sit/face/paw/lie）画布尺寸与基线一致，
   * 所以换图不会跳——**不要**在这里重新 fit 尺寸。
   * @param {number} side
   * @param {'sit'|'face'|'paw'|'lie'} form
   * @param {string} code 品种 code（用来取图）
   */
  setForm(side, form, code) {
    const grp = this.actorRoot.children[side];
    if (!grp) return;
    const ud = grp.userData;
    if (ud.form === form && ud.formCode === code) return;
    ud.form = form;
    ud.formCode = code;
    // 用 actors.js 的 dogTexture：它会优先取真实图，没图退回 SVG
    const tex = this.textureFor(code, form);
    if (tex) {
      ud.body.material.map = tex;
      ud.body.material.needsUpdate = true;
    }
  }

  /** 每一帧按状态挑一张形态：倒地 → lie，放技能/冲刺 → paw，其余 → sit/face */
  autoForm(side, u, code) {
    let form = 'sit';
    if (u.state === 'down') form = 'lie';
    else if (u.state === 'skill' || u.state === 'dash' || u.hurt) form = 'paw';
    else if (u.facing > 0 && u.side === 0) form = 'face';
    this.setForm(side, form, code);
  }

  /**
   * 画一帧。
   * @param {object} view  { units:[unitView], balls:[{x,y}], focus:{x,y}, dt }
   */
  render(view) {
    const units = view.units || [];
    for (const u of units) {
      const grp = this.actorRoot.children[u.side];
      if (!grp) continue;
      const ud = grp.userData;
      // 姿态：按状态换图（四张同画布同基线，换图不跳）
      if (view.forms && view.forms[u.side]) {
        this.setForm(u.side, view.forms[u.side], view.codes?.[u.side]);
      }
      // 侧视：x 直接用，y 是离地高度。
      // 倒地的一律压回地面：逻辑层已经保证 KO 那一击不上抛（见 sim.js 的 applyHit），
      // 这里再兜一层，免得以后又冒出"飘在屋顶上的狗"。
      grp.position.set(u.x, u.state === 'down' ? 0 : u.y, 0);
      grp.scale.x = u.facing >= 0 ? 1 : -1;
      // 挤压拉伸：起跳/下落时拉长，落地瞬间压扁——最便宜的"重量感"
      let sx = 1; let sy = 1;
      if (!u.grounded) {
        const vy = Math.max(-1, Math.min(1, (u.y > 40 ? 0.1 : -0.1)));
        sy = 1 + (u.facing >= 0 ? vy * 0.06 : vy * 0.06);
        sx = 1 - (sy - 1);
      }
      if (u.state === 'dash') { sx = 1.16; sy = 0.9; }
      if (u.state === 'hurt') { sx = 0.9; sy = 1.08; }
      if (u.state === 'down') { sy = 0.42; sx = 1.3; }
      grp.scale.set((u.facing >= 0 ? 1 : -1) * sx, sy, 1);
      /* ---- 受击闪白 ----
         挨打的人身上闪一下。原版是 `f.hitFlash = .13`（单位给渲染层做混合），
         我们这里做成"短暂提亮 + 微微放大"：
         纯改颜色在立绘上不明显（狗本身是白的），提亮 + 一点点放大才有"被打到"的实感。 */
      const hurtK = u.hurt ? 1 : 0;
      if (ud.hurtK !== hurtK) {
        ud.hurtK = hurtK;
        // attachActor 里已经把这只狗的材质挂在 userData.mat 上，直接用。
        // （第一版我写了个 traverse 找 `userData.isBody`，那个标记根本不存在 ——
        //   结果是"代码在跑但什么都没变"，不会报错，也看不出来。）
        if (ud.mat) ud.mat.color.setHex(hurtK ? 0xfff2d0 : 0xffffff);
      }
      if (hurtK) { sy *= 1.05; sx *= 0.96; }

      // 出招前摇：往蓄力方向压一点，玩家能"看出来要打了"
      if (u.state === 'attack' && u.act
          && u.stateT <= u.act.windup) {
        grp.position.x -= u.facing * 6;
      }
      ud.shadow.scale.set(1 - Math.min(0.5, u.y / 400), 0.32, 1);
      ud.shadow.material.opacity = 0.18 * (1 - Math.min(0.7, u.y / 500));
      // 受击闪白 + 无敌帧闪烁
      if (u.hurt) ud.mat.color.setHex(0xffd8d0);
      else if (u.invuln) ud.mat.color.setHex(0xbfd0ff);
      else ud.mat.color.setHex(0xffffff);
      grp.visible = !(u.invuln && (Math.floor(performance.now() / 60) % 2 === 0)
        && u.state === 'dash');
      grp.renderOrder = 5;
    }

    // 投掷物：一个小球 + 墨圈
    for (let i = 0; i < (view.balls || []).length; i += 1) {
      let m = this.fxRoot.children.find((c) => c.userData.ball === i);
      if (!m) {
        m = new THREE.Mesh(new THREE.CircleGeometry(14, 16),
          new THREE.MeshBasicMaterial({ color: 0xb8892f }));
        m.userData.ball = i;
        m.renderOrder = 6;
        this.fxRoot.add(m);
      }
      m.position.set(view.balls[i].x, view.balls[i].y, 10);
    }

    const rdt = view.dt || 1 / 60;
    this._updateEffects(rdt);
    this._updateSparks(rdt);
    this._updateFlash(rdt);
    this._updateTexts(rdt);
    this._updateGhosts(rdt);
    this._updateCamera(view.focus);
    /* ★ 血量变化飘字放在**这里**，不放各个页面的循环里 ——
       三个对战页（训练/竞技场/道场）共用这一个 render，
       放这里就三边都有了，也不会哪一页漏掉（训练页原来一个飘字都没有，
       所以治愈做完也看不见反馈）。纯表现层：不碰引擎状态、不进哈希。 */
    if (view.units) this.watchHp(view.units);
    this.renderer.render(this.scene, this.camera);
  }

  _updateCamera(focus) {
    if (!focus) return;
    /* ★ 记下**相机实际收到的那个 focus**（调试与验收都读它）。
       ⚠️ 为什么要有这个：页面里另有一个 `view._lastFocus` 钩子，它写的是
          `{...focus, meX: me.x, foeX: foe.x}` —— 把 focus 自己的 meX/foeX
          **覆盖成双方的原始坐标**，连"对手还没登场、focus 走的是玩家自己"
          这个分支都盖掉了。于是验收拿它算屏位，在推进段算出"两人隔了 1350"，
          假报"对手出画"（实测：span=0 而 foeX=1560，两个数自相矛盾）。
          这里存的是一份**未经改写**的副本。 */
    this._focusIn = { ...focus };
    // 取景：至少要能同时看见两个人才行。
    // 横板对战里"镜头把对手甩出画面"是最致命的体验问题，
    // 所以这里按两人间距自动拉远（有上限，别缩成一张邮票）。
    const need = (focus.span || 0) + 460;
    const baseW = this._baseViewW();
    /* 上限从 1.9 放到 2.4：场地本身就有 2000~2400 宽，而基础视野约 1238，
       要"把整条场地装进画面"需要 zoom ≈ 1.94 —— 原来卡在 1.9 刚好差一点，
       于是场地两端永远有一截进不来。 */
    const ZOOM_MAX = 2.4;
    const wantZoom = Math.max(1, Math.min(ZOOM_MAX, need / baseW));
    this._zoom = this._zoom === undefined ? wantZoom : this._zoom + (wantZoom - this._zoom) * 0.08;
    /* ★ 硬约束：两人一旦**比画面还宽**，必须立刻拉远到够用，不能等插值。
       插值每秒只走 8%，两人贴身缠斗时距离会突然拉开（击退、冲刺、扑咬），
       那几帧里就有人已经在画面外 —— 用户看到的就是"打着打着人不见了"。
       实测验收逐帧采样，四个关都抓到过（屏位 1350 > 可见宽 1238）。
       拉远是"立刻生效"，缩回来仍走插值，所以画面不会一惊一乍。 */
    if (typeof focus.meX === 'number' && typeof focus.foeX === 'number') {
      const span = Math.abs(focus.meX - focus.foeX);
      const fitZoom = Math.min(ZOOM_MAX, (span + 260) / baseW);
      if (fitZoom > this._zoom) this._zoom = fitZoom;
    }
    this._applyZoom(this._zoom);

    const half = this._viewW() / 2;
    /* 取景边界。
       ⚠️ 原来上下界都夹死在 `[half, stageW - half]` —— 也就是"画面不许越过场地两端"。
          但**角色是能跑出 stageW 的**：第二关的对手实测能到 2044，而 stageW=2000，
          于是相机先撞上 1381 的上界停住、对手再往右两步就**出画不见了**
          （用户报的"越打到后面 Boss 和角色就不见了"，实测屏位 +1282 > 可见宽 1238）。

          为什么可以放宽：背景幕布宽 4200（见本文件顶部 BACKDROPS 的说明），
          本来就比 stageW 宽得多，露出一点场地外的背景是**设计好的余量**，
          不会被看出边缘。而"把正在打架的人甩出画面"是硬伤。

          所以给边界留 `EDGE_SLACK` 的余量：相机会跟着人继续走一段，
          人始终在画面里。 */
    const EDGE_SLACK = 420;
    let tx;
    if (this.stageW > half * 2) {
      tx = Math.max(half - EDGE_SLACK,
                    Math.min(this.stageW - half + EDGE_SLACK, focus.x));
    } else {
      tx = this.stageW / 2;
    }
    // 排查用：把"这一帧算出来的相机目标"也留一份（配合页面侧的 focus 一起看）
    this._lastTarget = tx;
    this._lastFocusIn = focus.x;
    this._camX = this._camX === undefined ? tx : this._camX + (tx - this._camX) * 0.12;
    /* ★ 硬约束：**两个人必须都在画面里**。
       光把相机往两人中点推是不够的 —— 相机是插值跟随（0.12），
       两人快速分开时它**跟不上**，于是对手就飘出画面右边
       （实测屏位 1350 > 可见宽 1238，四个关都复现）。
       这里在插值之后补一刀：把相机夹到"能同时装下两人的那个区间"里。
       区间怎么来：相机中心必须在 [maxX - half, minX + half] 之内
       （half = 可见半宽）；这个区间为空（两人比画面还宽）时取中点，
       再由 zoom 去拉远。 */
    if (typeof focus.meX === 'number' && typeof focus.foeX === 'number' && focus.foeActive !== false) {
      const lo = Math.max(focus.meX, focus.foeX) - half;
      const hi = Math.min(focus.meX, focus.foeX) + half;
      const before = this._camX;
      this._camX = lo <= hi
        ? Math.max(lo, Math.min(hi, this._camX))
        : (focus.meX + focus.foeX) / 2;
      this._dbg = { lo: Math.round(lo), hi: Math.round(hi), before: Math.round(before),
                    after: Math.round(this._camX), half: Math.round(half),
                    meX: Math.round(focus.meX), foeX: Math.round(focus.foeX) };
    } else {
      this._dbg = { skipped: true, meX: focus.meX, foeX: focus.foeX, foeActive: focus.foeActive };
    }
    const s = this.shake;
    this.camera.position.set(this._camX + (s ? (Math.random() - 0.5) * s : 0),
                             this.camY + (s ? (Math.random() - 0.5) * s : 0), 1000);
    this.camera.lookAt(this._camX, this.camY, 0);
    // 视差：每层按自己的系数反向偏移
    for (const L of this.layers) {
      L.mesh.position.x = L.baseX - (this._camX - this.stageW / 2) * (1 - L.parallax);
    }
    this.ground.position.x = this.stageW / 2 - (this._camX - this.stageW / 2);
  }

  _baseViewW() {
    const w = this.container.clientWidth || 900;
    const hgt = this.container.clientHeight || 450;
    return this.viewH * (w / hgt);
  }

  _viewW() {
    return this._baseViewW() * (this._zoom || 1);
  }

  /** 按缩放系数重算正交视锥；地面在画面里的相对高度保持不变 */
  _applyZoom(z) {
    const vh = this.viewH * z;
    const aspect = this._baseViewW() / this.viewH;
    this.camera.left = -(vh * aspect) / 2;
    this.camera.right = (vh * aspect) / 2;
    this.camera.top = vh / 2;
    this.camera.bottom = -vh / 2;
    this.camY = vh * 0.32;
    this.camera.updateProjectionMatrix();
  }

  /** 命中/起跳/落地/冲刺的表现 */
  /**
   * 火花：一批有初速、受重力、会淡出的小粒子。
   *
   * 逐条搬自原版 engine.js 的 sparks(x, y, color, count = 16, power = 1)：
   *     const a = random() * PI * 2;
   *     const v = (75 + random() * 200) * power;   // 速度 75~275 × 力度
   *     particles.push({ vx: cos(a)*v, vy: sin(a)*v,
   *                      life: .15 + random()*.4,   // 0.15~0.55 秒
   *                      size: 2 + floor(random()*5) });  // 2~6 px
   *
   * ⚠️ 用的是**自己那条随机流**（fxRand），不是引擎的 rngSim。
   *    粒子纯表现，不能影响联机同步 —— 如果它和 AI 共用一条流，
   *    端上一帧掉帧、粒子少生成几颗，后面所有随机决策就全错位了。
   *
   * @param count 颗数。原版的调用点：默认 16、反击 25、slam 落地 35
   * @param power 力度倍数（slam 用 1.5）
   */
  sparks(x, y, color, count = 16, power = 1) {
    if (!this._sparkGeo) {
      this._sparkGeo = new THREE.CircleGeometry(1, 6);
      this._sparkTex = burstTexture();
    }
    const n = Math.max(0, Math.min(48, count | 0));
    for (let i = 0; i < n; i += 1) {
      const a = this._fxRand() * Math.PI * 2;
      const v = (75 + this._fxRand() * 200) * power;
      const size = 2 + Math.floor(this._fxRand() * 5);
      const mat = new THREE.MeshBasicMaterial({
        map: this._sparkTex, transparent: true, opacity: 1,
        color, depthWrite: false,
      });
      const m = new THREE.Mesh(this._sparkGeo, mat);
      m.position.set(x, y, 210);
      m.scale.set(size, size, 1);
      m.renderOrder = 21;
      this.fxRoot.add(m);
      // 单位：格/秒（和引擎一致），_updateSparks 里按 dt 积分
      this.particles.push({
        mesh: m,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0,
        ttl: 0.15 + this._fxRand() * 0.4,
      });
    }
  }

  /** 粒子推进：速度积分 + 重力 + 淡出（原版是 vy += 900*dt） */
  /**
   * 在世界坐标 (x, y) 上飘一行字。
   *
   * 搬自原版的 `text(str, x, y, color, life = .8, size = 20)`：
   *   向上飘、渐隐。数字的大小可以按伤害量缩放，玩家扫一眼就知道哪下重。
   *
   * @param str   内容（伤害数字、'格挡'、'破防!'…）
   * @param opts  { life, size, kind }  kind 用来上不同颜色/描边
   */
  popText(str, x, y, color, opts = {}) {
    if (!this.textRoot) return;
    const el = document.createElement('div');
    el.className = 'fx-text' + (opts.kind ? ` is-${opts.kind}` : '');
    el.textContent = str;
    el.style.color = color || '#fff8e8';
    el.style.fontSize = `${opts.size || 20}px`;
    this.textRoot.appendChild(el);
    this.texts.push({
      el,
      x, y,
      vy: opts.vy !== undefined ? opts.vy : 62,   // 格/秒，向上飘
      life: 0,
      ttl: opts.life || 0.8,
      drift: (this._fxRand() - 0.5) * 26,          // 左右稍微散开，叠字不糊在一起
    });
  }

  /**
   * 飘字推进：世界坐标 + 位移 → 屏幕像素。
   *
   * ⚠️ **不用 `Vector3.project(camera)`**。
   *    第一版用的是它，结果飘字全挤在画面左下角、叠在血条上。
   *    原因是 project() 依赖 `camera.matrixWorldInverse`，
   *    而那个矩阵是 `renderer.render()` 时才更新的 —— 我在 render 之前算，
   *    拿到的是上一帧（甚至是初始化时）的矩阵。
   *
   *    正交相机的换算本来就是个线性映射，自己算既准确又不受更新时机影响：
   *      px = (worldX - camX + halfW) / (2*halfW) * 画布宽
   *      py = (halfH - (worldY - camY)) / (2*halfH) * 画布高
   *    halfW/halfH 取相机自己的 frustum 再除 zoom（两处都除，兼容
   *    "把 zoom 算进 frustum" 和 "设 camera.zoom" 两种实现）。
   */
  _updateTexts(dt) {
    if (!this.texts || !this.texts.length) return;
    const el = this.renderer.domElement;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    const cam = this.camera;
    const zoom = cam.zoom || 1;
    const halfW = ((cam.right - cam.left) / 2) / zoom;
    const halfH = ((cam.top - cam.bottom) / 2) / zoom;
    const keep = [];
    for (const t of this.texts) {
      t.life += dt;
      const k = t.life / t.ttl;
      if (k >= 1) { t.el.remove(); continue; }
      t.y += t.vy * dt;
      t.x += t.drift * dt;
      const px = ((t.x - cam.position.x + halfW) / (2 * halfW)) * w;
      const py = ((halfH - (t.y - cam.position.y)) / (2 * halfH)) * h;
      t.el.style.transform =
        `translate(-50%, -50%) translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`
        + ` scale(${(1 + k * 0.25).toFixed(3)})`;
      t.el.style.opacity = String(Math.max(0, 1 - k * k));
      keep.push(t);
    }
    this.texts = keep;
  }

  /**
   * 突进残影。原版 `effect('ghost', x - facing*18, y, color, .18, { fighter, alpha: .3 })`
   * —— 每 3 帧留一个半透明的自己，突进才有速度感。
   *
   * 做法是**复制那只狗当前的贴图**再压低透明度，而不是画个色块：
   * 残影要能认出是"刚才那只狗"，色块是没有这个效果的。
   */
  spawnGhost(side, x, y, alpha = 0.3) {
    const src = this.actorRoot.children[side];
    const ud = src && src.userData;
    if (!ud || !ud.mat || !ud.mat.map) return;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(ud.H || 150, ud.H || 150),
      new THREE.MeshBasicMaterial({
        map: ud.mat.map, transparent: true, opacity: alpha, depthWrite: false,
      }));
    m.position.set(x, y + (ud.H || 150) / 2, 5);
    m.scale.x = src.scale.x < 0 ? -1 : 1;
    m.renderOrder = 8;                 // 压在狗下面，免得糊住本体
    this.fxRoot.add(m);
    this.ghosts.push({ mesh: m, life: 0, ttl: 0.22, a: alpha });
  }

  /** 残影推进：渐隐 */
  _updateGhosts(dt) {
    if (!this.ghosts || !this.ghosts.length) return;
    const keep = [];
    for (const g of this.ghosts) {
      g.life += dt;
      const k = g.life / g.ttl;
      if (k >= 1) {
        this.fxRoot.remove(g.mesh);
        g.mesh.geometry.dispose();
        g.mesh.material.dispose();
        continue;
      }
      g.mesh.material.opacity = g.a * (1 - k);
      keep.push(g);
    }
    this.ghosts = keep;
  }

  /** 白闪推进：原版是 `this.flash = Math.max(0, this.flash - dt)`，0.15 秒闪完 */
  _updateFlash(dt) {
    if (!this.flashEl) return;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    // 前面一小段用满强度，后面渐隐 —— 线性淡出看着"软"，一下就没了才像被打到
    const a = this.flash > 0 ? Math.min(1, this.flash / 0.12) : 0;
    this.flashEl.style.opacity = a > 0 ? String(0.55 * a) : '0';
  }

  _updateSparks(dt) {
    if (!this.particles || !this.particles.length) return;
    const keep = [];
    for (const p of this.particles) {
      p.life += dt;
      const k = p.life / p.ttl;
      if (k >= 1) {
        this.fxRoot.remove(p.mesh);
        p.mesh.material.dispose();
        continue;
      }
      p.vy -= 900 * dt;                    // 原版的重力
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.material.opacity = 1 - k * k;
      keep.push(p);
    }
    this.particles = keep;
  }

  spawnFx(kind, x, y, opt = {}) {
    const color = { guard: 0x2447d8, evade: 0x7f97ff, ko: 0xa8332a }[kind] || INK;
    const mat = new THREE.MeshBasicMaterial({
      map: this._burstTex, transparent: true, opacity: 0.95, color, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat);
    m.position.set(x, y + 70, 200);
    m.renderOrder = 20;
    this.fxRoot.add(m);
    this.effects.push({ mesh: m, life: 0, ttl: kind === 'ko' ? 0.6 : 0.28,
                        scale: kind === 'ko' ? 3.2 : 1.6 });
    if (kind === 'hit' || kind === 'ko') this.shake = kind === 'ko' ? 14 : 7;
    // 光晕之外再炸一批火花（原版 sparks 的颗数就是按事件分级的）
    const sparkColor = { guard: 0x6fb6ff, evade: 0x9fb4ff, ko: 0xff7a5c }[kind] || 0xffd27a;
    const count = opt.sparks !== undefined ? opt.sparks
      : (kind === 'ko' ? 35 : (kind === 'hit' ? 16 : 10));
    this.sparks(x, y + 70, sparkColor, count, kind === 'ko' ? 1.5 : 1);
  }

  _updateEffects(dt) {
    const keep = [];
    for (const e of this.effects) {
      e.life += dt;
      const k = Math.min(1, e.life / e.ttl);
      const s = 0.6 + k * e.scale;
      e.mesh.scale.set(s, s, 1);
      e.mesh.material.opacity = 0.95 * (1 - k);
      if (k < 1) keep.push(e);
      else { this.fxRoot.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
    }
    this.effects = keep;
    for (const c of [...this.fxRoot.children]) {
      if (c.userData.ball !== undefined) continue;
      if (!this.effects.some((e) => e.mesh === c)) this.fxRoot.remove(c);
    }
    this.shake *= 0.86;
    if (this.shake < 0.4) this.shake = 0;
  }

  clearBalls() {
    for (const c of [...this.fxRoot.children]) {
      if (c.userData.ball !== undefined) this.fxRoot.remove(c);
    }
  }

  resize() {
    const w = this.container.clientWidth || 900;
    const hgt = this.container.clientHeight || 450;
    this.renderer.setSize(w, hgt);
    const aspect = w / hgt;
    const vh = this.viewH;
    this.camera.left = -(vh * aspect) / 2;
    this.camera.right = (vh * aspect) / 2;
    this.camera.top = vh / 2;
    this.camera.bottom = -vh / 2;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.renderer.dispose();
    this.container.replaceChildren();
  }
}
