export const EXPANSION_KIT = 'models/landmark/world-expansion.glb';
export const FLOWER_KIT = 'models/landmark/park-landscape.glb';

export function kitProp(x, z, asset, w, d, h, options = {}) {
  return { kind: 'kitProp', x, z, asset, w, d, h, ...options };
}
