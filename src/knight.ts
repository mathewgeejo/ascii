import { bakeKnight } from './knight-sdf';
import { WIDTH, HEIGHT, type Bouquet } from './bouquet';
import { createGarden } from './garden';
import type { Quality, Settings } from './config';

const canvas = () => { const c = document.createElement('canvas'); c.width = WIDTH; c.height = HEIGHT; return c; };
/** Source illustration is cached; only cloth is drawn each frame. */
export class Knight {
  readonly canvas = canvas();
  private ctx = this.canvas.getContext('2d')!;
  private armour = canvas();
  private rearBed = canvas();
  private frontBed = canvas();
  private ribbon = new Float32Array(73 * 5 * 3);
  private quality: Quality = 'fine';
  private glyphSize = 1;
  private gardenReady = false;

  async init() {
    bakeKnight(this.armour.getContext('2d')!);
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

  /** One free scarf tail: displacement grows toward the loose end, the root stays pinned at the knot. */
  private scarf(time: number, secondary: boolean, amplitude: number) {
    const rows = 72, columns = 4, ctx = this.ctx;
    const length = secondary ? 228 : 242;
    const phase = secondary ? 1.9 : 0;
    const rootX = secondary ? 536 : 526, rootY = secondary ? 352 : 334;
    const rise = secondary ? -12 : -100;
    for (let row = 0; row <= rows; row++) {
      const u = row / rows, env = Math.pow(u, 1.35);
      const wave = Math.sin(u * 7.2 - time * 2.4 + phase) * 19 + Math.sin(u * 15.8 - time * 3.9 + phase) * 6;
      const gust = Math.sin(time * .71 + u * 3.4 + phase) * 9;
      const centerX = rootX + length * u - env * Math.abs(gust) * .8;
      const centerY = rootY + rise * u * (1 - .25 * u) + amplitude * env * (wave + gust);
      const twist = .62 + .38 * Math.cos(u * 9.6 - time * 2.2 + phase);
      const fray = 1 - .6 * Math.max(0, (u - .78) / .22);
      const width = ((secondary ? 17 : 25) * (1 + .45 * u) * twist + 4) * fray;
      for (let col = 0; col <= columns; col++) {
        const q = col / columns * 2 - 1, p = (row * 5 + col) * 3;
        this.ribbon[p] = centerX + q * Math.sin(u * 6 - time * 1.7) * 4 * env;
        this.ribbon[p + 1] = centerY + q * width;
        this.ribbon[p + 2] = .5 + .32 * Math.cos(q * 2.4 + u * 13 - time * 2.3 + phase) * twist + .14 * Math.sin(u * 23 - time * 3.2 + phase) - (secondary ? .14 : 0);
      }
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const a = (row * 5 + col) * 3, b = a + 15, c = b + 3, d = a + 3;
      const shade = Math.max(.12, Math.min(1, this.ribbon[a + 2]));
      ctx.fillStyle = `rgb(${Math.round(92 + shade * 150)},${Math.round(4 + shade * 16)},${Math.round(14 + shade * 24)})`;
      ctx.beginPath(); ctx.moveTo(this.ribbon[a], this.ribbon[a + 1]);
      ctx.lineTo(this.ribbon[b], this.ribbon[b + 1]); ctx.lineTo(this.ribbon[c], this.ribbon[c + 1]);
      ctx.lineTo(this.ribbon[d], this.ribbon[d + 1]); ctx.closePath(); ctx.fill();
    }
  }

  /** Wrap around the throat, in front of helm and tail roots so the attachment never shows a seam. */
  /** Wrap around the gorget, drawn over helm rim and tail roots so the attachment never shows a seam. */
  /** Wrap around the gorget, drawn over helm rim and tail roots so the attachment never shows a seam. */
  /** Wrap around the gorget, drawn over helm rim and tail roots so the attachment never shows a seam. */
  private scarfWrap(time: number, amplitude: number) {
    const ctx = this.ctx, lift = Math.sin(time * 1.3) * 1.2 * amplitude;
    const band = ctx.createLinearGradient(420, 320, 545, 362);
    band.addColorStop(0, '#6e0912'); band.addColorStop(.4, '#cc182b'); band.addColorStop(.75, '#9c0f1d'); band.addColorStop(1, '#52060e');
    ctx.fillStyle = band; ctx.beginPath();
    ctx.moveTo(422, 330); ctx.quadraticCurveTo(480, 318 + lift, 540, 322);
    ctx.lineTo(548, 352); ctx.quadraticCurveTo(484, 360 + lift, 428, 358); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#360408'; ctx.lineWidth = 2.5; ctx.beginPath();
    ctx.moveTo(430, 345); ctx.quadraticCurveTo(484, 336 + lift, 542, 337); ctx.stroke();
    ctx.fillStyle = '#b51424'; ctx.beginPath(); ctx.ellipse(528, 337 + lift, 16, 13, -.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#640910'; ctx.beginPath(); ctx.ellipse(532, 340 + lift, 6, 5, -.3, 0, Math.PI * 2); ctx.fill();
  }

  render(time: number, garden: boolean, settings: Settings) {
    const ctx = this.ctx;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (garden) ctx.drawImage(this.rearBed, 0, 0);
    const scarfTime = time * settings.scarfSpeed;
    // Lower tail passes behind the rear pauldron; the main tail and the wrap sit in front.
    this.scarf(scarfTime, true, settings.scarfAmplitude);
    ctx.drawImage(this.armour, 0, 0);
    this.scarf(scarfTime, false, settings.scarfAmplitude);
    this.scarfWrap(scarfTime, settings.scarfAmplitude);
    if (garden) ctx.drawImage(this.frontBed, 0, 0);
  }
}
