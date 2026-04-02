import * as THREE from 'three';
import { writeFileSync } from 'fs';

const TIERS = [
  { name: 'cloud_blue',    color: [0, 248, 255], shapes: 'cumulus_flat' },
  { name: 'cloud_green',   color: [0, 255, 57],  shapes: 'cumulus_med' },
  { name: 'cloud_yellow',  color: [245, 255, 0], shapes: 'cumulus_tower' },
  { name: 'cloud_orange',  color: [255, 178, 0], shapes: 'cumulonimbus' },
  { name: 'cloud_red',     color: [255, 2, 0],   shapes: 'supercell' },
  { name: 'cloud_magenta', color: [255, 0, 245], shapes: 'supercell_massive' },
];

function lerpColor(base, target, t) {
  return [
    Math.round(base[0] + (target[0] - base[0]) * t),
    Math.round(base[1] + (target[1] - base[1]) * t),
    Math.round(base[2] + (target[2] - base[2]) * t),
  ];
}

function makeSphereGeo(r, seg) {
  const geo = new THREE.SphereGeometry(r, seg, seg);
  return geo;
}

function buildBlobs(tier) {
  const base = tier.color;
  const white = [255, 255, 255];
  const dark = [38, 38, 46];
  const blobs = [];

  function addBlob(r, sx, sy, sz, px, py, pz, mixTarget, mixAmt, opacity) {
    const col = lerpColor(base, mixTarget, mixAmt);
    blobs.push({ r, sx, sy, sz, px, py, pz, col, opacity });
  }

  switch (tier.shapes) {
    case 'cumulus_flat':
      addBlob(1, 1.0, 0.45, 0.9, 0, 0, 0, white, 0.15, 0.55);
      break;
    case 'cumulus_med':
      addBlob(1, 1.15, 0.5, 1.05, 0, 0, 0, dark, 0.2, 0.65);
      addBlob(0.7, 0.9, 0.55, 0.85, 0, 0.55, 0, white, 0.2, 0.55);
      break;
    case 'cumulus_tower':
      addBlob(1, 1.1, 0.5, 1.0, 0, 0, 0, dark, 0.25, 0.68);
      addBlob(0.8, 0.95, 0.6, 0.9, 0, 0.65, 0, white, 0.15, 0.6);
      addBlob(0.55, 0.8, 0.55, 0.75, 0, 1.15, 0, white, 0.25, 0.5);
      break;
    case 'cumulonimbus':
      addBlob(1, 1.2, 0.55, 1.1, 0, 0, 0, dark, 0.3, 0.72);
      addBlob(0.85, 1.05, 0.65, 0.95, 0, 0.7, 0, white, 0.15, 0.65);
      addBlob(0.65, 0.9, 0.6, 0.85, 0, 1.3, 0, white, 0.25, 0.55);
      addBlob(1.2, 1.5, 0.15, 1.3, 0, 1.6, 0, white, 0.3, 0.35);
      break;
    case 'supercell':
      addBlob(1, 1.3, 0.55, 1.2, 0, 0, 0, dark, 0.4, 0.78);
      addBlob(0.9, 1.1, 0.7, 1.0, 0, 0.8, 0, white, 0.15, 0.72);
      addBlob(0.75, 0.9, 0.8, 0.85, 0, 1.5, 0, white, 0.3, 0.65);
      addBlob(1.6, 1.8, 0.18, 1.5, 0, 2.0, 0, white, 0.35, 0.4);
      addBlob(0.4, 0.5, 0.8, 0.5, -0.6, -0.2, 0.5, dark, 0.5, 0.45);
      break;
    case 'supercell_massive':
      addBlob(1.1, 1.4, 0.6, 1.3, 0, 0, 0, dark, 0.45, 0.82);
      addBlob(1.0, 1.2, 0.75, 1.1, 0, 0.9, 0, white, 0.1, 0.75);
      addBlob(0.85, 1.0, 0.85, 0.95, 0, 1.7, 0, white, 0.25, 0.68);
      addBlob(0.6, 0.7, 0.7, 0.65, 0.3, 2.3, -0.2, white, 0.3, 0.55);
      addBlob(1.8, 2.0, 0.2, 1.7, 0, 2.2, 0, white, 0.35, 0.42);
      addBlob(0.5, 0.6, 1.0, 0.6, -0.7, -0.3, 0.6, dark, 0.55, 0.5);
      addBlob(0.3, 0.4, 0.6, 0.4, 0.5, -0.1, -0.4, dark, 0.4, 0.35);
      break;
  }
  return blobs;
}

function buildGLB(tier) {
  const blobs = buildBlobs(tier);
  const SEG = 8;
  const meshes = [];

  for (const b of blobs) {
    const geo = new THREE.SphereGeometry(b.r, SEG, SEG);
    geo.scale(b.sx, b.sy, b.sz);
    geo.translate(b.px, b.py, b.pz);
    const positions = geo.attributes.position.array;
    const normals = geo.attributes.normal.array;
    const indices = geo.index.array;
    meshes.push({
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices: new Uint16Array(indices),
      color: b.col,
      opacity: b.opacity
    });
  }

  const gltfJson = {
    asset: { version: "2.0", generator: "StormTracker-CloudGen" },
    scene: 0,
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: [],
    meshes: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
    materials: []
  };

  const binChunks = [];
  let byteOffset = 0;

  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    const matIdx = i;
    gltfJson.materials.push({
      pbrMetallicRoughness: {
        baseColorFactor: [m.color[0] / 255, m.color[1] / 255, m.color[2] / 255, m.opacity],
        metallicFactor: 0,
        roughnessFactor: 0.9
      },
      alphaMode: "BLEND",
      doubleSided: true
    });

    const posBytes = Buffer.from(m.positions.buffer);
    const normBytes = Buffer.from(m.normals.buffer);
    const idxBytes = Buffer.from(m.indices.buffer);

    let posMin = [Infinity, Infinity, Infinity];
    let posMax = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < m.positions.length; j += 3) {
      for (let k = 0; k < 3; k++) {
        posMin[k] = Math.min(posMin[k], m.positions[j + k]);
        posMax[k] = Math.max(posMax[k], m.positions[j + k]);
      }
    }

    const bvPos = gltfJson.bufferViews.length;
    gltfJson.bufferViews.push({ buffer: 0, byteOffset, byteLength: posBytes.length, target: 34962 });
    binChunks.push(posBytes);
    byteOffset += posBytes.length;
    while (byteOffset % 4) { binChunks.push(Buffer.from([0])); byteOffset++; }

    const bvNorm = gltfJson.bufferViews.length;
    gltfJson.bufferViews.push({ buffer: 0, byteOffset, byteLength: normBytes.length, target: 34962 });
    binChunks.push(normBytes);
    byteOffset += normBytes.length;
    while (byteOffset % 4) { binChunks.push(Buffer.from([0])); byteOffset++; }

    const bvIdx = gltfJson.bufferViews.length;
    gltfJson.bufferViews.push({ buffer: 0, byteOffset, byteLength: idxBytes.length, target: 34963 });
    binChunks.push(idxBytes);
    byteOffset += idxBytes.length;
    while (byteOffset % 4) { binChunks.push(Buffer.from([0])); byteOffset++; }

    const accPos = gltfJson.accessors.length;
    gltfJson.accessors.push({ bufferView: bvPos, componentType: 5126, count: m.positions.length / 3, type: "VEC3", min: posMin, max: posMax });
    const accNorm = gltfJson.accessors.length;
    gltfJson.accessors.push({ bufferView: bvNorm, componentType: 5126, count: m.normals.length / 3, type: "VEC3" });
    const accIdx = gltfJson.accessors.length;
    gltfJson.accessors.push({ bufferView: bvIdx, componentType: 5123, count: m.indices.length, type: "SCALAR" });

    gltfJson.nodes.push({ mesh: i });
    gltfJson.meshes.push({
      primitives: [{
        attributes: { POSITION: accPos, NORMAL: accNorm },
        indices: accIdx,
        material: matIdx
      }]
    });
  }

  const binData = Buffer.concat(binChunks);
  gltfJson.buffers.push({ byteLength: binData.length });

  const jsonStr = JSON.stringify(gltfJson);
  let jsonBuf = Buffer.from(jsonStr);
  while (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.from(' ')]);

  let binBuf = binData;
  while (binBuf.length % 4) binBuf = Buffer.concat([binBuf, Buffer.from([0])]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4);

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuf.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4);

  return Buffer.concat([header, jsonChunkHeader, jsonBuf, binChunkHeader, binBuf]);
}

for (const tier of TIERS) {
  const glb = buildGLB(tier);
  const path = `docs/models/${tier.name}.glb`;
  writeFileSync(path, glb);
  console.log(`${path}: ${glb.length} bytes`);
}
console.log('Done — 6 GLB cloud models generated.');
