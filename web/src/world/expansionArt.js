import * as THREE from 'three';
import { instanceVertexColorModel } from './models.js';

export function makeExpansionProp(prop, url) {
  const model = instanceVertexColorModel(url, prop.asset);
  if (!model) return null;
  const yaw = prop.rot || 0;
  model.position.set(prop.x, 0, prop.z);
  model.rotation.y = yaw;
  model.scale.set(prop.w, prop.h, prop.d);
  if (prop.solid) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const zones = prop.solid === true ? [[0, 0, 1, 1]] : prop.solid;
    model.userData.colliders = zones.map(([x, z, w, d]) => {
      const width = Math.abs(c) * w * prop.w + Math.abs(s) * d * prop.d;
      const depth = Math.abs(s) * w * prop.w + Math.abs(c) * d * prop.d;
      return { x: prop.x + c * x * prop.w + s * z * prop.d - width / 2,
        z: prop.z - s * x * prop.w + c * z * prop.d - depth / 2, w: width, d: depth };
    });
  }
  return model;
}

function rounded(ctx, { x, z, w, d }, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, z, w, d, radius);
  ctx.fill();
}

function drawPlanks(ctx, { x, z, w, d }, colors) {
  ctx.fillStyle = '#5c483b';
  ctx.fillRect(x, z, w, d);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 6, z + 6, w - 12, d - 12);
  ctx.clip();
  for (let i = 0, row = z; row < z + d; i++, row += 38) {
    for (let j = 0, col = x - (i % 3) * 77; col < x + w; j++, col += 230) {
      ctx.fillStyle = colors[(i * 7 + j * 11) % colors.length];
      ctx.fillRect(col + 1, row + 1, 228, 36);
      ctx.fillStyle = '#f5d39740';
      ctx.fillRect(col + 1, row + 7, 225, 1.5);
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#b3a07f';
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 16, z + 16, w - 32, d - 32);
}

function paw(ctx, x, z, angle) {
  ctx.save();
  ctx.translate(x, z);
  ctx.rotate(angle);
  ctx.fillStyle = '#807253';
  ctx.beginPath();
  ctx.ellipse(0, 3, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [tx, tz] of [[-9, -5], [-3, -9], [4, -9], [10, -5]]) {
    ctx.beginPath();
    ctx.ellipse(tx, tz, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function kennelGroundTexture(scene, width, depth, margin) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = Math.round(canvas.width * depth / width);
  const g = canvas.getContext('2d');
  g.setTransform(canvas.width / width, 0, 0, canvas.height / depth,
    canvas.width * margin / width, canvas.height * margin / depth);
  const { house, archive, yard } = scene.kennelLayout;
  g.fillStyle = '#647060';
  g.fillRect(-margin, -margin, width, depth);
  rounded(g, yard, 150, '#798568');
  rounded(g, { x: yard.x + 60, z: yard.z + 56, w: yard.w - 120, d: yard.d - 118 }, 122, '#8b926f');
  for (let i = 0; i < 950; i++) {
    const x = yard.x + ((i * 5171) % 32749) / 32749 * yard.w;
    const z = yard.z + ((i * 3571) % 32719) / 32719 * yard.d;
    g.fillStyle = i % 2 ? '#d1cb923e' : '#4f6e5438';
    g.fillRect(x, z, 2.5 + i % 8, 2);
  }
  g.strokeStyle = '#ac9a74';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 143;
  g.beginPath();
  g.moveTo(950, 1818);
  g.lineTo(950, 1430);
  g.moveTo(1698, 1182);
  g.bezierCurveTo(1970, 1182, 2080, 1350, 2285, 1310);
  g.bezierCurveTo(2285, 1210, 2285, 775, 2285, 691);
  g.stroke();
  drawPlanks(g, house, ['#b2916b', '#bc9a74', '#b89a74', '#ad8963', '#c0a079']);
  drawPlanks(g, archive, ['#8a7662', '#957d66', '#9d8268', '#897665']);
  for (let i = 0; i < 16; i++) paw(g, 2285 + (i % 2 ? 19 : -19), 690 + i * 41, i % 2 ? 0.19 : -0.2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
