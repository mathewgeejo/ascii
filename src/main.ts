import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { Bouquet, WIDTH, HEIGHT, DURATION } from './bouquet';
import { Stingray } from './stingray';
import { createAsciiFilter } from './ascii-filter';
import { CONFIG, type Quality, type Scene } from './config';
import './style.css';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
const app = new Application();
const artwork = new Container();
const lilyLayer = new Container();
const stingray = new Stingray();
const settings = { ...CONFIG };
const ascii = createAsciiFilter();
const scenes: Scene[] = ['lilies', 'stingray'];
let savedScene: string | null = null;
try { savedScene = localStorage.getItem('ascii-scene'); } catch { /* Storage is optional. */ }
let scene: Scene = scenes.includes(params.get('scene') as Scene) ? params.get('scene') as Scene
  : scenes.includes(savedScene as Scene) ? savedScene as Scene : 'stingray';
let quality: Quality = params.get('quality') === 'light' ? 'light' : 'fine';
let bouquet = new Bouquet(quality);
const sprites: Sprite[] = [];
let visibleGlyphs = 0;
let raySprite: Sprite;
let time = scene === 'lilies' && reducedMotion.matches ? DURATION : 0;
const clocks: Record<Scene, number> = { lilies: reducedMotion.matches ? DURATION : 0, stingray: 0 };
let paused = false;
let last = 0;
let request = 0;
let renderedFrames = 0;
let lastUiUpdate = -1;
let ready = false;
const sourceFilter = [ascii.filter];

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
    stingray.render(app,time,settings);
    ascii.filter.resources.ascii.uniforms.uTime = time;
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
  // Filter inputs are pooled; release the previous framebuffer binding before a resize.
  ascii.filter.resources.uTexture = Texture.WHITE.source;
  ascii.filter.resources.uSampler = Texture.WHITE.source.style;
  app.renderer.resize(innerWidth, innerHeight);
  if (scene === 'stingray') {
    const width = Math.round(innerWidth / innerHeight * 1000);
    stingray.resize(width,1000,quality);
    raySprite.width = width; raySprite.height = 1000;
    ascii.filter.resources.ascii.uniforms.uSceneSize[0] = width;
    ascii.filter.resources.ascii.uniforms.uSceneSize[1] = 1000;
    artwork.scale.set(innerHeight / 1000);
    artwork.position.set(0,0);
  } else {
    const scale = Math.min((innerWidth - 24) / WIDTH, (innerHeight - 96) / HEIGHT) * settings.scale;
    artwork.scale.set(scale);
    artwork.position.set((innerWidth - WIDTH * scale)/2,(innerHeight-HEIGHT*scale)/2+2);
  }
  draw();
}

function setScene(next: Scene, remember = true) {
  stop(); clocks[scene] = time; scene = next; time = clocks[scene];
  if (scene === 'lilies' && reducedMotion.matches) time = DURATION;
  paused = false; lastUiUpdate = -1;
  lilyLayer.visible = scene === 'lilies'; raySprite.visible = scene === 'stingray';
  if (scene === 'lilies') ensurePool();
  $('#stage').setAttribute('aria-label', scene === 'lilies' ? 'An animated ASCII bouquet of colourful lilies'
    : 'A luminous mythical ASCII stingray swimming through a dark ocean, with flapping fins, an undulating tail, moving water and drifting plankton');
  $<HTMLSelectElement>('#scene').value = scene;
  $<HTMLInputElement>('#seek').max = scene === 'lilies' ? String(DURATION) : '24';
  $<HTMLInputElement>('#source').disabled = scene === 'lilies';
  $('#ocean-controls').hidden = scene === 'lilies';
  $('#replay').setAttribute('aria-label', scene === 'lilies' ? 'Replay bouquet blooming' : 'Restart swimming animation');
  if (remember) {
    try { localStorage.setItem('ascii-scene', scene); } catch { /* Optional. */ }
    const url = new URL(location.href); url.searchParams.set('scene', scene); url.searchParams.delete('t');
    history.replaceState(null, '', url);
  }
  $('#status').textContent = scene === 'lilies' ? 'Lilies selected.' : 'Stingray selected.';
  resize(); updateUI(true); play();
}

function configureQuality() {
  bouquet = new Bouquet(quality, undefined, settings.glyphSize);
  for (const sprite of sprites) sprite.visible = false;
  if (scene === 'lilies') ensurePool();
  app.renderer.resolution = quality === 'fine' ? 2 : 1;
  ascii.configure(settings, quality);
  $<HTMLSelectElement>('#quality').value = quality; $<HTMLSelectElement>('#quick-quality').value = quality;
  resize();
}

async function init() {
  await app.init({ background: '#000000', width: innerWidth, height: innerHeight, antialias: false,
    resolution: quality === 'fine' ? 2 : 1, autoDensity: true, autoStart: false, preference: 'webgl' });
  raySprite = new Sprite(stingray.texture); raySprite.eventMode = 'none';
  ascii.filter.resources.uSource = stingray.texture.source;
  raySprite.filters = sourceFilter;
  artwork.addChild(lilyLayer, raySprite); app.stage.addChild(artwork);
  $('#stage').appendChild(app.canvas); app.canvas.setAttribute('aria-hidden', 'true');
  ready = true; ascii.configure(settings, quality); setScene(scene, false);
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
    ['gamma', 'gamma'], ['swim-speed', 'swimSpeed'], ['fin-amplitude', 'finAmplitude'],
    ['tail-amplitude', 'tailAmplitude'], ['water', 'water'], ['glow', 'glow'],
  ] as const) {
    $<HTMLInputElement>("#" + id).value = String(settings[key]);
    $("#" + id).addEventListener('input', e => {
    settings[key] = Number((e.target as HTMLInputElement).value);
    if (key === 'glyphSize') configureQuality(); else { ascii.configure(settings, quality); draw(); }
  });
  }
  $('#source').addEventListener('change', e => {
    settings.source = (e.target as HTMLInputElement).checked;
    ascii.configure(settings,quality); draw();
  });
  $('#close-dev').addEventListener('click', () => { $('#dev').hidden = true; });
  document.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'd' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); $('#dev').hidden = !$('#dev').hidden; return;
    }
    if ((event.target as HTMLElement).matches('input, select, button')) return;
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
