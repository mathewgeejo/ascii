import { Assets, Buffer, BufferUsage, Geometry, GlProgram, Mesh, Shader, State, type Application, type Texture } from 'pixi.js';
import type { Settings } from './config';
import { ShaderScene } from './shader-scene';
import { spaceFragment } from './space';
import modelUrl from './assets/skull/mesh.bin?url';
import colorUrl from './assets/skull/bone.jpg';
import normalUrl from './assets/skull/normal.png';
import occlusionUrl from './assets/skull/occlusion.jpg';

// Actual human-made anatomical geometry (CDmir, 2018, CC0), not primitive shapes
// approximating a face. Reference/provenance is in assets/skull/LICENSE.md.
const transform = `
uniform vec2 uSize;
uniform float uTime;
uniform float uMotion;
uniform float uScale;
mat2 rotate(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
vec3 orient(vec3 p) {
  p.xz=rotate(.23+uTime*.28*uMotion)*p.xz;
  p.xy=rotate(sin(uTime*.27)*.025*uMotion)*p.xy;
  return p;
}
vec3 place(vec3 p) {
  p=orient(p);
  p.x+=sin(uTime*.22)*.055*uMotion;
  p.y+=sin(uTime*.48)*.075*uMotion;
  p.z+=sin(uTime*.19)*.045*uMotion;
  return p;
}
vec4 project(vec3 p) {
  float distance=5.2-p.z;
  float aspect=uSize.x/uSize.y;
  float focal=2.30*uScale/max(1.,.55/aspect);
  return vec4(p.x*focal/aspect,p.y*focal,1.004008*distance-.2004008,distance);
}`;

const boneVertex = `
in vec3 aPosition;
in vec3 aNormal;
in vec2 aUV;
in vec4 aTangent;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUV;
out vec4 vTangent;
${transform}
void main() {
  vWorld=place(aPosition); vNormal=orient(aNormal); vUV=vec2(aUV.x,1.-aUV.y);
  vTangent=vec4(orient(aTangent.xyz),aTangent.w);
  gl_Position=project(vWorld);
}`;
const boneFragment = `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUV;
in vec4 vTangent;
out vec4 finalColor;
uniform sampler2D uBone;
uniform sampler2D uNormal;
uniform sampler2D uOcclusion;
uniform float uDetail;
void main() {
  vec3 n=normalize(vNormal);
  vec3 view=normalize(vec3(0,0,5.2)-vWorld);
  if(dot(n,view)<0.)n=-n;
  vec3 t=normalize(vTangent.xyz-n*dot(n,vTangent.xyz));
  vec3 b=cross(n,t)*vTangent.w;
  vec3 detail=texture(uNormal,vUV).xyz*2.-1.;
  n=normalize(n+(.58*uDetail)*(t*detail.x+b*detail.y));
  vec3 albedo=texture(uBone,vUV).rgb;
  // Preserve the original bone texture while keeping the palette natural and pale.
  float grey=dot(albedo,vec3(.299,.587,.114));
  albedo=mix(albedo,grey*vec3(1.03,1.01,.96),.35);
  float ao=texture(uOcclusion,vUV).r;
  vec3 key=normalize(vec3(-.65,.85,1.));
  float diffuse=max(0.,dot(n,key));
  float fill=max(0.,dot(n,normalize(vec3(.8,.1,.6))));
  float rim=pow(max(0.,dot(n,normalize(vec3(.3,.4,-1.)))),2.);
  vec3 color=albedo*(.18+diffuse*.82+fill*.18)*mix(.10,1.,ao);
  color+=vec3(.075,.09,.10)*rim*ao;
  float shine=pow(max(0.,dot(reflect(-key,n),view)),35.);
  color+=shine*.055*ao;
  finalColor=vec4(color,1.);
}`;

const beamVertex = `
in vec3 aPosition;
in float aOpacity;
out float vOpacity;
${transform}
void main() { vOpacity=aOpacity; gl_Position=project(place(aPosition)); }
`;
const beamFragment = `
in float vOpacity;
out vec4 finalColor;
uniform float uPower;
void main() { float a=vOpacity*uPower; finalColor=vec4(vec3(1.,.018,.006)*a,a); }
`;

function beamGeometry() {
  const positions: number[] = [], opacity: number[] = [], indices: number[] = [];
  for (const eye of [-1, 1]) for (const [radius, alpha] of [[.008, .95], [.025, .15], [.055, .035]]) {
    const first = positions.length / 3;
    for (let end = 0; end < 2; end++) for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      positions.push(eye * .39 + Math.cos(angle) * radius, .20 + Math.sin(angle) * radius, .68 + end * 18);
      opacity.push(alpha);
    }
    for (let i = 0; i < 12; i++) {
      const a = first + i, b = first + (i + 1) % 12;
      indices.push(a, b, a + 12, b, b + 12, a + 12);
    }
  }
  return new Geometry({ attributes: {
    aPosition: { buffer: new Float32Array(positions), format: 'float32x3' },
    aOpacity: { buffer: new Float32Array(opacity), format: 'float32' },
  }, indexBuffer: new Uint32Array(indices) });
}

export class SpaceSkull extends ShaderScene {
  private bone?: Mesh<Geometry, Shader>;
  private beams?: Mesh<Geometry, Shader>;
  private loading?: Promise<void>;

  constructor() { super(spaceFragment, 'skull-deep-space'); }

  load() { return this.loading ??= this.loadModel(); }

  private async loadModel() {
    const [response, color, normal, ao] = await Promise.all([
      fetch(modelUrl), Assets.load<Texture>(colorUrl), Assets.load<Texture>(normalUrl), Assets.load<Texture>(occlusionUrl),
    ]);
    if (!response.ok) throw new Error('Unable to load the skull geometry.');
    const data = await response.arrayBuffer(), header = new Uint32Array(data, 0, 2);
    const vertexData = new Float32Array(data, 8, header[0] * 12);
    const indexData = new Uint32Array(data, 8 + vertexData.byteLength, header[1]);
    const buffer = new Buffer({ data: vertexData, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    const geometry = new Geometry({ attributes: {
      aPosition: { buffer, format: 'float32x3', stride: 48, offset: 0 },
      aNormal: { buffer, format: 'float32x3', stride: 48, offset: 12 },
      aUV: { buffer, format: 'float32x2', stride: 48, offset: 24 },
      aTangent: { buffer, format: 'float32x4', stride: 48, offset: 32 },
    }, indexBuffer: indexData });
    const uniforms = () => ({
      uTime: { value: 0, type: 'f32' as const }, uMotion: { value: 1, type: 'f32' as const },
      uScale: { value: 1, type: 'f32' as const }, uSize: { value: new Float32Array([1200, 1000]), type: 'vec2<f32>' as const },
    });
    const boneShader = new Shader({
      glProgram: GlProgram.from({ vertex: boneVertex, fragment: boneFragment, name: 'anatomical-skull', preferredFragmentPrecision: 'highp' }),
      resources: { uBone: color.source, uNormal: normal.source, uOcclusion: ao.source,
        model: { ...uniforms(), uDetail: { value: 1, type: 'f32' } } },
    });
    const state = State.for2d(); state.blend = false; state.depthTest = true; state.depthMask = true;
    this.bone = new Mesh({ geometry, shader: boneShader, state }); this.bone.eventMode = 'none';
    const beamShader = new Shader({
      glProgram: GlProgram.from({ vertex: beamVertex, fragment: beamFragment, name: 'occasional-red-lasers' }),
      resources: { model: { ...uniforms(), uPower: { value: 0, type: 'f32' } } },
    });
    const beamState = State.for2d(); beamState.blendMode = 'add'; beamState.depthTest = true; beamState.depthMask = false;
    this.beams = new Mesh({ geometry: beamGeometry(), shader: beamShader, state: beamState });
    this.beams.eventMode = 'none'; this.beams.visible = false;
    this.source.addChild(this.bone, this.beams);
  }

  override render(app: Application, time: number, settings: Settings) {
    const t = time * settings.swimSpeed;
    const phase = t % (Math.PI * 2 / .28);
    const ramp = (a: number, b: number, n: number) => {
      const x = Math.max(0, Math.min(1, (n - a) / (b - a))); return x * x * (3 - 2 * x);
    };
    const power = ramp(20.1, 20.14, phase) * (1 - ramp(20.38, 20.43, phase)) * settings.glow;
    for (const item of [this.bone, this.beams]) if (item) {
      const u = item.shader!.resources.model.uniforms;
      u.uTime = t; u.uMotion = settings.finAmplitude; u.uScale = settings.scale;
      u.uSize.set(this.shader.resources.scene.uniforms.uSize);
      if (item === this.bone) u.uDetail = settings.tailAmplitude;
      else { u.uPower = power; item.visible = power > .001; }
    }
    super.render(app, time, settings);
  }
}
