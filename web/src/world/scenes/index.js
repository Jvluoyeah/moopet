/* 场景注册表：按 code 取场景定义；对外只暴露一个小接口。 */

import PLAZA from './plaza.js';
import OTHERS from './others.js';

export const SCENE_LIST = [
  { code: 'plaza', name: '长夜月广场', desc: '大家默认落脚的地方，最热闹' },
  { code: 'park', name: '长夜月公园', desc: '遛弯专用，草地开阔' },
  { code: 'kennel', name: '我的狗窝', desc: '自己的地盘，可以摆装扮、翻日记' },
  { code: 'arena', name: '月光竞技场', desc: '对战入口，也通向训练关卡' },
];

const REGISTRY = { plaza: PLAZA, ...OTHERS };

/** 取场景定义（不存在就回广场，避免白屏） */
export function sceneOf(code) {
  return REGISTRY[code] || PLAZA;
}

/** 该场景的碰撞盒（建筑 + 会挡路的道具） */
export function collidersOf(scene) {
  const out = [];
  for (const b of scene.blocks || []) {
    out.push({ x: b.x - b.w / 2, z: b.z - b.d / 2, w: b.w, d: b.d });
  }
  for (const p of scene.props || []) {
    if (p.kind === 'planter' || p.kind === 'bed' || p.kind === 'shelf') {
      const w = p.w || 160, d = p.d || 90;
      out.push({ x: p.x - w / 2, z: p.z - d / 2, w, d });
    }
  }
  return out;
}

export default REGISTRY;
