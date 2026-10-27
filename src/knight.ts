import knightUrl from './knight-art.svg?url';
import { hash, WIDTH, HEIGHT, type Bouquet } from './bouquet';
import { createGarden } from './garden';
import type { Quality, Settings } from './config';

const canvas = () => { const c = document.createElement('canvas'); c.width = WIDTH; c.height = HEIGHT; return c; };
interface Grass { x: number; y: number; h: number; lean: number; phase: number; front: boolean; shade: number }

/** Source illustration is cached; only cloth and sparse grass are drawn each frame. */
export class Knight {
  readonly canvas = canvas();
  private ctx = this.canvas.getContext('2d')!;
  private armour = canvas();
  private rearBed = canvas();
  private frontBed = canvas();
  private grass: Grass[] = Array.from({ length: 330 }, (_, i) => ({
    x: 97 + hash(i + 120) * 612, y: 875 + hash(i + 300) * 65,
    h: 15 + Math.pow(hash(i + 700), 2) * 113,
    lean: (hash(i + 80) - .3) * 42, phase: hash(i + 11) * Math.PI * 2,
    front: i % 3 === 0, shade: 20 + hash(i + 444) * 37,
  }));
  private ribbon = new Float32Array(73 * 5 * 3);
  private quality: Quality = 'fine';
  private glyphSize = 1;
  private gardenReady = false;

  async init() {
    const image = new Image(); image.src = knightUrl;
    await image.decode();
    const ctx = this.armour.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    // Seeded wear is generated once and clipped to opaque armour, never the backdrop.
    ctx.save(); ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 14500; i++) {
      const x = 170 + hash(i + 177) * 410, y = 140 + hash(i + 551) * 741;
      ctx.fillStyle = i % 3 ? 'rgba(8,12,8,.21)' : 'rgba(235,230,205,.13)';
      ctx.fillRect(x, y, .6 + hash(i + 33) * 1.7, .65);
    }
    ctx.restore();
  }

  configureGarden(quality: Quality, glyphSize: number) {
    if (this.gardenReady && quality === this.quality && glyphSize === this.glyphSize) return;
    this.quality = quality; this.glyphSize = glyphSize;
    const bed = createGarden(quality, glyphSize);
    this.bedToCanvas(bed.rear, this.rearBed); this.bedToCanvas(bed.front, this.frontBed);
    this.gardenReady = true;
  }

  private bedToCanvas(bed: Bouquet, destination: HTMLCanvasElement) {
    const small = document.createElement('canvas'); small.width = bed.cols; small.height = bed.rows;
    const ctx = small.getContext('2d')!;
    const image = ctx.createImageData(bed.cols, bed.rows);
    for (let i = 0; i < bed.colors.length; i++) {
      if (bed.depth[i] === -Infinity) continue;
      const color = bed.colors[i], p = i * 4;
      image.data[p] = color >> 16; image.data[p + 1] = color >> 8 & 255;
      image.data[p + 2] = color & 255; image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const dest = destination.getContext('2d')!; dest.clearRect(0, 0, WIDTH, HEIGHT);
    dest.imageSmoothingEnabled = false;
    dest.drawImage(small, 0, 0, bed.cols * bed.cellX, bed.rows * bed.cellY);
  }

  private drawGrass(time: number, front: boolean, movement: number) {
    const ctx = this.ctx;
    ctx.lineWidth = 1.15;
    for (let i = 0; i < this.grass.length; i++) {
      const blade = this.grass[i];
      if (blade.front !== front) continue;
      const sway = movement * (Math.sin(time * .64 + blade.phase) * 4 + Math.sin(time * 1.13 + blade.x * .012) * 1.8);
      const b = blade.shade;
      ctx.strokeStyle = `rgb(${b * .82},${b},${b * .69})`;
      ctx.beginPath(); ctx.moveTo(blade.x, blade.y);
      ctx.quadraticCurveTo(blade.x + blade.lean * .25, blade.y - blade.h * .65,
        blade.x + blade.lean + sway * blade.h / 95, blade.y - blade.h);
      ctx.stroke();
    }
  }

  private scarf(time: number, secondary: boolean, amplitude: number) {
    const rows = 72, columns = 4, ctx = this.ctx;
    const length = secondary ? 238 : 302;
    const phase = secondary ? 1.9 : 0;
    for (let row = 0; row <= rows; row++) {
      const u = row / rows, env = Math.pow(u, 1.45);
      const wave = Math.sin(u * 8.6 - time * 2.25 + phase) * 17 + Math.sin(u * 17.4 - time * 3.65 + phase) * 5;
      const gust = Math.sin(time * .73 + u * 4 + phase) * 6;
      const centerX = 452 + length * u;
      const centerY = (secondary ? 323 : 311) + (secondary ? 62 : -54) * u + amplitude * env * (wave + gust);
      const twist = .7 + .3 * Math.cos(u * 10.8 - time * 2.1 + phase);
      const width = (secondary ? 16 : 23) * (1 - .68 * u) * twist + 1.8;
      for (let col = 0; col <= columns; col++) {
        const q = col / columns * 2 - 1, p = (row * 5 + col) * 3;
        this.ribbon[p] = centerX + q * Math.sin(u * 6 - time * 1.7) * 3.5 * env;
        this.ribbon[p + 1] = centerY + q * width;
        this.ribbon[p + 2] = .46 + .3 * Math.cos(q * 2.6 + u * 14 - time * 2.2 + phase) + .16 * Math.sin(u * 24 - time * 3.1 + phase);
      }
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const a = (row * 5 + col) * 3, b = a + 15, c = b + 3, d = a + 3;
      const shade = Math.max(.15, this.ribbon[a + 2]);
      ctx.fillStyle = `rgb(${Math.round(105 + shade * 150)},${Math.round(4 + shade * 20)},${Math.round(20 + shade * 34)})`;
      ctx.beginPath(); ctx.moveTo(this.ribbon[a], this.ribbon[a + 1]);
      ctx.lineTo(this.ribbon[b], this.ribbon[b + 1]); ctx.lineTo(this.ribbon[c], this.ribbon[c + 1]);
      ctx.lineTo(this.ribbon[d], this.ribbon[d + 1]); ctx.closePath(); ctx.fill();
    }
    // Irregular split edge rather than a perfectly rectangular ribbon end.
    const p = rows * 15;
    ctx.fillStyle = '#000'; ctx.beginPath();
    ctx.moveTo(this.ribbon[p] - 8, this.ribbon[p + 7]);
    ctx.lineTo(this.ribbon[p + 6] + 4, this.ribbon[p + 7] - 3);
    ctx.lineTo(this.ribbon[p + 12] + 2, this.ribbon[p + 13] + 2); ctx.fill();
  }

  render(time: number, garden: boolean, settings: Settings) {
    const ctx = this.ctx;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.drawGrass(time, false, settings.grassMotion);
    if (garden) ctx.drawImage(this.rearBed, 0, 0);
    this.scarf(time * settings.scarfSpeed, false, settings.scarfAmplitude);
    ctx.drawImage(this.armour, 0, 0);
    // The lower free strip is in front of the rear shoulder, with a fixed neck anchor.
    this.scarf(time * settings.scarfSpeed, true, settings.scarfAmplitude);
    // Restore the neck/helmet boundary from the cached illustration to protect overlap.
    ctx.drawImage(this.armour, 330, 140, 150, 205, 330, 140, 150, 205);
    this.drawGrass(time, true, settings.grassMotion);
    if (garden) ctx.drawImage(this.frontBed, 0, 0);
  }
}
