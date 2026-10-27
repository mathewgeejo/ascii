// Fixed camera, world units. Positive z faces the viewer; positive y is up.
export const WIDTH = 800;
export const HEIGHT = 1000;
export const DURATION = 4.2;
type Vec = { x: number; y: number; z: number };
type Color = readonly [number, number, number];
type Vertex = Vec & { r: number; g: number; b: number };
export interface Flower { x: number; y: number; z: number; size: number; color: Color; tilt: number; yaw: number; rotation: number; delay: number; baseX?: number; baseY?: number }
const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { n = clamp(n); return n * n * (3 - 2 * n); };
export const hash = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

// Rear flowers first only for readability: visibility is resolved per grid cell.
const flowers: Flower[] = [
  { x: -55, y: 790, z: -80, size: 76, color: [255, 201, 153], tilt: .66, yaw: -.34, rotation: .1, delay: 1.12 },
  { x: 82, y: 757, z: -72, size: 83, color: [255, 231, 178], tilt: .57, yaw: .48, rotation: .55, delay: 1.3 },
  { x: -165, y: 654, z: -48, size: 104, color: [255, 191, 24], tilt: .4, yaw: -.52, rotation: .3, delay: 1.45 },
  { x: 153, y: 688, z: -45, size: 99, color: [255, 210, 28], tilt: .55, yaw: .52, rotation: .74, delay: 1.22 },
  { x: 190, y: 559, z: -12, size: 95, color: [137, 19, 52], tilt: .24, yaw: .72, rotation: .6, delay: 1.62 },
  { x: -130, y: 494, z: -9, size: 90, color: [220, 77, 97], tilt: .08, yaw: -.4, rotation: .15, delay: 1.84 },
  { x: 116, y: 454, z: 5, size: 88, color: [164, 22, 39], tilt: .2, yaw: .67, rotation: .2, delay: 1.76 },
  { x: -13, y: 709, z: 65, size: 120, color: [246, 30, 67], tilt: .35, yaw: -.1, rotation: .52, delay: 1.58 },
  { x: -122, y: 567, z: 105, size: 126, color: [244, 62, 160], tilt: .22, yaw: -.32, rotation: .23, delay: 1.82 },
  { x: 91, y: 551, z: 148, size: 139, color: [255, 247, 218], tilt: .22, yaw: .16, rotation: .53, delay: 2.02 },
  { x: -20, y: 420, z: 171, size: 109, color: [255, 205, 154], tilt: -.12, yaw: -.2, rotation: .75, delay: 2.16 },
  { x: -212, y: 739, z: -90, size: 59, color: [255, 232, 190], tilt: .65, yaw: -.66, rotation: .6, delay: 1.36 },
];

/** A CPU z-buffer at glyph resolution; no DOM characters and no raster image artwork. */
export class Bouquet {
  readonly cols: number;
  readonly rows: number;
  readonly depth: Float32Array;
  readonly colors: Uint32Array;
  readonly light: Float32Array;
  readonly noise: Float32Array;
  readonly cellX: number;
  readonly cellY: number;
  private vertices: Vertex[] = Array.from({ length: 33 * 13 }, () => ({ x: 0, y: 0, z: 0, r: 0, g: 0, b: 0 }));
  constructor(quality: 'fine' | 'light' = 'fine', private arrangement: Flower[] = flowers, glyphSize = 1) {
    this.cellX = (quality === 'fine' ? 2.5 : 3.5) * glyphSize;
    this.cellY = (quality === 'fine' ? 4 : 5.6) * glyphSize;
    this.cols = Math.ceil(WIDTH / this.cellX);
    this.rows = Math.ceil(HEIGHT / this.cellY);
    const length = this.cols * this.rows;
    this.depth = new Float32Array(length);
    this.colors = new Uint32Array(length);
    this.light = new Float32Array(length);
    this.noise = Float32Array.from({ length }, (_, i) => hash(i + 61));
  }

  private point(x: number, y: number, z: number, r: number, g: number, b: number) {
    const gx = Math.floor((400 + x) / this.cellX), gy = Math.floor((935 - y) / this.cellY);
    if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) return;
    this.write(gy * this.cols + gx, z, r, g, b);
  }

  private write(i: number, z: number, r: number, g: number, b: number) {
    if (z < this.depth[i]) return;
    this.depth[i] = z;
    const variation = .86 + this.noise[i] * .24;
    // Compensate for the black gaps between glyph strokes without losing folds.
    r = Math.min(255, Math.max(0, r * variation * 1.48));
    g = Math.min(255, Math.max(0, g * variation * 1.48));
    b = Math.min(255, Math.max(0, b * variation * 1.48));
    this.colors[i] = (r << 16) | (g << 8) | b;
    this.light[i] = Math.max(r, g, b) / 255;
  }

  private triangle(a: Vertex, b: Vertex, c: Vertex) {
    const ax = (400 + a.x) / this.cellX, ay = (935 - a.y) / this.cellY;
    const bx = (400 + b.x) / this.cellX, by = (935 - b.y) / this.cellY;
    const cx = (400 + c.x) / this.cellX, cy = (935 - c.y) / this.cellY;
    const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(denom) < .0001) return;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(this.cols - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(this.rows - 1, Math.ceil(Math.max(ay, by, cy)));
    // Two-sided petal lighting from its actual 3D surface normal.
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const norm = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    const lighting = .48 + .52 * Math.abs((nx * -.3 + ny * .5 + nz * .81) / norm);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const wa = ((by - cy) * (x + .5 - cx) + (cx - bx) * (y + .5 - cy)) / denom;
        const wb = ((cy - ay) * (x + .5 - cx) + (ax - cx) * (y + .5 - cy)) / denom;
        const wc = 1 - wa - wb;
        if (wa < -.0001 || wb < -.0001 || wc < -.0001) continue;
        this.write(y * this.cols + x, wa * a.z + wb * b.z + wc * c.z,
          (wa * a.r + wb * b.r + wc * c.r) * lighting,
          (wa * a.g + wb * b.g + wc * c.g) * lighting,
          (wa * a.b + wb * b.b + wc * c.b) * lighting);
      }
    }
  }

  private line(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: Color, width = 1) {
    const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 1.3) + 1;
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      for (let w = -width; w <= width; w += 1) {
        this.point(ax + (bx - ax) * t + w, ay + (by - ay) * t, az + (bz - az) * t,
          color[0], color[1], color[2]);
      }
    }
  }

  private stemPosition(f: Flower, t: number, out: Vec) {
    out.x = (f.baseX ?? f.x * .035) * (1 - Math.pow(t, 1.38)) + f.x * Math.pow(t, 1.38) + Math.sin(t * Math.PI) * (f.x > 0 ? -19 : 19);
    out.y = (f.baseY ?? 60) + (f.y - (f.baseY ?? 60)) * t;
    out.z = -90 + (f.z + 90) * t;
  }

  render(time: number) {
    this.depth.fill(-Infinity);
    this.colors.fill(0);
    this.light.fill(0);
    const a = this.vertices[0], b = this.vertices[1];
    this.arrangement.forEach((f, index) => {
      const growth = smooth((time - index * .015) / .65);
      const end = Math.floor(growth * 100);
      this.stemPosition(f, 0, a);
      for (let i = 1; i <= end; i++) {
        this.stemPosition(f, i / 100, b);
        this.line(a.x, a.y, a.z, b.x, b.y, b.z, [47, 109 + index % 3 * 12, 34], 1.2);
        a.x = b.x; a.y = b.y; a.z = b.z;
      }
    });
    // Alternate lanceolate leaves along each stem, with folded midribs.
    this.arrangement.forEach((f, index) => {
      for (let j = 0; j < (f.baseX === undefined ? 5 : 3); j++) {
        const t = .18 + j * .124 + hash(index * 7 + j) * .055;
        const growth = smooth((time - .48 - j * .095 - index * .016) / .64);
        if (!growth) continue;
        this.stemPosition(f, t, a);
        const x = a.x, y = a.y, z = a.z;
        const sign = (index + j) % 2 ? 1 : -1;
        const length = (88 + hash(index * 12 + j) * 97) * growth * (f.baseX === undefined ? 1 : .5);
        const angle = sign * (.38 + hash(index * 9 + j) * .66) * (.3 + .7 * growth);
        const rows = 24, columns = 6;
        for (let u = 0; u <= rows; u++) {
          const s = u / rows;
          const half = (7 + hash(index + j * 8) * 9) * Math.pow(Math.sin(Math.PI * s), .9) * growth;
          for (let v = 0; v <= columns; v++) {
            const q = v / columns * 2 - 1;
            const vert = this.vertices[u * (columns + 1) + v];
            vert.x = x + Math.sin(angle) * length * s + Math.cos(angle) * half * q;
            vert.y = y + Math.cos(angle) * length * s - 30 * s * s * growth - Math.sin(angle) * half * q;
            vert.z = z + Math.sin(s * Math.PI) * 23 - Math.abs(q) * half * .7 + j * 2;
            const shade = (q < 0 ? .61 : 1) * (.7 + .3 * Math.sin(s * Math.PI));
            const vein = Math.abs(q) < .08 ? 1.45 : 1;
            vert.r = 35 * shade * vein; vert.g = (110 + index % 4 * 13) * shade * vein; vert.b = 30 * shade * vein;
          }
        }
        this.mesh(rows, columns);
      }
    });
    this.arrangement.forEach((f, i) => this.flower(f, i, time));
  }

  private mesh(rows: number, columns: number) {
    const stride = columns + 1;
    for (let u = 0; u < rows; u++) for (let v = 0; v < columns; v++) {
      const i = u * stride + v;
      this.triangle(this.vertices[i], this.vertices[i + stride], this.vertices[i + 1]);
      this.triangle(this.vertices[i + 1], this.vertices[i + stride], this.vertices[i + stride + 1]);
    }
  }

  private flower(f: Flower, index: number, time: number) {
    const bud = smooth((time - f.delay + .27) / .42);
    if (!bud) return;
    const opening = smooth((time - f.delay) / (DURATION - f.delay - .08));
    const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw), ct = Math.cos(f.tilt), st = Math.sin(f.tilt);
    // Local (u,v,w) basis: w is the trumpet axis.
    const transform = (out: Vertex, u: number, v: number, w: number) => {
      out.x = f.x + cy * u + sy * ct * w - sy * st * v;
      out.y = f.y + ct * v + st * w;
      out.z = f.z - sy * u + cy * ct * w - cy * st * v;
    };
    const rows = 32, columns = 12;
    for (let petal = 0; petal < 6; petal++) {
      const seed = index * 31 + petal * 7;
      const theta = petal / 6 * TAU + f.rotation + (hash(seed) - .5) * .12;
      const length = f.size * (.89 + hash(seed + 4) * .23) * (.48 + bud * .52);
      const breadth = length * (petal % 2 ? .27 : .34);
      const spread = .09 + opening * (1.15 + hash(seed + 2) * .22);
      for (let u = 0; u <= rows; u++) {
        const t = u / rows;
        const radial = length * (Math.sin(spread) * t + opening * .13 * Math.sin(Math.PI * t));
        const forward = length * (Math.cos(spread) * t + opening * .36 * Math.sin(Math.PI * t) - opening * .46 * Math.pow(t, 4));
        const width = breadth * Math.pow(Math.sin(Math.PI * t), 1.12) * (1.05 - .35 * t) * (.16 + opening * .84);
        const angle = theta + opening * (hash(seed + 3) - .5) * .42 * t;
        for (let v = 0; v <= columns; v++) {
          const q = v / columns * 2 - 1;
          const vert = this.vertices[u * (columns + 1) + v];
          const fold = width * (.63 * q * q - .19 * (1 - Math.abs(q))) + q * width * t * (hash(seed + 1) - .5) * .95 * opening;
          transform(vert, Math.cos(angle) * radial - Math.sin(angle) * width * q,
            Math.sin(angle) * radial + Math.cos(angle) * width * q,
            forward + fold);
          const throat = .27 + .73 * smooth(t / .53);
          const vein = 1 - .13 * Math.pow(Math.cos(q * Math.PI * 3 + t * 1.5), 12);
          const ridge = .79 + .21 * Math.pow(Math.abs(q), .5);
          const central = 1 - .15 * Math.exp(-q * q * 150);
          const spots = t > .12 && t < .52 && hash(seed * 113 + u * 17 + v * 97) > .89 ? .42 : 1;
          const shade = throat * vein * ridge * central * spots;
          const greenBud = (1 - opening) * (1 - opening) * .64;
          vert.r = (f.color[0] * (1 - greenBud) + 72 * greenBud) * shade;
          vert.g = (f.color[1] * (1 - greenBud) + 120 * greenBud) * shade + 20 * (1 - smooth(t / .4));
          vert.b = (f.color[2] * (1 - greenBud) + 38 * greenBud) * shade;
        }
      }
      this.mesh(rows, columns);
    }
    if (opening < .28) return;
    // Six fine filaments with oblong pollen anthers, projected in the same z-buffer.
    for (let s = 0; s < 6; s++) {
      const angle = s / 6 * TAU + .4;
      const length = f.size * (.38 + hash(index * 8 + s) * .12) * opening;
      const a = this.vertices[0], b = this.vertices[1];
      transform(a, 0, 0, 7);
      for (let k = 1; k <= 16; k++) {
        const t = k / 16;
        transform(b, Math.cos(angle) * length * .5 * t * t, Math.sin(angle) * length * .52 * t * t + t * length * .16, length * t + 7);
        this.line(a.x, a.y, a.z, b.x, b.y, b.z, [177, 164, 90], .5);
        a.x = b.x; a.y = b.y; a.z = b.z;
      }
      this.line(b.x - 3, b.y - 1.8, b.z + 1, b.x + 3, b.y + 1.8, b.z + 1, [222, 133, 34], 1.1);
    }
  }
}
