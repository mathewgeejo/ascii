import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { Bouquet, WIDTH, HEIGHT, DURATION } from './bouquet';
import './style.css';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
const app = new Application();
const artwork = new Container();
let bouquet = new Bouquet(params.get('quality') === 'light' ? 'light' : 'fine');
let sprites: Sprite[] = [];
let density = 1;
let time = reducedMotion.matches ? DURATION : 0;
let paused = false;
let last = 0;
let request = 0;
let renderedFrames = 0;

// One white monospaced atlas shared by all glyph sprites. All colours are sprite tints.
function makeAtlas() {
  const chars = '.,:;-+=*oO';
  const canvas = document.createElement('canvas');
  canvas.width = chars.length * 6; canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px "Courier New", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < chars.length; i++) ctx.fillText(chars[i], i * 6 + 3, 4);
  const atlas = Texture.from(canvas);
  return Array.from(chars, (_, i) => new Texture({ source: atlas.source, frame: new Rectangle(i * 6, 0, 6, 8) }));
}
const textures = makeAtlas();

function ensurePool() {
  // Allocate once per quality switch, never in an animation frame.
  const size = Math.ceil(bouquet.cols * bouquet.rows * .52);
  while (sprites.length < size) {
    const sprite = new Sprite(textures[0]);
    sprite.visible = false;
    artwork.addChild(sprite);
    sprites.push(sprite);
  }
}

function draw() {
  bouquet.render(time);
  let count = 0;
  for (let i = 0; i < bouquet.colors.length; i++) {
    if (bouquet.depth[i] === -Infinity || bouquet.noise[i] > density) continue;
    const sprite = sprites[count++];
    if (!sprite) break;
    const light = bouquet.light[i];
    const glyph = Math.min(9, Math.floor(2 + light * 4 + bouquet.noise[i] * 3));
    sprite.texture = textures[glyph];
    sprite.tint = bouquet.colors[i];
    sprite.position.set(i % bouquet.cols * bouquet.cellX, Math.floor(i / bouquet.cols) * bouquet.cellY);
    sprite.width = bouquet.cellX * 1.12;
    sprite.height = bouquet.cellY * 1.07;
    sprite.visible = true;
  }
  for (let i = count; i < sprites.length && sprites[i].visible; i++) sprites[i].visible = false;
  app.render();
  renderedFrames++;
  $('#seek').setAttribute('aria-valuetext', `${time.toFixed(2)} seconds`);
  $<HTMLInputElement>('#seek').value = String(time);
  $('#time-label').textContent = `${time.toFixed(2)} s`;
  $('#pause').textContent = paused || time >= DURATION ? 'Play' : 'Pause';
}

function stop() { cancelAnimationFrame(request); request = 0; last = 0; }
function frame(now: number) {
  request = 0;
  if (document.hidden || paused) { last = 0; return; }
  if (last) time = Math.min(DURATION, time + (now - last) / 1000);
  last = now;
  draw();
  if (time < DURATION) request = requestAnimationFrame(frame);
  else { last = 0; $('#status').textContent = 'The bouquet is in full bloom.'; }
}
function play() {
  stop();
  if (!document.hidden && !paused && time < DURATION) request = requestAnimationFrame(frame);
}
function replay() {
  time = reducedMotion.matches ? DURATION : 0;
  paused = false;
  $('#status').textContent = reducedMotion.matches ? 'The bouquet is in full bloom. Reduced motion is enabled.' : 'The bouquet is growing.';
  draw(); play();
}
function seek(value: number) { stop(); paused = true; time = Math.min(DURATION, Math.max(0, value)); draw(); }
function resize() {
  app.renderer.resize(window.innerWidth, window.innerHeight);
  const scale = Math.min(window.innerWidth / (WIDTH - 90), (window.innerHeight - 70) / HEIGHT);
  artwork.scale.set(scale);
  artwork.position.set((window.innerWidth - WIDTH * scale) / 2, (window.innerHeight - 70 - HEIGHT * scale) / 2 + 12);
  app.render();
}

async function init() {
  await app.init({ background: '#000000', width: innerWidth, height: innerHeight, antialias: false,
    resolution: Math.min(devicePixelRatio, 2), autoDensity: true, autoStart: false, preference: 'webgl' });
  app.stage.addChild(artwork);
  $('#stage').appendChild(app.canvas);
  app.canvas.setAttribute('aria-hidden', 'true');
  ensurePool(); resize();
  $('#replay').addEventListener('click', replay);
  $('#pause').addEventListener('click', () => { paused = !paused; if (time >= DURATION) { time = 0; paused = false; } draw(); play(); });
  $('#seek').addEventListener('input', event => seek(Number((event.target as HTMLInputElement).value)));
  $('#density').addEventListener('input', event => { density = Number((event.target as HTMLInputElement).value); draw(); });
  $('#quality').addEventListener('change', event => {
    bouquet = new Bouquet((event.target as HTMLSelectElement).value as 'fine' | 'light');
    for (const sprite of sprites) sprite.visible = false;
    ensurePool(); draw();
  });
  $<HTMLSelectElement>('#quality').value = params.get('quality') === 'light' ? 'light' : 'fine';
  $('#close-dev').addEventListener('click', () => { $('#dev').hidden = true; });
  document.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).matches('input, select, button')) return;
    if (event.key.toLowerCase() === 'd') $('#dev').hidden = !$('#dev').hidden;
    if (event.code === 'Space' && !$('#dev').hidden) { event.preventDefault(); $('#pause').click(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else play(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { stop(); time = DURATION; draw(); } });
  window.addEventListener('resize', resize);
  if (params.has('debug')) $('#dev').hidden = false;
  if (params.has('t')) seek(Number(params.get('t')) || 0);
  else { draw(); play(); }
  // Small, deterministic inspection surface used by the browser verification script.
  Object.assign(window, { bouquetStudio: {
    seek, replay, getState: () => ({ time, paused, renderedFrames, visibleGlyphs: sprites.filter(s => s.visible).length,
      quality: bouquet.cellX === 2.5 ? 'fine' : 'light', running: request !== 0, width: app.screen.width, height: app.screen.height }),
  } });
}
init().catch(error => {
  console.error(error);
  $('#stage').innerHTML = '<p class="error">This bouquet needs a browser with WebGL enabled.<br>Please enable hardware acceleration and reload.</p>';
});
