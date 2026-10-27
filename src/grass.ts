import { BufferImageSource } from 'pixi.js';
import { hash, WIDTH, HEIGHT } from './bouquet';

const TAU = Math.PI * 2;

export class Meadow {
  private cellX = 0;
  private cellY = 0;
  private cols = 0;
  private rows = 0;
  private depth = new Float32Array(0);
  private baseX = new Float32Array(0);
  private baseY = new Float32Array(0);
  private height = new Float32Array(0);
  private lean0 = new Float32Array(0);
  private phase = new Float32Array(0);
  private tint = new Float32Array(0);
  private pixels = new Uint8Array(0);
  private brightness = new Float32Array(0);
  private source: BufferImageSource | null = null;
  private readonly retainedSources: BufferImageSource[] = [];

  configure(cellX: number, cellY: number) {
    const cols = Math.ceil(WIDTH / cellX);
    const rows = Math.ceil(HEIGHT / cellY);
    this.cellX = cellX;
    this.cellY = cellY;
    if (cols === this.cols && rows === this.rows) {
      return { source: this.source!, cols, rows };
    }

    this.cols = cols;
    this.rows = rows;
    const count = Math.round(cols * 1.05);
    this.depth = new Float32Array(count);
    this.baseX = new Float32Array(count);
    this.baseY = new Float32Array(count);
    this.height = new Float32Array(count);
    this.lean0 = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.tint = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const seed = i * 7;
      const depth = Math.pow(hash(seed), .75);
      this.depth[i] = depth;
      this.baseY[i] = 878 + depth * 136;
      this.baseX[i] = hash(seed + 1) * WIDTH;
      this.height[i] = (6 + 48 * depth * depth) * (.4 + Math.pow(hash(seed + 2), 1.6));
      this.lean0[i] = .15 + (hash(seed + 3) - .5) * .35;
      this.phase[i] = hash(seed + 4) * TAU;
      this.tint[i] = hash(seed + 5);
    }

    this.pixels = new Uint8Array(cols * rows * 4);
    this.brightness = new Float32Array(cols * rows);
    this.source = new BufferImageSource({
      resource: this.pixels,
      width: cols,
      height: rows,
      format: 'rgba8unorm',
      scaleMode: 'nearest',
      mipLevelCount: 1,
      autoGenerateMipmaps: false,
      alphaMode: 'no-premultiply-alpha',
    });
    this.retainedSources.push(this.source);
    return { source: this.source, cols, rows };
  }

  update(time: number, grassMotion: number) {
    const pixels = this.pixels;
    const brightness = this.brightness;
    const cellX = this.cellX;
    const cellY = this.cellY;
    const ratio = cellY / cellX;
    pixels.fill(0);
    brightness.fill(0);

    for (let i = 0; i < this.depth.length; i++) {
      const depth = this.depth[i];
      const baseX = this.baseX[i];
      const baseY = this.baseY[i];
      const front = baseY > 975;
      const gustBase = .5 + .5 * Math.sin(TAU * (baseX / 480 - time / 4.8));
      const gust = gustBase * gustBase * gustBase;
      const wind = grassMotion * (.18 + .55 * gust + .12 * Math.sin(TAU * (baseX / 136 - time / 2.4) + 1.3));
      let lean = this.lean0[i] + wind * (.6 + .6 * depth)
        + grassMotion * (.35 * Math.sin(TAU * 3 * time / 4.8 + this.phase[i])
          + .15 * Math.sin(TAU * 5 * time / 4.8 + 1.7 * this.phase[i])) * (.5 + depth) * .25;
      lean = Math.max(-1.1, Math.min(1.5, lean));
      const height = front ? Math.min(this.height[i], cellY * 10) : this.height[i];
      const steps = Math.max(1, Math.ceil(height / cellY));

      for (let step = 0; step <= steps; step++) {
        const u = step / steps;
        const x = baseX + lean * height * .55 * u * u;
        const y = baseY - height * u;
        const col = Math.floor(x / cellX);
        const row = Math.floor(y / cellY);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) continue;

        const slope = lean * u * 1.1 * ratio;
        let glyph: number;
        if (depth < .1) glyph = 1;
        else if (u > .9 && steps > 2) glyph = slope > .5 ? 3 : 2;
        else if (slope > .6) glyph = 4;
        else if (slope < -.6) glyph = 5;
        else glyph = 6;

        const sheenBase = .5 + .5 * Math.sin(TAU * (x / 480 - time / 4.8) - .3);
        const sheen = sheenBase * sheenBase * sheenBase;
        const light = (.12 + .32 * depth) * (.7 + .3 * u) * (.75 + .7 * sheen * u);
        const edgeFade = Math.min(1, x / 110, (WIDTH - x) / 110);
        const strength = light * edgeFade;
        const index = row * this.cols + col;
        if (strength <= brightness[index]) continue;

        const amount = u * u * (.25 + .35 * this.tint[i]) + .45 * sheen * u;
        const nearR = .20 + (.32 - .20) * depth;
        const nearG = .27 + (.50 - .27) * depth;
        const nearB = .26 + (.28 - .26) * depth;
        const r = nearR + (.82 - nearR) * amount;
        const g = nearG + (.72 - nearG) * amount;
        const b = nearB + (.40 - nearB) * amount;
        const offset = index * 4;
        brightness[index] = strength;
        pixels[offset] = Math.max(0, Math.min(255, Math.round(r * strength * 255)));
        pixels[offset + 1] = Math.max(0, Math.min(255, Math.round(g * strength * 255)));
        pixels[offset + 2] = Math.max(0, Math.min(255, Math.round(b * strength * 255)));
        pixels[offset + 3] = glyph + (front ? 8 : 0);
      }
    }

    this.source?.update();
  }
}
