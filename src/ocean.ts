// Analytic wave field, finite-difference normals, refracted caustics and current-borne plankton.
// All coordinates are world/grid coordinates, so patterns do not crawl with the glyph atlas.
export const oceanGLSL = `
uniform float uTime;
uniform float uWater;
float heightField(vec2 p, float t) {
  return sin(p.x * .019 + p.y * .011 + t * .48) * .65
    + sin(p.x * -.012 + p.y * .025 - t * .36) * .45
    + sin(p.x * .035 + p.y * .031 + sin(p.x * .008 - t * .22) * 2.) * .24;
}
vec3 ocean(vec2 p) {
  vec2 uv = p / uSceneSize;
  float t = uTime * .7;
  float h = heightField(p,t);
  vec2 gradient = vec2(heightField(p+vec2(2.,0.),t)-h,heightField(p+vec2(0.,2.),t)-h);
  vec3 normal = normalize(vec3(-gradient * 8.,1.));
  float lighting = max(0.,dot(normal,normalize(vec3(-.35,-.6,1.))));
  float vignette = 1. - smoothstep(.26,.85,length((uv-.5)*vec2(1.,.75)));
  vec3 deep = mix(vec3(.001,.004,.011),vec3(.008,.025,.042),pow(1.-uv.y,2.));
  // Focusing of several wave trains forms the drifting thin network of caustic light.
  float c1 = abs(sin(p.x*.013 + p.y*.021 + h*1.7 + t*.15));
  float c2 = abs(sin(p.x*-.021 + p.y*.014 + h*1.2 - t*.12));
  float caustic = pow(1.-min(c1,c2),23.);
  float floorMask = smoothstep(.49,.92,uv.y);
  vec3 water = vec3(.024,.11,.15) * caustic * floorMask * (lighting*.6+.4);
  water += vec3(.008,.026,.039) * pow(.5+.5*sin(p.x*.012+sin(p.y*.01-t*.14)*2.),12.) * (1.-uv.y);
  // Water surface, seen from below: broken elongated highlights rather than a horizon image.
  float surface = exp(-pow((uv.y-.115)/.057,2.));
  water += vec3(.018,.080,.105) * pow(.5+.5*sin(p.y*.17+h*4.+sin(p.x*.014+t*.2)*2.),8.) * surface;
  float shaft = pow(max(0.,sin(uv.x*24. + uv.y*4. + sin(t*.13)*.3)),26.);
  water += vec3(.008,.028,.04) * shaft * pow(1.-uv.y,2.);
  // Two spatial particle grids drift at different depths, fading at their cell boundaries.
  for (int layer=0; layer<2; layer++) {
    float l = float(layer);
    vec2 gp = (p + vec2(t*(9.+l*5.), t*(-3.-l))) / (57.+l*42.);
    vec2 id = floor(gp), f = fract(gp);
    vec2 pos = vec2(hash(id+13.+l),hash(id+87.+l))*.64+.18;
    float particle = exp(-dot((f-pos)*vec2(1.,1.6),(f-pos)*vec2(1.,1.6))*3200.);
    particle *= step(.36,hash(id+5.)) * (.55 + .45*sin(t*.32+hash(id)*6.));
    water += particle * vec3(.10,.25,.28) / (1.+l);
  }
  return deep + water * uWater * vignette;
}`;
