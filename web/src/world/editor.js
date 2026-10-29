/* 场景编辑器：**在浏览器里直接把模型摆好**，不用改代码、不用重建。
 *
 * 为什么要有它：靠读代码算坐标来摆模型，效率极低而且经常"算对了、看着不对"。
 * 这个面板让你选中任何一个模型，用方向键推着走、实时看穿模、然后把最终数字
 * 复制出来粘回场景文件。
 *
 * 用法：
 *   1) `npm run dev`（Vite，存盘热更新），打开 `#/world`
 *   2) 按 **F2** 开关编辑器面板
 *   3) 点列表里的模型选中它 → 地上会出现一个黄色圆环标出它的位置
 *   4) 方向键推：← → 是世界 x，↑ ↓ 是世界 z
 *        Shift + 方向键 = 100 格（粗调）
 *        Alt   + 方向键 = 1 格（微调）
 *   5) 面板底部会给出**可以直接粘回场景文件的代码行**，按"复制"即可
 *
 * ⚠️ 导出的坐标会自动按场景的坐标系给：plaza 用世界坐标 `prop(x, z, …)`，
 *    公园/狗窝/竞技场用相机坐标 `prop(F, R, …)`（由 at() 转换）。
 *    写混了两个坐标系是这块最容易出的错，所以导出这一步不能靠人手算。
 *
 * 约定：新增场景时，如果它在 others.js 里，要往 COORD_SYS 里登记。
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { overlapCheck } from './footprint.js';

/* ------------------------------------------------------------------
   和外部软件的通道
   ------------------------------------------------------------------
   1) **模型**：项目本来就支持外部模型（`public/models/` 下的 .glb，GLTFLoader 加载，
      见 models.js 的 MODELS_BY_KIND / TARGET_HEIGHT）。Blender 直接导出 .glb
      丢进去、登记一个 kind 就能用。**不需要这个编辑器**。
   2) **整个场景导出去**：`导出 GLB` 把当前建好的场景（楼/道具/地面）序列化成一个
      .glb，可以在 Blender 里打开看比例、量尺寸、改配色、渲染出图。
      ⚠️ 这是**单向快照**：在 Blender 里挪了东西再导回来是接不上的 ——
      场景是按数据程序化生成的，没有"用外部网格替换场景"这条路。
   3) **坐标往返**：`导出 JSON / 导入 JSON` 是真正能闭环的那条 ——
      把每个模型的 id/kind/x/z/y 导出去，用任何工具（Excel、脚本、
      Blender 里当空物体摆）改完再导回来，直接生效。
   */

/** 下载一个 Blob。 */
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 把当前建好的场景导出成 .glb（返回 ArrayBuffer，方便测试也方便下载）。 */
export function exportSceneGLB(world) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(world.built.root, (buf) => resolve(buf),
      (err) => reject(err), { binary: true });
  });
}

/** 场景里所有可摆模型的位置清单（JSON 往返用）。 */
export function sceneSnapshot(world) {
  return {
    scene: world.sceneCode,
    note: 'x/z 是世界坐标；y 是抬升高度（不写=贴地）。改完用编辑器的「导入 JSON」读回来。',
    items: collect(world).map((i) => ({
      id: i.id, kind: i.kind,
      x: Math.round(i.x), z: Math.round(i.z), y: Math.round(i.o.y || 0),
      ...(i.o.rot !== undefined ? { rot: +i.o.rot.toFixed(3) } : {}),
    })),
  };
}

/** 把 JSON 里的坐标写回场景数据。返回改动条数。 */
export function applySceneSnapshot(world, text) {
  const data = JSON.parse(text);
  if (data.scene && data.scene !== world.sceneCode) {
    throw new Error(`这份 JSON 是场景「${data.scene}」的，当前是「${world.sceneCode}」`);
  }
  const byId = new Map(collect(world).map((i) => [i.id, i]));
  let n = 0;
  for (const it of data.items || []) {
    const t = byId.get(it.id);
    if (!t) continue;
    if (it.x !== undefined) t.o.x = it.x;
    if (it.z !== undefined) t.o.z = it.z;
    if (it.y !== undefined) t.o.y = it.y;
    if (it.rot !== undefined && t.o.rot !== undefined) t.o.rot = it.rot;
    n += 1;
  }
  world.reloadSceneGeometry();
  return n;
}

// 哪个场景用哪套坐标（plaza.js 是世界坐标，其余在 others.js 里用 at() 的 F/R）
const COORD_SYS = { plaza: 'world', park: 'fr', kennel: 'fr', arena: 'fr' };

const STEP = { plain: 25, shift: 100, alt: 1 };

/** 把世界坐标反算成 at() 的 (F, R)。和 place.js 的 at() 严格互逆。 */
function worldToFR(scene, x, z) {
  const yaw = scene.camera?.yaw ?? -0.18;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const dx = x - scene.spawn.x, dz = z - scene.spawn.z;
  return [dx * fx + dz * fz, dx * rx + dz * rz];
}

const fmt = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v))
                                                       : v.toFixed(1));

/** 把一个值写成能直接粘进场景文件的 JS 字面量。 */
function jsVal(v) {
  if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
  if (typeof v === 'number') return fmt(v);
  if (typeof v === 'boolean' || v === null) return String(v);
  if (Array.isArray(v)) return `[${v.map(jsVal).join(', ')}]`;
  if (typeof v === 'object') {
    const inner = Object.entries(v).map(([k, x]) => `${k}: ${jsVal(x)}`);
    return `{ ${inner.join(', ')} }`;
  }
  return 'undefined';
}

/** 把物体的**全部外观选项**序列化出来（除了坐标本身）。
 *  ⚠️ 早先只导出了 id/kind/label/hint，结果楼导出来是
 *  `box(220, 760, 400, 380, 460, { kind: 'building' })` —— 招牌、配色、
 *  屋顶、卷帘门全丢了，照它粘回去店面就变成一块白板。导出必须是**完整**的。 */
function serializeOpts(o, skip = []) {
  const parts = [];
  for (const [k, v] of Object.entries(o)) {
    if (k === 'x' || k === 'z' || v === undefined || skip.includes(k)) continue;
    if (k === 'y' && v === 0) continue;     // 0 就是默认值，别写进导出行
    // shutter 这类颜色在源码里写成 0x8c3b2e，按十六进制给可读性好得多
    const text = (k === 'shutter' && typeof v === 'number')
      ? '0x' + v.toString(16) : jsVal(v);
    parts.push(`${k}: ${text}`);
  }
  return parts.length ? `, { ${parts.join(', ')} }` : '';
}

/** 收集当前场景里所有能摆的东西。id 用 `类型#下标`，稳定且能和 scene 对上。 */
function collect(world) {
  const s = world.scene, out = [];
  (s.blocks || []).forEach((o, i) => out.push({
    id: `block#${i}`, group: '楼', kind: o.sign?.text || o.kind || '建筑', o,
    get x() { return o.x; }, get z() { return o.z; } }));
  (s.props || []).forEach((o, i) => out.push({
    id: `prop#${i}`, group: '道具', kind: o.kind + (o.id ? `:${o.id}` : ''), o,
    get x() { return o.x; }, get z() { return o.z; } }));
  (s.locals || []).forEach((o, i) => out.push({
    id: `local#${i}`, group: '交互', kind: o.label || o.id || o.kind, o,
    get x() { return o.x; }, get z() { return o.z; } }));
  (s.portals || []).forEach((o, i) => out.push({
    id: `portal#${i}`, group: '传送', kind: `→${o.to}`, o,
    get x() { return o.x; }, get z() { return o.z; } }));
  return out;
}

/** 生成可以直接粘回场景文件的代码行（坐标按该场景的坐标系给）。 */
function codeLine(world, item) {
  const sys = COORD_SYS[world.sceneCode] || 'fr';
  const o = item.o;
  const isBlock = item.id.startsWith('block#');
  const isPortal = item.id.startsWith('portal#');
  let pos;
  if (isPortal) {
    const [F, R] = worldToFR(world.scene, o.x, o.z);
    // 传送点在两个文件里都写成 at(F, R)
    return `{ to: '${o.to}', ...at(${fmt(F)}, ${fmt(R)}), r: ${o.r ?? 150}, `
      + `label: '${o.label || ''}' }`;
  }
  if (sys === 'world') {
    pos = `${fmt(o.x)}, ${fmt(o.z)}`;
  } else {
    const [F, R] = worldToFR(world.scene, o.x, o.z);
    pos = `${fmt(F)}, ${fmt(R)}`;
  }
  const fn = isBlock ? (sys === 'world' ? 'box' : 'bld') : 'prop';
  if (isBlock) {
    // 楼：box(x, z, w, d, h, {…}) / bld(F, R, w, d, h, {…})
    // w/d/h 已经作为位置参数给出去了，opts 里就别再重复一遍
    return `${fn}(${pos}, ${fmt(o.w)}, ${fmt(o.d)}, ${fmt(o.h)}`
      + `${serializeOpts(o, ['w', 'd', 'h'])})`;
  }
  return `${fn}(${pos}${serializeOpts(o)})`;
}

export function attachSceneEditor(world) {
  let root = null;          // 面板 DOM
  let marker = null;        // 地面上的黄色圆环
  let items = [];
  let sel = null;
  let lastScene = null;     // 上次收集列表时是哪个场景
  const changed = new Map();   // id -> {kind, from:[x,z], to:[x,z]}

  /** 场景换了就把列表和选中项作废。
   *  ⚠️ 少了这一步，切到公园之后列表里还是广场的东西，选中/推动会张冠李戴
   *  （自动化测试就是这么抓到的）。 */
  function ensureFresh() {
    if (world.sceneCode === lastScene) return;
    lastScene = world.sceneCode;
    sel = null;
    if (root) refreshList();
    if (marker) marker.visible = false;
  }

  const host = world.host || document.body;

  function buildMarker() {
    /* 选中标记必须**任何情况下都看得见**。
       第一版只是躺在地上的一圈黄环（y=8）—— 选中一栋楼时那个环在楼体内部，
       被墙挡得严严实实，用户以为"没选中 / 推不动"。用户报"只能动 Y 轴、
       横纵向动不了"，根因就是这个（键盘其实在动，只是没有任何可见反馈）。
       现在：地面圆环 + 一根竖直光柱，并且 **关掉深度测试 + 最高渲染序**，
       保证它永远画在所有东西上面。 */
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd24a, side: THREE.DoubleSide,
      depthTest: false, depthWrite: false, transparent: true, opacity: 0.95,
    });
    marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(70, 92, 40), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 6;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1200, 8), mat);
    beam.position.y = 600;
    marker.add(ring, beam);
    marker.renderOrder = 999;
    marker.visible = false;
    // 挂到 three 场景上（不是 sceneRoot）—— 场景几何重建时它不会被清掉
    world.three.add(marker);
  }

  function refreshList() {
    items = collect(world);
    lastScene = world.sceneCode;
    if (!root) return;
    const box = root.querySelector('.se-list');
    box.replaceChildren(...items.map((it) => {
      const row = document.createElement('div');
      row.className = 'se-row' + (sel && sel.id === it.id ? ' se-sel' : '');
      row.textContent = `[${it.group}] ${it.kind}`;
      row.title = `${it.id}  @ ${Math.round(it.x)}, ${Math.round(it.z)}`;
      row.onclick = () => { select(it.id); };
      return row;
    }));
  }

  function select(id) {
    ensureFresh();
    sel = items.find((i) => i.id === id) || null;
    if (sel) {
      marker.visible = true;
      marker.position.x = sel.x;
      marker.position.z = sel.z;
      marker.position.y = sel.o.y || 0;
    } else {
      marker.visible = false;
    }
    refreshList();
    renderInfo();
  }

  /** 面板顶部那行状态。挪动之后要把"从哪到哪"写出来 ——
   *  25 格的位移在画面上可能只有十几像素，光靠看容易以为没动。 */
  function say(t) {
    if (root) root.querySelector('.se-stat').textContent = t;
  }

  function renderInfo() {
    const info = root.querySelector('.se-info');
    if (!sel) {
      info.textContent = '先在上面点一个模型。';
      return;
    }
    const o = sel.o;
    const sys = COORD_SYS[world.sceneCode] || 'fr';
    const [F, R] = worldToFR(world.scene, o.x, o.z);
    // 只报**和选中这个**有关的穿模。overlapCheck 返回的是给人看的字符串，
    // 里面带了这个物体的圆整坐标 —— 按坐标匹配比按 kind 匹配准得多
    // （按 kind 匹配会把"别的长椅"的告警也捞进来）。
    const mine = `(${Math.round(o.x)},${Math.round(o.z)})`;
    const warn = overlapCheck(world.scene).filter((w) => w.includes(mine));
    const lines = [
      `${sel.kind}   ${sel.id}`,
      `世界坐标  x=${Math.round(o.x)}  z=${Math.round(o.z)}  y=${Math.round(o.y || 0)}`,
      sys === 'world' ? '（本场景用世界坐标，直接粘 x/z）'
        : `相机坐标  F=${fmt(F)}  R=${fmt(R)}（y 不参与换算，照抄）`,
      warn.length ? `⚠ ${warn.length} 条穿模：\n` + warn.slice(0, 3).join('\n') : '✓ 没有穿模',
    ];
    info.textContent = lines.join('\n');
    root.querySelector('.se-code').value = codeLine(world, sel);
  }

  /** 垂直方向。这个轴是后加的（场景格式原本只有 x/z，见 build.js 里的说明）：
   *  数据里写 `y: 300` 就能把模型整体抬起来，不写就是贴地。 */
  function nudgeY(dy) {
    ensureFresh();
    if (!sel) return;
    const o = sel.o;
    const rec = changed.get(sel.id) || { kind: sel.kind, from: [o.x, o.z] };
    o.y = Math.round((o.y || 0) + dy);
    rec.to = [o.x, o.z];
    rec.y = o.y;
    changed.set(sel.id, rec);
    marker.position.y = o.y;
    world.reloadSceneGeometry();
    renderInfo();
    say(`y ${Math.round(o.y - dy)} → ${o.y}`);
  }

  function nudge(dx, dz) {
    ensureFresh();
    if (!sel) return;
    const o = sel.o;
    const rec = changed.get(sel.id) || { kind: sel.kind, from: [o.x, o.z] };
    o.x += dx;
    o.z += dz;
    rec.to = [o.x, o.z];
    changed.set(sel.id, rec);
    marker.position.x = o.x;
    marker.position.z = o.z;
    world.reloadSceneGeometry();
    renderInfo();
    say(`x/z (${Math.round(rec.from[0])},${Math.round(rec.from[1])})`
      + ` → (${Math.round(o.x)},${Math.round(o.z)})`);
  }

  function onKey(e) {
    if (!root || root.style.display === 'none') return;
    if (!sel) return;
    const step = e.shiftKey ? STEP.shift : (e.altKey ? STEP.alt : STEP.plain);
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0],
                  ArrowUp: [0, -step], ArrowDown: [0, step] };
    // PageUp / PageDown 抬升、下沉（x/z 已经用掉方向键了）
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      e.stopPropagation();
      nudgeY(e.key === 'PageUp' ? step : -step);
      return;
    }
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();      // 别让世界那边的按键也吃到
    nudge(d[0], d[1]);
  }

  function exportAll() {
    const out = [];
    for (const [id, rec] of changed) {
      out.push(`// ${rec.kind}  (${Math.round(rec.from[0])},${Math.round(rec.from[1])})`
        + ` -> (${Math.round(rec.to[0])},${Math.round(rec.to[1])})`);
    }
    if (!out.length) return '（还没改动过任何模型）';
    return out.join('\n');
  }

  function makeUI() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;right:14px;top:70px;width:340px;max-height:74vh;'
      + 'display:flex;flex-direction:column;gap:8px;z-index:9999;'
      + 'background:#1d1a16;color:#f2ede1;border:1px solid #6b5a45;border-radius:10px;'
      + 'padding:10px;font:12px/1.5 ui-monospace,Consolas,monospace;'
      + 'box-shadow:0 8px 28px rgba(0,0,0,.45)';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>场景编辑器</b>
        <span class="se-stat" style="opacity:.7"></span>
      </div>
      <div style="opacity:.75">F2 开关 · 点模型选中 · 方向键推 x/z（Shift 100 / Alt 1）<br>
        PageUp / PageDown 抬升、下沉 y</div>
      <div class="se-list" style="overflow:auto;max-height:30vh;border:1px solid #4a3f33;
           border-radius:6px"></div>
      <div class="se-info" style="white-space:pre-wrap;background:#2a251e;padding:6px;
           border-radius:6px;min-height:74px"></div>
      <div style="display:flex;gap:4px;align-items:center">
        <span style="opacity:.7;width:26px">x</span>
        <button class="se-btn se-mv" data-dx="-100" style="flex:1">−100</button>
        <button class="se-btn se-mv" data-dx="-25" style="flex:1">−25</button>
        <button class="se-btn se-mv" data-dx="25" style="flex:1">+25</button>
        <button class="se-btn se-mv" data-dx="100" style="flex:1">+100</button>
      </div>
      <div style="display:flex;gap:4px;align-items:center">
        <span style="opacity:.7;width:26px">z</span>
        <button class="se-btn se-mv" data-dz="-100" style="flex:1">−100</button>
        <button class="se-btn se-mv" data-dz="-25" style="flex:1">−25</button>
        <button class="se-btn se-mv" data-dz="25" style="flex:1">+25</button>
        <button class="se-btn se-mv" data-dz="100" style="flex:1">+100</button>
      </div>
      <div style="display:flex;gap:4px;align-items:center">
        <span style="opacity:.7;width:26px">y</span>
        <button class="se-btn se-y" data-dy="-100" style="flex:1">−100</button>
        <button class="se-btn se-y" data-dy="-10" style="flex:1">−10</button>
        <button class="se-btn se-y" data-dy="0" style="flex:1">归零</button>
        <button class="se-btn se-y" data-dy="10" style="flex:1">+10</button>
        <button class="se-btn se-y" data-dy="100" style="flex:1">+100</button>
      </div>
      <textarea class="se-code" readonly style="width:100%;height:52px;background:#12100d;
           color:#9fe08a;border:1px solid #4a3f33;border-radius:6px;padding:4px;
           font:11px/1.4 ui-monospace,Consolas,monospace"></textarea>
      <div style="display:flex;gap:6px">
        <button class="se-btn se-copy" style="flex:1">复制这行</button>
        <button class="se-btn se-dump" style="flex:1">改动清单</button>
      </div>
      <div style="display:flex;gap:6px">
        <button class="se-btn se-glb" style="flex:1">导出 GLB</button>
        <button class="se-btn se-json-out" style="flex:1">导出 JSON</button>
        <button class="se-btn se-json-in" style="flex:1">导入 JSON</button>
      </div>
      <input class="se-file" type="file" accept=".json" style="display:none">
      <div style="opacity:.6;font-size:11px">GLB 给 Blender 看/量/改外观；JSON 是坐标往返（改完导回来直接生效）</div>`;
    const style = document.createElement('style');
    // ⚠️ 按钮要显式给底色和字色：不给的话用的是浏览器默认的浅灰底，
    //    而字色继承面板的浅色 —— 结果就是"看得见两个按钮、看不见字"。
    style.textContent = `.se-row{padding:3px 7px;cursor:pointer;border-bottom:1px solid #2f2a23}
      .se-row:hover{background:#332c23}.se-sel{background:#5a4a2a;color:#ffe9a8}
      .se-row:last-child{border-bottom:none}
      .se-btn{padding:6px;cursor:pointer;background:#4a3f33;color:#f2ede1;
              border:1px solid #6b5a45;border-radius:6px;font:inherit}
      .se-btn:hover{background:#5c4e3f}`;
    el.appendChild(style);
    el.querySelector('.se-copy').onclick = () => {
      const ta = el.querySelector('.se-code');
      ta.select();
      navigator.clipboard?.writeText(ta.value);
      el.querySelector('.se-stat').textContent = '已复制';
    };
    el.querySelector('.se-dump').onclick = () => {
      const t = exportAll();
      el.querySelector('.se-code').value = t;
      navigator.clipboard?.writeText(t);
    };
    for (const b of el.querySelectorAll('.se-mv')) {
      b.onclick = () => nudge(Number(b.dataset.dx || 0), Number(b.dataset.dz || 0));
    }
    for (const b of el.querySelectorAll('.se-y')) {
      b.onclick = () => {
        const dy = Number(b.dataset.dy);
        if (dy === 0) {
          if (!sel) return;
          nudgeY(-(sel.o.y || 0));      // 归零
        } else nudgeY(dy);
      };
    }
    const stat = (t) => { el.querySelector('.se-stat').textContent = t; };
    el.querySelector('.se-glb').onclick = async () => {
      stat('导出 GLB…');
      try {
        const buf = await exportSceneGLB(world);
        download(new Blob([buf], { type: 'model/gltf-binary' }),
                 `${world.sceneCode}.glb`);
        stat(`GLB ${Math.round(buf.byteLength / 1024)} KB`);
      } catch (e) { stat('GLB 失败: ' + e.message); }
    };
    el.querySelector('.se-json-out').onclick = () => {
      const txt = JSON.stringify(sceneSnapshot(world), null, 2);
      download(new Blob([txt], { type: 'application/json' }),
               `${world.sceneCode}.json`);
      stat('JSON 已导出');
    };
    const file = el.querySelector('.se-file');
    el.querySelector('.se-json-in').onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const n = applySceneSnapshot(world, await f.text());
        ensureFresh();
        refreshList();
        renderInfo();
        stat(`导入了 ${n} 个`);
      } catch (e) { stat('导入失败: ' + e.message); }
      file.value = '';
    };
    el.style.display = 'none';
    return el;
  }

  function open() {
    if (!root) {
      buildMarker();
      root = makeUI();
      host.appendChild(root);
      window.addEventListener('keydown', onKey, true);
    }
    root.style.display = 'flex';
    ensureFresh();
    refreshList();
    renderInfo();
  }
  function close() {
    if (root) root.style.display = 'none';
    if (marker) marker.visible = false;
  }
  const toggle = () => (root && root.style.display !== 'none' ? close() : open());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') { e.preventDefault(); toggle(); }
  }, true);

  // 供自动化测试用
  const api = { open, close, toggle,
                select: (id) => select(id),
                nudge: (dx, dz) => nudge(dx, dz),
                nudgeY: (dy) => nudgeY(dy),
                getItemY: (id) => { const it = items.find((i) => i.id === id);
                                    return it ? (it.o.y || 0) : null; },
                getItems: () => { ensureFresh();
                  return items.map((i) => ({ id: i.id, kind: i.kind, x: i.x, z: i.z })); },
                getCode: () => (sel ? codeLine(world, sel) : ''),
                getChanged: () => [...changed.keys()],
                getWarnings: () => overlapCheck(world.scene),
                exportGLB: () => exportSceneGLB(world),
                exportJSONText: () => JSON.stringify(sceneSnapshot(world)),
                importJSONText: (t) => applySceneSnapshot(world, t) };
  window.__sceneEditor = api;
  return api;
}
