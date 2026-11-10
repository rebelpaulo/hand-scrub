// Camada de brilho partilhada pelas experiências desenhadas em Canvas 2D.
//
// Lê o canvas da experiência como textura e desenha, num canvas WebGL2 por
// cima, apenas o halo (bloom) — somado ao que está por baixo. Não substitui a
// imagem original, por isso funciona igual sobre fundo preto ou sobre o vídeo
// da câmara, e se o WebGL2 faltar a experiência fica exatamente como estava.
//
//   const glow = attachGlow(canvas, { amount: 1 });
//   ...no fim de cada quadro:  glow?.render();

const VS = `#version 300 es
layout(location=0) in vec2 p; out vec2 v;
void main(){ v=p*.5+.5; gl_Position=vec4(p,0.,1.); }`;
const HEAD = `#version 300 es
precision highp float; in vec2 v; out vec4 o; uniform sampler2D t; uniform vec2 px;
`;
const FS = {
  // Reduz a metade, passa a luz linear e fica só com o que brilha.
  pre: HEAD + `uniform float thr,knee;
void main(){
  vec3 c=(texture(t,v+px*vec2(-.5,-.5)).rgb+texture(t,v+px*vec2(.5,-.5)).rgb
         +texture(t,v+px*vec2(-.5,.5)).rgb+texture(t,v+px*vec2(.5,.5)).rgb)*.25;
  c=pow(c,vec3(2.2));
  float b=max(c.r,max(c.g,c.b));
  float soft=clamp(b-thr+knee,0.,2.*knee); soft=soft*soft/(4.*knee+1e-4);
  o=vec4(c*max(soft,b-thr)/max(b,1e-4),1.);
}`,
  down: HEAD + `void main(){
  vec3 s=texture(t,v).rgb*4.;
  s+=texture(t,v-px).rgb+texture(t,v+px).rgb+texture(t,v+vec2(px.x,-px.y)).rgb+texture(t,v-vec2(px.x,-px.y)).rgb;
  o=vec4(s/8.,1.);
}`,
  up: HEAD + `void main(){
  vec3 s=texture(t,v+vec2(-px.x*2.,0.)).rgb+texture(t,v+vec2(px.x*2.,0.)).rgb
        +texture(t,v+vec2(0.,px.y*2.)).rgb+texture(t,v+vec2(0.,-px.y*2.)).rgb;
  s+=2.*(texture(t,v+vec2(-px.x,px.y)).rgb+texture(t,v+px).rgb+texture(t,v+vec2(px.x,-px.y)).rgb+texture(t,v-px).rgb);
  o=vec4(s/12.,1.);
}`,
  // Halo final: comprime sem mudar o tom, volta a sRGB e junta ruído
  // triangular de ±1/255 para os degradés escuros não fazerem faixas no projetor.
  out: HEAD + `uniform float amt,seed;
float hash(vec2 q){ q=fract(q*vec2(123.34,456.21)); q+=dot(q,q+45.32); return fract(q.x*q.y); }
void main(){
  vec3 c=texture(t,v).rgb*amt;
  c/=1.+max(c.r,max(c.g,c.b))*.5;
  c=pow(c,vec3(1./2.2));
  float n=(hash(gl_FragCoord.xy+seed)+hash(gl_FragCoord.xy*1.37-seed)-1.)/255.;
  o=vec4(max(c+n,0.),0.);
}`,
};

export function attachGlow(source, { amount = 1, threshold = .12, knee = .1, levels = 5 } = {}) {
  knee = Math.min(knee, threshold);   // acima do limiar o joelho deixava passar o fundo escuro
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const float = !!gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("OES_texture_float_linear");

  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:fixed;pointer-events:none;";
  source.after(canvas);

  const programs = {};
  for (const [name, fs] of Object.entries(FS)) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn("glow:", gl.getShaderInfoLog(s)); canvas.remove(); return null; }
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    const u = {};
    for (const n of ["t", "px", "thr", "knee", "amt", "seed"]) u[n] = gl.getUniformLocation(p, n);
    programs[name] = { p, u };
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

  const texture = () => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    return tex;
  };
  const input = texture();
  let chain = [], sw = 0, sh = 0;

  function build() {
    for (const l of chain) { gl.deleteTexture(l.tex); gl.deleteFramebuffer(l.fbo); }
    chain = []; sw = source.width; sh = source.height;
    let w = Math.max(2, sw >> 1), h = Math.max(2, sh >> 1);
    canvas.width = w; canvas.height = h;
    for (let i = 0; i < levels && Math.min(w, h) >= 4; i++, w >>= 1, h >>= 1) {
      const tex = texture();
      gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      chain.push({ tex, fbo, w, h });
    }
  }

  // O halo acompanha a caixa (e o espelho, se houver) do canvas de origem.
  function place() {
    const r = source.getBoundingClientRect(), cs = getComputedStyle(source);
    canvas.style.left = r.left + "px"; canvas.style.top = r.top + "px";
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
    canvas.style.zIndex = cs.zIndex;
    canvas.style.transform = cs.transform === "none" ? "" : cs.transform;
    canvas.style.display = cs.display === "none" || cs.visibility === "hidden" ? "none" : "";
  }
  new ResizeObserver(place).observe(source);
  addEventListener("resize", place);
  place();

  function pass(name, tex, target, w, h, set) {
    const { p, u } = programs[name];
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.t, 0); gl.uniform2f(u.px, 1 / w, 1 / h);
    set?.(u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let off = false, slow = 0, last = 0, frame = 0;
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); off = true; canvas.style.display = "none"; });

  return {
    canvas,
    set amount(v) { amount = v; },
    render() {
      if (off || !source.width || !source.height) return;
      // Salvaguarda para o PC do evento: se os quadros passam de ~28 ms durante
      // dois segundos seguidos, o halo desliga-se e fica a imagem original.
      const now = performance.now(), dt = now - last; last = now;
      slow = dt > 28 && dt < 250 ? slow + 1 : 0;
      if (slow > 120) { off = true; canvas.style.display = "none"; console.warn("glow: desligado para manter a fluidez"); return; }
      if (sw !== source.width || sh !== source.height) { build(); place(); }
      else if (!(frame++ % 30)) place();

      gl.disable(gl.BLEND);
      gl.bindTexture(gl.TEXTURE_2D, input);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      pass("pre", input, chain[0], sw, sh, u => { gl.uniform1f(u.thr, threshold); gl.uniform1f(u.knee, knee); });
      for (let i = 1; i < chain.length; i++) pass("down", chain[i - 1].tex, chain[i], chain[i - 1].w * 2, chain[i - 1].h * 2);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      // O nível mais nítido fica de fora da soma: é a própria imagem, e somá-la
      // outra vez queimava o traço para branco em vez de lhe dar halo.
      for (let i = chain.length - 1; i > 1; i--) pass("up", chain[i].tex, chain[i - 1], chain[i].w * 2, chain[i].h * 2);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      pass("out", chain[Math.min(1, chain.length - 1)].tex, null, 1, 1, u => { gl.uniform1f(u.amt, amount); gl.uniform1f(u.seed, now % 97); });
    },
  };
}
