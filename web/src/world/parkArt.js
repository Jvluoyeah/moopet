import * as THREE from 'three';
import { instanceVertexColorModel } from './models.js';

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function shadeGround(ctx, x, z, radius, color, aspect = 1) {
  ctx.save();
  ctx.translate(x, z);
  ctx.scale(1, aspect);
  const shade = ctx.createRadialGradient(0, 0, radius * 0.17, 0, 0, radius);
  shade.addColorStop(0, color);
  shade.addColorStop(1, color.slice(0, 7) + '00');
  ctx.fillStyle = shade;
  ctx.fillRect(-radius, -radius, 2 * radius, 2 * radius);
  ctx.restore();
}

function paintTrails(g, trails) {
  const walks = trails.map(({ points, loop, w }) => ({
    w,
    samples: new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), loop)
      .getPoints(points.length * 15),
  }));
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const [offset, paint] of [[26, '#576c54'], [13, '#818367'], [0, '#baa47a']]) {
    g.strokeStyle = paint;
    for (const { w, samples } of walks) {
      g.lineWidth = w + offset;
      g.beginPath();
      g.moveTo(samples[0].x, samples[0].z);
      for (const { x, z } of samples.slice(1)) g.lineTo(x, z);
      g.stroke();
    }
  }

  const random = randomSource(531);
  for (const { w, samples } of walks) {
    for (const { x, z } of samples) {
      for (let i = 0; i < 7; i++) {
        g.fillStyle = random() > 0.47 ? '#e2cc9d68' : '#786c594a';
        const dx = (random() - 0.5) * w * 0.67;
        const dz = (random() - 0.5) * w * 0.67;
        g.fillRect(x + dx, z + dz, 2 + random() * 5, 2 + random() * 3);
      }
    }
  }
}

function paintStarLawn(g, { x, z, r }) {
  g.fillStyle = '#516b6a';
  g.beginPath();
  g.arc(x, z, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#acaa82';
  for (const [radius, width] of [[r - 3, 8], [r - 22, 3], [r - 52, 2]]) {
    g.lineWidth = width;
    g.beginPath();
    g.arc(x, z, radius, 0, Math.PI * 2);
    g.stroke();
  }
  const constellation = [[-0.67, -0.06], [-0.40, 0.15], [-0.16, 0.15], [0.16, -0.08],
    [0.55, -0.32], [0.64, 0.11], [0.24, 0.26], [0.16, -0.08]];
  const points = constellation.map(([a, b]) => [x + a * r, z + b * r]);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(...points[0]);
  for (const point of points.slice(1)) g.lineTo(...point);
  g.stroke();
  g.fillStyle = '#e2d2a0';
  for (const [a, b] of points) {
    g.beginPath();
    g.moveTo(a, b - 13);
    g.lineTo(a + 7, b);
    g.lineTo(a, b + 13);
    g.lineTo(a - 7, b);
    g.closePath();
    g.fill();
  }
}

export function parkGroundTexture(scene, width, depth, margin) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = Math.round(canvas.width * depth / width);
  const g = canvas.getContext('2d');
  g.setTransform(canvas.width / width, 0, 0, canvas.height / depth,
    canvas.width * margin / width, canvas.height * margin / depth);
  const { lake, grove, stars, near, trails } = scene.parkLayout;
  g.fillStyle = scene.ground.colors[0];
  g.fillRect(-margin, -margin, width, depth);
  shadeGround(g, 475, 670, 1200, '#496656c9', 1.11);
  shadeGround(g, 510, 2090, 900, '#607b5b9b', 0.91);
  shadeGround(g, lake.x, lake.z, lake.w * 0.82, '#658f82c6', 0.85);
  shadeGround(g, grove.x, grove.z, grove.r * 1.48, '#ad9c5bb7', 0.86);
  shadeGround(g, near.x, near.z, near.r * 1.70, '#a8ae71a6', 0.79);
  shadeGround(g, stars.x, stars.z, stars.r * 2.24, '#496a748a', 1.12);

  const random = randomSource(4732);
  for (let i = 0; i < 7300; i++) {
    const x = random() * width - margin;
    const z = random() * depth - margin;
    g.fillStyle = random() > 0.56 ? '#546a504d' : '#c5c68442';
    g.fillRect(x, z, 2 + random() * 8, 2 + random() * 5);
  }
  paintTrails(g, trails);
  paintStarLawn(g, stars);

  // 落叶限定在林心，林道仍清楚可辨。
  for (let i = 0; i < 320; i++) {
    const a = random() * Math.PI * 2, r = grove.r * Math.sqrt(random());
    g.fillStyle = i % 3 ? '#d1b57786' : '#c1845474';
    g.fillRect(grove.x + Math.cos(a) * r, grove.z + Math.sin(a) * r * 0.71, 4 + random() * 8, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function addParkModels(root, scene, colliders) {
  const { decor, deck } = scene.parkLayout;
  const url = scene.parkPropsKit;
  const woodDeck = instanceVertexColorModel(url, 'Boardwalk');
  if (woodDeck) {
    woodDeck.position.set(deck.x, 0, deck.z);
    woodDeck.scale.set(deck.w, deck.h, deck.d);
    root.add(woodDeck);
  }

  const batch = new THREE.Group();
  batch.name = 'ParkDecor';
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [name, placements] of Object.entries(decor)) {
    const model = instanceVertexColorModel(url, name);
    if (!model) continue;
    model.updateMatrixWorld(true);
    model.traverse((part) => {
      if (!part.isMesh) return;
      const instances = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
      instances.name = 'Park_' + name;
      placements.forEach(([x, z, w, h, d, yaw], i) => {
        position.set(x, 0, z);
        scale.set(w, h, d);
        rotation.setFromAxisAngle(up, yaw);
        matrix.compose(position, rotation, scale).multiply(part.matrixWorld);
        instances.setMatrixAt(i, matrix);
      });
      instances.computeBoundingSphere();
      batch.add(instances);
    });
    if (name === 'Pine' || name === 'Ginkgo') {
      for (const [x, z, w] of placements) {
        const radius = w * 0.105;
        colliders.push({ x: x - radius, z: z - radius, w: radius * 2, d: radius * 2 });
      }
    }
  }
  root.add(batch);
  if (!woodDeck) return undefined;

  return (x, z) => {
    const startZ = deck.z + deck.d / 2;
    if (Math.abs(x - deck.x) > deck.w / 2 || Math.abs(z - deck.z) > deck.d / 2) return 0;
    return deck.floorY * THREE.MathUtils.smoothstep(startZ - z, 0, 34);
  };
}

function fireflies({ lake, grove, stars }) {
  const random = randomSource(8251);
  const vertices = [], seeds = [];
  for (const [x, z, r, count] of [
    [lake.x, lake.z + lake.d * 0.24, lake.w * 0.58, 32],
    [grove.x, grove.z, grove.r * 0.9, 25],
    [stars.x, stars.z, stars.r * 1.39, 19],
  ]) {
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const span = r * Math.sqrt(random());
      vertices.push(x + Math.cos(a) * span, 30 + random() * 91, z + Math.sin(a) * span * 0.65);
      seeds.push(random() * Math.PI * 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 40;
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: [
      'uniform float time; attribute float phase; varying float vLight;',
      'void main() {',
      '  vec3 p = position + vec3(21.0 * sin(time * 0.43 + phase),',
      '    12.0 * sin(time * 0.72 + phase * 2.4), 17.0 * cos(time * 0.38 + phase));',
      '  vec4 v = modelViewMatrix * vec4(p, 1.0);',
      '  gl_Position = projectionMatrix * v;',
      '  gl_PointSize = clamp(2.0 + 9800.0 / max(400.0, -v.z), 3.0, 12.0);',
      '  vLight = 0.11 + 0.79 * pow(0.5 + 0.5 * sin(time * (0.78 + 0.12 * phase) + phase * 3.0), 2.4);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying float vLight;',
      'void main() {',
      '  float d = length(gl_PointCoord - 0.5);',
      '  float halo = 1.0 - smoothstep(0.04, 0.50, d);',
      '  gl_FragColor = vec4(0.95, 0.83, 0.40, vLight * halo * halo);',
      '}',
    ].join('\n'),
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'ParkFireflies';
  return points;
}

function pondRipples(lake) {
  const pos = [], uv = [], phase = [];
  const quads = [[-1, -1], [-1, 1], [1, 1], [-1, -1], [1, 1], [1, -1]];
  const spots = [[-0.21, -0.14, 57], [0.03, 0.04, 69], [0.20, 0.116, 50], [-0.12, 0.194, 43]];
  spots.forEach(([u, v, r], i) => {
    for (const [a, b] of quads) {
      pos.push(lake.x + u * lake.w + r * a, 10.8, lake.z + v * lake.d + r * b);
      uv.push(a, b);
      phase.push(i * 0.23);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('rippleUv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: [
      'attribute vec2 rippleUv; attribute float phase;',
      'varying vec2 vUv; varying float vPhase;',
      'void main() { vUv = rippleUv; vPhase = phase;',
      'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    ].join('\n'),
    fragmentShader: [
      'uniform float time; varying vec2 vUv; varying float vPhase;',
      'void main() {',
      '  float cycle = fract(time * 0.19 + vPhase);',
      '  float r = 0.16 + cycle * 0.76;',
      '  float ring = 1.0 - smoothstep(0.008, 0.031, abs(length(vUv) - r));',
      '  gl_FragColor = vec4(0.40, 0.81, 0.79, ring * sin(cycle * 3.14159) * 0.44);',
      '}',
    ].join('\n'),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'PondRipples';
  mesh.userData.surfaceEffect = true;
  return mesh;
}

export function addParkAmbience(root, layout, pondLoaded) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const flies = fireflies(layout);
  root.add(flies);
  const ripples = pondLoaded ? pondRipples(layout.lake) : null;
  if (ripples) root.add(ripples);
  return (time) => {
    if (reduced) return;
    flies.material.uniforms.time.value = time;
    if (ripples) ripples.material.uniforms.time.value = time;
  };
}
