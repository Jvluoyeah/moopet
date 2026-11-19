import * as THREE from 'three';
import { signFont } from '../lib/fonts.js';

const STYLES = {
  plaza: { pigment: '#693c30', wood: '#94653f', trim: '#c39a58' },
  park: { pigment: '#354e40', wood: '#826443', trim: '#bba36b' },
  diary: { pigment: '#634237', wood: '#ac7750', trim: '#c99c65' },
  shelf: { pigment: '#46564e', wood: '#9f744d', trim: '#ceb17b' },
};

function roundedRect(ctx, x, y, w, h, radius, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

function paperSlip(ctx, x, y, w, h, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  roundedRect(ctx, -w / 2 + 4, 8, w, h, 7, '#211a174b');
  roundedRect(ctx, -w / 2, 0, w, h, 6, color);
  ctx.fillStyle = '#a68b653b';
  for (const [i, length] of [0.7, 0.74, 0.52].entries()) {
    ctx.fillRect(-w * 0.36, 29 + i * 14, w * length, 4);
  }
  ctx.fillStyle = '#aa7845';
  ctx.beginPath();
  ctx.arc(0, 8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function boardTexture(label, style, colors, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = Math.round(canvas.width * height / width);
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const outdoors = style === 'plaza' || style === 'park';
  const tone = ctx.createLinearGradient(0, 0, w * 0.2, h);
  tone.addColorStop(0, outdoors ? '#b48655' : '#efe0b6');
  tone.addColorStop(1, outdoors ? '#85593b' : '#cfad7a');
  roundedRect(ctx, 0, 0, w, h, 36, tone);
  roundedRect(ctx, 19, 19, w - 38, h - 38, 24, outdoors ? '#795033' : '#9e754c');
  roundedRect(ctx, 25, 25, w - 50, h - 50, 20, outdoors ? '#ab7e4f' : '#e8d5aa');

  const inset = outdoors ? 53 : 49;
  const headerY = outdoors ? 57 : 52;
  const headerH = outdoors ? h * 0.37 : h - 104;
  roundedRect(ctx, inset + 2, headerY + 7, w - (inset + 1) * 2, headerH, 20, '#39261a45');
  roundedRect(ctx, inset, headerY, w - inset * 2, headerH, 18, colors.pigment);
  ctx.strokeStyle = '#f5d59f7d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(inset + 12, headerY + 11, w - (inset + 12) * 2, headerH - 22, 12);
  ctx.stroke();

  for (const x of [inset + 29, w - inset - 29]) {
    ctx.fillStyle = '#e3b477';
    ctx.beginPath();
    ctx.arc(x, headerY + headerH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff1cf';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = signFont(Math.min(outdoors ? 105 : 117, headerH * 0.72));
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.strokeText(label, w / 2, headerY + headerH / 2 + 2, w - (inset + 53) * 2);
  ctx.fillText(label, w / 2, headerY + headerH / 2 + 2, w - (inset + 53) * 2);

  if (outdoors) {
    paperSlip(ctx, w * 0.32, h * 0.56, 236, h * 0.29, -0.065, '#e8cca1');
    paperSlip(ctx, w * 0.66, h * 0.58, 202, h * 0.26, 0.08, '#f1dbad');
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

function timber(group, material, size, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}

function support(group, material, a, b, thickness) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const axis = end.clone().sub(start);
  const length = axis.length();
  const piece = timber(group, material, [thickness, length, thickness], start.lerp(end, 0.5).toArray());
  piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.divideScalar(length));
}

function framedPanel(label, style, colors, w, h) {
  const root = new THREE.Group();
  const radius = 13;
  const l = -w / 2, r = w / 2, bottom = -h / 2, top = h / 2;
  const outline = new THREE.Shape();
  outline.moveTo(l + radius, bottom);
  outline.lineTo(r - radius, bottom);
  outline.quadraticCurveTo(r, bottom, r, bottom + radius);
  outline.lineTo(r, top - radius);
  outline.quadraticCurveTo(r, top, r - radius, top);
  outline.lineTo(l + radius, top);
  outline.quadraticCurveTo(l, top, l, top - radius);
  outline.lineTo(l, bottom + radius);
  outline.quadraticCurveTo(l, bottom, l + radius, bottom);

  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, {
    depth: 12, bevelEnabled: true, bevelSize: 3, bevelThickness: 2, bevelSegments: 1, curveSegments: 4,
  }), new THREE.MeshLambertMaterial({ color: colors.wood }));
  back.position.z = -10;
  root.add(back);
  const map = boardTexture(label, style, colors, w, h);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 6, h - 6),
    new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, toneMapped: false }));
  face.name = 'NoticeBoardFace';
  face.position.z = 5;
  face.userData.ownedTexture = map;
  root.add(face);
  return root;
}

export function makeNoticeBoard(local) {
  const root = new THREE.Group();
  root.name = `NoticeBoard:${local.id}`;
  root.position.set(local.x, 0, local.z);
  root.rotation.y = local.rot || 0;
  root.scale.setScalar(local.modelScale ?? 1);
  const style = local.boardStyle || 'plaza';
  const colors = STYLES[style] || STYLES.plaza;
  const wood = new THREE.MeshLambertMaterial({ color: colors.wood });
  const brass = new THREE.MeshLambertMaterial({ color: colors.trim });

  if (style === 'shelf') {
    const panel = framedPanel(local.label, style, colors, 158, 69);
    timber(root, wood, [147, 10, 44], [0, 5, 1]);
    timber(root, wood, [114, 32, 21], [0, 21, -5]);
    panel.position.set(0, 36, 4);
    panel.rotation.x = -0.55;
    root.add(panel);
    return root;
  }

  if (style === 'diary') {
    const panel = framedPanel(local.label, style, colors, 207, 113);
    timber(root, wood, [154, 18, 82], [0, 9, -3]);
    timber(root, wood, [72, 93, 63], [0, 57, -3]);
    timber(root, brass, [109, 12, 78], [0, 101, -5]);
    panel.position.set(0, 125, 6);
    panel.rotation.x = -0.51;
    root.add(panel);
    return root;
  }

  for (const side of [-1, 1]) {
    const x = side * 92;
    timber(root, brass, [27, 12, 31], [x, 6, 25]);
    support(root, wood, [x, 6, 25], [side * 88, 188, -18], 21);
    support(root, wood, [x, 7, -53], [side * 88, 161, -16], 15);
  }
  timber(root, wood, [183, 13, 20], [0, 68, 7]);
  const panel = framedPanel(local.label, style, colors, 268, 176);
  panel.position.set(0, 164, -2);
  panel.rotation.x = -0.35;
  root.add(panel);
  return root;
}
