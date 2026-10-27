import { GlProgram, Mesh, MeshGeometry, Shader, Texture } from 'pixi.js';
import type { BufferImageSource } from 'pixi.js';
import type { Quality, Settings } from './config';

const vertex = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vSceneCoord;
out vec2 vSourceCoord;
uniform vec2 uViewport;
uniform vec4 uArtwork;
void main() {
  vec2 position = uArtwork.xy + aPosition * uArtwork.zw;
  vec2 clip = position / uViewport * 2. - 1.;
  gl_Position = vec4(clip.x, -clip.y, 0., 1.);
  vSceneCoord = aPosition;
  vSourceCoord = aUV;
}`;
const fragment = `
precision highp float;
in vec2 vSceneCoord;
in vec2 vSourceCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uGlyphs;
uniform sampler2D uGrass;
uniform vec2 uCell;
uniform vec2 uGrid;
uniform float uSpacing;
uniform float uContrast;
uniform float uGamma;
uniform float uDensity;
uniform float uSourceMode;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main() {
  if (uSourceMode > .5) {
    finalColor = vec4(texture(uTexture, vSourceCoord).rgb, 1.);
    return;
  }
  vec2 position = vSceneCoord * vec2(800.0, 1000.0);
  vec2 cell = floor(position / uCell);
  vec2 center = (cell + .5) * uCell / vec2(800.0, 1000.0);
  vec3 source = texture(uTexture, center).rgb;
  float value = max(source.r, max(source.g, source.b));
  vec2 local = (fract(position / uCell) - .5) * uSpacing + .5;
  vec4 grassSample = texture(uGrass, (cell + .5) / uGrid);
  float grass = floor(grassSample.a * 255. + .5);
  bool front = grass >= 8.;
  if (front) grass -= 8.;
  if (grass > 0. && (front || value < .025)) {
    if (any(lessThan(local, vec2(0.))) || any(greaterThanEqual(local, vec2(1.)))) {
      finalColor = vec4(0.,0.,0.,1.); return;
    }
    vec2 glyphUV = vec2((11. + grass + clamp(local.x, .04, .96)) / 18., clamp(local.y, .035, .965));
    float ink = texture(uGlyphs, glyphUV).a;
    vec3 color = min(vec3(1.), grassSample.rgb * 2.3);
    finalColor = vec4(color * ink, 1.);
    return;
  }
  float noise = hash(cell);
  if (value < .025 || noise > uDensity) { finalColor = vec4(0.,0.,0.,1.); return; }
  float level = clamp(pow(value, uGamma) * uContrast, 0., 1.);
  float glyph = clamp(floor(level * 10. + noise * .7 + 1.), 1., 11.);
  if (any(lessThan(local, vec2(0.))) || any(greaterThanEqual(local, vec2(1.)))) {
    finalColor = vec4(0.,0.,0.,1.); return;
  }
  // Inset the atlas sample to prevent bleeding from adjacent characters.
  vec2 glyphUV = vec2((glyph + clamp(local.x, .04, .96)) / 18., clamp(local.y, .035, .965));
  float ink = texture(uGlyphs, glyphUV).a;
  vec3 color = min(vec3(1.), pow(source, vec3(uGamma)) * uContrast * 1.75);
  finalColor = vec4(color * ink, 1.);
}`;

export function createAsciiRenderer(source: Texture, grassSource: BufferImageSource, cols: number, rows: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 18 * 16; canvas.height = 24;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 22px "Courier New", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  Array.from(' .,:;-=+*#%@').forEach((char, i) => ctx.fillText(char, i * 16 + 8, 12));
  Array.from(".,'/\\|").forEach((char, i) => ctx.fillText(char, (i + 12) * 16 + 8, 12));
  const atlas = Texture.from(canvas);
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex, fragment, name: 'stable-ascii' }),
    resources: {
      uTexture: source.source,
      uGlyphs: atlas.source,
      uGrass: grassSource,
      ascii: {
        uViewport: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
        uArtwork: { value: new Float32Array([0, 0, 800, 1000]), type: 'vec4<f32>' },
        uCell: { value: new Float32Array([4.2, 7]), type: 'vec2<f32>' },
        uGrid: { value: new Float32Array([cols, rows]), type: 'vec2<f32>' },
        uSpacing: { value: 1, type: 'f32' },
        uContrast: { value: 1.12, type: 'f32' },
        uGamma: { value: .86, type: 'f32' },
        uDensity: { value: 1, type: 'f32' },
        uSourceMode: { value: 0, type: 'f32' },
      },
    },
  });
  const geometry = new MeshGeometry({
    positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const mesh = new Mesh({ geometry, shader, texture: source });
  mesh.eventMode = 'none';
  function configure(settings: Settings, quality: Quality) {
    const u = shader.resources.ascii.uniforms;
    const cellX = (quality === 'fine' ? 4.2 : 5.4) * settings.glyphSize;
    const cellY = (quality === 'fine' ? 7 : 9) * settings.glyphSize;
    u.uCell[0] = cellX;
    u.uCell[1] = cellY;
    u.uSpacing = settings.spacing; u.uContrast = settings.contrast;
    u.uGamma = settings.gamma; u.uDensity = settings.density;
    u.uSourceMode = settings.source ? 1 : 0;
    return { cellX, cellY };
  }
  function resize(viewportWidth: number, viewportHeight: number, x: number, y: number, width: number, height: number) {
    const u = shader.resources.ascii.uniforms;
    u.uViewport[0] = viewportWidth; u.uViewport[1] = viewportHeight;
    u.uArtwork[0] = x; u.uArtwork[1] = y; u.uArtwork[2] = width; u.uArtwork[3] = height;
  }
  function setGrass(source: BufferImageSource, gridCols: number, gridRows: number) {
    if (shader.resources.uGrass !== source) shader.resources.uGrass = source;
    const u = shader.resources.ascii.uniforms;
    u.uGrid[0] = gridCols; u.uGrid[1] = gridRows;
  }
  return { mesh, configure, resize, setGrass };
}
