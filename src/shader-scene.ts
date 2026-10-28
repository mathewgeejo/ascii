import { Container, GlProgram, Mesh, MeshGeometry, RenderTarget, RenderTexture, Shader, type Application } from 'pixi.js';
import type { Quality, Settings } from './config';

const vertex = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
void main() { vUV = aUV; gl_Position = vec4(aPosition, 0., 1.); }
`;

/** Procedural 3D geometry rendered on the GPU before the shared ASCII pass. */
export class ShaderScene {
  readonly texture = RenderTexture.create({ width: 1200, height: 1000, resolution: .8, dynamic: true });
  protected source = new Container();
  protected shader: Shader;
  private target = new RenderTarget({ colorTextures: [this.texture.source], depth: true });

  constructor(fragment: string, name: string) {
    this.shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name, preferredFragmentPrecision: 'highp' }),
      resources: { scene: {
        uSize: { value: new Float32Array([1200, 1000]), type: 'vec2<f32>' },
        uTime: { value: 0, type: 'f32' },
        uMotion: { value: 1, type: 'f32' },
        uDetail: { value: 1, type: 'f32' },
        uParticles: { value: 1, type: 'f32' },
        uGlow: { value: 1, type: 'f32' },
        uScale: { value: 1, type: 'f32' },
      } },
    });
    const geometry = new MeshGeometry({
      positions: new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
    });
    geometry.batchMode = 'no-batch';
    const mesh = new Mesh({ geometry, shader: this.shader }); mesh.eventMode = 'none';
    this.source.addChild(mesh);
  }

  resize(width: number, height: number, quality: Quality) {
    this.shader.resources.scene.uniforms.uSize.set([width, height]);
    this.texture.resize(width, height, quality === 'fine' ? .8 : .5);
  }

  render(app: Application, time: number, settings: Settings) {
    const u = this.shader.resources.scene.uniforms;
    u.uTime = time * settings.swimSpeed; u.uMotion = settings.finAmplitude;
    u.uDetail = settings.tailAmplitude; u.uParticles = settings.water;
    u.uGlow = settings.glow; u.uScale = settings.scale;
    app.renderer.render({ container: this.source, target: this.target, clear: true });
  }
}
