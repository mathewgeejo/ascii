import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { Bouquet, WIDTH, HEIGHT, DURATION } from './bouquet';
import { Stingray } from './stingray';
import { SpaceSkull } from './skull';
import { ImportedScene } from './imported-scene';
import { mountStudio } from './studio';
import { cleanSettings } from './projects';
import type { StudioAPI } from './studio-types';
import { ShaderScene } from './shader-scene';
import { backgroundFragment } from './background';
import { createAsciiFilter } from './ascii-filter';
import { CONFIG, type Quality, type Scene } from './config';
import './style.css';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const params = new URLSearchParams(location.search);
const app = new Application();
const artwork = new Container();
const lilyLayer = new Container();
const renderedScenes = { stingray: new Stingray(), skull: new SpaceSkull(), custom: new ImportedScene() };
const settings = { ...CONFIG };
const ascii = createAsciiFilter();
const lilySky=new ShaderScene(backgroundFragment,'lily-background');
const lilyAscii=createAsciiFilter();
const lilyBackdrop=new Sprite(lilySky.texture);
const scenes: Scene[] = ['lilies', 'stingray', 'skull'];
const descriptions: Record<Scene, string> = {
  lilies: 'An animated ASCII bouquet of colourful lilies',
  stingray: 'A luminous mythical ASCII stingray swimming through a dark ocean, with flapping fins, an undulating tail, moving water and drifting plankton',
  skull: 'A three-dimensional human skull floating and rotating through deep space, with layered drifting stars, faint blue and violet nebula clouds, a distant ringed planet, a small moon and occasional red laser fire',
  custom:'Your imported artwork rendered as live ASCII',
};
let savedScene: string | null = null;
try { savedScene = localStorage.getItem('ascii-scene'); } catch { /* Storage is optional. */ }
let scene: Scene = scenes.includes(params.get('scene') as Scene) ? params.get('scene') as Scene
  : scenes.includes(savedScene as Scene) ? savedScene as Scene : 'skull';
let quality: Quality = params.get('quality') === 'light' ? 'light' : 'fine';
let bouquet = new Bouquet(quality);
const sprites: Sprite[] = [];
let visibleGlyphs = 0;
let sceneSprite: Sprite;
let time = scene === 'lilies' && reducedMotion.matches ? DURATION : 0;
const clocks: Record<Scene, number> = { lilies: reducedMotion.matches ? DURATION : 0, stingray: 0, skull: 0, custom:0 };
let paused = false;
let last = 0;
let request = 0;
let renderedFrames = 0;
let lastUiUpdate = -1;
let ready = false;
const sourceFilter = [ascii.filter];
let aspect='free';
let outputSize:{width:number;height:number}|null=null;
const changed=()=>window.dispatchEvent(new Event('studiochange'));

let updateLilyCharacters=(_settings:typeof settings)=>{};
function makeLilyAtlas() {
  const chars = '.,:;-+=*oO', canvas = document.createElement('canvas');
  canvas.width = chars.length * 6; canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 9px "Courier New", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < chars.length; i++) ctx.fillText(chars[i], i * 6 + 3, 4);
  const atlas = Texture.from(canvas);
  let previous='classic';
  updateLilyCharacters=(current)=>{
    const key=current.charset+current.characters;if(key===previous)return;previous=key;
    const ramp=current.charset==='classic'?chars:current.charset==='dots'?' .·:oO●':current.charset==='blocks'?' ░▒▓▅▆▇█':current.charset==='binary'?'01':current.characters||chars;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<10;i++)ctx.fillText(ramp[Math.min(ramp.length-1,Math.floor(i/9*(ramp.length-1)))],i*6+3,4);
    atlas.source.update();
  };
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
  updateLilyCharacters(settings);
  lilySky.render(app,time,settings);
  lilyAscii.filter.resources.ascii.uniforms.uTime=time;
  bouquet.render(time);
  let count = 0;
  for (let i = 0; i < bouquet.colors.length; i++) {
    if (bouquet.depth[i] === -Infinity || bouquet.noise[i] > settings.density) continue;
    const sprite = sprites[count++]; if (!sprite) break;
    const glyph = Math.min(9, Math.floor(2 + bouquet.light[i] * 4 + bouquet.noise[i] * 3));
    const original=bouquet.colors[i],luminance=Math.max(original>>16&255,original>>8&255,original&255)/255;
    const ink=parseInt(settings.inkColor.slice(1),16),shadow=parseInt(settings.shadowColor.slice(1),16);
    const channels=[16,8,0].map(shift=>{let value=(original>>shift&255)/255;if(settings.palette==='mono')value=(ink>>shift&255)/255*luminance;else if(settings.palette==='duotone')value=((shadow>>shift&255)*(1-luminance)+(ink>>shift&255)*luminance)/255*Math.max(.15,luminance);return Math.min(255,Math.pow(value,settings.gamma/.86)*(settings.contrast/1.12)*settings.brightness*255);});
    const tint=(channels[0]<<16)|(channels[1]<<8)|channels[2];
    sprite.texture = textures[glyph]; sprite.tint = tint;
    sprite.position.set(i % bouquet.cols * bouquet.cellX, Math.floor(i / bouquet.cols) * bouquet.cellY);
    sprite.width = bouquet.cellX * 1.12 / settings.spacing;
    sprite.height = bouquet.cellY * 1.07 / settings.spacing;
    sprite.visible = true;
  }
  for (let i = count; i < sprites.length && sprites[i].visible; i++) sprites[i].visible = false;
  visibleGlyphs = count;
}

const finished = () => scene === 'lilies' && time >= DURATION && ['black','gradient'].includes(settings.background);
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
    renderedScenes.custom.playing=canAnimate();
    renderedScenes[scene].render(app,time,settings);
    ascii.filter.resources.ascii.uniforms.uTime = time;
  }
  app.render(); renderedFrames++; updateUI();
}

function stop() { cancelAnimationFrame(request); request = 0; last = 0; renderedScenes.custom.pauseMedia(); }
function frame(now: number) {
  request = 0;
  if (!canAnimate()) { last = 0; return; }
  if (last) time += (now - last) / 1000;
  if (scene === 'lilies'&&['black','gradient'].includes(settings.background)) time = Math.min(DURATION, time);
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
  paused = !paused; updateUI(true); play();draw();
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
  lilyAscii.filter.resources.uTexture=Texture.WHITE.source;lilyAscii.filter.resources.uSampler=Texture.WHITE.source.style;
  const area=$('#canvas-area'),padding=document.body.dataset.editor==='false'?0:32;
  let width=Math.max(1,area.clientWidth-padding),height=Math.max(1,area.clientHeight-padding);
  const ratio=aspect==='square'?1:aspect==='portrait'?9/16:aspect==='landscape'?16/9:0;
  if(ratio){if(width/height>ratio)width=height*ratio;else height=width/ratio;}
  width=Math.round(width);height=Math.round(height);
  $('#stage').style.width=width+'px';$('#stage').style.height=height+'px';
  if(outputSize){width=outputSize.width;height=outputSize.height;}
  app.renderer.resize(width,height);
  if (scene !== 'lilies') {
    const worldWidth = Math.round(width / height * 1000);
    renderedScenes[scene].resize(worldWidth,1000,quality);
    sceneSprite.width = worldWidth; sceneSprite.height = 1000;
    ascii.filter.resources.ascii.uniforms.uSceneSize[0] = worldWidth;
    ascii.filter.resources.ascii.uniforms.uSceneSize[1] = 1000;
    artwork.scale.set(height / 1000);
    artwork.position.set(0,0);
  } else {
    const worldWidth=Math.round(width/height*1000);
    lilySky.resize(worldWidth,1000,quality);lilyBackdrop.width=width;lilyBackdrop.height=height;
    lilyAscii.filter.resources.ascii.uniforms.uSceneSize.set([worldWidth,1000]);
    const scale = Math.min((width - 24) / WIDTH, (height - 48) / HEIGHT) * settings.scale;
    artwork.scale.set(scale);
    artwork.position.set((width - WIDTH * scale)/2+settings.positionX*width*.3,(height-HEIGHT*scale)/2+settings.positionY*height*.3+2);
  }
  draw();$('#canvas-size').textContent=`${width} × ${height}`;
}

function setScene(next: Scene, remember = true) {
  if(next==='custom'&&!renderedScenes.custom.files.length)return;
  stop(); clocks[scene] = time; scene = next; time = clocks[scene];
  if (scene === 'lilies' && reducedMotion.matches) time = DURATION;
  paused = false; lastUiUpdate = -1;
  lilyLayer.visible = scene === 'lilies'; sceneSprite.visible = scene !== 'lilies';
  lilyBackdrop.visible=scene==='lilies';
  if (scene === 'lilies') ensurePool();
  else {
    sceneSprite.texture = renderedScenes[scene].texture;
    ascii.filter.resources.uSource = renderedScenes[scene].texture.source;
    ascii.filter.resources.ascii.uniforms.uExposure = scene === 'stingray' ? 1.9 : scene==='custom'?1:1.15;
  }
  $('#stage').setAttribute('aria-label', descriptions[scene]);
  $<HTMLSelectElement>('#scene').value = scene;
  $<HTMLInputElement>('#seek').max = scene === 'lilies' ? String(DURATION) : '24';
  $<HTMLInputElement>('#source').disabled = scene === 'lilies';
  $('#ocean-controls').hidden = scene === 'lilies';
  $('#replay').setAttribute('aria-label', scene === 'lilies' ? 'Replay bouquet blooming' : 'Restart animation');
  if (remember) {
    try { localStorage.setItem('ascii-scene', scene); } catch { /* Optional. */ }
    const url = new URL(location.href); url.searchParams.set('scene', scene); url.searchParams.delete('t');
    history.replaceState(null, '', url);
  }
  $('#status').textContent = `${scene==='custom'?renderedScenes.custom.name:scene} selected.`;
  if(scene!=='custom')renderedScenes.custom.playing=false;
  resize(); updateUI(true); play();changed();
}

function configureQuality() {
  bouquet = new Bouquet(quality, undefined, settings.glyphSize);
  for (const sprite of sprites) sprite.visible = false;
  if (scene === 'lilies') ensurePool();
  app.renderer.resolution = quality === 'fine' ? 2 : 1;
  ascii.configure(settings, quality);
  lilyAscii.configure(settings,quality);
  $<HTMLSelectElement>('#quality').value = quality; $<HTMLSelectElement>('#quick-quality').value = quality;
  resize();
}

async function init() {
  await app.init({ background: '#000000', width: innerWidth, height: innerHeight, antialias: false,
    resolution: quality === 'fine' ? 2 : 1, autoDensity: true, autoStart: false, preference: 'webgl',preserveDrawingBuffer:true });
  await renderedScenes.skull.load();
  sceneSprite = new Sprite(renderedScenes.stingray.texture); sceneSprite.eventMode = 'none';
  ascii.filter.resources.uSource = renderedScenes.stingray.texture.source;
  sceneSprite.filters = sourceFilter;
  lilyAscii.filter.resources.uSource=lilySky.texture.source;lilyBackdrop.filters=[lilyAscii.filter];lilyBackdrop.eventMode='none';
  artwork.addChild(lilyLayer, sceneSprite); app.stage.addChild(lilyBackdrop,artwork);
  $('#stage').replaceChildren(app.canvas); app.canvas.setAttribute('aria-hidden', 'true');
  ready = true; ascii.configure(settings, quality); setScene(scene, false);
  $('#scene').addEventListener('change', e => setScene((e.target as HTMLSelectElement).value as Scene));
  $('#replay').addEventListener('click', replay); $('#pause').addEventListener('click', togglePause);
  $('#playback').addEventListener('click', togglePause);
  $('#seek').addEventListener('input', e => seek(Number((e.target as HTMLInputElement).value)));
  for (const id of ['quality', 'quick-quality']) $("#" + id).addEventListener('change', e => {
    quality = (e.target as HTMLSelectElement).value as Quality; configureQuality();
  });
  $<HTMLSelectElement>('#quality').value = quality; $<HTMLSelectElement>('#quick-quality').value = quality;
  $('#close-dev').addEventListener('click', () => { document.body.dataset.editor='false';const url=new URL(location.href);url.searchParams.delete('studio');url.searchParams.delete('debug');history.replaceState(null,'',url);resize(); });
  document.addEventListener('keydown', event => {
    if(document.querySelector('dialog[open]'))return;
    if ((event.target as HTMLElement).matches('input, select, button, textarea, [contenteditable]')) return;
    if (event.key.toLowerCase() === 'd' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); const open=document.body.dataset.editor==='false';document.body.dataset.editor=open?'true':'false';const url=new URL(location.href);if(open)url.searchParams.set('studio','1');else{url.searchParams.delete('studio');url.searchParams.delete('debug');}history.replaceState(null,'',url);resize(); return;
    }
    if ((event.target as HTMLElement).matches('input, select, button')) return;
    if (event.code === 'Space') { event.preventDefault(); togglePause(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else play(); });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { stop(); if (scene === 'lilies') time = DURATION; draw(); updateUI(true); } else play();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('mediaframe',()=>{if(scene==='custom')draw();});
  new ResizeObserver(()=>resize()).observe($('#canvas-area'));
  document.body.dataset.editor=params.get('studio')==='1'||params.has('debug')?'true':'false';
  if (params.has('t')) seek(Number(params.get('t')) || 0);
  const inspection = { seek, replay, setScene,
    getState: () => ({ scene, time, paused, renderedFrames, visibleGlyphs, quality, reducedMotion: reducedMotion.matches,
      running: request !== 0, width: app.screen.width, height: app.screen.height, settings: { ...settings } }),
  };
  Object.assign(window, { artworkStudio: inspection, bouquetStudio: inspection });
  const api:StudioAPI={
    getState:()=>({scene,time,paused,quality,settings:{...settings},aspect,assetName:renderedScenes.custom.name,assetKind:renderedScenes.custom.kind,files:scene==='custom'?renderedScenes.custom.files:[],width:app.screen.width,height:app.screen.height}),
    setSettings(patch){const previousGlyph=settings.glyphSize;Object.assign(settings,cleanSettings({...settings,...patch}));ascii.configure(settings,quality);lilyAscii.configure(settings,quality);if(previousGlyph!==settings.glyphSize)configureQuality();else if(scene==='lilies'&&['scale','positionX','positionY'].some(key=>key in patch))resize();else draw();updateUI(true);if(canAnimate()&&!request)play();changed();},
    setScene,setQuality(next){quality=next;configureQuality();changed();},setAspect(next){aspect=next;resize();changed();},
    async importFiles(files){const wasPaused=paused;stop();const candidate=new ImportedScene();try{await candidate.load(files);}catch(error){candidate.dispose();if(!wasPaused)play();throw error;}const previous=renderedScenes.custom;renderedScenes.custom=candidate;clocks.custom=0;const option=$<HTMLSelectElement>('#scene').querySelector('option[value="custom"]');if(!option){const item=document.createElement('option');item.value='custom';item.textContent='Imported artwork';$('#scene').appendChild(item);}settings.background='black';settings.motion=candidate.kind==='model'?'float-spin':'still';ascii.configure(settings,quality);setScene('custom');previous.dispose();},
    seek,togglePause,replay,resize,getCanvas:()=>app.canvas as HTMLCanvasElement,
    setOutputSize(size){outputSize=size;app.renderer.resolution=size?1:quality==='fine'?2:1;resize();},
  };
  const studioReady=mountStudio(api);resize();await studioReady;
}
init().catch(error => {
  console.error(error);
  $('#stage').innerHTML = '<p class="error">This artwork needs a browser with WebGL enabled.<br>Please enable hardware acceleration and reload.</p>';
});
