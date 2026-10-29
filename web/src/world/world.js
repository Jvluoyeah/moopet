/* 世界：把场景、相机、玩家、NPC、传送门、交互物装在一起跑起来
   ------------------------------------------------------------
   这一版是「真的开放世界」而不是看板：
     * 玩家用 WASD 操控自己的狗真实跑动（本地即刻响应，不等网络）
     * 相机斜俯视跟随，可拖拽旋转、滚轮缩放
     * 建筑有碰撞，走不进去
     * 靠近可交互物浮出气泡，按 E 交互；走到传送点切场景
     * 远端玩家（后续阶段接上）用插值渲染
   */

import * as THREE from 'three';
import { sceneOf } from './scenes/index.js';
import { buildScene, skyTexture } from './build.js';
import { WorldCamera } from './camera.js';
import { makeDogActor } from './actors.js';
import { breedOf } from '../lib/store.js';
import { VIEW, DOG_SCALE } from './scale.js';

const DOG_RADIUS = 26;           // 碰撞半径（格）
const WALK_SPEED = 240;          // 格/秒
// 疾跑要**明显**比走路快：240 → 430 只快 1.8 倍，帧率一抖就感觉不出来，
// 用户会以为"按了 Shift 没用"。拉到 2.5 倍，配合扬尘，一眼就能看出在冲。
const RUN_SPEED = 600;
const ACCEL = 1800;
// 跑的代价也要够疼：18/秒跑满 5 秒多才见底，太温柔了。
// 26/秒 ≈ 3.8 秒跑空，体力条的下降肉眼可见。
const RUN_DRAIN = 26;
const INTERACT_RANGE = 130;
const DOG_INTERACT_RANGE = 170;   // 和别的狗打招呼的范围（比道具宽一点，狗会动）
const HOP_TIME = 0.42;           // 空格跳一下的时长（秒），纯表现
const BUBBLE_TIME = 2.2;         // 动作气泡挂多久
/** 空格"卖萌"时随机说的几句（不用 emoji，走文本气泡） */
const ACTION_LINES = [
  '汪！', '看我看我', '转圈圈', '尾巴摇起来了',
  '闻到了什么', '一起去逛逛？', '这里不错嘛', '累了歇会儿',
];
// 远端插值的延迟在 WorldSession 里（默认 0.12s），这里不再重复定义

export class World {
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.theme = opts.theme || 'day';
    this.keys = new Set();
    this.dragging = false;
    this._pointer = null;

    this.sceneCode = opts.sceneCode || 'plaza';
    this.scene = null;             // 场景定义
    this.built = null;             // buildScene 结果
    this.localActor = null;
    this.player = { x: 0, z: 0, vx: 0, vz: 0, facing: 1, status: 'idle', stamina: 100 };
    this.npcs = [];
    this.remotes = new Map();      // dog_id -> {actor, dog}（插值在 WorldSession 里）
    this.session = null;           // 联机会话（attachSession 挂上）
    this.nearby = null;            // 当前可交互物
    this._hopT = 0;                // 空格动作的剩余时间
    this._bubbleT = 0;             // 动作气泡剩余时间
    this._actionIdx = 0;
    this._raf = 0;
    this._last = 0;
    this._elapsed = 0;

    this._initThree();
    this._bindInput();
    this.setScene(this.sceneCode, opts.at);
  }

  // ---------------- Three 基础 ----------------
  _initThree() {
    const w = this.host.clientWidth || 800;
    const h = this.host.clientHeight || 520;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // 自适应分辨率：像素数才是这个场景的真正瓶颈（三角形只有 3k 出头，
    // 软件光栅 / 4K 屏上纯粹是被填充率拖住的）。
    // 先按设备上限开，跑不动就逐级降，缓过来再升回去。
    this._dprCap = Math.min(window.devicePixelRatio || 1, 2);
    this._dpr = this._dprCap;
    this._fpsAcc = { frames: 0, t: 0, last: 0 };
    this.renderer.setPixelRatio(this._dpr);
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x141d33);   // 夜景兜底色
    // 真阴影：第一版没有影子，所有东西都像贴纸一样浮在地上。
    // 场景里网格数不到两百，PCFSoft + 2048 图完全跑得动。
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.host.appendChild(this.renderer.domElement);

    this.three = new THREE.Scene();
    this.camera3 = new THREE.PerspectiveCamera(VIEW.fov, w / h, 10, 9000);
    this.camera = new WorldCamera(this.camera3, {
      dist: VIEW.dist,
      pitch: VIEW.pitch,
      leadFrac: VIEW.leadFrac,
    });

    /* 光照 = **月光夜景**。
       设定上这个世界永远是晚上（月塔的设定），所以不再是"暖白日光"那一套：
         环境光  压得很低、偏冷蓝，负责托住暗部（不然阴影里全黑）
         半球光  天顶冷蓝 / 地面深蓝，让朝上的面比朝下的面亮一点，体积感出来
         主光    改成"月亮"：冷白偏蓝、强度低、从高处斜下（影子长而淡）
         补光    一点点暖色，模拟远处灯火的反射
       注意：窗光/门洞/灯罩这些**光源本身**不受这些影响 —— 它们在
       models.js 里走 GLOW_MATERIALS（MeshBasicMaterial，不吃光照）。 */
    this.three.add(new THREE.AmbientLight(0x3b4f77, 0.55));
    this.three.add(new THREE.HemisphereLight(0x5a76b0, 0x1a2133, 0.45));

    const sun = new THREE.DirectionalLight(0xa8c4ff, 0.85);   // 月光
    sun.position.set(-900, 1600, 700);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 200;
    sun.shadow.camera.far = 5200;
    const S = 1500;                       // 阴影正交框半宽：够盖住一屏
    sun.shadow.camera.left = -S;
    sun.shadow.camera.right = S;
    sun.shadow.camera.top = S;
    sun.shadow.camera.bottom = -S;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 6;
    this.three.add(sun);
    this.three.add(sun.target);
    this.sun = sun;
    this._sunOffset = sun.position.clone();

    const fill = new THREE.DirectionalLight(0xffd9a0, 0.18);  // 远处灯火的暖反弹
    fill.position.set(1200, 700, -900);
    this.three.add(fill);

    this.sceneRoot = new THREE.Group();
    this.three.add(this.sceneRoot);
    this.actorRoot = new THREE.Group();
    this.three.add(this.actorRoot);
  }

  /** 把所有 userData.billboard 的面片转向相机（每帧一次，数量很少） */
  _faceCamera() {
    const cam = this.camera3;
    if (!cam) return;
    this.three.traverse((o) => {
      if (!o.userData || !o.userData.billboard || !o.isMesh) return;
      // 只绕 Y 轴转：保持牌子竖直，不跟着俯角点头（点头会看着像倒了）
      const p = new THREE.Vector3();
      o.getWorldPosition(p);
      o.rotation.y = Math.atan2(cam.position.x - p.x, cam.position.z - p.z);
    });
  }

  // ---------------- 场景装卸 ----------------
  setScene(code, at = null) {
    this.sceneCode = code;
    this.scene = sceneOf(code);

    // 清掉旧场景
    while (this.sceneRoot.children.length) {
      const c = this.sceneRoot.children.pop();
      this.sceneRoot.remove(c);
      disposeTree(c);
    }
    for (const n of this.npcs) n.actor.dispose();
    this.npcs = [];
    for (const r of this.remotes.values()) r.actor.dispose();
    this.remotes.clear();
    this.localActor?.dispose();
    // 换场景 = 换房间：把远端清干净，并让会话切到新场景（页面负责重连）
    this.session?.setScene(code);

    this.built = buildScene(this.scene);
    this.sceneRoot.add(this.built.root);
    /* 背景：默认用清屏色（极暗的夜色）；场景标了 `skybox` 就换成**天空盒**。
       天空盒按 three.js 手册的做法（`scene.background` + 等距柱状贴图，
       见 build.js 的 makeSkyTexture 与 https://threejs.org/manual/#backgrounds）。
       ⚠️ 这个机位整幅都在地平线以下，所以天空盒通常看不到 ——
          只有"地面不够大、画面顶边越过地面远端"时才会在顶部露一条。
          露多少由场景的 `groundMargin` 决定（见 buildScene）。 */
    if (this.scene.skybox) {
      this.three.background = skyTexture();
    } else {
      this.three.background = null;
      this.renderer.setClearColor(new THREE.Color(this.scene.sky || '#141d33'));
    }

    const spot = at || this.scene.spawn
      || { x: this.scene.size.w / 2, z: this.scene.size.d / 2 };
    this.player.x = spot.x;
    this.player.z = spot.z;
    this.player.vx = 0;
    this.player.vz = 0;
    this.player.stamina = 100;

    // 每个场景可以有自己的取景（小房间拉近、大广场拉远）
    const cam = this.scene.camera || {};
    this.camera.dist = cam.dist || VIEW.dist;
    this.camera.yaw = cam.yaw !== undefined ? cam.yaw : -0.32;
    this.camera.pitch = cam.pitch !== undefined ? cam.pitch : VIEW.pitch;
    this.camera.leadFrac = cam.leadFrac !== undefined ? cam.leadFrac : VIEW.leadFrac;
    /* 转向范围：不配就是不限制（原来的行为）。
       配了的场景（比如公园 —— 它为了露出天空特意把地面收窄了）
       转不出设计好的那个取景，也就不会看见"地面之外"。
       必须是**换场景时**一起设，否则从别的场景切过来会带着旧的限制。 */
    this.camera.baseYaw = this.camera.yaw;
    this.camera.yawRange = cam.yawRange === undefined ? null : cam.yawRange;
    this.camera.setTarget(spot.x, spot.z);
    this.camera.update(1);
    this._followSun(spot.x, spot.z);

    // 本地玩家的狗
    const dog = this.opts.dog || {};
    this.localActor = makeDogActor({
      breed: breedOf(dog.breed_code), level: dog.level || 1,
      name: dog.name || '我', theme: this.theme, scale: 100 * DOG_SCALE,
    });
    this.localActor.setName(`${dog.name || '我'}（你）`);
    this.actorRoot.add(this.localActor.group);

    this._spawnNpcs();

    this.opts.onSceneChange?.(this.scene);
    return this.scene;
  }

  /** 只重建**场景几何**（楼 / 道具 / 可交互物 / 传送圈 / NPC），别的一律不动。
   *
   *  给场景编辑器用：挪一下模型就重建一次。**不能走 setScene()** —— 那个会
   *  dispose 掉本地狗和所有远端、重新 setScene 会话（每挪一下就重连一次），
   *  还会把玩家位置和镜头重置回出生点。
   *  实测重建一次只有几毫秒，拖着微调是跟得上的。 */
  reloadSceneGeometry() {
    while (this.sceneRoot.children.length) {
      const c = this.sceneRoot.children.pop();
      this.sceneRoot.remove(c);
      disposeTree(c);
    }
    this.built = buildScene(this.scene);
    this.sceneRoot.add(this.built.root);
    for (const n of this.npcs) n.actor.dispose();
    this.npcs = [];
    this._spawnNpcs();
  }

  _spawnNpcs() {    this.npcs = (this.scene.npcRoutes || []).map((r) => {
      const actor = makeDogActor({
        breed: breedOf(r.look), level: r.level || 1, name: r.name,
        theme: this.theme, scale: 92 * DOG_SCALE,
      });
      const path = r.path.map(([x, z]) => ({ x, z }));
      const npc = { ...r, actor, path, idx: 0, x: path[0].x, z: path[0].z,
                    facing: 1, phase: Math.random() * 6.28 };
      actor.group.position.set(npc.x, 0, npc.z);
      this.actorRoot.add(actor.group);
      return npc;
    });
  }

  // ---------------- 远端玩家 ----------------
  /**
   * 挂上联机会话（WorldSession）。不挂也能跑——世界里就只有 NPC 和自己。
   *
   * 远端的位置**不再由 World 自己插值**：插值逻辑统一放在 WorldSession.update()，
   * 这里只负责"把结果搬到 Three.js 演员身上"。
   * 之前两处各写一套插值，结果调参调了一个忘另一个，远端看着一会儿顺一会儿跳。
   */
  attachSession(session) {
    this.session = session || null;
    if (this.session) {
      this.session.setScene(this.sceneCode);
      // 别人按空格 → 他那只狗也跳一下 + 冒泡。
      // 挂在这里而不是页面里：这是"别人做动作"的表现，属于世界自己的事。
      const prev = this.session.onPeerAction;
      this.session.onPeerAction = (dogId, action, bubble) => {
        const rec = this.remotes.get(dogId);
        if (rec) { rec.hopT = HOP_TIME; rec.bubbleT = BUBBLE_TIME; }
        prev?.(dogId, action, bubble);
      };
    }
    this.clearRemotes();
  }

  /** 兼容旧接口：外部直接塞一个远端位置。真链路走 session.receive()。 */
  upsertRemote(dog, pos) {
    this.session?.receive({
      type: 'peer_move', dog_id: dog.dog_id, x: pos.x, z: pos.z,
      facing: pos.facing ?? 1, status: pos.status || 'walk',
    });
  }

  removeRemote(dogId) {
    const r = this.remotes.get(dogId);
    if (!r) return;
    r.actor.dispose();
    this.remotes.delete(dogId);
  }

  clearRemotes() {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
  }

  _ensureRemoteActor(dogId, dog) {
    let r = this.remotes.get(dogId);
    if (r) { r.dog = { ...r.dog, ...dog }; return r; }
    const actor = makeDogActor({
      breed: breedOf(dog.breed_code), level: dog.level || 1,
      name: dog.name || dog.dog_name || '狗', theme: this.theme,
      scale: 95 * DOG_SCALE,
    });
    this.actorRoot.add(actor.group);
    r = { actor, dog, hopT: 0, bubbleT: 0, last: null };
    this.remotes.set(dogId, r);
    return r;
  }

  // ---------------- 输入 ----------------
  _bindInput() {
    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      // 空格是"单次动作"，不能走 keys 集合（按住会连发）——用 keydown 的重复标志挡掉
      if (k === ' ') { if (!e.repeat) this.doAction(); return; }
      this.keys.add(k);
      if (k === 'e') this._tryInteract();
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    const el = this.renderer.domElement;
    this._onDown = (e) => {
      this.dragging = true;
      this._pointer = { x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    };
    this._onMove = (e) => {
      if (!this.dragging || !this._pointer) return;
      const dx = e.clientX - this._pointer.x;
      const dy = e.clientY - this._pointer.y;
      this._pointer = { x: e.clientX, y: e.clientY };
      this.camera.rotate(dx, dy);
    };
    this._onUp = (e) => {
      this.dragging = false;
      this._pointer = null;
      el.releasePointerCapture?.(e.pointerId);
    };
    this._onWheel = (e) => {
      e.preventDefault();
      this.camera.zoom(e.deltaY);
    };
    el.addEventListener('pointerdown', this._onDown);
    el.addEventListener('pointermove', this._onMove);
    el.addEventListener('pointerup', this._onUp);
    el.addEventListener('pointercancel', this._onUp);
    el.addEventListener('wheel', this._onWheel, { passive: false });
    el.style.touchAction = 'none';
  }

  _tryInteract() {
    if (!this.nearby) return;
    this.opts.onInteract?.(this.nearby);
  }

  /**
   * 空格：跳一下 + 冒个泡（计划里的"跳跃 / 卖萌动作"）。
   *
   * 世界里的"跳"不做真实物理——它不参与碰撞、不改变 x/z，
   * 只是一个表现层的抛物线位移 + 一句话。理由：世界是客户端权威的漫游场景，
   * 为了一个纯表演动作去动移动/碰撞那套逻辑，只会让"别人看你"多一份不同步。
   * 动作本身会通过 session.action 广播出去，所以别人也看得见你跳。
   */
  doAction(text = '') {
    if (this._hopT > 0) return false;         // 正在跳就别叠
    this._hopT = HOP_TIME;
    /* 「口头禅」怎么说：小说里登记员把这张卡纸交给你时说得很清楚 ——
       "机械狗的胸腔喇叭里装不下大道理……你写什么，它这辈子说得最多的，
        就是这一句。"
       所以空格的冒泡**以口头禅为主**，每三句里插一句通用动作台词
       （全说同一句会显得呆，全说通用台词又等于白填了那张卡纸）。
       没填口头禅时就是原来的轮播，行为不变。 */
    const motto = this.opts.motto || '';
    let line;
    if (text) line = text;
    else if (motto && this._actionIdx % 3 !== 2) line = motto;
    else line = ACTION_LINES[this._actionIdx % ACTION_LINES.length];
    this._actionIdx += 1;
    this._bubbleT = BUBBLE_TIME;
    this._bubbleText = line;
    this.session?.action('wave', line);
    this.opts.onAction?.(line);
    return true;
  }

  // ---------------- 主循环 ----------------
  start() {
    if (this._raf) return;
    this._last = performance.now();
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this._last) / 1000 || 0);
      this._last = t;
      this._elapsed += dt;
      this.update(dt);
      this._adaptQuality(dt);
      this.renderer.render(this.three, this.camera3);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  update(dt) {
    /* 广告牌：让标了 userData.billboard 的面片**永远面向相机**。
       ⚠️ 这个标记在 build.js 里被写上（传送路牌的牌面），但全项目一直
       **没有任何地方读它** —— 写了个寂寞，牌子其实是死的。这里补上消费端。 */
    this._faceCamera();

    this._tickAction(dt);
    this._moveLocal(dt);
    this._moveNpcs(dt);
    this._syncRemotes();
    this._updateNearby();
    this._checkPortals();
    this.camera.setTarget(this.player.x, this.player.z);
    this.camera.update(dt);
    this._followSun(this.player.x, this.player.z);
  }

  /** 阴影相机跟着玩家走：正交框只有 3000 宽，不跟就会走出去没影子 */
  _followSun(x, z) {
    if (!this.sun) return;
    this.sun.position.set(x + this._sunOffset.x, this._sunOffset.y, z + this._sunOffset.z);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
  }

  _moveLocal(dt) {
    const k = this.keys;
    const mx = (k.has('d') || k.has('arrowright') ? 1 : 0)
             - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const my = (k.has('s') || k.has('arrowdown') ? 1 : 0)
             - (k.has('w') || k.has('arrowup') ? 1 : 0);
    const running = (k.has('shift') || k.has('shiftleft') || k.has('shiftright'))
      && this.player.stamina > 1;

    const b = this.camera.basis();
    let dx = b.right.x * mx + b.forward.x * (-my);
    let dz = b.right.z * mx + b.forward.z * (-my);
    const len = Math.hypot(dx, dz);
    const moving = len > 0.001;
    if (moving) { dx /= len; dz /= len; }

    const target = moving ? (running ? RUN_SPEED : WALK_SPEED) : 0;
    const tvx = dx * target, tvz = dz * target;
    const k2 = Math.min(1, dt * ACCEL / Math.max(1, target || WALK_SPEED));
    this.player.vx += (tvx - this.player.vx) * k2;
    this.player.vz += (tvz - this.player.vz) * k2;
    if (!moving && Math.hypot(this.player.vx, this.player.vz) < 6) {
      this.player.vx = this.player.vz = 0;
    }

    const speed = Math.hypot(this.player.vx, this.player.vz);
    // 朝向按**屏幕方向**算，不能按世界 vx：
    // 相机可以拖拽旋转，"屏幕上往左走"和"世界 -x"只在初始角度下重合，
    // 转过视角之后按 vx 判朝向，狗就会朝着反方向跑。
    //
    // 而且光有 ±1 不够：立牌是**侧面像**，往画面里走（W）时它既不该朝左也不该朝右，
    // 应该露出**背影**——不然玩家会觉得"按 W 狗还是横着站，没照着方向走"。
    // 所以这里算的是一个 4 向 dir，交给 actors 去挑图（有 back 帧就用背影）。
    let dir = this.player.dir || 'down';
    if (speed > 4) {
      const r = b.right, f = b.forward;
      const sx = this.player.vx * r.x + this.player.vz * r.z;      // 屏幕横向
      const sy = -(this.player.vx * f.x + this.player.vz * f.z);   // 屏幕纵向：+ = 朝观众
      if (Math.abs(sx) > Math.abs(sy) * 1.15) {
        dir = sx >= 0 ? 'right' : 'left';
        this.player.facing = sx >= 0 ? 1 : -1;
      } else if (Math.abs(sy) > 12) {
        dir = sy >= 0 ? 'down' : 'up';
      }
    }
    this.player.dir = dir;
    this.player.status = speed < 8 ? 'idle' : (running ? 'run' : 'walk');

    // 体力：跑动消耗、静止回复
    if (running && moving) this.player.stamina = Math.max(0, this.player.stamina - dt * RUN_DRAIN);
    else this.player.stamina = Math.min(100, this.player.stamina + dt * (moving ? 6 : 16));

    // 分轴位移 + 碰撞（这样贴着墙能滑动，不会被卡死）
    this._tryMove(this.player, this.player.vx * dt, 0);
    this._tryMove(this.player, 0, this.player.vz * dt);

    // 场景边界
    const s = this.scene.size;
    this.player.x = clamp(this.player.x, DOG_RADIUS, s.w - DOG_RADIUS);
    this.player.z = clamp(this.player.z, DOG_RADIUS, s.d - DOG_RADIUS);

    // 同步演员
    const a = this.localActor;
    if (a) {
      a.group.position.set(this.player.x, this._hopY(), this.player.z);
      a.setFacing(this.player.facing);
      a.tick(1 / 60);
      a.pose(this.player.status === 'idle' ? 'idle' :
              (this.keys.has('shift') ? 'run' : 'walk'), this._elapsed, this.player.dir);
      a.showBubble(this._bubbleT > 0 || Boolean(this.nearby));
    }
  }

  /** 空格动作的抛物线高度（0 → 峰值 → 0），只在表现层用 */
  _hopY() {
    if (this._hopT <= 0) return 0;
    const k = 1 - this._hopT / HOP_TIME;      // 0..1
    return Math.sin(k * Math.PI) * 46;
  }

  _tickAction(dt) {
    if (this._hopT > 0) this._hopT = Math.max(0, this._hopT - dt);
    if (this._bubbleT > 0) this._bubbleT = Math.max(0, this._bubbleT - dt);
  }

  /**
   * 自适应分辨率。每 1.5 秒看一次平均帧率：
   *   低于 45 → 降一档（最低 0.6）；稳定高于 58 → 升一档（最高回到设备上限）。
   * 只影响渲染分辨率，不碰任何游戏逻辑——所以不会影响联机一致性。
   */
  _adaptQuality(dt) {
    const a = this._fpsAcc;
    a.frames += 1;
    a.t += dt;
    if (a.t < 1.5) return;
    const fps = a.frames / a.t;
    a.frames = 0;
    a.t = 0;
    a.last = fps;
    let next = this._dpr;
    if (fps < 45) next = Math.max(0.6, this._dpr - 0.25);
    else if (fps > 58) next = Math.min(this._dprCap, this._dpr + 0.25);
    if (next !== this._dpr) {
      this._dpr = next;
      this.renderer.setPixelRatio(next);
    }
  }

  /** 性能自查（测试与排障看它，不要改） */
  perf() {
    return { dpr: this._dpr, dprCap: this._dprCap, fps: Math.round(this._fpsAcc.last),
             calls: this.renderer.info.render.calls,
             triangles: this.renderer.info.render.triangles };
  }

  _tryMove(ent, dx, dz) {
    const nx = ent.x + dx;
    const nz = ent.z + dz;
    if (!this._blocked(nx, ent.z)) ent.x = nx;
    if (!this._blocked(ent.x, nz)) ent.z = nz;
  }

  _blocked(x, z) {
    const r = DOG_RADIUS;
    for (const c of this.built.colliders) {
      if (x + r > c.x && x - r < c.x + c.w && z + r > c.z && z - r < c.z + c.d) return true;
    }
    return false;
  }

  _moveNpcs(dt) {
    for (const n of this.npcs) {
      const target = n.path[n.idx];
      const dx = target.x - n.x, dz = target.z - n.z;
      const d = Math.hypot(dx, dz);
      if (d < 18) {
        n.idx = (n.idx + 1) % n.path.length;
        continue;
      }
      const step = Math.min(d, n.speed * dt);
      n.x += (dx / d) * step;
      n.z += (dz / d) * step;
      if (Math.abs(dx) > 2) n.facing = dx >= 0 ? 1 : -1;
      n.actor.group.position.set(n.x, 0, n.z);
      n.actor.setFacing(n.facing);
      n.actor.pose('walk', this._elapsed + n.phase);
    }
  }

  /** 上报自己 + 画别人。插值在 WorldSession 里，这里只做搬运。 */
  _syncRemotes() {
    if (!this.session) return;
    this.session.reportMine(this.player.x, this.player.z,
                            this.player.facing, this.player.status);
    this.session.pruneStale();

    const alive = new Set();
    for (const r of this.session.update()) {
      alive.add(r.dogId);
      const rec = this._ensureRemoteActor(r.dogId, r.dog);
      if (rec.hopT > 0) rec.hopT = Math.max(0, rec.hopT - 1 / 60);
      if (rec.bubbleT > 0) rec.bubbleT = Math.max(0, rec.bubbleT - 1 / 60);
      const hop = rec.hopT > 0 ? Math.sin((1 - rec.hopT / HOP_TIME) * Math.PI) * 46 : 0;
      rec.actor.group.position.set(r.x, hop, r.z);
      rec.actor.setFacing(r.facing ?? 1);
      rec.last = r;                       // 记一份最后位置，_updateNearby 要用
      rec.actor.tick(1 / 60);
      rec.actor.pose(r.status === 'run' ? 'run' : (r.status === 'walk' ? 'walk' : 'idle'),
                     this._elapsed);
      rec.actor.showBubble(Boolean(r.bubble) || rec.bubbleT > 0);
    }
    for (const id of [...this.remotes.keys()]) {
      if (!alive.has(id)) this.removeRemote(id);
    }
  }

  _updateNearby() {
    let best = null, bestD = INTERACT_RANGE;
    for (const l of this.built.interactables) {
      const d = Math.hypot(l.x - this.player.x, l.z - this.player.z);
      if (d < bestD) { bestD = d; best = l; }
    }
    // 传送点也算"可交互"，走到跟前就有提示
    for (const p of this.built.portals) {
      const d = Math.hypot(p.x - this.player.x, p.z - this.player.z);
      if (d < (p.r || 100) && d < bestD) {
        bestD = d;
        best = { id: `portal-${p.to}`, kind: 'portal', label: p.label,
                 hint: '走过去即可前往', x: p.x, z: p.z, to: p.to };
      }
    }
    // ⚠️ **别的玩家的狗也要能交互**。
    // 之前这里只扫公告板/店铺/NPC，走到别人旁边按 E 什么都不会发生——
    // 而"靠近别的狗能打招呼"是开放世界最基本的社交动作，
    // 也是这一版做联机的意义所在。范围放得比道具小一点（狗会动，太远就够不着）。
    for (const [dogId, rec] of this.remotes) {
      const r = rec.last;      // 用**插值后**的位置，和画面上看到的一致
      if (!r) continue;
      const d = Math.hypot(r.x - this.player.x, r.z - this.player.z);
      if (d < DOG_INTERACT_RANGE && d < bestD) {
        bestD = d;
        best = {
          id: `dog-${dogId}`, kind: 'dog', dogId,
          label: r.dog?.name || '路过的狗',
          hint: '打个招呼', x: r.x, z: r.z,
        };
      }
    }
    const changed = (this.nearby?.id || null) !== (best?.id || null);
    // 每帧都要刷：别的狗会走动，提示里的坐标得跟着更新
    this.nearby = best;
    if (this.localActor) this.localActor.showBubble(Boolean(best));
    if (changed) this.opts.onNearby?.(best);
  }

  _checkPortals() {
    for (const p of this.built.portals) {
      const d = Math.hypot(p.x - this.player.x, p.z - this.player.z);
      if (d < (p.r || 100) * 0.55) {
        this.opts.onPortal?.(p.to);
        return;
      }
    }
  }

  // ---------------- 对外状态 ----------------
  playerState() {
    return {
      x: Math.round(this.player.x), z: Math.round(this.player.z),
      facing: this.player.facing, status: this.player.status,
      scene: this.sceneCode,
    };
  }

  setTheme(theme) {
    this.theme = theme;
    // 立牌纹理带主题色，换主题要重建演员
    const dog = this.opts.dog || {};
    this.localActor?.dispose();
    this.localActor = makeDogActor({
      breed: breedOf(dog.breed_code), level: dog.level || 1,
      name: `${dog.name || '我'}（你）`, theme, scale: 100 * DOG_SCALE,
    });
    this.actorRoot.add(this.localActor.group);
    for (const n of this.npcs) n.actor.dispose();
    this._spawnNpcs();
    this.clearRemotes();
  }

  resize() {
    const w = this.host.clientWidth || 800;
    const h = this.host.clientHeight || 520;
    this.renderer.setSize(w, h);
    this.camera3.aspect = w / h;
    this.camera3.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this._onDown);
    el.removeEventListener('pointermove', this._onMove);
    el.removeEventListener('pointerup', this._onUp);
    el.removeEventListener('pointercancel', this._onUp);
    el.removeEventListener('wheel', this._onWheel);
    for (const n of this.npcs) n.actor.dispose();
    this.clearRemotes();
    this.localActor?.dispose();
    disposeTree(this.sceneRoot);
    this.renderer.dispose();
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function disposeTree(root) {
  root.traverse?.((o) => {
    if (o.geometry) o.geometry.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
    else m?.dispose?.();
  });
}
