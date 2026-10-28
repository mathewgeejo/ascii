import { spaceGLSL } from './space';
import { oceanGLSL } from './ocean';

export const backgroundGLSL = `
uniform float uBackground;
uniform float uParticles;
uniform float uTime;
uniform float uWater;
${spaceGLSL}
${oceanGLSL.replace('uniform float uTime;','').replace('uniform float uWater;','')}
vec3 environment(vec2 uv) {
  if(uBackground<.5)return deepSpace(uv);
  if(uBackground<1.5)return ocean(uv*uSceneSize);
  if(uBackground<2.5)return vec3(0.);
  vec2 p=(uv-.5)*vec2(uSceneSize.x/uSceneSize.y,1.);
  float light=exp(-dot(p,p)*2.8);
  return mix(vec3(.004,.003,.01),vec3(.065,.035,.11),light);
}`;

export const backgroundFragment = `
in vec2 vUV;
out vec4 finalColor;
uniform vec2 uSize;
#define uSceneSize uSize
${backgroundGLSL}
void main() { finalColor=vec4(environment(vUV),1.); }
`;
