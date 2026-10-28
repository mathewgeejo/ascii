import { Container, GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, type Application } from 'pixi.js';
import type { Quality, Settings } from './config';

// Everything in this scene is geometry or shader math. No source images or textures.
const deformation = `
uniform float uTime;
uniform float uAmplitude;
uniform float uTailAmplitude;
uniform float uPart;
uniform vec2 uSize;
vec3 surface(vec2 uv) {
  float t = uv.y, s = uv.x * 2. - 1.;
  if (uPart > .5) {
    float envelope = t * t;
    float x = uTailAmplitude * envelope * (58. * sin(t * 8.7 - uTime * 1.7) + 23. * sin(t * 16. - uTime * 2.1));
    float length = 515. + 180. * (1. - min(uSize.x / 1100., 1.));
    float y = 201. + length * t;
    float width = 9. * pow(max(0.,1. - t), 1.3) + .65;
    width += 6. * exp(-pow((t - .29) * 54.,2.));
    return vec3(x + s * width, y, 6. * sin(t * 12. - uTime * 1.5) * t + 5. * (1. - s*s));
  }
  float width = t < .43 ? 44. + 410. * pow(t / .43, 1.15) : 14. + 440. * pow(max(0.,1. - t) / .57, 1.32);
  float x = s * width;
  float outer = max(0., abs(x) - 68.);
  float fraction = outer / max(1., width - 68.);
  float phase = uTime * 1.65 - fraction * 1.45 - t * 1.35;
  float angle = sin(phase) * .56 * uAmplitude;
  x = sign(x) * (min(abs(x),68.) + outer * cos(angle));
  float y = -190. + t * 395. + pow(abs(s),1.7) * (48. + sin(phase - .5) * 22. * uAmplitude);
  y += exp(-t*20.) * s*s * 25.;
  y += pow(abs(s),3.) * sin(t * 37.) * 3.;
  float dome = 50. * exp(-pow(x / 89.,2.)) * pow(max(.001,sin(t * 3.14159)),.65);
  float z = dome + outer * sin(angle);
  z += sin(t * 31. - fraction * 8.) * 2.5 * fraction;
  z += 12. * exp(-pow((abs(x) - 42.) / 14.,2.) - pow((t - .21) / .055,2.));
  return vec3(x,y,z);
}
vec3 project(vec3 p) {
  float bank = -.32 + sin(uTime * .35) * .025;
  float c = cos(bank), s = sin(bank);
  vec2 xy = mat2(c,s,-s,c) * p.xy;
  float scale = min(uSize.x / 1080., uSize.y / 1000.);
  return vec3(uSize.x * .5 + xy.x * scale,
    uSize.y * .365 + (xy.y * .87 - p.z * .67 + sin(uTime * .53) * 5.) * scale,
    p.z);
}`;

const vertex = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec3 vNormal;
out vec3 vLocal;
${deformation}
void main() {
  vec3 p = surface(aUV);
  vec3 dx = surface(aUV + vec2(.0005,0.)) - p;
  vec3 dy = surface(aUV + vec2(0.,.0005)) - p;
  vNormal = normalize(cross(dx,dy));
  vUV = aUV; vLocal = p;
  vec3 screen = project(p);
  gl_Position = vec4(screen.x / uSize.x * 2. - 1., 1. - screen.y / uSize.y * 2., 0., 1.);
}`;

const fragment = `
in vec2 vUV;
in vec3 vNormal;
in vec3 vLocal;
out vec4 finalColor;
uniform float uTime;
uniform float uPart;
uniform float uGlow;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
void main() {
  float s = abs(vUV.x * 2. - 1.), t = vUV.y;
  vec3 n = normalize(vNormal);
  float light = .23 + .77 * max(0.,dot(n,normalize(vec3(-.25,-.5,1.))));
  float ribs = pow(.5 + .5 * sin(t * 92. + pow(s,.65) * 17.),18.);
  float ridge = exp(-pow(vLocal.x / 25.,2.));
  vec3 skin = mix(vec3(.012,.035,.095),vec3(.25,.44,.61),pow(light,1.65));
  skin = mix(skin,vec3(.20,.13,.37),pow(s,.6) * .32);
  skin += vec3(.055,.085,.09) * ridge;
  skin *= .38 + .62 * light;
  skin += ribs * smoothstep(.19,.85,s) * vec3(.025,.07,.08);
  float grain = hash(floor(vUV * vec2(230.,180.)));
  skin *= .87 + grain * .24;
  // Fine luminous spots and concentric tracery are attached to the skin's UVs.
  vec2 grid = vUV * vec2(49.,38.);
  vec2 id = floor(grid), q = fract(grid) - .5;
  float spot = exp(-dot(q,q) * 80.) * step(.29,hash(id));
  spot *= smoothstep(.15,.55,s) * (1. - smoothstep(.86,1.,s));
  float rings = pow(max(0.,cos(length(vec2(vLocal.x * .011,(t-.23)*7.)) * 16. + s * 3.)),26.);
  rings *= smoothstep(.2,.7,s) * .30;
  float edge = smoothstep(.975,1.,s) + (1.-smoothstep(.006,.022,t)) * .4;
  skin += uGlow * (spot * vec3(.35,.85,.86) + rings * vec3(.24,.57,.67));
  float pearl = pow(max(0.,dot(n,normalize(vec3(.1,-.3,1.)))),28.);
  skin += pearl * vec3(.09,.08,.13) * (1.-smoothstep(.45,.9,s));
  skin += edge * uGlow * vec3(.08,.39,.43);
  // Eyes have raised sockets, pale irises, and dark pupils rather than flat dots.
  vec2 eye = vec2((abs(vLocal.x)-42.)/11., (t-.21)/.033);
  float e = length(eye);
  skin = mix(skin,vec3(.025,.055,.075),1.-smoothstep(.9,1.35,e));
  skin = mix(skin,vec3(.45,.8,.64),1.-smoothstep(.42,.76,e));
  skin = mix(skin,vec3(.005,.02,.03),1.-smoothstep(.19,.33,e));
  skin += vec3(.23,.55,.49) * exp(-pow(eye.x+.25,2.)*45.-pow(eye.y+.26,2.)*45.);
  // Paired spiracles and a narrow dorsal ridge give the central disc anatomy.
  float vent = exp(-pow((abs(vLocal.x)-37.)/9.,2.) - pow((t-.29)/.019,2.));
  skin *= 1. - vent * .72;
  skin += exp(-pow(vLocal.x/3.,2.)) * sin(t*3.14159) * vec3(.10,.22,.21);
  float caustic = pow(.5+.5*sin(vLocal.x*.028 + vLocal.y*.024 + sin(vLocal.y*.04-uTime*.5)*1.8 + uTime*.6),15.);
  skin += caustic * vec3(.035,.095,.11);
  if (uPart > .5) {
    skin = mix(vec3(.045,.12,.19),vec3(.14,.34,.41),light);
    skin *= .7 + .3 * cos((vUV.x-.5)*3.14159);
    skin += uGlow * exp(-pow((vUV.x-.5)*13.,2.)) * vec3(.05,.32,.34);
    skin += uGlow * pow(.5+.5*sin(t*130.),18.) * vec3(.035,.10,.12);
  }
  finalColor = vec4(skin,1.);
}`;

function mesh(rows: number, columns: number, part: number) {
  const positions = new Float32Array((rows + 1) * (columns + 1) * 2);
  const uvs = new Float32Array(positions.length);
  const indices = new Uint32Array(rows * columns * 6);
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
    const i = (y * (columns + 1) + x) * 2;
    positions[i] = x / columns * 1200; positions[i+1] = y / rows * 1000;
    uvs[i] = x / columns; uvs[i+1] = y / rows;
  }
  let index = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const i = y * (columns+1) + x;
    indices[index++] = i; indices[index++] = i+1; indices[index++] = i+columns+1;
    indices[index++] = i+1; indices[index++] = i+columns+2; indices[index++] = i+columns+1;
  }
  const geometry = new MeshGeometry({ positions, uvs, indices });
  geometry.batchMode = 'no-batch';
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex, fragment, name: 'mythic-ray', preferredFragmentPrecision: 'highp' }),
    resources: { ray: {
      uTime: { value: 0, type: 'f32' }, uAmplitude: { value: 1, type: 'f32' },
      uTailAmplitude: { value: 1, type: 'f32' }, uGlow: { value: 1, type: 'f32' },
      uPart: { value: part, type: 'f32' }, uSize: { value: new Float32Array([1200,1000]), type: 'vec2<f32>' },
    } },
  });
  const result = new Mesh({ geometry, shader }); result.eventMode = 'none';
  return result;
}

export class Stingray {
  readonly texture = RenderTexture.create({ width: 1200, height: 1000, resolution: 1, dynamic: true });
  private source = new Container();
  private body = mesh(94,116,0);
  private tail = mesh(190,8,1);
  private width = 1200;
  private height = 1000;
  constructor() { this.source.addChild(this.tail,this.body); }

  resize(width: number, height: number, quality: Quality) {
    this.width = width; this.height = height;
    this.texture.resize(width,height,quality === 'fine' ? 1 : .65);
    for (const item of [this.body,this.tail]) {
      item.shader!.resources.ray.uniforms.uSize[0] = width;
      item.shader!.resources.ray.uniforms.uSize[1] = height;
    }
  }

  render(app: Application, time: number, settings: Settings) {
    for (const item of [this.body,this.tail]) {
      const u = item.shader!.resources.ray.uniforms;
      u.uTime = time * settings.swimSpeed; u.uAmplitude = settings.finAmplitude;
      u.uTailAmplitude = settings.tailAmplitude; u.uGlow = settings.glow;
    }
    app.renderer.render({ container: this.source, target: this.texture, clear: true });
  }
}
