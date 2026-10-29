/* 场景占地的**唯一**量尺：检查器（tools/layout_check.mjs）和浏览器里的
   场景编辑器（world/editor.js）都 import 这里，别再各写一份。

   ⚠️ 这张表错过一次，代价很大：不写 w/d 的小道具原本全落到 `default: 200×200`，
   于是蘑菇被当成两米见方的东西，报出来的"穿模"一半是假的。改这张表之前
   先想清楚它对应 build.js 里哪个真实几何。

   本文件由 _refs/_extract_footprint.py 从 layout_check.mjs 抽取生成，
   两边保持一致；改逻辑请直接改这里。 */

export function footprint(kind, o) {
  switch (kind) {
    case 'block': {
      // 占地 = 台基（楼身 +40）。**不含门前的台阶**：台阶只有 26 高，狗能站上去，
      // 算进去会把店面门口变成一堵无形的墙（出生点正对中街那栋时尤其明显）。
      // 数字必须和 build.js 的 collider 一致，不然查出来的都是假问题。
      return { hw: o.w / 2 + 20, hd: o.d / 2 + 20 };
    }
    // 树只算**树干**：树冠在 5 米高，长椅、花坛、传送圈摆在树下是正常的，
    // 按整个树冠（180 见方）算会把一堆合理的摆法报成穿模。
    case 'tree': return { hw: 60, hd: 60 };
    case 'fountain': { const r = o.r || 180; return { hw: r, hd: r }; }
    // 月塔：地标，塔基实测 520 见方。**必须显式登记** —— 漏了会落到
    // default 的 200×200，于是检查器把 520 宽的塔当成 200，
    // 出生点和旁边的花坛全被包进塔里还报"0 穿模"（狗直接卡住动不了）。
    // 跟着数据走：塔基尺寸在场景里是可配的（h/w/d），别写死
    case 'moontower': return { hw: (o.w || 520) / 2, hd: (o.d || 520) / 2 };
    case 'stall': return { hw: (o.w || 240) / 2, hd: (o.d || 200) / 2 };
    case 'lamp': return { hw: 26, hd: 26 };
    case 'bench': return { hw: (o.w || 200) / 2, hd: (o.d || 90) / 2 };
    case 'hedge': return { hw: (o.w || 300) / 2, hd: (o.d || 90) / 2 };
    case 'planter': return { hw: (o.w || 140) / 2, hd: (o.d || 140) / 2 };
    case 'umbrella': return { hw: 130, hd: 130 };
    case 'portal': return { hw: 130, hd: 130 };   // 传送圈（牌子已拆成独立道具）
    // 传送路牌（独立道具）：只有杆子占地，牌子是悬在 260 高的 billboard
    case 'portalsign': return { hw: 20, hd: 20 };
    // local 里装的不都是 NPC：成长日记 / 成就墙 / 公园告示是**挂墙薄板**，
    // 它们本来就该贴着墙面装、也该允许长椅摆在旁边。一律按 90×90 的 NPC
    // 算，会把"贴在墙上的板子"和"墙边正常摆放"全报成穿模。
    case 'local': {
      const k = o.kind;
      if (k === 'board') return { hw: (o.w || 180) / 2, hd: 22 };
      if (k === 'shelf' || k === 'bed') return { hw: (o.w || 200) / 2, hd: (o.d || 200) / 2 };
      return { hw: 90, hd: 90 };       // NPC / 可交互物（含走动余量）
    }
    // stage 是**地面贴花**：build.js:685 注明"刻意做成平的（只在地上画圈）"，
    // 狗始终站在 y=0。画在地上的一圈不可能和楼穿模 —— 它由下面 overlapCheck
    // 的 solid 开关排除（和草丛、蘑菇同类），这里只给出占地供取景统计。
    // 之前它落到 default 被当成 200 方块，反而漏掉了真问题。
    case 'stage': { const r = o.r || 380; return { hw: r, hd: r }; }
    /* 室内竞技场的五个构件。
       ⚠️ 不登记的话会落到 default 的 200×200 —— 看台其实是 1280×616，
          用 200 去算就会漏报/误报（我第一版就是没登记，检查器给出的
          "重叠 128×171" 之类的数字全是错的）。
       看台是旋转 90° 摆的，这里的 hw/hd 是**未旋转**的口径，
       和检查器"不看 rot"的老毛病一致（见 tools/layout_check.mjs 的说明）。 */
    case 'bleachers': {
      const rows = o.rows || 6;
      return { hw: (o.len || 900) / 2, hd: rows * (o.stepD || 78) / 2 };
    }
    case 'lightpool': { const r = o.r || 540; return { hw: r, hd: r }; }
    case 'courtline': return { hw: (o.w || 1000) / 2, hd: (o.t || 16) / 2 };
    case 'ceilinglamp': return { hw: 20, hd: 20 };
    case 'deskset': return { hw: (o.w || 300) / 2, hd: (o.d || 130) / 2 };
    // 下面这一组以前全落到 default 的"200×200 方块"上 —— 蘑菇、花、石头
    // 在数据里不写 w/d，于是被当成两米见方的东西，和长椅/花坛的"穿模"里
    // 有一大半是这么来的假问题。量尺不准，改布局就是瞎改。
    // 数字对齐 build.js 里各自的真实占地：
    case 'mushroom': return { hw: 40, hd: 40 };
    case 'flower': return { hw: 50, hd: 50 };
    case 'rock': return { hw: 80, hd: 80 };
    // stone 原来没有条目，落到 default 的 200×200 —— 而它和 rock 是同一族模型
    case 'stone': return { hw: 80, hd: 80 };
    case 'bush': return { hw: 90, hd: 90 };
    case 'stump': return { hw: 70, hd: 70 };
    case 'grass': return { hw: 120, hd: 120 };    // 草皮是一小块贴地补丁
    // 挂墙板（成长日记 / 成就墙 / 告示）：薄板，贴着墙面装，深度只算板厚。
    case 'board': return { hw: (o.w || 180) / 2, hd: 22 };
    case 'npc': return { hw: 70, hd: 70 };
    case 'pond': return { hw: (o.w || 380) / 2, hd: (o.d || 260) / 2 };
    default: return { hw: (o.w || 200) / 2, hd: (o.d || 200) / 2 };
  }
}

export function overlapCheck(scene) {
  const warn = [];
  const items = [];
  const add = (kind, label, x, z, fp, solid, decal = false) => {
    // 占地中心可以相对物体中心偏移（楼的台阶只朝一边伸）
    const cz = z + (fp.oz || 0);
    items.push({ kind, label, x, z, ...fp, solid, decal,
                 x0: x - fp.hw, x1: x + fp.hw, z0: cz - fp.hd, z1: cz + fp.hd });
  };
  for (const b of scene.blocks || []) {
    add('block', b.sign?.text || '建筑', b.x, b.z, footprint('block', b), true);
  }
  for (const p of scene.props || []) {
    // 只有"实心"的道具才需要占位；草丛、花这类可以互相压
    // 地被/矮丛只是装饰，可以互相压：花朵、草、蘑菇、石头、树桩、灌木
    const solid = !['flowers', 'grass', 'decal', 'path', 'flower', 'mushroom',
                     'rock', 'stone', 'stump', 'bush',
                     // 室内竞技场的装饰：光斑/白线贴地、吊灯在头顶，都不是障碍
                     'lightpool', 'courtline', 'ceilinglamp'].includes(p.kind);
    // 地面贴花：画在地上的东西（竞技场舞台圈、草皮、小径）。楼本来就坐在地上，
    // 贴花"压在"楼下面不算穿模，所以贴花**和谁都配不成穿模**，单独一档。
    const decal = ['stage', 'grass', 'path', 'decal', 'flowers',
                   'portalsign',
                   // 光斑、白线是贴地装饰；吊灯整个在头顶（吊杆 1200 以上），
                   // 从俯视看它和白线落在同一个 x/z 上是**正常**的，不该报穿模。
                   'lightpool', 'courtline', 'ceilinglamp'].includes(p.kind);
    add('prop', `${p.kind}`, p.x, p.z, footprint(p.kind, p), solid, decal);
  }
  for (const p of scene.portals || []) {
    add('portal', `传送→${p.to}`, p.x, p.z, footprint('portal', p), true);
  }
  for (const l of scene.locals || []) {
    add('local', l.label || l.id || '可交互', l.x, l.z, footprint('local', l), true);
  }

  const pad = 6;   // 贴边不算撞，留一点余量
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i], b = items[j];
      if (a.decal || b.decal) continue;
      if (!a.solid && !b.solid) continue;
      const hit = a.x0 < b.x1 - pad && b.x0 < a.x1 - pad
               && a.z0 < b.z1 - pad && b.z0 < a.z1 - pad;
      if (!hit) continue;
      // 建筑互相挨着是正常的（连排店面），只报"小东西插进大东西"
      if (a.kind === 'block' && b.kind === 'block') continue;
      const ov = Math.round(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
      const od = Math.round(Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
      warn.push(`  ! 穿模：${a.kind}「${a.label}」(${Math.round(a.x)},${Math.round(a.z)})`
        + ` 与 ${b.kind}「${b.label}」(${Math.round(b.x)},${Math.round(b.z)})`
        + ` 重叠 ${ov}×${od} 格`);
    }
  }
  return warn;
}
