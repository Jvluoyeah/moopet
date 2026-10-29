/* 斜俯视跟随相机：透视投影 + 可拖拽绕 Y 轴旋转 + 滚轮缩放
   ------------------------------------------------------------
   参照奇迹巡展那套观感：俯角 45~60°、看不到地平线、相机贴着角色跟。
   俯角是"看起来像 2.5D"的关键——太平会像俯视图，太陡又像纯 2D。

   取景口径（和 scale.js 的 VIEW 联动，改一个要回去对另一个）：
     pitch 57°、fov 35、dist 1400、画面 16:9 左右时，
     可视地面 ≈ 1090（纵深）× 1270~1700（横宽）。

   lead（前视偏移）是这一版新加的，解决的是"近景糊屏"：
     第一版相机正对着狗，于是**狗身后那一片**也被画进来，
     压在画面最底下的道具被透视放到巨大（花箱横跨半个屏幕、
     传送牌只剩半截）。现在相机和目标点一起往前挪
     leadFrac * 地面距离，狗落到画面约 2/3 处，
     身后只留一点点，近处的巨大前景基本被裁掉了。
   */

const DEG = Math.PI / 180;

export class WorldCamera {
  constructor(camera, opts = {}) {
    this.camera = camera;
    this.yaw = opts.yaw ?? -18 * DEG;        // 初始稍微偏一点，画面更有立体感
    this.pitch = opts.pitch ?? 57 * DEG;     // 俯角
    this.dist = opts.dist ?? 1400;
    this.minDist = opts.minDist ?? 900;
    // 广场放大到 2800×2150 之后 3000 不够用了 ——
    // 玩家得能缩到看见整个广场，所以上限抬到 3800。
    this.maxDist = opts.maxDist ?? 3800;
    this.lookHeight = opts.lookHeight ?? 70; // 视线略高于地面（对着狗身子）
    this.leadFrac = opts.leadFrac ?? 0.22;   // 前视偏移占地面距离的比例
    /* 转向范围（可选）：`baseYaw ± yawRange`。
       为什么要它：**斜俯视 + 有限地面**的组合下，"转到侧面"会把场地外面
       （地面之外）露出来。公园那种"地面故意收窄、好让天空盒露一条"的场景
       尤其明显 —— 用户转一下视角就看见浮空的路缘和贴片幕布。
       用户的原话是"实在不行你就固定机位，保证机位内不会穿帮就行"，
       所以这里给一个**每场景可配**的转向范围：留一点可转的余地（验收要求
       拖动视角能转动），但转不出"设计好的那个取景"。 */
    this.baseYaw = this.yaw;
    this.yawRange = opts.yawRange ?? null;    // null = 不限制（原来的行为）
    this.target = { x: 0, z: 0 };
    this.smooth = { x: 0, z: 0 };
    this.follow = opts.follow ?? 7.5;        // 跟随缓动
    this._first = true;
  }

  setTarget(x, z) {
    this.target.x = x;
    this.target.z = z;
  }

  /** 拖拽旋转（dx/dy 是像素位移） */
  rotate(dx, dy) {
    this.yaw -= dx * 0.006;
    // 场景配了转向范围就夹住 —— 转不出去，取景就不会穿帮（见构造函数的说明）
    if (this.yawRange !== null) {
      this.yaw = Math.max(this.baseYaw - this.yawRange,
                          Math.min(this.baseYaw + this.yawRange, this.yaw));
    }
    this.pitch = Math.max(30 * DEG, Math.min(74 * DEG, this.pitch + dy * 0.004));
  }

  /** 缩放（delta 是滚轮量） */
  zoom(delta) {
    const factor = Math.exp(delta * 0.0012);
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * factor));
  }

  update(dt) {
    const k = this._first ? 1 : Math.min(1, dt * this.follow);
    this.smooth.x += (this.target.x - this.smooth.x) * k;
    this.smooth.z += (this.target.z - this.smooth.z) * k;
    this._first = false;

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // 前视偏移：沿相机的"屏幕上方"世界方向挪
    const lead = this.dist * cp * this.leadFrac;
    const lx = this.smooth.x - Math.sin(this.yaw) * lead;
    const lz = this.smooth.z - Math.cos(this.yaw) * lead;

    this.camera.position.set(lx + Math.sin(this.yaw) * cp * this.dist, sp * this.dist,
                             lz + Math.cos(this.yaw) * cp * this.dist);
    this.camera.lookAt(lx, this.lookHeight, lz);
  }

  /** 屏幕方向 → 世界方向（移动用：按"上"就往屏幕里走） */
  basis() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return {
      forward: { x: -s, z: -c },      // 屏幕上方对应的世界方向
      right: { x: c, z: -s },         // 屏幕右方对应的世界方向
    };
  }

  state() {
    return { yaw: this.yaw, pitch: this.pitch, dist: this.dist,
             lead: this.dist * Math.cos(this.pitch) * this.leadFrac };
  }
}
