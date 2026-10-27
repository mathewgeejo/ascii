import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { Bouquet, WIDTH, HEIGHT, DURATION } from './bouquet';
import { Knight } from './knight';
import { createAsciiRenderer } from './ascii-filter';
import { Meadow } from './grass';
import { CONFIG, type Quality, type Scene } from './config';
import './style.css';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
const app = new Application();
const artwork = new Container();
const lilyLayer = new Container();
const knight = new Knight();
const meadow = new Meadow();
const settings = { ...CONFIG };
const scenes: Scene[] = ['lilies', 'knight', 'garden'];
let savedScene: string | null = null;
try { savedScene = localStorage.getItem('ascii-scene'); } catch { /* Storage is optional. */ }
let scene: Scene = scenes.includes(params.get('scene') as Scene) ? params.get('scene') as Scene
  : scenes.includes(savedScene as Scene) ? savedScene as Scene : 'knight';
let quality: Quality = params.get('quality') === 'light' ? 'light' : 'fine';
let bouquet = new Bouquet(quality);
const sprites: Sprite[] = [];
let visibleGlyphs = 0;
let ascii!: ReturnType<typeof createAsciiRenderer>;
let knightSprite: ReturnType<typeof createAsciiRenderer>['mesh'];
let time = scene === 'lilies' && reducedMotion.matches ? DURATION : 0;
const clocks: Record<Scene, number> = { lilies: reducedMotion.matches ? DURATION : 0, knight: 0, garden: 0 };
let paused = false;
let last = 0;
let request = 0;
let renderedFrames = 0;
let lastUiUpdate = -1;
let ready = false;

function makeLilyAtlas() {
  const chars = '.,:;-+=*oO', canvas = document.createElement('canvas');
  canvas.width = chars.length * 6; canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px "Courier New", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < chars.length; i++) ctx.fillText(chars[i], i * 6 + 3, 4);
  const atlas = Texture.from(canvas);
  return Array.from(chars, (_, i) => new Texture({ source: atlas.source, frame: new Rectangle(i * 6, 0, 6, 8) }));
}
const textures = makeLilyAtlas();

function ensurePool() {
  const size = Math.ceil(bouquet.cols * bouquet.rows * .56);
  while (sprites.length < size) {
    const sprite = new Sprite(textures[0]); sprite.visible = false; sprite.eventMode = 'none';
    lilyLayer.addChild(sprite); sprites.push(sprite);
  }
}

function drawLilies() {
  bouquet.render(time);
  let count = 0;
  for (let i = 0; i < bouquet.colors.length; i++) {
    if (bouquet.depth[i] === -Infinity || bouquet.noise[i] > settings.density) continue;
    const sprite = sprites[count++]; if (!sprite) break;
    const glyph = Math.min(9, Math.floor(2 + bouquet.light[i] * 4 + bouquet.noise[i] * 3));
    sprite.texture = textures[glyph]; sprite.tint = bouquet.colors[i];
    sprite.position.set(i % bouquet.cols * bouquet.cellX, Math.floor(i / bouquet.cols) * bouquet.cellY);
    sprite.width = bouquet.cellX * 1.12 / settings.spacing;
    sprite.height = bouquet.cellY * 1.07 / settings.spacing;
    sprite.visible = true;
  }
  for (let i = count; i < sprites.length && sprites[i].visible; i++) sprites[i].visible = false;
  visibleGlyphs = count;
}

const finished = () => scene === 'lilies' && time >= DURATION;
const canAnimate = () => !document.hidden && !paused && !reducedMotion.matches && !finished();

function updateUI(force = false) {
  if (!force && time - lastUiUpdate < .1) return;
  lastUiUpdate = time;
  const stopped = paused || reducedMotion.matches || finished();
  $<HTMLInputElement>('#seek').value = String(scene === 'lilies' ? time : time % 24);
  $('#seek').setAttribute('aria-valuetext', `${time.toFixed(2)} seconds`);
  $('#time-label').textContent = `${time.toFixed(2)} s`;
  $('#pause').textContent = stopped ? 'Resume' : 'Pause';
  $('#playback').setAttribute('aria-label', stopped ? 'Resume animation' : 'Pause animation');
  $('#playback').setAttribute('aria-pressed', String(stopped));
  $('#playback').dataset.paused = String(stopped);
}

function draw() {
  if (scene === 'lilies') drawLilies();
  else {
    meadow.update(time, settings.grassMotion);
    knight.render(time, scene === 'garden', settings);
    knightSprite.texture.source.update();
  }
  app.render(); renderedFrames++; updateUI();
}

function stop() { cancelAnimationFrame(request); request = 0; last = 0; }
function frame(now: number) {
  request = 0;
  if (!canAnimate()) { last = 0; return; }
  if (last) time += (now - last) / 1000;
  if (scene === 'lilies') time = Math.min(DURATION, time);
  last = now; draw();
  if (canAnimate()) request = requestAnimationFrame(frame);
  else { last = 0; updateUI(true); }
}
function play() { stop(); if (canAnimate()) request = requestAnimationFrame(frame); }
function replay() {
  stop(); time = scene === 'lilies' && reducedMotion.matches ? DURATION : 0;
  paused = false; lastUiUpdate = -1;
  $('#status').textContent = reducedMotion.matches ? 'Stable artwork. Reduced motion is enabled.' : 'Animation restarted.';
  draw(); updateUI(true); play();
}
function togglePause() {
  if (reducedMotion.matches) { $('#status').textContent = 'Motion is disabled by your reduced motion preference.'; return; }
  if (finished()) { replay(); return; }
  paused = !paused; updateUI(true); play();
}
function seek(value: number) {
  stop(); paused = true; time = Math.max(0, Math.min(scene === 'lilies' ? DURATION : 86400, value));
  lastUiUpdate = -1; draw(); updateUI(true);
}

function resize() {
  if (!ready) return;
  app.renderer.resize(innerWidth, innerHeight);
  const scale = Math.min((innerWidth - 24) / WIDTH, (innerHeight - 96) / HEIGHT) * settings.scale;
  const x = (innerWidth - WIDTH * scale) / 2;
  const y = (innerHeight - HEIGHT * scale) / 2 + 2;
  artwork.scale.set(scale);
  artwork.position.set(x, y);
  ascii.resize(innerWidth, innerHeight, x, y, WIDTH * scale, HEIGHT * scale);
  app.render();
}

function setScene(next: Scene, remember = true) {
  stop(); clocks[scene] = time; scene = next; time = clocks[scene];
  if (scene === 'lilies' && reducedMotion.matches) time = DURATION;
  paused = false; lastUiUpdate = -1;
  lilyLayer.visible = scene === 'lilies'; knightSprite.visible = scene !== 'lilies';
  if (scene === 'garden') knight.configureGarden(quality, settings.glyphSize);
  $('#stage').setAttribute('aria-label', scene === 'lilies' ? 'An animated ASCII bouquet of colourful lilies'
    : scene === 'garden' ? 'A bowed ASCII knight holding an upright sword in a colourful bed of lilies, with a red scarf moving in the wind'
      : 'A bowed armoured ASCII knight holding an upright sword, with a crimson scarf moving in the wind and dark grass below');
  $<HTMLSelectElement>('#scene').value = scene;
  $<HTMLInputElement>('#seek').max = scene === 'lilies' ? String(DURATION) : '24';
  $<HTMLInputElement>('#source').disabled = scene === 'lilies';
  $('#knight-controls').hidden = scene === 'lilies';
  $('#replay').setAttribute('aria-label', scene === 'lilies' ? 'Replay bouquet blooming' : 'Restart wind animation');
  if (remember) {
    try { localStorage.setItem('ascii-scene', scene); } catch { /* Optional. */ }
    const url = new URL(location.href); url.searchParams.set('scene', scene); url.searchParams.delete('t');
    history.replaceState(null, '', url);
  }
  $('#status').textContent = scene === 'lilies' ? 'Lilies selected.' : scene === 'garden' ? 'Knight in lilies selected.' : 'Knight selected.';
  draw(); updateUI(true); play();
}

function configureQuality() {
  bouquet = new Bouquet(quality, undefined, settings.glyphSize);
  for (const sprite of sprites) sprite.visible = false;
  ensurePool(); configureAscii();
  if (scene === 'garden') knight.configureGarden(quality, settings.glyphSize);
  $<HTMLSelectElement>('#quality').value = quality; $<HTMLSelectElement>('#quick-quality').value = quality;
  draw();
}

function configureAscii() {
  const { cellX, cellY } = ascii.configure(settings, quality);
  const grid = meadow.configure(cellX, cellY);
  ascii.setGrass(grid.source, grid.cols, grid.rows);
}

async function init() {
  await app.init({ background: '#000000', width: innerWidth, height: innerHeight, antialias: false,
    resolution: Math.min(devicePixelRatio, 2), autoDensity: true, autoStart: false, preference: 'webgl' });
  await knight.init();
  const grid = meadow.configure(4.2, 7);
  knightSprite = (ascii = createAsciiRenderer(Texture.from(knight.canvas), grid.source, grid.cols, grid.rows)).mesh;
  artwork.addChild(lilyLayer); app.stage.addChild(artwork, knightSprite);
  $('#stage').appendChild(app.canvas); app.canvas.setAttribute('aria-hidden', 'true');
  ready = true; ensurePool(); configureAscii(); resize(); setScene(scene, false);
  $('#scene').addEventListener('change', e => setScene((e.target as HTMLSelectElement).value as Scene));
  $('#replay').addEventListener('click', replay); $('#pause').addEventListener('click', togglePause);
  $('#playback').addEventListener('click', togglePause);
  $('#seek').addEventListener('input', e => seek(Number((e.target as HTMLInputElement).value)));
  for (const id of ['quality', 'quick-quality']) $("#" + id).addEventListener('change', e => {
    quality = (e.target as HTMLSelectElement).value as Quality; configureQuality();
  });
  $<HTMLSelectElement>('#quality').value = quality; $<HTMLSelectElement>('#quick-quality').value = quality;
  for (const [id, key] of [
    ['density', 'density'], ['glyph-size', 'glyphSize'], ['spacing', 'spacing'], ['contrast', 'contrast'],
    ['gamma', 'gamma'], ['scarf-speed', 'scarfSpeed'], ['scarf-amplitude', 'scarfAmplitude'], ['grass', 'grassMotion'],
  ] as const) $("#" + id).addEventListener('input', e => {
    settings[key] = Number((e.target as HTMLInputElement).value);
    if (key === 'glyphSize') configureQuality(); else { configureAscii(); draw(); }
  });
  $('#source').addEventListener('change', e => {
    settings.source = (e.target as HTMLInputElement).checked;
    configureAscii(); draw();
  });
  $('#close-dev').addEventListener('click', () => { $('#dev').hidden = true; });
  document.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).matches('input, select, button')) return;
    if (event.key.toLowerCase() === 'd') $('#dev').hidden = !$('#dev').hidden;
    if (event.code === 'Space') { event.preventDefault(); togglePause(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else play(); });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { stop(); if (scene === 'lilies') time = DURATION; draw(); updateUI(true); } else play();
  });
  window.addEventListener('resize', resize);
  if (params.has('debug')) $('#dev').hidden = false;
  if (params.has('t')) seek(Number(params.get('t')) || 0);
  const inspection = { seek, replay, setScene,
    getState: () => ({ scene, time, paused, renderedFrames, visibleGlyphs, quality, reducedMotion: reducedMotion.matches,
      running: request !== 0, width: app.screen.width, height: app.screen.height, settings: { ...settings } }),
  };
  Object.assign(window, { artworkStudio: inspection, bouquetStudio: inspection });
}
init().catch(error => {
  console.error(error);
  $('#stage').innerHTML = '<p class="error">This artwork needs a browser with WebGL enabled.<br>Please enable hardware acceleration and reload.</p>';
});
