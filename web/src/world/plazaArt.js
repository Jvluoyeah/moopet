import * as THREE from 'three';

const COBBLES = ['#728088', '#697983', '#75818a', '#647581', '#7a8488', '#6c7e85'];

function drawCompass(g, x, z) {
  g.save();
  g.translate(x, z);
  const slate = g.createRadialGradient(0, 0, 80, 0, 0, 402);
  slate.addColorStop(0, '#233e4fc7');
  slate.addColorStop(1, '#3658669e');
  g.fillStyle = slate;
  g.beginPath();
  g.arc(0, 0, 396, 0, Math.PI * 2);
  g.fill();

  for (const [radius, width, color] of [
    [188, 5, '#bcb097'], [209, 14, '#9c957f'],
    [340, 3, '#b0b192'], [368, 16, '#928c73'], [394, 5, '#c5b698'],
  ]) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.arc(0, 0, radius, 0, Math.PI * 2);
    g.stroke();
  }

  for (let i = 0; i < 24; i++) {
    g.save();
    g.rotate(i * Math.PI / 12);
    const cardinal = i % 6 === 0;
    const tip = cardinal ? 340 : 313;
    g.fillStyle = cardinal ? '#d8bd86' : '#bcb49b';
    g.beginPath();
    g.moveTo(0, -tip);
    g.lineTo(cardinal ? 19 : 8, -263);
    g.lineTo(0, cardinal ? -218 : -245);
    g.lineTo(cardinal ? -19 : -8, -263);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.restore();
}

function drawDistricts(g, { market, pavilion, garden }) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const [color, width] of [['#59666c', 189], ['#939384', 156]]) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(1900, 1371);
    g.lineTo(2490, 1371);
    g.quadraticCurveTo(2700, 1371, 2902, 1223);
    g.lineTo(3290, 1060);
    g.moveTo(3310, 1460);
    g.quadraticCurveTo(3304, 1740, pavilion.x, pavilion.z);
    g.moveTo(1920, 2232);
    g.quadraticCurveTo(2220, 2240, garden.x, garden.z);
    g.quadraticCurveTo(3060, 2400, pavilion.x, pavilion.z);
    g.stroke();
  }

  g.save();
  g.beginPath();
  g.roundRect(market.x, market.z, market.w, market.d, 100);
  g.fillStyle = '#966f59';
  g.fill();
  g.clip();
  for (let i = 0; i * 46 < market.d; i++) {
    for (let j = 0; j * 98 < market.w + 90; j++) {
      g.fillStyle = ['#b18b70', '#b58e75', '#a5806c', '#b4917b'][(i * 5 + j * 3) % 4];
      g.fillRect(market.x + j * 98 - (i % 2) * 49, market.z + i * 46, 95, 43);
    }
  }
  g.restore();
  g.strokeStyle = '#beab89';
  g.lineWidth = 12;
  g.stroke();

  for (const [place, color] of [[garden, '#79816c'], [pavilion, '#657d82']]) {
    const { x, z, r } = place;
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, z, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b4aa8a';
    for (const [radius, weight] of [[r - 6, 12], [r - 46, 3]]) {
      g.lineWidth = weight;
      g.beginPath();
      g.arc(x, z, radius, 0, Math.PI * 2);
      g.stroke();
    }
  }
}

export function makePlazaPaving(scene) {
  const { w, d } = scene.size;
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = Math.round(canvas.width * d / w);
  const g = canvas.getContext('2d');
  g.scale(canvas.width / w, canvas.height / d);
  const edge = 44;
  g.fillStyle = '#414d58';
  g.fillRect(edge, edge, w - edge * 2, d - edge * 2);
  g.save();
  g.beginPath();
  g.rect(edge + 6, edge + 6, w - (edge + 6) * 2, d - (edge + 6) * 2);
  g.clip();
  for (let row = 0, z = edge; z < d - edge; row++, z += 74) {
    for (let col = 0, x = edge - (row % 2) * 66; x < w - edge; col++, x += 132) {
      const variation = (Math.imul(col + 1, 73856093) ^ Math.imul(row + 1, 19349663)) >>> 0;
      g.fillStyle = COBBLES[variation % COBBLES.length];
      g.beginPath();
      g.roundRect(x + 2, z + 2, 128, 70, 5);
      g.fill();
      g.fillStyle = '#bdc3bd60';
      g.fillRect(x + 8, z + 5, 113, 3);
    }
  }
  g.restore();
  for (const [gap, width, color] of [[0, 7, '#9caab0'], [19, 4, '#899fa7']]) {
    const inset = edge + gap;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.strokeRect(inset, inset, w - inset * 2, d - inset * 2);
  }
  if (scene.districts) drawDistricts(g, scene.districts);
  const tower = scene.props.find(({ kind }) => kind === 'moontower');
  if (tower) drawCompass(g, tower.x, tower.z);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({
    map, transparent: true, depthWrite: false,
  }));
  panel.name = 'MoonCompassPaving';
  panel.rotation.x = -Math.PI / 2;
  panel.position.set(w / 2, 0.35, d / 2);
  panel.renderOrder = -10;
  panel.userData.ownedTexture = map;
  return panel;
}
