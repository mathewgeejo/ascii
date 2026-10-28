import { Filter, GlProgram, Texture } from 'pixi.js';
import type { Quality, Settings } from './config';
import { oceanGLSL } from './ocean';

// PixiJS v8 filter vertex convention, with an additional fixed scene coordinate.
const vertex = `
in vec2 aPosition;
out vec2 vSceneCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vSceneCoord = aPosition;
}`;
const fragment = `
in vec2 vSceneCoord;
out vec4 finalColor;
uniform sampler2D uSource;
uniform sampler2D uGlyphs;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec2 uCell;
uniform vec2 uSceneSize;
uniform float uSpacing;
uniform float uContrast;
uniform float uGamma;
uniform float uDensity;
uniform float uRaw;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
${oceanGLSL}
void main() {
  vec2 position = vSceneCoord * uSceneSize;
  vec2 cell = floor(position / uCell);
  vec2 center = (cell + .5) * uCell / uSceneSize;
  vec4 ray = texture(uSource, vec2(center.x,1.-center.y));
  vec3 source = ray.rgb + ocean((cell+.5)*uCell) * (1.-ray.a);
  if (uRaw > .5) {
    vec4 smoothRay = texture(uSource,vec2(vSceneCoord.x,1.-vSceneCoord.y));
    finalColor = vec4(smoothRay.rgb + ocean(position)*(1.-smoothRay.a),1.); return;
  }
  float noise = hash(cell);
  float value = max(source.r, max(source.g, source.b));
  if (value < .014 || noise > uDensity) { finalColor = vec4(0.,0.,0.,1.); return; }
  float level = clamp(pow(value, uGamma) * uContrast, 0., 1.);
  float glyph = clamp(floor(level * 8. + noise * 1.2 + 2.), 1., 11.);
  vec2 local = (fract(position / uCell) - .5) * uSpacing + .5;
  if (any(lessThan(local, vec2(0.))) || any(greaterThanEqual(local, vec2(1.)))) {
    finalColor = vec4(0.,0.,0.,1.); return;
  }
  // Inset the atlas sample to prevent bleeding from adjacent characters.
  vec2 glyphUV = vec2((glyph + clamp(local.x, .04, .96)) / 12., clamp(local.y, .035, .965));
  float ink = texture(uGlyphs, glyphUV).a;
  vec3 color = min(vec3(1.), pow(source, vec3(uGamma)) * uContrast * 1.9);
  finalColor = vec4(color * ink, 1.);
}`;

export function createAsciiFilter() {
  const canvas = document.createElement('canvas');
  canvas.width = 12 * 6; canvas.height = 9;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  // Explicit 5×7 monospaced glyphs avoid platform font rasterization differences.
  const glyphs = [
    [0,0,0,0,0,0,0], [0,0,0,0,0,4,4], [0,0,0,0,0,4,8],
    [0,4,4,0,4,4,0], [0,4,4,0,4,4,8], [0,0,0,31,0,0,0],
    [0,0,31,0,31,0,0], [0,4,4,31,4,4,0], [0,21,14,31,14,21,0],
    [10,10,31,10,31,10,10], [25,26,2,4,8,11,19], [14,17,23,21,23,16,15],
  ];
  glyphs.forEach((rows, i) => rows.forEach((bits, y) => {
    for (let x = 0; x < 5; x++) if (bits & (1 << (4 - x))) ctx.fillRect(i * 6 + x, y + 1, 1, 1);
  }));
  const atlas = Texture.from(canvas);
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex, fragment, name: 'stable-ascii', preferredFragmentPrecision: 'highp' }),
    resolution: 'inherit',
    resources: {
      uGlyphs: atlas.source,
      uSource: Texture.WHITE.source,
      ascii: {
        uCell: { value: new Float32Array([2.5, 4]), type: 'vec2<f32>' },
        uSceneSize: { value: new Float32Array([800, 1000]), type: 'vec2<f32>' },
        uSpacing: { value: 1, type: 'f32' },
        uContrast: { value: 1.12, type: 'f32' },
        uGamma: { value: .86, type: 'f32' },
        uDensity: { value: 1, type: 'f32' },
        uTime: { value: 0, type: 'f32' },
        uWater: { value: 1, type: 'f32' },
        uRaw: { value: 0, type: 'f32' },
      },
    },
  });
  function configure(settings: Settings, quality: Quality) {
    const u = filter.resources.ascii.uniforms;
    u.uCell[0] = (quality === 'fine' ? 2.5 : 3.5) * settings.glyphSize;
    u.uCell[1] = (quality === 'fine' ? 4 : 5.6) * settings.glyphSize;
    u.uSpacing = settings.spacing; u.uContrast = settings.contrast;
    u.uGamma = settings.gamma; u.uDensity = settings.density;
    u.uWater = settings.water; u.uRaw = settings.source ? 1 : 0;
  }
  return { filter, configure };
}
