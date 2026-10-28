// Reproducible import of CDmir's 2018 CC0 model. No image generation or AI tools.
// Download/extract https://opengameart.org/sites/default/files/skull-obj.zip into test-results/ first.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const input = 'test-results/skull-obj/', output = 'src/assets/skull/';
await mkdir(output, { recursive: true });
const obj = await readFile(input + 'skull-Low4K.obj', 'utf8');
const positions = [], normals = [], uvs = [], faces = [];
for (const row of obj.split(/\r?\n/)) {
  const [kind, ...values] = row.trim().split(/\s+/);
  if (kind === 'v') positions.push(values.map(Number));
  if (kind === 'vn') normals.push(values.map(Number));
  if (kind === 'vt') uvs.push(values.map(Number));
  if (kind === 'f') for (let i = 1; i < values.length - 1; i++) faces.push([values[0], values[i], values[i + 1]]);
}
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const point of positions) point.forEach((n, i) => { min[i] = Math.min(min[i], n); max[i] = Math.max(max[i], n); });
const center = min.map((n, i) => (n + max[i]) / 2), scale = 2.7 / (max[1] - min[1]);
const vertices = [], indices = [], lookup = new Map();
for (const face of faces) for (const key of face) {
  if (!lookup.has(key)) {
    lookup.set(key, vertices.length / 8);
    const [p, uv, n] = key.split('/').map(Number);
    vertices.push(...positions[p - 1].map((v, i) => (v - center[i]) * scale), ...normals[n - 1], ...uvs[uv - 1].slice(0, 2));
  }
  indices.push(lookup.get(key));
}
const header = new Uint32Array([vertices.length / 8, indices.length]);
const tangent = new Float32Array(header[0] * 3), bitangent = new Float32Array(header[0] * 3);
for (let i = 0; i < indices.length; i += 3) {
  const a = indices[i] * 8, b = indices[i + 1] * 8, c = indices[i + 2] * 8;
  const e1 = [0, 1, 2].map(n => vertices[b + n] - vertices[a + n]);
  const e2 = [0, 1, 2].map(n => vertices[c + n] - vertices[a + n]);
  const du1 = vertices[b + 6] - vertices[a + 6], dv1 = vertices[a + 7] - vertices[b + 7];
  const du2 = vertices[c + 6] - vertices[a + 6], dv2 = vertices[a + 7] - vertices[c + 7];
  const determinant = du1 * dv2 - du2 * dv1;
  if (Math.abs(determinant) < 1e-9) continue;
  for (const index of indices.slice(i, i + 3)) for (let n = 0; n < 3; n++) {
    tangent[index * 3 + n] += (dv2 * e1[n] - dv1 * e2[n]) / determinant;
    bitangent[index * 3 + n] += (-du2 * e1[n] + du1 * e2[n]) / determinant;
  }
}
const packed = [];
for (let i = 0; i < header[0]; i++) {
  const n = vertices.slice(i * 8 + 3, i * 8 + 6), t = Array.from(tangent.slice(i * 3, i * 3 + 3));
  const dot = n.reduce((sum, v, k) => sum + v * t[k], 0);
  const orthogonal = t.map((v, k) => v - n[k] * dot), length = Math.hypot(...orthogonal) || 1;
  const normalized = orthogonal.map(v => v / length);
  const cross = [n[1] * normalized[2] - n[2] * normalized[1], n[2] * normalized[0] - n[0] * normalized[2], n[0] * normalized[1] - n[1] * normalized[0]];
  const sign = cross.reduce((sum, v, k) => sum + v * bitangent[i * 3 + k], 0) < 0 ? -1 : 1;
  packed.push(...vertices.slice(i * 8, i * 8 + 8), ...normalized, sign);
}
const vertexData = new Float32Array(packed), indexData = new Uint32Array(indices);
await writeFile(output + 'mesh.bin', Buffer.concat([Buffer.from(header.buffer), Buffer.from(vertexData.buffer), Buffer.from(indexData.buffer)]));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const [source, target, size, format] of [
    ['Skull-Low.png', 'bone.jpg', 1536, 'image/jpeg'],
    ['Skull-Low-normal.png', 'normal.png', 1024, 'image/png'],
    ['Skull-AO.png', 'occlusion.jpg', 1024, 'image/jpeg'],
  ]) {
    const base64 = (await readFile(input + source)).toString('base64');
    const result = await page.evaluate(async ({ base64, size, format }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + base64; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
      return canvas.toDataURL(format, .91).split(',')[1];
    }, { base64, size, format });
    await writeFile(output + target, Buffer.from(result, 'base64'));
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ vertices: vertices.length / 8, triangles: faces.length, originalBounds: { min, max }, center, scale }));
