// Entirely procedural deep space, rendered through the same ASCII cells as the skull.
// Star cores span multiple source pixels so they survive the character-grid sampling.
export const spaceFragment = `
in vec2 vUV;
out vec4 finalColor;
uniform vec2 uSize;
uniform float uTime;
uniform float uParticles;

float hash(vec2 p) {
  p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
mat2 turn(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float cloud(vec2 p) {
  float sum=0.,weight=.55;
  for(int i=0;i<4;i++) {
    sum+=noise(p)*weight;
    p=mat2(.8,-.6,.6,.8)*p*2.03+vec2(17.17,9.41); weight*=.48;
  }
  return sum;
}

vec3 nebula(vec2 p,vec2 drift) {
  vec2 q=turn(-.48)*p;
  vec2 clouds=q*3.4+drift*.23;
  float large=cloud(clouds+vec2(4.2,13.7));
  float fine=cloud(clouds*3.1+large*1.8);
  float lane=q.y+.035*sin(q.x*3.2)+.085*(large-.5);
  float band=exp(-pow(lane/.20,2.));
  float wisp=pow(max(0.,fine-.28),1.7)*band;
  float dust=smoothstep(.24,.65,cloud(clouds*5.3+vec2(8.6,2.4)));
  vec3 tint=mix(vec3(.035,.055,.12),vec3(.080,.038,.13),smoothstep(.25,.75,large));
  vec3 color=tint*wisp*5.3*(.3+.7*dust);
  color+=vec3(.010,.017,.036)*band*(.25+large*.55);
  // The denser dust lanes interrupt the glow, leaving large stretches of deep black.
  float centre=.60+.40*smoothstep(.12,.58,length(p*vec2(.75,1.)));
  return color*centre*uParticles;
}

vec3 stars(vec2 p,vec2 drift) {
  vec3 color=vec3(0.);
  for(int layer=0;layer<4;layer++) {
    float l=float(layer),size=78.-l*18.;
    vec2 gp=(p+drift*(.35+l*.65))*size+vec2(l*51.,l*19.);
    vec2 id=floor(gp),f=fract(gp)-.5;
    vec2 q=f-(vec2(hash(id+13.),hash(id+57.))*.64-.32);
    float seed=hash(id+79.);
    float enabled=step(l>2.5?.985:.975-l*.008,seed);
    float radius=size*(.00075+l*.00043+hash(id+93.)*.0006);
    float distance=dot(q,q)/(radius*radius);
    float core=exp(-distance*1.3);
    float glow=exp(-distance*.11)*.055;
    float brightness=.38+.62*hash(id+141.);
    float twinkle=.86+.14*sin(uTime*(.15+hash(id)*.26)+hash(id+123.)*40.);
    vec3 tint=mix(vec3(.55,.69,.95),vec3(.94,.88,.74),hash(id+165.));
    color+=(core+glow)*enabled*brightness*twinkle*tint;
    // A handful of nearer stars show faint, slender diffraction spikes.
    if(l>2.5&&seed>.995) {
      vec2 s=q/size;
      float spike=exp(-abs(s.x)*3300.-abs(s.y)*230.)+exp(-abs(s.y)*3300.-abs(s.x)*230.);
      color+=spike*.23*tint*twinkle;
    }
  }
  return color*uParticles;
}

vec3 ringedPlanet(vec3 background,vec2 p) {
  p=turn(-.37)*p;
  float radius=.070,dist=length(p);
  float ring=length(p/vec2(1.,.28));
  float rings=smoothstep(.095,.100,ring)*(1.-smoothstep(.156,.163,ring));
  float bands=.33+.67*pow(.5+.5*sin(ring*2450.),2.);
  vec3 ringColor=vec3(.18,.22,.28)*rings*bands;
  if(p.y<0.)background+=ringColor;
  // Thin atmospheric light appears only around the illuminated limb.
  background+=vec3(.035,.065,.10)*exp(-abs(dist-radius)*1400.)*(1.-smoothstep(-.06,.02,p.x));
  if(dist<radius) {
    vec3 n=vec3(p/radius,sqrt(max(0.,1.-dist*dist/(radius*radius))));
    float light=.026+.72*max(0.,dot(n,normalize(vec3(-.7,-.4,.5))));
    float stripes=.83+.17*sin(p.y*480.+sin(p.x*60.)*.6);
    background=vec3(.32,.41,.49)*light*stripes;
    background+=vec3(.10,.17,.23)*pow(1.-n.z,5.)*.18;
  }
  if(p.y>=0.)background+=ringColor;
  return background;
}

vec3 distantMoon(vec3 background,vec2 p) {
  float radius=.025,dist=length(p);
  if(dist<radius) {
    vec3 n=vec3(p/radius,sqrt(max(0.,1.-dist*dist/(radius*radius))));
    float light=.025+.67*max(0.,dot(n,normalize(vec3(-.7,-.25,.12))));
    float craters=.72+.28*noise(n.xy*15.+n.z*6.);
    background=vec3(.29,.36,.43)*light*craters;
  }
  return background;
}

void main() {
  float aspect=uSize.x/uSize.y;
  vec2 p=(vUV-.5)*vec2(aspect,1.);
  // Each depth follows the same slow camera drift, with its own parallax distance.
  vec2 drift=vec2(uTime*.0007+sin(uTime*.07)*.009,uTime*.00019+cos(uTime*.05)*.006)*uParticles;
  vec3 color=vec3(.0004,.0006,.0015)+nebula(p,drift);
  color+=stars(p,drift);
  vec2 planet=(vUV-vec2(.82,.20))*vec2(aspect,1.)+drift*.12;
  color=ringedPlanet(color,planet);
  vec2 moon=(vUV-vec2(.13,.72))*vec2(aspect,1.)+drift*.06;
  color=distantMoon(color,moon);
  finalColor=vec4(color,1.);
}`;
