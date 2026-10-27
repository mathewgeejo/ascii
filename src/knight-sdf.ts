// The knight is modelled procedurally as signed-distance armour (no raster artwork) and lit once
// into the static source canvas. World units: 1 = 100 scene px, origin at the stage centre, y up.
const vertex = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0., 1.); }`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 uSize;
out vec4 outColor;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.) / k1; }
float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float ra, float rb, out float h) {
  vec3 pa = p - a, ba = b - a; h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.);
  return length(pa - ba * h) - mix(ra, rb, h);
}
float sdCylinder(vec3 q, float r, float h, float rr) {
  vec2 d = vec2(length(q.xz) - r + rr, abs(q.y) - h + rr);
  return min(max(d.x, d.y), 0.) + length(max(d, 0.)) - rr;
}
// Overlapping lames: a dark gap at each boundary and each plate thickening toward its lower lip.
float lames(float t, float depth) { float f = fract(t); float gap = 1. - smoothstep(0., .08, min(f, 1. - f)); return depth * (1.5 * gap - .6 * f); }
float rivets(vec2 uv, float spacing, float r) { vec2 c = vec2((fract(uv.x / spacing) - .5) * spacing, uv.y); return smoothstep(r, r * .3, length(c)); }

vec2 U(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
const float STEEL = 1., MAIL = 2., CLOTH = 3., BLADE = 4., LEATHER = 5., LINEN = 6.;

float helmet(vec3 p) {
  vec3 q = p - vec3(.62, 2.16, .72);
  q.xy = rot(.28) * q.xy; q.yz = rot(-.5) * q.yz;
  float r = .64 - .04 * q.y;
  float d = sdCylinder(q, r, .76, .12);
  d -= .035 * smoothstep(.07, 0., abs(q.x)) * smoothstep(0., .3, q.z);
  d -= .022 * smoothstep(.07, .02, abs(q.y - .36));
  d += .02 * (1. - smoothstep(0., .02, abs(q.y - .47))) + .02 * (1. - smoothstep(0., .02, abs(q.y - .25)));
  d += .02 * (1. - smoothstep(0., .02, abs(q.y - .66)));
  d = max(d, -sdRoundBox(q - vec3(-.34, .08, .62), vec3(.25, .04, .3), .01));
  d = max(d, -sdRoundBox(q - vec3(.34, .08, .62), vec3(.25, .04, .3), .01));
  if (q.z > 0. && q.x > .08 && q.x < .52 && q.y > -.62 && q.y < -.12) {
    vec2 f = fract(q.xy / .1) - .5; d += .05 * smoothstep(.3, .2, length(f));
  }
  if (q.z > 0. && q.x < -.14 && q.x > -.5 && q.y > -.6 && q.y < -.2) d += .045 * (1. - smoothstep(0., .03, abs(fract(q.y / .13) - .5) * .13));
  d -= .028 * rivets(vec2(atan(q.x, q.z) * r, q.y - .36), .19, .045);
  d -= .022 * rivets(vec2(atan(q.x, q.z) * r, q.y + .72), .17, .04);
  return d;
}

vec2 sword(vec3 p) {
  vec3 q = p - vec3(-1.36, -1.3, .25);
  float w = .1 * smoothstep(-2.78, -2.15, q.y);
  float blade = max(max(abs(q.x) - w, abs(q.z) - .035 + .025 * abs(q.x) / .1), abs(q.y) - 2.75);
  blade += .012 * smoothstep(.026, 0., abs(q.x)) * step(-1.9, q.y);
  vec2 res = vec2(blade, BLADE);
  float h;
  float guard = sdCapsule(p, vec3(-2.08, 1.47, .25), vec3(-.64, 1.53, .25), .065, .065, h);
  guard = min(guard, length(p - vec3(-2.12, 1.46, .25)) - .1);
  guard = min(guard, length(p - vec3(-.6, 1.54, .25)) - .1);
  guard = min(guard, sdRoundBox(p - vec3(-1.36, 1.5, .25), vec3(.15, .1, .08), .03));
  float pommel = length((p - vec3(-1.36, 3.12, .25)) * vec3(1., 1., 1.6)) - .18;
  pommel += .02 * (1. - smoothstep(0., .02, abs(length((p - vec3(-1.36, 3.12, .25)).xy) - .1)));
  res = U(res, vec2(min(guard, pommel), STEEL));
  float grip = sdCapsule(p, vec3(-1.36, 1.58, .25), vec3(-1.36, 2.96, .25), .085, .08, h);
  grip += .014 * smoothstep(.3, .9, sin((p.y + p.x * .3) * 48.));
  return U(res, vec2(grip, LEATHER));
}

float torso(vec3 p) {
  vec3 q = p - vec3(.95, .4, .05); q.yz = rot(-.45) * q.yz;
  float d = sdEllipsoid(q, vec3(.88, 1.12, .64));
  d -= .03 * smoothstep(.08, 0., abs(q.x)) * step(0., q.z);
  d += lames(q.y * 7. + .2, .022) * smoothstep(-.3, -.5, q.y);
  vec3 g = p - vec3(.75, 1.52, .3);
  float gorget = sdCylinder(g, .5, .22, .06) + lames(g.y * 9., .02);
  d = min(d, gorget);
  vec3 f = p - vec3(.95, -.85, .12);
  float fauld = sdEllipsoid(f, vec3(.92, .45, .7)) + lames(f.y * 7.5 + .5, .024);
  fauld -= .02 * rivets(vec2(atan(f.x, f.z) * .8, fract(f.y * 7.5 + .5) / 7.5 - .03), .2, .035);
  return min(d, fauld);
}

float tasset(vec3 p, vec3 c, float lean) {
  vec3 q = p - c; q.xy = rot(lean) * q.xy; q.yz = rot(-.3) * q.yz;
  return sdRoundBox(q, vec3(.34, .42, .05), .04) + lames(q.y * 5. + .5, .02);
}

float pauldrons(vec3 p) {
  vec3 q = p - vec3(2., 1.5, 0.); q.xy = rot(.25) * q.xy;
  float d = max(sdEllipsoid(q, vec3(1.1, .86, .85)), -q.y - .68);
  float t = q.y * 5. + .3;
  d += lames(t, .03);
  d -= .024 * rivets(vec2(atan(q.x, q.z) * .9, (fract(t) - .22) / 5.), .22, .035);
  vec3 f = p - vec3(0., 1.4, .5); f.xy = rot(-.4) * f.xy;
  float front = max(sdEllipsoid(f, vec3(.62, .55, .55)), -f.y - .42) + lames(f.y * 6. + .4, .026);
  front -= .022 * rivets(vec2(atan(f.x, f.z) * .55, (fract(f.y * 6. + .4) - .22) / 6.), .17, .032);
  return min(d, front);
}

float fist(vec3 p, vec3 c, float a) {
  vec3 q = p - c; q.xy = rot(a) * q.xy;
  float d = sdRoundBox(q, vec3(.25, .29, .24), .11);
  d += lames(q.y * 8. + .5, .026) * smoothstep(-.05, .15, q.z);
  return d;
}

float arms(vec3 p) {
  float h;
  float d = sdCapsule(p, vec3(.02, 1.05, .55), vec3(-.12, .25, 1.), .27, .24, h);
  d = min(d, length(p - vec3(-.12, .25, 1.02)) - .3);
  d = min(d, sdEllipsoid(p - vec3(-.3, .22, 1.1), vec3(.16, .26, .12)));
  float fore = sdCapsule(p, vec3(-.12, .25, 1.), vec3(-.98, 1.62, .55), .24, .2, h) + lames(h * 4. + .5, .016);
  fore -= .02 * smoothstep(.06, 0., abs(dot(normalize(p - vec3(-.55, .93, .78)), vec3(0., 0., 1.)) - 1.));
  d = min(d, fore);
  d = min(d, sdCapsule(p, vec3(-.86, 1.44, .6), vec3(-1.06, 1.75, .5), .28, .27, h) + lames(h * 3., .02));
  d = min(d, fist(p, vec3(-1.3, 1.86, .38), .2));
  d = min(d, sdCapsule(p, vec3(-1.12, 2.06, .62), vec3(-1.36, 2.22, .62), .1, .085, h));
  float upper = sdCapsule(p, vec3(2.4, .95, -.05), vec3(2.58, -.25, .35), .32, .28, h) + lames(h * 6., .022);
  d = min(d, upper);
  d = min(d, length(p - vec3(2.6, -.25, .38)) - .33);
  d = min(d, sdEllipsoid(p - vec3(2.85, -.28, .35), vec3(.12, .28, .2)));
  d = min(d, sdCapsule(p, vec3(2.58, -.25, .35), vec3(2.02, -1.15, 1.52), .27, .22, h) + lames(h * 4. + .5, .016));
  d = min(d, fist(p, vec3(1.8, -1.45, 1.72), -.5));
  return d;
}

float legs(vec3 p) {
  float h;
  float d = sdCapsule(p, vec3(.55, -1.5, .25), vec3(.32, -3.5, 1.05), .45, .37, h);
  d -= .025 * smoothstep(.1, 0., abs(p.x - .45 + (p.y + 1.5) * .1)) * step(.5, p.z);
  d = min(d, length(p - vec3(.32, -3.52, 1.2)) - .38 + lames(atan(p.y + 3.52, p.x - .32) * 1.2, .015));
  d = min(d, sdEllipsoid(p - vec3(.68, -3.48, 1.12), vec3(.16, .26, .1)));
  d = min(d, sdCapsule(p, vec3(.38, -3.68, .95), vec3(1.3, -3.8, -.5), .33, .24, h));
  d = min(d, sdCapsule(p, vec3(1.3, -3.85, -.5), vec3(1.9, -3.95, -.75), .2, .14, h) + lames(h * 5., .02));
  d = min(d, sdCapsule(p, vec3(1.4, -1.45, .1), vec3(2.1, -1.75, 1.7), .45, .38, h) + lames(h * 2.5, .016));
  d = min(d, length(p - vec3(2.12, -1.74, 1.86)) - .38);
  d = min(d, sdEllipsoid(p - vec3(2.48, -1.72, 1.7), vec3(.14, .3, .16)));
  float greave = sdCapsule(p, vec3(2.12, -1.9, 1.72), vec3(2.15, -3.68, 1.45), .34, .25, h);
  greave -= .03 * smoothstep(.09, 0., abs(p.x - 2.13)) * step(1.6, p.z + .1);
  d = min(d, greave);
  d = min(d, sdCapsule(p, vec3(2.15, -3.76, 1.5), vec3(1.8, -4., 2.2), .28, .15, h) + lames(h * 6., .022));
  return d;
}

float cloak(vec3 p) {
  vec3 q = p - vec3(2.95, -1.3, -.75);
  q.z += .09 * sin(q.x * 13. + q.y * 1.4) + .04 * sin(q.x * 31.);
  float halfWidth = .5 + .22 * clamp(-q.y / 2.5, 0., 1.);
  float d = sdRoundBox(q, vec3(halfWidth, 2.6, .045), .03);
  float hem = -2.15 - .45 * noise(vec3(q.x * 9., 0., 1.)) - .25 * step(.5, fract(q.x * 4.3));
  d = max(d, hem - q.y);
  d = max(d, -(length((q.xy - vec2(.1, -.9)) * vec2(3., 1.)) - .12));
  return d;
}

// Surcoat panel hanging between the knees; seeded tears along the hem.
float tabard(vec3 p) {
  vec3 q = p - vec3(.98, -2.25, .82); q.yz = rot(.18) * q.yz;
  q.z += .045 * sin(q.x * 19.) * smoothstep(.9, -.9, q.y);
  float halfWidth = .3 + .1 * clamp(-q.y, 0., 1.);
  float d = sdRoundBox(q, vec3(halfWidth, 1.05, .03), .02);
  float hem = -.9 - .22 * noise(vec3(q.x * 11., 3., 0.)) - .15 * step(.6, fract(q.x * 5.1));
  return max(d, hem - q.y);
}
float belt(vec3 p) {
  float band = sdEllipsoid(p - vec3(.95, -1.15, .14), vec3(.96, .09, .74));
  return min(band, sdRoundBox(p - vec3(.98, -1.16, .86), vec3(.12, .1, .05), .02));
}

vec2 map(vec3 p) {
  vec2 res = sword(p);
  float steel = min(min(min(helmet(p), torso(p)), min(pauldrons(p), arms(p))), legs(p));
  steel = min(steel, min(tasset(p, vec3(.5, -1.55, .72), .12), tasset(p, vec3(1.38, -1.5, .72), -.15)));
  res = U(res, vec2(steel, STEEL));
  res = U(res, vec2(sdEllipsoid(p - vec3(.95, -1.4, .05), vec3(.82, .55, .58)), MAIL));
  res = U(res, vec2(cloak(p), CLOTH));
  return U(res, vec2(min(tabard(p), belt(p)), LINEN));
}

vec3 normalAt(vec3 p) {
  const vec2 k = vec2(1., -1.); const float e = .0015;
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x + k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x);
}

float shadow(vec3 ro, vec3 rd) {
  float res = 1., t = .03;
  for (int i = 0; i < 40 && t < 4.; i++) { float h = map(ro + rd * t).x; res = min(res, 9. * h / t); if (res < .01) break; t += clamp(h, .02, .3); }
  return clamp(res, 0., 1.);
}

float occlusion(vec3 p, vec3 n) {
  float o = 0., s = 1.;
  for (int i = 1; i <= 5; i++) { float h = .04 * float(i) * float(i); o += (h - map(p + n * h).x) * s; s *= .6; }
  return clamp(1. - 2.2 * o, 0., 1.);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 ro = vec3(uv.x * 8. - 4., uv.y * 10. - 5., 6.), rd = vec3(0., 0., -1.);
  if (ro.x < -2.4 || ro.x > 3.9 || ro.y > 3.6 || ro.y < -4.35) { outColor = vec4(0.); return; }
  float t = 0.; vec2 hit = vec2(-1.);
  for (int i = 0; i < 160; i++) {
    vec2 h = map(ro + rd * t);
    if (h.x < .0015) { hit = vec2(t, h.y); break; }
    t += h.x * .85;
    if (t > 12.) break;
  }
  if (hit.x < 0.) { outColor = vec4(0.); return; }
  vec3 p = ro + rd * hit.x, n = normalAt(p), v = -rd;
  vec3 light = normalize(vec3(-.55, .62, .58));
  float dif = clamp(dot(n, light), 0., 1.);
  float sh = shadow(p + n * .01, light), ao = occlusion(p, n);
  float spec = pow(clamp(dot(reflect(-light, n), v), 0., 1.), 22.);
  float rim = pow(1. - clamp(dot(n, v), 0., 1.), 3.) * clamp(dot(n, normalize(vec3(.8, .2, -.3))) + .3, 0., 1.);
  float grime = .82 + .18 * noise(p * 16.) - .12 * smoothstep(.62, .7, noise(p * vec3(40., 5., 40.)));
  vec3 albedo = vec3(.9, .85, .77) * grime;
  float shine = .85;
  if (hit.y == MAIL) {
    vec2 ring = fract(vec2(p.x * 18. + floor(p.y * 22.) * .5, p.y * 22.)) - .5;
    albedo = vec3(.62, .58, .53) * (.25 + .75 * smoothstep(.18, .3, length(ring)) * smoothstep(.5, .38, length(ring)));
    shine = .4;
  } else if (hit.y == CLOTH) {
    albedo = vec3(.6, .56, .51) * (.8 + .3 * noise(p * vec3(30., 3., 30.))); shine = 0.;
  } else if (hit.y == BLADE) {
    albedo = vec3(.78, .76, .73) * (.9 + .1 * noise(p * 30.)); shine = 1.1;
  } else if (hit.y == LINEN) {
    albedo = vec3(.86, .81, .72) * (.82 + .25 * noise(p * vec3(6., 40., 6.))); shine = .05;
  } else if (hit.y == LEATHER) {
    albedo = vec3(.3, .25, .21); shine = .15;
  }
  vec3 col = albedo * (.05 + 1.08 * dif * sh) * ao;
  col += vec3(1., .97, .91) * spec * shine * sh * ao;
  col += albedo * rim * .32 * ao;
  col += albedo * .1 * clamp(dot(n, normalize(vec3(.8, .1, .5))), 0., 1.) * ao;
  col = pow(col, vec3(.92));
  outColor = vec4(col, 1.);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Knight shader: ${gl.getShaderInfoLog(shader)}`);
  return shader;
}

/** Ray-marches the armour once on a throwaway WebGL2 context and copies it into `target`. */
export function bakeKnight(target: CanvasRenderingContext2D, width = 560, height = 700) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error('WebGL2 is required to model the knight.');
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Knight program: ${gl.getProgramInfoLog(program)}`);
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(gl.getUniformLocation(program, 'uSize'), width, height);
  gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  target.imageSmoothingQuality = 'high';
  target.drawImage(canvas, 0, 0, target.canvas.width, target.canvas.height);
  gl.deleteBuffer(buffer); gl.deleteProgram(program);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}
