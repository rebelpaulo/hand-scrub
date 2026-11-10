// Draw Physics — camada WebGL2. Sem bibliotecas: programas, alvos de render,
// o solver de fluido (stable fluids), ondas, reação-difusão, sprites
// instanciados, fitas e pós-processamento (bloom + composição final).

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*.5+.5; gl_Position = vec4(aPos,0.,1.); }`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
`;

const NOISE = `
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y); }
`;

const FS = {
  copy: HEAD + `uniform sampler2D uTex; uniform float uScale;
void main(){ o = texture(uTex,vUv)*uScale; }`,

  // Junta cor/velocidade ao longo de um segmento (do ponto A ao ponto B), para
  // traços rápidos não ficarem aos soluços.
  splat: HEAD + `uniform sampler2D uTarget; uniform vec2 uA,uB; uniform float uAspect,uRadius,uMax,uSoft; uniform vec3 uColor;
void main(){
  vec2 p=vUv,a=uA,b=uB; p.x*=uAspect; a.x*=uAspect; b.x*=uAspect;
  vec2 ab=b-a; float t=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-9),0.,1.);
  vec2 d=p-(a+ab*t);
  vec3 base=texture(uTarget,vUv).rgb;
  vec3 add=exp(-dot(d,d)/uRadius)*uColor;
  // tinta: quanto mais cheio está o sítio, menos entra — um dedo parado ou a
  // passar devagar deixa de queimar tudo para branco
  if(uSoft>0.) add*=clamp(1.-max(base.r,max(base.g,base.b))/uMax,0.,1.);
  o=vec4(clamp(base+add,-uMax,uMax),1.);
}`,

  // Empurrão em remoinho à volta de um ponto (efeito Vórtice).
  swirl: HEAD + `uniform sampler2D uTarget; uniform vec2 uA; uniform float uAspect,uRadius,uPower;
void main(){
  vec2 d=vUv-uA; d.x*=uAspect;
  float g=exp(-dot(d,d)/uRadius);
  vec2 v=texture(uTarget,vUv).xy + vec2(-d.y,d.x)*g*uPower;
  o=vec4(v,0.,1.);
}`,

  advect: HEAD + `uniform sampler2D uVel,uSrc; uniform vec2 uT; uniform float uDt,uDecay;
void main(){ vec2 c=vUv-uDt*texture(uVel,vUv).xy*uT; o=uDecay*texture(uSrc,c); }`,

  curl: HEAD + `uniform sampler2D uVel; uniform vec2 uT;
void main(){
  float L=texture(uVel,vUv-vec2(uT.x,0.)).y, R=texture(uVel,vUv+vec2(uT.x,0.)).y;
  float B=texture(uVel,vUv-vec2(0.,uT.y)).x, T=texture(uVel,vUv+vec2(0.,uT.y)).x;
  o=vec4(.5*(R-L-T+B),0.,0.,1.);
}`,

  // Reforça os redemoinhos (vorticity confinement) e soma impulsão e gravidade.
  forces: HEAD + `uniform sampler2D uVel,uCurl,uDye; uniform vec2 uT,uGrav; uniform float uCurlK,uDt;
void main(){
  float L=texture(uCurl,vUv-vec2(uT.x,0.)).x, R=texture(uCurl,vUv+vec2(uT.x,0.)).x;
  float B=texture(uCurl,vUv-vec2(0.,uT.y)).x, T=texture(uCurl,vUv+vec2(0.,uT.y)).x;
  float C=texture(uCurl,vUv).x;
  vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));
  f/=length(f)+1e-4; f*=uCurlK*C; f.y*=-1.;
  vec2 v=texture(uVel,vUv).xy+f*uDt;
  vec3 d=texture(uDye,vUv).rgb;
  float m=min(max(d.r,max(d.g,d.b)),2.);
  v+=uDt*m*uGrav;
  o=vec4(clamp(v,-2000.,2000.),0.,1.);
}`,

  divergence: HEAD + `uniform sampler2D uVel; uniform vec2 uT;
void main(){
  float L=texture(uVel,vUv-vec2(uT.x,0.)).x, R=texture(uVel,vUv+vec2(uT.x,0.)).x;
  float B=texture(uVel,vUv-vec2(0.,uT.y)).y, T=texture(uVel,vUv+vec2(0.,uT.y)).y;
  vec2 C=texture(uVel,vUv).xy;
  if(vUv.x-uT.x<0.) L=-C.x; if(vUv.x+uT.x>1.) R=-C.x;
  if(vUv.y-uT.y<0.) B=-C.y; if(vUv.y+uT.y>1.) T=-C.y;
  o=vec4(.5*(R-L+T-B),0.,0.,1.);
}`,

  pressure: HEAD + `uniform sampler2D uPrs,uDiv; uniform vec2 uT;
void main(){
  float L=texture(uPrs,vUv-vec2(uT.x,0.)).x, R=texture(uPrs,vUv+vec2(uT.x,0.)).x;
  float B=texture(uPrs,vUv-vec2(0.,uT.y)).x, T=texture(uPrs,vUv+vec2(0.,uT.y)).x;
  o=vec4((L+R+B+T-texture(uDiv,vUv).x)*.25,0.,0.,1.);
}`,

  gradient: HEAD + `uniform sampler2D uPrs,uVel; uniform vec2 uT;
void main(){
  float L=texture(uPrs,vUv-vec2(uT.x,0.)).x, R=texture(uPrs,vUv+vec2(uT.x,0.)).x;
  float B=texture(uPrs,vUv-vec2(0.,uT.y)).x, T=texture(uPrs,vUv+vec2(0.,uT.y)).x;
  o=vec4(texture(uVel,vUv).xy-vec2(R-L,T-B),0.,1.);
}`,

  // Transforma a "tinta" do fluido em imagem. Saída pré-multiplicada.
  fluidShow: HEAD + `uniform sampler2D uDye; uniform vec2 uT; uniform int uMode;
uniform vec3 uC1,uC2,uC3; uniform float uTime,uInten;
float lum(vec2 uv){ vec3 c=texture(uDye,uv).rgb; return (c.r+c.g+c.b)*.3333; }
vec3 ramp(float t){ t=clamp(t,0.,1.); return t<.5 ? mix(uC3,uC2,t*2.) : mix(uC2,uC1,t*2.-1.); }
void main(){
  vec3 c=texture(uDye,vUv).rgb;
  float d=max(c.r,max(c.g,c.b));
  float gx=lum(vUv+vec2(uT.x,0.))-lum(vUv-vec2(uT.x,0.));
  float gy=lum(vUv+vec2(0.,uT.y))-lum(vUv-vec2(0.,uT.y));
  vec3 L=normalize(vec3(-.45,.6,.66));
  if(uMode==0){ o=vec4(c*uInten,0.); return; }
  if(uMode==1){ // fumo: volume com luz lateral
    vec3 n=normalize(vec3(-gx*9.,-gy*9.,.5));
    float light=.5+.5*dot(n,L);
    float a=1.-exp(-d*1.7);
    vec3 hue=c/max(d,1e-3);
    o=vec4(hue*(.28+.85*light)*a*uInten,a*.82); return;
  }
  if(uMode==2){ // fogo: rampa de temperatura
    vec3 col=ramp(d*1.2)*smoothstep(0.,.22,d)*(1.+1.8*smoothstep(.8,1.7,d));
    col+=vec3(1.,.95,.85)*smoothstep(1.3,2.6,d)*.9;
    o=vec4(col*uInten,0.); return;
  }
  if(uMode==3){ // líquido metálico
    float a=smoothstep(.1,.26,d);
    vec3 n=normalize(vec3(-gx*14.,-gy*14.,1.));
    float diff=max(dot(n,L),0.);
    float spec=pow(max(dot(n,normalize(L+vec3(0.,0.,1.))),0.),42.);
    float fres=pow(1.-n.z,1.5);
    vec3 base=mix(uC3,uC2,diff);
    base=mix(base,uC1,clamp(fres*.9+.3*n.y,0.,1.));
    vec3 col=base*(.22+.95*diff)+spec*1.8;
    o=vec4(col*a*uInten,a); return;
  }
  if(uMode==4){ // curvas de nível
    float k=d*7.;
    float f=abs(fract(k+.5)-.5);
    float w=max(fwidth(k),.02);
    float line=1.-smoothstep(0.,w*1.6,f);
    float on=smoothstep(.02,.08,d);
    vec3 col=ramp(d*.6);
    o=vec4((col*line*1.6+col*.07)*on*uInten,0.); return;
  }
  if(uMode==5){ // psicadélico
    float t=d*2.4-uTime*.35;
    vec3 col=.5+.5*cos(6.2831*(t+vec3(0.,.33,.67)));
    col*=smoothstep(.02,.2,d)*(.62+.38*sin(d*26.-uTime*3.));
    o=vec4(col*uInten,0.); return;
  }
  // lava: brasa por dentro, crosta escura por fora
  float a=smoothstep(.08,.24,d);
  vec3 n=normalize(vec3(-gx*10.,-gy*10.,1.));
  float diff=max(dot(n,L),0.);
  vec3 col=ramp(d*.62)*(.35+.9*smoothstep(.25,1.1,d));
  col*=.55+.6*diff;
  col+=uC1*smoothstep(.9,1.8,d)*.9;
  o=vec4(col*a*uInten,a);
}`,

  waveStep: HEAD + `uniform sampler2D uState; uniform vec2 uT; uniform float uSpeed,uDamp;
void main(){
  vec4 s=texture(uState,vUv);
  float n=texture(uState,vUv+vec2(uT.x,0.)).r+texture(uState,vUv-vec2(uT.x,0.)).r
         +texture(uState,vUv+vec2(0.,uT.y)).r+texture(uState,vUv-vec2(0.,uT.y)).r;
  float v=(s.g+(n*.25-s.r)*uSpeed)*uDamp;
  o=vec4((s.r+v)*.9992,v,0.,1.);
}`,

  waveShow: HEAD + NOISE + `uniform sampler2D uState; uniform vec2 uT; uniform vec3 uC1,uC2,uC3; uniform float uTime,uAspect,uInten;
void main(){
  float h=texture(uState,vUv).r;
  float hx=texture(uState,vUv+vec2(uT.x,0.)).r-texture(uState,vUv-vec2(uT.x,0.)).r;
  float hy=texture(uState,vUv+vec2(0.,uT.y)).r-texture(uState,vUv-vec2(0.,uT.y)).r;
  vec3 n=normalize(vec3(-hx*7.,-hy*7.,1.));
  vec2 uv=vUv+n.xy*.035;
  vec2 q=uv*vec2(uAspect,1.)*5.;
  float bed=noise(q)+.5*noise(q*2.3+uTime*.04)+.25*noise(q*5.1-uTime*.06);
  vec3 col=mix(uC3*.22,uC2*.5,clamp(bed*.5+uv.y*.25,0.,1.));
  vec3 L=normalize(vec3(-.3,.5,.8));
  float spec=pow(max(dot(n,normalize(L+vec3(0.,0.,1.))),0.),70.);
  col+=uC1*spec*2.4+uC1*max(h,0.)*.5+uC2*(abs(hx)+abs(hy))*1.1;
  o=vec4(col*uInten,1.);
}`,

  // Gray-Scott: dois químicos que se alimentam e se comem.
  rdStep: HEAD + `uniform sampler2D uState; uniform vec2 uT; uniform float uF,uK;
void main(){
  vec2 s=texture(uState,vUv).rg;
  vec2 l=-s;
  l+=.2*(texture(uState,vUv+vec2(uT.x,0.)).rg+texture(uState,vUv-vec2(uT.x,0.)).rg
        +texture(uState,vUv+vec2(0.,uT.y)).rg+texture(uState,vUv-vec2(0.,uT.y)).rg);
  l+=.05*(texture(uState,vUv+uT).rg+texture(uState,vUv-uT).rg
         +texture(uState,vUv+vec2(uT.x,-uT.y)).rg+texture(uState,vUv+vec2(-uT.x,uT.y)).rg);
  float r=s.r*s.g*s.g;
  float a=s.r+(l.r-r+uF*(1.-s.r));
  float b=s.g+(.5*l.g+r-(uK+uF)*s.g);
  o=vec4(clamp(a,0.,1.),clamp(b,0.,1.),0.,1.);
}`,

  rdShow: HEAD + `uniform sampler2D uState; uniform vec2 uT; uniform vec3 uC1,uC2,uC3; uniform float uInten;
void main(){
  float b=texture(uState,vUv).g;
  float gx=texture(uState,vUv+vec2(uT.x,0.)).g-texture(uState,vUv-vec2(uT.x,0.)).g;
  float gy=texture(uState,vUv+vec2(0.,uT.y)).g-texture(uState,vUv-vec2(0.,uT.y)).g;
  vec3 n=normalize(vec3(-gx*5.,-gy*5.,.4));
  float light=max(dot(n,normalize(vec3(-.5,.6,.7))),0.);
  vec3 col=mix(uC3,uC2,smoothstep(.08,.3,b));
  col=mix(col,uC1,smoothstep(.26,.46,b));
  col=col*(.25+light)+pow(light,14.)*.7;
  float a=smoothstep(.04,.16,b);
  o=vec4(col*a*uInten,a);
}`,

  voronoi: HEAD + `uniform vec4 uSeeds[48]; uniform int uCount; uniform float uAspect,uInten; uniform vec3 uC1,uC2,uC3;
vec3 pal(float t){ t=fract(t)*3.; return t<1. ? mix(uC1,uC2,t) : t<2. ? mix(uC2,uC3,t-1.) : mix(uC3,uC1,t-2.); }
void main(){
  if(uCount==0){ o=vec4(0.); return; }
  vec2 p=vec2(vUv.x*uAspect,vUv.y);
  float d1=1e9,d2=1e9,ph=0.,wg=0.;
  for(int i=0;i<48;i++){ if(i>=uCount) break;
    float d=distance(p,uSeeds[i].xy);
    if(d<d1){ d2=d1; d1=d; ph=uSeeds[i].z; wg=uSeeds[i].w; } else if(d<d2) d2=d; }
  float lead=smoothstep(.004,.016,d2-d1);
  vec3 col=pal(ph)*(.3+.95*exp(-d1*4.5))*lead;
  col+=pal(ph+.12)*pow(max(0.,1.-d1*3.),4.)*.5*lead;
  o=vec4(col*wg*uInten,wg*.9);
}`,

  meta: HEAD + `uniform vec4 uBalls[40]; uniform int uCount; uniform float uAspect,uInten; uniform vec3 uC1,uC2,uC3;
vec3 pal(float t){ t=fract(t)*3.; return t<1. ? mix(uC1,uC2,t) : t<2. ? mix(uC2,uC3,t-1.) : mix(uC3,uC1,t-2.); }
void main(){
  vec2 p=vec2(vUv.x*uAspect,vUv.y);
  float f=0.; vec3 cs=vec3(0.); vec2 g=vec2(0.);
  for(int i=0;i<40;i++){ if(i>=uCount) break;
    vec2 d=p-uBalls[i].xy; float r2=dot(d,d)+1e-5;
    float w=uBalls[i].z*uBalls[i].z/r2;
    f+=w; cs+=w*pal(uBalls[i].w); g+=-2.*w*d/r2; }
  vec3 base=cs/max(f,1e-4);
  float a=smoothstep(.96,1.06,f);
  vec3 n=normalize(vec3(-g*.035,1.));
  vec3 L=normalize(vec3(-.4,.55,.72));
  float diff=max(dot(n,L),0.);
  float spec=pow(max(dot(n,normalize(L+vec3(0.,0.,1.))),0.),36.);
  vec3 col=base*(.3+.85*diff)+spec*.9+base*smoothstep(1.,2.4,f)*.5;
  vec3 halo=base*smoothstep(.35,1.,f)*.22;
  o=vec4((col*a+halo*(1.-a))*uInten,a);
}`,

  prefilter: HEAD + `uniform sampler2D uTex; uniform float uThr,uKnee;
void main(){
  vec3 c=texture(uTex,vUv).rgb;
  float br=max(c.r,max(c.g,c.b));
  float soft=clamp(br-uThr+uKnee,0.,2.*uKnee); soft=soft*soft/(4.*uKnee+1e-4);
  o=vec4(c*max(soft,br-uThr)/max(br,1e-4),1.);
}`,

  down: HEAD + `uniform sampler2D uTex; uniform vec2 uT;
void main(){
  vec3 s=texture(uTex,vUv).rgb*4.;
  s+=texture(uTex,vUv-uT).rgb+texture(uTex,vUv+uT).rgb;
  s+=texture(uTex,vUv+vec2(uT.x,-uT.y)).rgb+texture(uTex,vUv-vec2(uT.x,-uT.y)).rgb;
  o=vec4(s/8.,1.);
}`,

  up: HEAD + `uniform sampler2D uTex; uniform vec2 uT;
void main(){
  vec3 s=texture(uTex,vUv+vec2(-uT.x*2.,0.)).rgb+texture(uTex,vUv+vec2(uT.x*2.,0.)).rgb
        +texture(uTex,vUv+vec2(0.,uT.y*2.)).rgb+texture(uTex,vUv+vec2(0.,-uT.y*2.)).rgb;
  s+=2.*(texture(uTex,vUv+vec2(-uT.x,uT.y)).rgb+texture(uTex,vUv+uT).rgb
        +texture(uTex,vUv+vec2(uT.x,-uT.y)).rgb+texture(uTex,vUv-uT).rgb);
  o=vec4(s/12.,1.);
}`,

  // Composição final: lente gravitacional, caleidoscópio, pixel, desvio de cor,
  // brilho, curva de tons, vinheta e grão.
  final: HEAD + `uniform sampler2D uScene,uBloom; uniform vec2 uRes;
uniform float uBloomAmt,uExposure,uChroma,uGrain,uPixel,uKaleido,uTime,uVignette;
uniform vec4 uWarp[4]; uniform int uWarpN;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
// Curva de tons aplicada ao canal mais forte e não a cada canal: as cores
// saturadas ficam na sua cor em vez de fugirem para branco. Só o muito quente
// (núcleo do fogo, raios) clareia para branco.
vec3 tone(vec3 x){
  float m=max(x.r,max(x.g,x.b)); if(m<1e-5) return vec3(0.);
  float t=(m*(2.51*m+.03))/(m*(2.43*m+.59)+.14);
  return clamp(mix(x*(t/m),vec3(t),smoothstep(1.3,5.,m)*.75),0.,1.);
}
void main(){
  float asp=uRes.x/uRes.y;
  vec2 uv=vUv;
  if(uPixel>0.){ vec2 px=uPixel/uRes; uv=(floor(uv/px)+.5)*px; }
  if(uKaleido>0.){
    vec2 c=uv-.5; c.x*=asp;
    float a=atan(c.y,c.x), r=length(c), seg=6.28318/uKaleido;
    a=abs(mod(a,seg)-seg*.5);
    c=r*vec2(cos(a),sin(a)); c.x/=asp; uv=c+.5;
  }
  float hole=1., ring=0.;
  for(int i=0;i<4;i++){ if(i>=uWarpN) break;
    vec2 d=uv-uWarp[i].xy; d.x*=asp;
    float r=length(d)+1e-4, rh=uWarp[i].z, k=uWarp[i].w;
    vec2 pull=d/r*min(rh*rh*2.2/r,r*.95)*k; pull.x/=asp;
    uv-=pull;
    hole*=mix(1.,smoothstep(rh*.55,rh*.8,r),k);
    ring+=exp(-pow((r-rh*.95)/(rh*.16),2.))*k;
  }
  vec2 dir=(uv-.5)*uChroma*.012;
  vec3 col=vec3(texture(uScene,uv+dir).r,texture(uScene,uv).g,texture(uScene,uv-dir).b);
  vec3 bl=vec3(texture(uBloom,uv+dir).r,texture(uBloom,uv).g,texture(uBloom,uv-dir).b);
  col=(col+bl*uBloomAmt)*hole;
  col+=vec3(1.,.82,.6)*ring*.9;
  col=tone(col*uExposure);
  vec2 v=vUv-.5;
  col*=1.-uVignette*dot(v,v)*1.5;
  col=pow(col,vec3(1./2.2));
  vec2 g=vUv*uRes+fract(uTime)*91.7;
  col+=(hash(g)-.5)*uGrain;
  col+=(hash(g+17.3)+hash(g*1.31-9.1)-1.)/255.;   // ruído triangular: sem faixas nos degradés escuros
  o=vec4(col,1.);
}`,
};

// Sprites instanciados: um quadrado por partícula, com a forma desenhada no
// shader (ponto, faísca, folha, coração, moeda, ...).
const SPRITE_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aXYSR;   // x, y, tamanho, rotação
layout(location=2) in vec4 aColor;
layout(location=3) in vec2 aAux;    // esticar, fase
uniform vec2 uRes; uniform int uShape;
out vec2 vP; out vec4 vColor; out float vPh;
void main(){
  vec2 c=aCorner;
  c.x*=aAux.x;
  if(uShape==7||uShape==3||uShape==4) c.y*=max(abs(cos(aAux.y)),.12);   // folhas e confetes rodam em 3D
  if(uShape==9) c.x*=max(abs(cos(aAux.y)),.1);                          // moeda a girar
  float s=sin(aXYSR.w), k=cos(aXYSR.w);
  vec2 p=vec2(c.x*k-c.y*s,c.x*s+c.y*k)*aXYSR.z+aXYSR.xy;
  gl_Position=vec4(p.x/uRes.x*2.-1.,1.-p.y/uRes.y*2.,0.,1.);
  vP=aCorner; vColor=aColor; vPh=aAux.y;
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vP; in vec4 vColor; in float vPh;
uniform int uShape;
out vec4 o;
void main(){
  vec2 p=vP; float r=length(p); float a=0.; vec3 col=vColor.rgb;
  if(uShape==0){ a=smoothstep(1.,0.,r); a*=a; }                                  // ponto de luz
  else if(uShape==1){ a=smoothstep(1.,0.,abs(p.y))*smoothstep(1.,-.3,abs(p.x)); a*=a; }   // faísca
  else if(uShape==2){                                                              // floco de neve
    float an=atan(p.y,p.x), k=1.0472;
    float f=abs(mod(an,k)-k*.5);
    float arm=smoothstep(.1,.03,r*sin(f))*step(r,.92);
    a=max(arm,smoothstep(.3,0.,r))*smoothstep(1.,.8,r);
  }
  else if(uShape==3){                                                              // folha
    float d=max(length(p-vec2(0.,.62)),length(p+vec2(0.,.62)))-1.06;
    a=smoothstep(.03,-.03,d);
    col*=.72+.28*smoothstep(-.4,.4,p.y);
    col*=1.-.35*smoothstep(.05,.0,abs(p.y));
  }
  else if(uShape==4){                                                              // pétala
    float d=length(vec2(p.x,p.y*(1.55-p.x*.55)))-.82;
    a=smoothstep(.04,-.04,d);
    col=mix(col,vec3(1.),.35*smoothstep(-.6,.8,p.x));
  }
  else if(uShape==5){                                                              // coração
    vec2 q=vec2(p.x,-p.y)*1.25; q.y+=.12;
    float f=pow(q.x*q.x+q.y*q.y-1.,3.)-q.x*q.x*q.y*q.y*q.y;
    a=smoothstep(.04,-.04,f);
    col*=.8+.5*smoothstep(.9,-.5,length(p-vec2(-.3,-.3)));
  }
  else if(uShape==6){                                                              // estrelinha
    float cross=smoothstep(.035,0.,abs(p.x)*abs(p.y))*smoothstep(1.,.15,r);
    a=max(cross,smoothstep(.34,0.,r));
  }
  else if(uShape==7){                                                              // confete
    a=step(max(abs(p.x),abs(p.y)*1.6),.92);
    col*=.65+.35*step(0.,cos(vPh));
  }
  else if(uShape==8){                                                              // bolha de sabão
    float ring=smoothstep(.13,0.,abs(r-.84));
    float hi=smoothstep(.2,0.,length(p-vec2(-.38,-.4)));
    vec3 iri=.5+.5*cos(6.2831*(atan(p.y,p.x)/6.2831+vPh*.1+vec3(0.,.33,.67)));
    col=mix(col,iri,.55);
    a=ring*.85+hi*.9+smoothstep(1.,.2,r)*.07*step(r,.9);
    col=mix(col,vec3(1.),hi);
  }
  else if(uShape==9){                                                              // moeda
    a=smoothstep(1.,.94,r);
    float rim=smoothstep(.82,.9,r);
    col*=mix(1.,.55,rim)*(.7+.5*smoothstep(.8,-.6,p.x+p.y));
    col=mix(col,col*.55,smoothstep(.07,.03,abs(r-.55)));
    col+=vec3(1.)*smoothstep(.25,0.,length(p-vec2(-.35,-.35)))*.7;
  }
  else if(uShape==10){ a=smoothstep(1.,0.,abs(p.y))*smoothstep(1.,0.,abs(p.x))*.75; }   // gota de chuva
  else if(uShape==11){                                                              // bloco 8-bit
    float m=max(abs(p.x),abs(p.y));
    a=step(m,.94);
    col*=m>.72 ? ((p.x+p.y)<0. ? 1.35 : .55) : 1.;
  }
  else if(uShape==12){                                                              // bola
    a=smoothstep(1.,.95,r);
    vec3 n=vec3(p,sqrt(max(0.,1.-r*r)));
    float diff=max(dot(n,normalize(vec3(-.5,-.6,.65))),0.);
    float spec=pow(max(dot(n,normalize(vec3(-.35,-.45,1.))),0.),30.);
    col=col*(.25+.9*diff)+spec*.9+col*pow(r,4.)*.6;
  }
  else if(uShape==13){                                                              // elo de corrente
    vec2 q=abs(p)-vec2(.5,.14);
    float d=length(max(q,0.))+min(max(q.x,q.y),0.)-.3;
    a=smoothstep(.14,.06,abs(d));
    col*=.55+.75*smoothstep(.5,-.6,p.y);
  }
  else if(uShape==14){                                                              // peixe
    float w=(1.-p.x)*.34*smoothstep(-1.,-.55,p.x)+.1*smoothstep(-.5,-1.,p.x)*(1.+p.x*.2);
    a=smoothstep(0.,.1,w-abs(p.y));
  }
  else if(uShape==15){ a=smoothstep(1.,0.,r); a=a*a*a+smoothstep(.45,0.,r)*.8; }   // brasa
  else if(uShape==16){ a=smoothstep(.16,.04,abs(r-.8)); }                           // anel (cursor)
  a*=vColor.a;
  o=vec4(col*a,a);
}`;

// Fitas: tiras de triângulos com perfil de brilho ao longo da largura.
const RIBBON_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUv;     // através (-1..1), ao longo
layout(location=2) in vec4 aColor;
uniform vec2 uRes;
out vec2 vU; out vec4 vColor;
void main(){ gl_Position=vec4(aPos.x/uRes.x*2.-1.,1.-aPos.y/uRes.y*2.,0.,1.); vU=aUv; vColor=aColor; }`;

const RIBBON_FS = `#version 300 es
precision highp float;
in vec2 vU; in vec4 vColor;
uniform int uStyle; uniform vec3 uC1,uC2,uC3;
out vec4 o;
void main(){
  float e=1.-abs(vU.x); vec3 col=vColor.rgb; float a=1.;
  if(uStyle==0){ a=e*e; }                                                   // brilho suave
  else if(uStyle==1){                                                       // núcleo branco + halo
    float core=smoothstep(.55,.85,e);
    a=e*e*.7+core;
    col=mix(col,vec3(1.),core*.85);
  }
  else if(uStyle==2){                                                       // corda entrançada
    a=smoothstep(0.,.18,e);
    float tw=.5+.5*sin(vU.y*1.9+vU.x*2.4);
    col*=(.5+.6*tw)*(.55+.45*e);
  }
  else if(uStyle==3){ a=smoothstep(0.,.3,e); col*=.6+.5*e; }                 // arame
  else if(uStyle==4){ a=1.; }                                               // chapado
  else if(uStyle==5){                                                       // três faixas
    col=vU.x<-.33 ? uC1 : vU.x<.33 ? uC2 : uC3;
    a=smoothstep(0.,.08,e);
    col*=1.25;
  }
  a*=vColor.a;
  o=vec4(col*a,a);
}`;

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error("Shader: " + gl.getShaderInfoLog(shader) + "\n" + src.split("\n").map((l, i) => (i + 1) + ": " + l).join("\n"));
  }
  return shader;
}

function link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Programa: " + gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, "");
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

export function createGLX(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: "high-performance", preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float")) return null;
  gl.getExtension("OES_texture_float_linear");

  const tri = gl.createVertexArray();
  gl.bindVertexArray(tri);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const programs = {};
  const X = {
    gl, canvas,
    prog(name) { return programs[name] ||= link(gl, VS, FS[name]); },
    use(name) { const P = X.prog(name); gl.useProgram(P.p); return P.u; },
    target(w, h, linear = true) {
      w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const f = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Alvo de render sem suporte.");
      const t = { tex, fbo, w, h };
      X.clear(t);
      return t;
    },
    double(w, h, linear = true) {
      let a = X.target(w, h, linear), b = X.target(w, h, linear);
      return {
        get read() { return a; }, get write() { return b; }, w: a.w, h: a.h,
        swap() { const t = a; a = b; b = t; },
        free() { X.free(a); X.free(b); },
      };
    },
    free(t) { if (!t) return; if (t.free) return t.free(); gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); },
    clear(t, r = 0, g = 0, b = 0, a = 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
      gl.viewport(0, 0, t ? t.w : canvas.width, t ? t.h : canvas.height);
      gl.clearColor(r, g, b, a);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    bind(t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
      gl.viewport(0, 0, t ? t.w : canvas.width, t ? t.h : canvas.height);
    },
    tex(unit, t, loc) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.uniform1i(loc, unit);
    },
    // Desenha o triângulo de ecrã inteiro para o alvo (ou para o ecrã).
    blit(t) { X.bind(t); gl.bindVertexArray(tri); gl.drawArrays(gl.TRIANGLES, 0, 3); },
    blend(mode) {
      if (!mode) return gl.disable(gl.BLEND);
      gl.enable(gl.BLEND);
      if (mode === "add") gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // pré-multiplicado
    },
    colors(u, pal) {
      gl.uniform3fv(u.uC1, pal[0]); gl.uniform3fv(u.uC2, pal[1]); gl.uniform3fv(u.uC3, pal[2]);
    },
  };
  return X;
}

const FLUID_MODES = { glow: 0, smoke: 1, fire: 2, liquid: 3, topo: 4, psy: 5, lava: 6 };

/* ================= Fluido ================= */
export class Fluid {
  constructor(X, W, H, small) {
    this.X = X;
    const aspect = W / H, simH = small ? 112 : 168, dyeH = Math.min(H, small ? 480 : 760);
    this.aspect = aspect;
    this.simW = Math.round(simH * aspect); this.simH = simH;
    this.vel = X.double(this.simW, simH);
    this.prs = X.double(this.simW, simH);
    this.div = X.target(this.simW, simH);
    this.curl = X.target(this.simW, simH);
    this.dye = X.double(dyeH * aspect, dyeH);
    this.iterations = small ? 14 : 22;
  }
  free() { for (const t of [this.vel, this.prs, this.div, this.curl, this.dye]) this.X.free(t); }
  clear() { for (const t of [this.vel.read, this.vel.write, this.prs.read, this.prs.write, this.dye.read, this.dye.write]) this.X.clear(t); }

  // Coordenadas uv (0..1, y para cima). dvx/dvy: velocidade do dedo em uv/segundo.
  splat(ax, ay, bx, by, dvx, dvy, color, radius, force, cap = 3) {
    const { X } = this, gl = X.gl;
    X.blend(null);
    let u = X.use("splat");
    gl.uniform2f(u.uA, ax, ay); gl.uniform2f(u.uB, bx, by);
    gl.uniform1f(u.uAspect, this.aspect);
    gl.uniform1f(u.uRadius, radius * radius);
    if (force) {
      gl.uniform1f(u.uMax, 2000); gl.uniform1f(u.uSoft, 0);
      gl.uniform3f(u.uColor, dvx * this.simW * force, dvy * this.simH * force, 0);
      X.tex(0, this.vel.read, u.uTarget);
      X.blit(this.vel.write); this.vel.swap();
    }
    if (color) {
      gl.uniform1f(u.uMax, cap); gl.uniform1f(u.uSoft, 1);
      gl.uniform3f(u.uColor, color[0], color[1], color[2]);
      X.tex(0, this.dye.read, u.uTarget);
      X.blit(this.dye.write); this.dye.swap();
    }
  }

  swirl(x, y, radius, power) {
    const { X } = this, gl = X.gl, u = X.use("swirl");
    X.blend(null);
    gl.uniform2f(u.uA, x, y); gl.uniform1f(u.uAspect, this.aspect);
    gl.uniform1f(u.uRadius, radius * radius); gl.uniform1f(u.uPower, power * this.simH);
    X.tex(0, this.vel.read, u.uTarget);
    X.blit(this.vel.write); this.vel.swap();
  }

  step(dt, p) {
    const { X } = this, gl = X.gl, tx = 1 / this.simW, ty = 1 / this.simH;
    X.blend(null);
    let u = X.use("curl");
    gl.uniform2f(u.uT, tx, ty); X.tex(0, this.vel.read, u.uVel); X.blit(this.curl);

    u = X.use("forces");
    gl.uniform2f(u.uT, tx, ty); gl.uniform1f(u.uCurlK, p.curl); gl.uniform1f(u.uDt, dt);
    gl.uniform2f(u.uGrav, 0, p.lift * this.simH / 168);
    X.tex(0, this.vel.read, u.uVel); X.tex(1, this.curl, u.uCurl); X.tex(2, this.dye.read, u.uDye);
    X.blit(this.vel.write); this.vel.swap();

    u = X.use("divergence");
    gl.uniform2f(u.uT, tx, ty); X.tex(0, this.vel.read, u.uVel); X.blit(this.div);

    u = X.use("copy");
    gl.uniform1f(u.uScale, .8); X.tex(0, this.prs.read, u.uTex); X.blit(this.prs.write); this.prs.swap();

    u = X.use("pressure");
    gl.uniform2f(u.uT, tx, ty); X.tex(1, this.div, u.uDiv);
    for (let i = 0; i < this.iterations; i++) { X.tex(0, this.prs.read, u.uPrs); X.blit(this.prs.write); this.prs.swap(); }

    u = X.use("gradient");
    gl.uniform2f(u.uT, tx, ty); X.tex(0, this.prs.read, u.uPrs); X.tex(1, this.vel.read, u.uVel);
    X.blit(this.vel.write); this.vel.swap();

    u = X.use("advect");
    gl.uniform2f(u.uT, tx, ty); gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uDecay, 1 / (1 + p.vdiss * dt));
    X.tex(0, this.vel.read, u.uVel); X.tex(1, this.vel.read, u.uSrc);
    X.blit(this.vel.write); this.vel.swap();

    gl.uniform1f(u.uDecay, 1 / (1 + p.diss * dt));
    X.tex(0, this.vel.read, u.uVel); X.tex(1, this.dye.read, u.uSrc);
    X.blit(this.dye.write); this.dye.swap();
  }

  draw(target, mode, pal, time, inten) {
    const { X } = this, gl = X.gl, u = X.use("fluidShow");
    X.blend("alpha");
    gl.uniform2f(u.uT, 1 / this.dye.w, 1 / this.dye.h);
    gl.uniform1i(u.uMode, FLUID_MODES[mode] ?? 0);
    gl.uniform1f(u.uTime, time); gl.uniform1f(u.uInten, inten);
    X.colors(u, pal);
    X.tex(0, this.dye.read, u.uDye);
    X.blit(target);
  }
}

/* ================= Campo 2D genérico (ondas e reação-difusão) ================= */
export class Field {
  constructor(X, W, H, res, init) {
    this.X = X; this.aspect = W / H; this.init = init || [0, 0, 0, 1];
    this.s = X.double(res * this.aspect, res);
    this.clear();
  }
  free() { this.X.free(this.s); }
  clear() { this.X.clear(this.s.read, ...this.init); this.X.clear(this.s.write, ...this.init); }
  splat(ax, ay, bx, by, color, radius) {
    const { X } = this, gl = X.gl, u = X.use("splat");
    X.blend(null);
    gl.uniform2f(u.uA, ax, ay); gl.uniform2f(u.uB, bx, by);
    gl.uniform1f(u.uAspect, this.aspect); gl.uniform1f(u.uRadius, radius * radius);
    gl.uniform1f(u.uMax, 4); gl.uniform1f(u.uSoft, 0); gl.uniform3f(u.uColor, color[0], color[1], color[2]);
    X.tex(0, this.s.read, u.uTarget); X.blit(this.s.write); this.s.swap();
  }
  step(name, set, times = 1) {
    const { X } = this, gl = X.gl, u = X.use(name);
    X.blend(null);
    gl.uniform2f(u.uT, 1 / this.s.w, 1 / this.s.h);
    set(gl, u);
    for (let i = 0; i < times; i++) { X.tex(0, this.s.read, u.uState); X.blit(this.s.write); this.s.swap(); }
  }
  draw(name, target, pal, set) {
    const { X } = this, gl = X.gl, u = X.use(name);
    X.blend("alpha");
    gl.uniform2f(u.uT, 1 / this.s.w, 1 / this.s.h);
    X.colors(u, pal);
    set?.(gl, u);
    X.tex(0, this.s.read, u.uState); X.blit(target);
  }
}

/* ================= Sprites instanciados ================= */
export const SHAPES = { dot: 0, spark: 1, snow: 2, leaf: 3, petal: 4, heart: 5, star: 6, confetti: 7, bubble: 8,
  coin: 9, rain: 10, block: 11, ball: 12, link: 13, fish: 14, ember: 15, ring: 16 };
export const STRIDE = 10;   // x y tamanho rot | r g b a | esticar fase

export class Sprites {
  constructor(X) {
    this.X = X; const gl = X.gl;
    this.P = link(gl, SPRITE_VS, SPRITE_FS);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.buf = gl.createBuffer(); this.cap = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const B = STRIDE * 4;
    for (const [loc, size, off] of [[1, 4, 0], [2, 4, 16], [3, 2, 32]]) {
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, B, off);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
  }
  // data: Float32Array com `count` instâncias; o alvo já está ligado (X.bind).
  draw(data, count, shape, add, W, H) {
    if (!count) return;
    const { X } = this, gl = X.gl;
    gl.useProgram(this.P.p);
    gl.uniform2f(this.P.u.uRes, W, H);
    gl.uniform1i(this.P.u.uShape, SHAPES[shape] ?? 0);
    X.blend(add ? "add" : "alpha");
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const view = data.subarray(0, count * STRIDE);
    if (view.length > this.cap) { this.cap = Math.max(view.length, this.cap * 2); gl.bufferData(gl.ARRAY_BUFFER, this.cap * 4, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, view);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }
}

/* ================= Fitas / linhas ================= */
const RSTYLES = { glow: 0, core: 1, rope: 2, wire: 3, flat: 4, tri: 5 };

export class Ribbons {
  constructor(X) {
    this.X = X; const gl = X.gl;
    this.P = link(gl, RIBBON_VS, RIBBON_FS);
    this.data = new Float32Array(8 * 6 * 4096); this.n = 0; this.cap = 0;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    for (const [loc, size, off] of [[0, 2, 0], [1, 2, 8], [2, 4, 16]]) {
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 32, off);
    }
    gl.bindVertexArray(null);
  }
  v(x, y, across, along, c, a) {
    if (this.n + 8 > this.data.length) { const d = new Float32Array(this.data.length * 2); d.set(this.data); this.data = d; }
    const d = this.data, i = this.n;
    d[i] = x; d[i + 1] = y; d[i + 2] = across; d[i + 3] = along;
    d[i + 4] = c[0]; d[i + 5] = c[1]; d[i + 6] = c[2]; d[i + 7] = a;
    this.n += 8;
  }
  // Um segmento reto com largura w (metade para cada lado).
  seg(x0, y0, x1, y1, w0, w1, c0, a0, c1, a1, l0 = 0, l1 = 1) {
    let nx = y0 - y1, ny = x1 - x0; const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    const ax = x0 + nx * w0, ay = y0 + ny * w0, bx = x0 - nx * w0, by = y0 - ny * w0;
    const cx = x1 + nx * w1, cy = y1 + ny * w1, dx = x1 - nx * w1, dy = y1 - ny * w1;
    this.v(ax, ay, -1, l0, c0, a0); this.v(bx, by, 1, l0, c0, a0); this.v(cx, cy, -1, l1, c1, a1);
    this.v(bx, by, 1, l0, c0, a0); this.v(dx, dy, 1, l1, c1, a1); this.v(cx, cy, -1, l1, c1, a1);
  }
  // Polilinha suave: pts = [{x,y}], width(i,n) e color(i,n) -> [cor, alfa].
  strip(pts, width, color, alongScale = 1) {
    const n = pts.length; if (n < 2) return;
    let pax, pay, pbx, pby, pc, pa, pl = 0, along = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(n - 1, i + 1)];
      let nx = q0.y - q1.y, ny = q1.x - q0.x; const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      const w = width(i, n), ca = color(i, n);
      const ax = p.x + nx * w, ay = p.y + ny * w, bx = p.x - nx * w, by = p.y - ny * w;
      if (i) along += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) * alongScale;
      if (i) {
        this.v(pax, pay, -1, pl, pc, pa); this.v(pbx, pby, 1, pl, pc, pa); this.v(ax, ay, -1, along, ca[0], ca[1]);
        this.v(pbx, pby, 1, pl, pc, pa); this.v(bx, by, 1, along, ca[0], ca[1]); this.v(ax, ay, -1, along, ca[0], ca[1]);
      }
      pax = ax; pay = ay; pbx = bx; pby = by; pc = ca[0]; pa = ca[1]; pl = along;
    }
  }
  tri(x0, y0, x1, y1, x2, y2, c, a) { this.v(x0, y0, 0, 0, c, a); this.v(x1, y1, 0, 0, c, a); this.v(x2, y2, 0, 0, c, a); }
  flush(style, add, W, H, pal) {
    if (!this.n) return;
    const { X } = this, gl = X.gl;
    gl.useProgram(this.P.p);
    gl.uniform2f(this.P.u.uRes, W, H);
    gl.uniform1i(this.P.u.uStyle, RSTYLES[style] ?? 0);
    if (pal) X.colors(this.P.u, pal);
    X.blend(add ? "add" : "alpha");
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (this.n > this.cap) { this.cap = this.data.length; gl.bufferData(gl.ARRAY_BUFFER, this.cap * 4, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.n));
    gl.drawArrays(gl.TRIANGLES, 0, this.n / 8);
    gl.bindVertexArray(null);
    this.n = 0;
  }
}

/* ================= Pós-processamento ================= */
export class Post {
  constructor(X) { this.X = X; this.levels = []; }
  resize(W, H) {
    const { X } = this;
    for (const t of [this.scene, this.trail, ...this.levels]) X.free(t);
    this.W = W; this.H = H;
    this.scene = X.target(W, H);
    this.trail = X.double(W, H);
    this.levels = [];
    let w = W / 2, h = H / 2;
    for (let i = 0; i < 6 && Math.min(w, h) >= 8; i++, w /= 2, h /= 2) this.levels.push(X.target(w, h));
  }
  clearTrail() { this.X.clear(this.trail.read); this.X.clear(this.trail.write); }
  // Esbate o rasto do quadro anterior e deixa o alvo pronto para desenhar por cima.
  trailBegin(fade) {
    const { X } = this, gl = X.gl, u = X.use("copy");
    X.blend(null);
    gl.uniform1f(u.uScale, fade);
    X.tex(0, this.trail.read, u.uTex);
    X.blit(this.trail.write);
    this.trail.swap();
    X.bind(this.trail.read);
  }
  begin(bg) { this.X.clear(this.scene, bg[0], bg[1], bg[2], 1); }
  trailToScene(scale = 1) {
    const { X } = this, gl = X.gl, u = X.use("copy");
    X.blend("add");
    gl.uniform1f(u.uScale, scale);
    X.tex(0, this.trail.read, u.uTex);
    X.blit(this.scene);
  }
  end(p) {
    const { X } = this, gl = X.gl, L = this.levels;
    X.blend(null);
    let u = X.use("prefilter");
    gl.uniform1f(u.uThr, .55); gl.uniform1f(u.uKnee, .4);
    X.tex(0, this.scene, u.uTex); X.blit(L[0]);
    u = X.use("down");
    for (let i = 1; i < L.length; i++) {
      gl.uniform2f(u.uT, .5 / L[i - 1].w, .5 / L[i - 1].h);
      X.tex(0, L[i - 1], u.uTex); X.blit(L[i]);
    }
    u = X.use("up");
    X.blend("add");
    for (let i = L.length - 1; i > 0; i--) {
      gl.uniform2f(u.uT, .5 / L[i].w, .5 / L[i].h);
      X.tex(0, L[i], u.uTex); X.blit(L[i - 1]);
    }
    X.blend(null);
    u = X.use("final");
    gl.uniform2f(u.uRes, this.W, this.H);
    gl.uniform1f(u.uBloomAmt, p.bloom); gl.uniform1f(u.uExposure, p.exposure);
    gl.uniform1f(u.uChroma, p.chroma); gl.uniform1f(u.uGrain, p.grain);
    gl.uniform1f(u.uPixel, p.pixel); gl.uniform1f(u.uKaleido, p.kaleido);
    gl.uniform1f(u.uTime, p.time); gl.uniform1f(u.uVignette, p.vignette);
    gl.uniform1i(u.uWarpN, p.warp.length / 4);
    if (p.warp.length) gl.uniform4fv(u.uWarp, p.warp);
    X.tex(0, this.scene, u.uScene); X.tex(1, L[0], u.uBloom);
    X.blit(null);
  }
}
