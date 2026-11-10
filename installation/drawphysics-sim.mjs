// Draw Physics — simulações. Cada sistema responde aos mesmos quatro momentos
// (down / stroke / up / step) e sabe desenhar-se. O estado partilhado `S` traz
// o tamanho do ecrã, a unidade `u` (ecrã curto = 1000 u), a paleta e as
// regulações do painel.

import { Fluid, Field, STRIDE } from "./drawphysics-gl.mjs";

const TAU = Math.PI * 2;
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const hashN = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hashN(xi, yi), hashN(xi + 1, yi), u), lerp(hashN(xi, yi + 1), hashN(xi + 1, yi + 1), u), v);
}
const WHITE = [1, 1, 1];

/* ================= Partículas ================= */
const F = 14; // x y vx vy life max size rot vr ph r g b k
export class Particles {
  constructor(S, cfg) {
    this.S = S;
    const c = this.c = { add: true, emit: "trail", rate: 0, size: [3, 6], life: [1, 2], speed: 0, follow: 0, grav: 0,
      drag: 0, wander: 0, spin: 0, twinkle: 0, bounce: 0, magnet: 0, push: 0, glow: 1, stretch: 0, color: "rand", ...cfg };
    this.max = c.max || (S.small ? 3200 : 6500);
    this.f = new Float32Array(this.max * F);
    this.out = new Float32Array(this.max * STRIDE);
    this.n = 0; this.trail = !!c.trail; this.seeded = false; this.tmp = [0, 0, 0];
    this.align = c.shape === "spark" || c.shape === "rain" || c.shape === "fish";
  }
  clear() { this.n = 0; this.seeded = false; }
  spawn(x, y, vx, vy, col, lifeMul = 1, sizeMul = 1) {
    if (this.n >= this.max) return -1;
    const c = this.c, f = this.f, o = this.n++ * F, life = rnd(c.life[0], c.life[1]) * lifeMul * this.S.ctl.duration;
    f[o] = x; f[o + 1] = y; f[o + 2] = vx; f[o + 3] = vy; f[o + 4] = life; f[o + 5] = life;
    f[o + 6] = rnd(c.size[0], c.size[1]) * sizeMul; f[o + 7] = rnd(TAU); f[o + 8] = c.spin ? rnd(-c.spin, c.spin) : 0;
    f[o + 9] = Math.random(); f[o + 10] = col[0]; f[o + 11] = col[1]; f[o + 12] = col[2]; f[o + 13] = Math.random();
    return o;
  }
  color(vp) {
    const { S, c, tmp } = this;
    if (typeof c.color === "number") return S.pal[c.color];
    if (c.color === "stroke" && vp) return S.cyc(vp.hue + rnd(.06), tmp);
    return S.pick(tmp);
  }
  burst(x, y) {
    const { S, c } = this, col = S.cyc(Math.random(), [0, 0, 0]), n = c.burst * (S.small ? .6 : 1);
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU), sp = c.speed * S.u * S.ctl.size * (Math.random() < .3 ? rnd(.2, .6) : rnd(.75, 1));
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, col);
    }
  }
  down(vp) { if (this.c.emit === "burst") { this.burst(vp.x, vp.y); vp.bd = 0; } }
  up() {}
  stroke(vp, dt) {
    const { S, c } = this, u = S.u, dist = Math.hypot(vp.x - vp.px, vp.y - vp.py) / u;
    if (c.emit === "burst") {
      vp.bd = (vp.bd || 0) + dist;
      if (vp.bd > c.every) { vp.bd = 0; this.burst(vp.x, vp.y); }
      return;
    }
    if (!c.rate) return;
    let acc = (vp.acc.get(this) || 0) + dist * c.rate / 100 + c.rate * .6 * dt;
    const jit = (c.jit ?? 7) * u * S.ctl.size;
    let guard = 300;
    while (acc >= 1 && guard--) {
      acc--;
      const t = Math.random(), a = rnd(TAU), r = Math.sqrt(Math.random()) * jit, sp = c.speed * u * rnd(.25, 1), b = rnd(TAU);
      this.spawn(lerp(vp.px, vp.x, t) + Math.cos(a) * r, lerp(vp.py, vp.y, t) + Math.sin(a) * r,
        vp.vx * c.follow + Math.cos(b) * sp + (c.vx || 0) * u,
        vp.vy * c.follow + Math.sin(b) * sp + (c.vy || 0) * u - (c.up || 0) * u * rnd(.6, 1), this.color(vp));
    }
    vp.acc.set(this, acc);
  }
  ambient() {
    const { S, c } = this, u = S.u;
    const target = Math.min(this.max * .8, c.ambient * (S.W * S.H) / (u * u) / 1e6 * (S.small ? .6 : 1));
    let budget = this.seeded ? 14 : target;
    while (this.n < target && budget-- > 0) {
      const top = c.from === "top" && this.seeded;
      const o = this.spawn(rnd(-.1, 1.1) * S.W, top ? -20 * u : rnd(S.H), (c.vx || 0) * u + rnd(-1, 1) * c.speed * u,
        (c.vy || 0) * u + rnd(-1, 1) * c.speed * u, this.color());
      if (o >= 0 && !this.seeded) this.f[o + 4] *= Math.random();   // idades diferentes no arranque
    }
    this.seeded = true;
  }
  update(dt) {
    const { S, c, f } = this, u = S.u, W = S.W, H = S.H, t = S.time;
    if (c.ambient) this.ambient();
    const g = c.grav * u * S.ctl.gravity, drag = Math.exp(-c.drag * dt), wander = c.wander * u * S.ctl.swirl;
    const k = 5 / (1000 * u), vps = S.vps, mag = c.magnet * u, pushR = 170 * u * S.ctl.size, flow = (c.flow || 0) * u;
    const margin = 60 * u;
    for (let i = this.n - 1; i >= 0; i--) {
      const o = i * F;
      let x = f[o], y = f[o + 1], vx = f[o + 2], vy = f[o + 3];
      if ((f[o + 4] -= dt) <= 0 || y > H + margin * 2 || y < -margin * 4 || x < -W * .3 || x > W * 1.3) {
        f.copyWithin(o, (this.n - 1) * F, this.n * F); this.n--; continue;
      }
      const ph = f[o + 9];
      let ax = 0, ay = g;
      if (wander) { ax += Math.sin(y * k + t * 1.3 + ph * 6.28) * wander; ay += Math.cos(x * k + t * 1.1 + ph * 4.1) * wander * .6; }
      if (flow) {
        const a = vnoise(x * k * .55, y * k * .55 + t * .06) * TAU * 2 + ph * .5;
        vx += (Math.cos(a) * flow - vx) * Math.min(1, dt * 2.2); vy += (Math.sin(a) * flow - vy) * Math.min(1, dt * 2.2);
      }
      if (this.hook) { const h = this.hook(x, y, vx, vy, o, dt); if (h === false) { f[o + 4] = 0; continue; } ax += h[0]; ay += h[1]; }
      for (let j = 0; j < vps.length; j++) {
        const p = vps[j], dx = p.x - x, dy = p.y - y, d2 = dx * dx + dy * dy;
        if (mag && p.down && d2 < pushR * pushR * 9) { const d = Math.sqrt(d2) + 1; ax += dx / d * mag; ay += dy / d * mag; }
        if (c.push && d2 < pushR * pushR) {
          const w = (1 - Math.sqrt(d2) / pushR) * c.push * Math.min(1, dt * 7);
          vx += (p.vx - vx) * w; vy += (p.vy - vy) * w;
        }
      }
      vx = (vx + ax * dt) * drag; vy = (vy + ay * dt) * drag;
      x += vx * dt; y += vy * dt;
      if (c.bounce) {
        if (y > H - 4 * u && vy > 0) { y = H - 4 * u; vy *= -c.bounce; vx *= .82; f[o + 8] *= .7; }
        if (y < 4 * u && vy < 0) { y = 4 * u; vy *= -c.bounce; }
        if (x < 4 * u && vx < 0) { x = 4 * u; vx *= -c.bounce; }
        if (x > W - 4 * u && vx > 0) { x = W - 4 * u; vx *= -c.bounce; }
      } else if (c.ambient) {
        if (x < -margin) x += W + margin * 2; else if (x > W + margin) x -= W + margin * 2;
        if (c.from === "any") { if (y < -margin) y += H + margin * 2; else if (y > H + margin) y -= H + margin * 2; }
      }
      f[o] = x; f[o + 1] = y; f[o + 2] = vx; f[o + 3] = vy;
      f[o + 7] += f[o + 8] * dt;
      if (c.flip) f[o + 13] += (c.spinFlip || 3) * dt * (.4 + ph);
    }
  }
  fill() {
    const { S, c, f, out } = this, u = S.u, t = S.time, sz = u * S.ctl.size, glow = c.add ? c.glow * (.55 + .45 * S.ctl.glow) : c.glow;
    for (let i = 0; i < this.n; i++) {
      const o = i * F, q = i * STRIDE, age = 1 - f[o + 4] / f[o + 5];
      let a = Math.min(1, age * 9) * Math.min(1, (1 - age) * 3.2);
      if (c.twinkle) a *= 1 - c.twinkle * (.5 + .5 * Math.sin(t * (c.slow ? 2.2 : 9) + f[o + 9] * 40));
      const vx = f[o + 2], vy = f[o + 3];
      out[q] = f[o]; out[q + 1] = f[o + 1];
      out[q + 2] = f[o + 6] * sz * (c.wobble ? 1 + .12 * Math.sin(t * 5 + f[o + 9] * 30) : 1);
      out[q + 3] = this.align ? Math.atan2(vy, vx) : f[o + 7];
      out[q + 4] = f[o + 10] * glow; out[q + 5] = f[o + 11] * glow; out[q + 6] = f[o + 12] * glow; out[q + 7] = a;
      out[q + 8] = c.stretch ? clamp(1 + Math.hypot(vx, vy) / u * c.stretch, 1, 16) : 1;
      out[q + 9] = c.flip ? f[o + 13] : f[o + 9] * TAU;
    }
  }
  step(dt) { this.update(dt); }
  render(G) { this.fill(); G.sprites.draw(this.out, this.n, this.c.shape, this.c.add, G.W, G.H); }
  draw(G) { if (!this.trail) this.render(G); }
  drawTrail(G) { if (this.trail) this.render(G); }
}

/* ================= Fluido ================= */
const MONO = { fire: 1, liquid: 1, topo: 1, psy: 1, lava: 1 };
export class FluidSys {
  constructor(S, X, c) {
    this.S = S; this.c = { mode: "glow", radius: 1, force: 1, diss: .5, vdiss: .4, curl: 18, amount: 1, ...c };
    this.fluid = new Fluid(X, S.W, S.H, S.small); this.tmp = [0, 0, 0];
  }
  free() { this.fluid.free(); }
  clear() { this.fluid.clear(); }
  down() {} up() {}
  stroke(vp, dt) {
    const { S, c } = this, W = S.W, H = S.H;
    const ax = vp.px / W, ay = 1 - vp.py / H, bx = vp.x / W, by = 1 - vp.y / H;
    const k = c.amount * Math.min(dt, .05) * 8, col = MONO[c.mode] ? WHITE : S.cyc(vp.hue, this.tmp);
    const radius = .03 * c.radius * S.ctl.size;
    this.fluid.splat(ax, ay, bx, by, (bx - ax) / dt, (by - ay) / dt, [col[0] * k, col[1] * k, col[2] * k], radius, c.force * Math.min(1, dt * 9));
    if (c.spin) this.fluid.swirl(bx, by, radius * 2.6, (vp.id % 2 ? -1 : 1) * 26 * c.spin * S.ctl.swirl * dt);
  }
  step(dt) {
    const { S, c } = this;
    this.fluid.step(dt, { curl: c.curl * S.ctl.swirl, lift: ((c.buoy || 0) + (c.grav || 0)) * S.ctl.gravity,
      diss: c.diss / S.ctl.duration, vdiss: c.vdiss });
  }
  drawBase(G) { this.fluid.draw(G.scene, this.c.mode, this.S.pal, this.S.time, this.c.inten || 1); }
}

/* ================= Ondas (lago) ================= */
export class WavesSys {
  constructor(S, X) { this.S = S; this.field = new Field(X, S.W, S.H, S.small ? 200 : 300); this.next = 0; }
  free() { this.field.free(); }
  clear() { this.field.clear(); }
  drop(x, y, amp, r) { this.field.splat(x, y, x, y, [amp, 0, 0], r); }
  down(vp) { this.drop(vp.x / this.S.W, 1 - vp.y / this.S.H, 1.1, .016 * this.S.ctl.size); }
  up() {}
  stroke(vp, dt) {
    const { S } = this;
    this.field.splat(vp.px / S.W, 1 - vp.py / S.H, vp.x / S.W, 1 - vp.y / S.H, [Math.min(dt, .05) * 9, 0, 0], .011 * S.ctl.size);
  }
  step(dt) {
    const { S } = this;
    if (S.time > this.next) { this.next = S.time + rnd(.8, 2.4); this.drop(Math.random(), Math.random(), rnd(.15, .4), .01); }
    const damp = Math.exp(-dt * .5 / S.ctl.duration);
    this.field.step("waveStep", (gl, u) => { gl.uniform1f(u.uSpeed, 1.05); gl.uniform1f(u.uDamp, damp); }, 3);
  }
  drawBase(G) {
    const { S } = this;
    this.field.draw("waveShow", G.scene, S.pal, (gl, u) => {
      gl.uniform1f(u.uTime, S.time); gl.uniform1f(u.uAspect, S.W / S.H); gl.uniform1f(u.uInten, 1);
    });
  }
}

/* ================= Reação-difusão ================= */
const SEED = [-.5, .9, 0];
export class RDSys {
  constructor(S, X, c) { this.S = S; this.c = c; this.field = new Field(X, S.W, S.H, S.small ? 220 : 320, [1, 0, 0, 1]); }
  free() { this.field.free(); }
  clear() { this.field.clear(); }
  down() {} up() {}
  stroke(vp) {
    const { S } = this;
    this.field.splat(vp.px / S.W, 1 - vp.py / S.H, vp.x / S.W, 1 - vp.y / S.H, SEED, .011 * S.ctl.size);
  }
  step() {
    const { c } = this;
    this.field.step("rdStep", (gl, u) => { gl.uniform1f(u.uF, c.F); gl.uniform1f(u.uK, c.k); }, c.steps || (this.S.small ? 8 : 12));
  }
  drawBase(G) { this.field.draw("rdShow", G.scene, this.S.pal, (gl, u) => gl.uniform1f(u.uInten, 1)); }
}

/* ================= Vitral (Voronoi) ================= */
export class VoronoiSys {
  constructor(S, X) { this.S = S; this.X = X; this.seeds = []; this.data = new Float32Array(48 * 4); }
  clear() { this.seeds.length = 0; }
  add(x, y) {
    if (this.seeds.length >= 48) this.seeds.shift();
    this.seeds.push({ x, y, vx: rnd(-1, 1), vy: rnd(-1, 1), ph: Math.random(), born: this.S.time });
  }
  down(vp) { this.add(vp.x, vp.y); vp.vd = 0; }
  up() {}
  stroke(vp) {
    vp.vd = (vp.vd || 0) + Math.hypot(vp.x - vp.px, vp.y - vp.py);
    if (vp.vd > 74 * this.S.u * this.S.ctl.size) { vp.vd = 0; this.add(vp.x, vp.y); }
  }
  step(dt) {
    const { S, seeds } = this, u = S.u, life = 16 * S.ctl.duration;
    for (let i = seeds.length - 1; i >= 0; i--) {
      const s = seeds[i];
      if (S.time - s.born > life) { seeds.splice(i, 1); continue; }
      for (const q of seeds) {
        if (q === s) continue;
        const dx = s.x - q.x, dy = s.y - q.y, d = Math.hypot(dx, dy) + 1, r = 90 * u;
        if (d < r) { s.vx += dx / d * (r - d) * .02; s.vy += dy / d * (r - d) * .02; }
      }
      s.vx *= .96; s.vy *= .96;
      s.x = clamp(s.x + s.vx * 12 * u * dt, 0, S.W); s.y = clamp(s.y + s.vy * 12 * u * dt, 0, S.H);
    }
  }
  drawBase(G) {
    const { S, X, seeds, data } = this, gl = X.gl, life = 16 * S.ctl.duration, asp = S.W / S.H;
    seeds.forEach((s, i) => {
      const age = S.time - s.born;
      data[i * 4] = s.x / S.W * asp; data[i * 4 + 1] = 1 - s.y / S.H; data[i * 4 + 2] = s.ph;
      data[i * 4 + 3] = Math.min(1, age * 2.5) * Math.min(1, (life - age) * .6);
    });
    const u = X.use("voronoi");
    X.blend("alpha");
    gl.uniform1i(u.uCount, seeds.length); gl.uniform1f(u.uAspect, asp); gl.uniform1f(u.uInten, 1);
    if (seeds.length) gl.uniform4fv(u.uSeeds, data);
    X.colors(u, S.pal);
    X.blit(G.scene);
  }
}

/* ================= Lâmpada de lava (metaballs) ================= */
export class MetaSys {
  constructor(S, X) { this.S = S; this.X = X; this.data = new Float32Array(40 * 4); this.clear(); }
  clear() { this.b = []; for (let i = 0; i < 9; i++) this.add(rnd(this.S.W), rnd(this.S.H), rnd(.045, .085)); }
  add(x, y, r) {
    if (this.b.length >= 30) this.b.splice(9, 1);
    this.b.push({ x, y, vx: 0, vy: 0, r, ph: Math.random(), heat: Math.random() });
  }
  down(vp) { this.add(vp.x, vp.y, rnd(.04, .075) * this.S.ctl.size); vp.blob = this.b[this.b.length - 1]; }
  up(vp) { vp.blob = null; }
  stroke(vp) { const b = vp.blob; if (b) { b.vx += (vp.x - b.x) * .35; b.vy += (vp.y - b.y) * .35; } }
  step(dt) {
    const { S, b } = this, H = S.H, W = S.W;
    for (const s of b) {
      const yn = s.y / H;                                    // 0 em cima, 1 em baixo
      s.heat += ((yn > .82 ? 1 : yn < .18 ? 0 : s.heat) - s.heat) * dt * .8;
      s.vy += (.5 - s.heat) * 260 * S.u * S.ctl.gravity * dt;   // quente sobe, frio desce
      s.vx += Math.sin(S.time * .5 + s.ph * 9) * 14 * S.u * dt;
      s.vx *= Math.exp(-1.6 * dt); s.vy *= Math.exp(-1.6 * dt);
      s.x += s.vx * dt; s.y += s.vy * dt;
      const m = s.r * H * .6;
      if (s.x < m) { s.x = m; s.vx *= -.4; } if (s.x > W - m) { s.x = W - m; s.vx *= -.4; }
      if (s.y < m) { s.y = m; s.vy *= -.4; } if (s.y > H - m) { s.y = H - m; s.vy *= -.4; }
    }
  }
  drawBase(G) {
    const { S, X, b, data } = this, gl = X.gl, asp = S.W / S.H;
    b.forEach((s, i) => { data[i * 4] = s.x / S.W * asp; data[i * 4 + 1] = 1 - s.y / S.H; data[i * 4 + 2] = s.r; data[i * 4 + 3] = s.ph; });
    const u = X.use("meta");
    X.blend("alpha");
    gl.uniform1i(u.uCount, b.length); gl.uniform1f(u.uAspect, asp); gl.uniform1f(u.uInten, 1);
    gl.uniform4fv(u.uBalls, data);
    X.colors(u, S.pal);
    X.blit(G.scene);
  }
}

/* ================= Fitas (rastos atrás do dedo) ================= */
export class RibbonSys {
  constructor(S, c) { this.S = S; this.c = c; this.trails = []; this.ca = [[0, 0, 0], 1]; }
  clear() { this.trails.length = 0; }
  down(vp) { vp.trail = { pts: [{ x: vp.x, y: vp.y, t: this.S.time }], hue: vp.hue }; this.trails.push(vp.trail); }
  up(vp) { vp.trail = null; }
  stroke(vp) {
    const tr = vp.trail; if (!tr) return;
    const last = tr.pts[tr.pts.length - 1];
    if (!last || Math.hypot(vp.x - last.x, vp.y - last.y) > 3 * this.S.u) tr.pts.push({ x: vp.x, y: vp.y, t: this.S.time });
  }
  step() {
    const { S, c } = this, life = c.life * S.ctl.duration;
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const p = this.trails[i].pts;
      while (p.length && S.time - p[0].t > life) p.shift();
      if (p.length < 1 && !S.vps.some(v => v.trail === this.trails[i])) this.trails.splice(i, 1);
    }
  }
  draw(G) {
    const { S, c, ca } = this, life = c.life * S.ctl.duration, w = c.width * S.u * S.ctl.size, glow = .6 + .9 * S.ctl.glow;
    for (const tr of this.trails) {
      const p = tr.pts;
      G.ribbons.strip(p, i => w * (.25 + .75 * Math.pow(1 - (S.time - p[i].t) / life, .6)) * Math.min(1, i / 3 + .3), (i, n) => {
        const age = (S.time - p[i].t) / life;
        S.cyc(tr.hue + i * .004, ca[0]);
        ca[0][0] *= glow; ca[0][1] *= glow; ca[0][2] *= glow;
        ca[1] = Math.min(1, (1 - age) * 2.2);
        return ca;
      });
    }
    G.ribbons.flush(c.style, c.style !== "tri", G.W, G.H, S.pal.map(k => [k[0] * glow, k[1] * glow, k[2] * glow]));
  }
}

/* ================= Raios ================= */
function bolt(x0, y0, x1, y1, jag, depth) {
  let pts = [{ x: x0, y: y0 }, { x: x1, y: y1 }], off = Math.hypot(x1 - x0, y1 - y0) * jag;
  for (let d = 0; d < depth; d++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1, r = (Math.random() - .5) * off;
      np.push({ x: (a.x + b.x) / 2 + (a.y - b.y) / len * r, y: (a.y + b.y) / 2 + (b.x - a.x) / len * r }, b);
    }
    pts = np; off *= .54;
  }
  return pts;
}
export class BoltSys {
  constructor(S, c) { this.S = S; this.c = c; this.list = []; this.next = 0; this.ca = [[0, 0, 0], 1]; }
  clear() { this.list.length = 0; }
  down(vp) { vp.ax = vp.x; vp.ay = vp.y; } up() {}
  stroke() {}
  push(x0, y0, x1, y1, w, ttl, branches) {
    const pts = bolt(x0, y0, x1, y1, .28, 6), S = this.S;
    this.list.push({ pts, w, born: S.time, ttl, c: S.pick([0, 0, 0]) });
    for (let b = 0; b < branches; b++) {
      const p = pts[(rnd(.2, .8) * pts.length) | 0], a = Math.atan2(y1 - y0, x1 - x0) + rnd(-1.1, 1.1), l = Math.hypot(x1 - x0, y1 - y0) * rnd(.2, .45);
      this.list.push({ pts: bolt(p.x, p.y, p.x + Math.cos(a) * l, p.y + Math.sin(a) * l, .3, 4), w: w * .5, born: S.time, ttl, c: S.pal[1] });
    }
  }
  step() {
    const { S, c } = this, u = S.u, size = S.ctl.size;
    this.list = this.list.filter(b => S.time - b.born < b.ttl);
    if (S.time < this.next) return;
    this.next = S.time + .045;
    const downs = S.vps.filter(v => v.down);
    if (c.type === "strike") {
      for (const v of downs) for (let i = 0; i < 2; i++) {
        const a = rnd(TAU), l = rnd(200, 520) * u * size;
        this.push(v.x, v.y, v.x + Math.cos(a) * l, v.y + Math.sin(a) * l, 3.2 * u, .1, 2);
      }
    } else if (downs.length > 1) {
      for (let i = 0; i < downs.length - 1; i++) for (let k = 0; k < 2; k++)
        this.push(downs[i].x, downs[i].y, downs[i + 1].x, downs[i + 1].y, (k ? 1.8 : 4) * u * size, .09, k ? 0 : 1);
    } else if (downs.length && Math.hypot(downs[0].x - downs[0].ax, downs[0].y - downs[0].ay) > 30 * u) {
      const v = downs[0];
      for (let k = 0; k < 2; k++) this.push(v.ax, v.ay, v.x, v.y, (k ? 1.8 : 4) * u * size, .09, k ? 0 : 1);
    }
  }
  draw(G) {
    const { S, ca } = this, glow = 1.2 + 1.6 * S.ctl.glow;
    for (const b of this.list) {
      const a = 1 - (S.time - b.born) / b.ttl;
      ca[0][0] = b.c[0] * glow; ca[0][1] = b.c[1] * glow; ca[0][2] = b.c[2] * glow; ca[1] = a;
      G.ribbons.strip(b.pts, (i, n) => b.w * (2.2 - i / n), () => ca);
    }
    G.ribbons.flush("core", true, G.W, G.H);
  }
}

/* ================= Laser ricochete ================= */
export class LaserSys {
  constructor(S) {
    this.S = S; this.beams = []; this.ca = [[0, 0, 0], 1];
    this.sparks = new Particles(S, { shape: "spark", size: [1.6, 3], life: [.25, .7], grav: 500, drag: 1, glow: 4, stretch: .02, color: 0, max: 1500 });
  }
  clear() { this.beams.length = 0; this.sparks.clear(); }
  down(vp) { vp.beam = { ox: vp.x, oy: vp.y, pts: [], live: true, end: 0 }; this.beams.push(vp.beam); }
  up(vp) { if (vp.beam) { vp.beam.live = false; vp.beam.end = this.S.time; vp.beam = null; } }
  stroke(vp) {
    const b = vp.beam, S = this.S; if (!b) return;
    let dx = vp.x - b.ox, dy = vp.y - b.oy; const len = Math.hypot(dx, dy);
    if (len < 10 * S.u) return;
    dx /= len; dy /= len;
    let x = b.ox, y = b.oy, left = Math.hypot(S.W, S.H) * 4.5;
    b.pts = [{ x, y }];
    for (let i = 0; i < 11 && left > 0; i++) {
      const tx = dx > 0 ? (S.W - x) / dx : dx < 0 ? -x / dx : 1e9, ty = dy > 0 ? (S.H - y) / dy : dy < 0 ? -y / dy : 1e9;
      const t = Math.min(tx, ty, left);
      x += dx * t; y += dy * t; left -= t;
      b.pts.push({ x, y });
      if (left <= 0) break;
      if (Math.random() < .5) {
        const a = rnd(TAU), sp = rnd(120, 420) * S.u;
        this.sparks.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, S.pal[i % 3]);
      }
      if (tx < ty) dx = -dx; else dy = -dy;
    }
  }
  step(dt) {
    this.beams = this.beams.filter(b => b.live || this.S.time - b.end < .6);
    this.sparks.update(dt);
  }
  draw(G) {
    const { S, ca } = this, glow = 1.2 + 1.8 * S.ctl.glow, w = 5 * S.u * S.ctl.size;
    for (const b of this.beams) {
      if (b.pts.length < 2) continue;
      const fade = b.live ? 1 : 1 - (S.time - b.end) / .6, n = b.pts.length;
      for (let i = 0; i < n - 1; i++) {
        const c = S.pal[(i % 2) * 2], a = fade * (1 - i / (n + 2));
        ca[0][0] = c[0] * glow; ca[0][1] = c[1] * glow; ca[0][2] = c[2] * glow;
        G.ribbons.seg(b.pts[i].x, b.pts[i].y, b.pts[i + 1].x, b.pts[i + 1].y, w, w, ca[0], a, ca[0], a * .9);
      }
    }
    G.ribbons.flush("core", true, G.W, G.H);
    this.sparks.render(G);
  }
}

/* ================= Cordas, correntes, arame e tentáculos ================= */
const ROPE = {
  rope:     { seg: 9,  grav: 1500, damp: .992, w: 5.5, style: "rope", add: false, life: 9 },
  chain:    { seg: 17, grav: 2100, damp: .995, w: 8,   style: "rope", add: false, life: 9 },
  barbed:   { seg: 10, grav: 500,  damp: .96,  w: 1.8, style: "wire", add: false, life: 10 },
  tentacle: { seg: 11, grav: 0,    damp: .93,  w: 9,   style: "core", add: true,  life: 5, pinRoot: true },
};
export class RopeSys {
  constructor(S, c) {
    this.S = S; this.t = ROPE[c.type]; this.type = c.type; this.ropes = []; this.ca = [[0, 0, 0], 1];
    this.out = new Float32Array(2600 * STRIDE);
  }
  clear() { this.ropes.length = 0; }
  down(vp) {
    if (this.ropes.length >= (this.S.small ? 6 : 12)) this.ropes.shift();
    vp.rope = { p: [{ x: vp.x, y: vp.y, px: vp.x, py: vp.y }], held: true, born: this.S.time, hue: vp.hue, hx: vp.x, hy: vp.y };
    this.ropes.push(vp.rope);
  }
  up(vp) { if (vp.rope) { vp.rope.held = false; vp.rope.born = this.S.time; vp.rope = null; } }
  stroke(vp) {
    const r = vp.rope; if (!r) return;
    r.hx = vp.x; r.hy = vp.y;
    const seg = this.t.seg * this.S.u, last = r.p[r.p.length - 1];
    let d = Math.hypot(vp.x - last.x, vp.y - last.y), guard = 12;
    while (d > seg && r.p.length < 170 && guard--) {
      const l = r.p[r.p.length - 1], k = seg / d;
      const x = l.x + (vp.x - l.x) * k, y = l.y + (vp.y - l.y) * k;
      r.p.push({ x, y, px: x, py: y });
      d -= seg;
    }
  }
  step(dt) {
    const { S, t } = this, u = S.u, seg = t.seg * u, g = t.grav * u * S.ctl.gravity * dt * dt, life = t.life * S.ctl.duration;
    this.ropes = this.ropes.filter(r => r.held || S.time - r.born < life);
    for (const r of this.ropes) {
      const p = r.p, n = p.length;
      for (let i = 0; i < n; i++) {
        const q = p[i]; let vx = (q.x - q.px) * t.damp, vy = (q.y - q.py) * t.damp;
        q.px = q.x; q.py = q.y;
        if (this.type === "tentacle") {
          const k = i / n;
          vx += Math.sin(S.time * 3 + i * .35 + r.hue * 20) * .5 * u * k; vy += Math.cos(S.time * 2.3 + i * .3) * .5 * u * k;
        }
        q.x += vx; q.y += vy + g;
      }
      for (let it = 0; it < 9; it++) {
        if (r.held) { p[n - 1].x = r.hx; p[n - 1].y = r.hy; }
        if (t.pinRoot) { p[0].x = p[0].px; p[0].y = p[0].py; }
        for (let i = 0; i < n - 1; i++) {
          const a = p[i], b = p[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, k = (d - seg) / d * .5;
          a.x += dx * k; a.y += dy * k; b.x -= dx * k; b.y -= dy * k;
        }
        for (const q of p) {
          if (q.y > S.H - 5 * u) { q.y = S.H - 5 * u; q.px = q.px + (q.x - q.px) * .35; }
          if (q.y < 3 * u) q.y = 3 * u;
          if (q.x < 3 * u) q.x = 3 * u; else if (q.x > S.W - 3 * u) q.x = S.W - 3 * u;
        }
      }
      if (t.pinRoot && !r.held) {   // tentáculo largado recolhe para a raiz
        for (let i = 1; i < n; i++) { p[i].x += (p[0].x - p[i].x) * dt * 1.4; p[i].y += (p[0].y - p[i].y) * dt * 1.4; }
      }
    }
  }
  draw(G) {
    const { S, t, ca, out } = this, u = S.u, life = t.life * S.ctl.duration, glow = t.add ? 1 + 1.4 * S.ctl.glow : 1;
    let n = 0;
    for (const r of this.ropes) {
      const p = r.p, fade = r.held ? 1 : Math.min(1, (life - (S.time - r.born)) * 1.5);
      if (p.length < 2) continue;
      if (this.type === "chain") {
        for (let i = 0; i < p.length - 1 && n < 2590; i++, n++) {
          const a = p[i], b = p[i + 1], q = n * STRIDE, c = S.pal[i % 2 ? 1 : 0];
          out[q] = (a.x + b.x) / 2; out[q + 1] = (a.y + b.y) / 2; out[q + 2] = t.seg * u * .78; out[q + 3] = Math.atan2(b.y - a.y, b.x - a.x);
          out[q + 4] = c[0]; out[q + 5] = c[1]; out[q + 6] = c[2]; out[q + 7] = fade; out[q + 8] = 1; out[q + 9] = 0;
        }
        continue;
      }
      const w = t.w * u * (this.type === "tentacle" ? S.ctl.size : 1);
      G.ribbons.strip(p, (i, m) => this.type === "tentacle" ? w * (.2 + .8 * (1 - i / m)) : w, (i, m) => {
        if (this.type === "tentacle") S.cyc(r.hue + i / m * .5, ca[0]); else { const c = S.pal[1]; ca[0][0] = c[0]; ca[0][1] = c[1]; ca[0][2] = c[2]; }
        ca[0][0] *= glow; ca[0][1] *= glow; ca[0][2] *= glow; ca[1] = fade;
        return ca;
      }, 1 / u);
      if (this.type === "barbed") {
        for (let i = 2; i < p.length - 1 && n < 2590; i += 3, n++) {
          const q = n * STRIDE, c = S.pal[0];
          out[q] = p[i].x; out[q + 1] = p[i].y; out[q + 2] = 8 * u; out[q + 3] = i * 1.7;
          out[q + 4] = c[0]; out[q + 5] = c[1]; out[q + 6] = c[2]; out[q + 7] = fade; out[q + 8] = 1; out[q + 9] = 0;
        }
      }
    }
    G.ribbons.flush(t.style, t.add, G.W, G.H);
    G.sprites.draw(out, n, this.type === "chain" ? "link" : "star", false, G.W, G.H);
  }
}

/* ================= Bolas saltitonas ================= */
export class WorldSys {
  constructor(S) { this.S = S; this.b = []; this.out = new Float32Array(90 * STRIDE); }
  clear() { this.b.length = 0; }
  add(vp) {
    const S = this.S;
    if (this.b.length >= (S.small ? 45 : 80)) this.b.shift();
    this.b.push({ x: vp.x, y: vp.y, vx: vp.vx * .6 + rnd(-60, 60) * S.u, vy: vp.vy * .6 + rnd(-60, 60) * S.u,
      r: rnd(13, 30) * S.u * S.ctl.size, c: S.pick([0, 0, 0]), born: S.time });
  }
  down(vp) { this.add(vp); vp.wd = 0; } up() {}
  stroke(vp) {
    vp.wd = (vp.wd || 0) + Math.hypot(vp.x - vp.px, vp.y - vp.py);
    if (vp.wd > 95 * this.S.u * this.S.ctl.size) { vp.wd = 0; this.add(vp); }
  }
  step(dt) {
    const { S, b } = this, g = 1700 * S.u * S.ctl.gravity, life = 10 * S.ctl.duration, h = dt / 2;
    this.b = b.filter(s => S.time - s.born < life);
    for (let sub = 0; sub < 2; sub++) {
      for (const s of this.b) {
        s.vy += g * h; s.x += s.vx * h; s.y += s.vy * h;
        if (s.x < s.r) { s.x = s.r; s.vx = Math.abs(s.vx) * .8; } else if (s.x > S.W - s.r) { s.x = S.W - s.r; s.vx = -Math.abs(s.vx) * .8; }
        if (s.y < s.r) { s.y = s.r; s.vy = Math.abs(s.vy) * .8; } else if (s.y > S.H - s.r) { s.y = S.H - s.r; s.vy = -Math.abs(s.vy) * .8; s.vx *= .992; }
      }
      for (let i = 0; i < this.b.length; i++) for (let j = i + 1; j < this.b.length; j++) {
        const a = this.b[i], c = this.b[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1, o = a.r + c.r - d;
        if (o <= 0) continue;
        const nx = dx / d, ny = dy / d, ma = a.r * a.r, mc = c.r * c.r, t = ma + mc;
        a.x -= nx * o * mc / t; a.y -= ny * o * mc / t; c.x += nx * o * ma / t; c.y += ny * o * ma / t;
        const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rv < 0) { const k = -1.85 * rv / t; a.vx -= nx * k * mc; a.vy -= ny * k * mc; c.vx += nx * k * ma; c.vy += ny * k * ma; }
      }
    }
  }
  draw(G) {
    const { S, out } = this, life = 10 * S.ctl.duration, glow = .8 + .5 * S.ctl.glow;
    this.b.forEach((s, i) => {
      const q = i * STRIDE;
      out[q] = s.x; out[q + 1] = s.y; out[q + 2] = s.r; out[q + 3] = 0;
      out[q + 4] = s.c[0] * glow; out[q + 5] = s.c[1] * glow; out[q + 6] = s.c[2] * glow;
      out[q + 7] = Math.min(1, (life - (S.time - s.born)) * 2); out[q + 8] = 1; out[q + 9] = 0;
    });
    G.sprites.draw(out, this.b.length, "ball", false, G.W, G.H);
  }
}

/* ================= Blocos 8-bit ================= */
export class BlockSys {
  constructor(S) { this.S = S; this.out = new Float32Array(1400 * STRIDE); this.clear(); }
  clear() { this.fall = []; this.cols = new Map(); }
  grid() { return Math.max(12, Math.round(38 * this.S.u * this.S.ctl.size)); }
  down(vp) { vp.bk = 1e9; } up() {}
  stroke(vp) {
    const g = this.grid();
    vp.bk = (vp.bk || 0) + Math.hypot(vp.x - vp.px, vp.y - vp.py);
    if (vp.bk < g * .7 || this.fall.length > 500) return;
    vp.bk = 0;
    this.fall.push({ col: Math.floor(vp.x / g), y: Math.floor(vp.y / g) * g + g / 2, vy: 0, c: this.S.pick([0, 0, 0]) });
  }
  step(dt) {
    const { S } = this, g = this.grid(), life = 8 * S.ctl.duration, maxRows = Math.floor(S.H / g) - 2;
    for (let i = this.fall.length - 1; i >= 0; i--) {
      const b = this.fall[i], stack = this.cols.get(b.col) || [];
      b.vy += 2600 * S.u * Math.max(.15, S.ctl.gravity) * dt; b.y += b.vy * dt;
      const floor = S.H - g * stack.length - g / 2;
      if (b.y >= floor) {
        stack.push({ c: b.c, t: S.time });
        if (stack.length > maxRows) stack.shift();
        this.cols.set(b.col, stack); this.fall.splice(i, 1);
      }
    }
    for (const [col, stack] of this.cols) {
      while (stack.length && S.time - stack[0].t > life) stack.shift();
      if (!stack.length) this.cols.delete(col);
    }
  }
  draw(G) {
    const { S, out } = this, g = this.grid(), glow = .9 + .5 * S.ctl.glow; let n = 0;
    const put = (x, y, c, a) => {
      if (n >= 1400) return; const q = n++ * STRIDE;
      out[q] = x; out[q + 1] = y; out[q + 2] = g / 2; out[q + 3] = 0;
      out[q + 4] = c[0] * glow; out[q + 5] = c[1] * glow; out[q + 6] = c[2] * glow; out[q + 7] = a; out[q + 8] = 1; out[q + 9] = 0;
    };
    for (const b of this.fall) put(b.col * g + g / 2, b.y, b.c, 1);
    for (const [col, stack] of this.cols) stack.forEach((b, i) => put(col * g + g / 2, S.H - g * i - g / 2, b.c, 1));
    G.sprites.draw(out, n, "block", false, G.W, G.H);
  }
}

/* ================= Areia ================= */
export class SandSys {
  constructor(S) {
    this.S = S;
    this.cw = Math.max(2, Math.round(3 * S.u));
    this.n = Math.ceil(S.W / this.cw) + 1;
    this.h = new Float32Array(this.n);
    this.grains = new Particles(S, { shape: "block", add: false, rate: 240, size: [1.3, 2.1], life: [6, 6], speed: 70, follow: .25, grav: 1500, drag: .15, color: "rand", jit: 9, max: S.small ? 3000 : 6000 });
    this.grains.hook = (x, y, vx, vy) => {
      const i = clamp(Math.round(x / this.cw), 0, this.n - 1);
      if (y < S.H - this.h[i]) return ZERO;
      this.h[i] += 13 * S.u * S.u * S.ctl.size / this.cw * 2.4;
      return false;
    };
    this.top = [0, 0, 0]; this.bot = [0, 0, 0];
  }
  clear() { this.h.fill(0); this.grains.clear(); }
  down() {} up() {}
  stroke(vp, dt) {
    const { S, h, cw } = this, i = clamp(Math.round(vp.x / cw), 0, this.n - 1);
    if (vp.y > S.H - h[i]) {                      // dedo dentro do monte: escava
      const r = Math.round(26 * S.u * S.ctl.size / cw);
      for (let j = Math.max(0, i - r); j <= Math.min(this.n - 1, i + r); j++) {
        const cut = Math.min(h[j], h[j] * dt * 5 * (1 - Math.abs(j - i) / (r + 1)));
        h[j] -= cut;
        if (cut > .5 && Math.random() < .3) this.grains.spawn(j * cw, S.H - h[j] - 4, rnd(-200, 200) * S.u, -rnd(300, 700) * S.u, S.pick([0, 0, 0]));
      }
      return;
    }
    this.grains.stroke(vp, dt);
  }
  step(dt) {
    const { S, h, n, cw } = this, slope = cw * .95;
    this.grains.update(dt);
    for (let pass = 0; pass < 5; pass++) {
      for (let i = pass % 2; i < n - 1; i++) {
        const d = h[i] - h[i + 1];
        if (d > slope) { const m = (d - slope) * .5; h[i] -= m; h[i + 1] += m; }
        else if (d < -slope) { const m = (-d - slope) * .5; h[i] += m; h[i + 1] -= m; }
      }
    }
    const drain = Math.exp(-dt * .035 / S.ctl.duration), cap = S.H * .72;
    for (let i = 0; i < n; i++) h[i] = Math.min(cap, h[i] * drain);
  }
  draw(G) {
    const { S, h, n, cw, top, bot } = this, R = G.ribbons, p = S.pal;
    for (let k = 0; k < 3; k++) { top[k] = p[0][k] * .95; bot[k] = p[2][k] * .5; }
    for (let i = 0; i < n - 1; i++) {
      if (h[i] < .5 && h[i + 1] < .5) continue;
      const x0 = i * cw, x1 = x0 + cw, y0 = S.H - h[i], y1 = S.H - h[i + 1];
      R.v(x0, y0, 0, 0, top, 1); R.v(x1, y1, 0, 0, top, 1); R.v(x0, S.H, 0, 0, bot, 1);
      R.v(x1, y1, 0, 0, top, 1); R.v(x1, S.H, 0, 0, bot, 1); R.v(x0, S.H, 0, 0, bot, 1);
    }
    R.flush("flat", false, G.W, G.H);
    this.grains.render(G);
  }
}
const ZERO = [0, 0];

/* ================= Tecido (rasga-se) ================= */
export class ClothSys {
  constructor(S) { this.S = S; this.ca = [0, 0, 0]; this.clear(); }
  clear() {
    const S = this.S, cols = this.cols = S.small ? 28 : 40, rows = this.rows = S.small ? 18 : 25;
    const sp = this.sp = Math.min(S.W * .86 / (cols - 1), S.H * .66 / (rows - 1)), x0 = (S.W - sp * (cols - 1)) / 2, y0 = S.H * .07;
    this.p = []; this.c = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = x0 + i * sp, y = y0 + j * sp;
      this.p.push({ x, y, px: x, py: y, pin: j === 0 && i % 3 === 0 });
      const k = j * cols + i;
      if (i) this.c.push([k - 1, k, true]);
      if (j) this.c.push([k - cols, k, true]);
    }
    this.total = this.c.length; this.alive = this.total;
  }
  down() {} up() {}
  stroke(vp) {
    const R = 62 * this.S.u * this.S.ctl.size, dx = vp.x - vp.px, dy = vp.y - vp.py;
    for (const q of this.p) {
      if (q.pin) continue;
      const d = Math.hypot(q.x - vp.x, q.y - vp.y);
      if (d < R) { const f = 1 - d / R; q.x += dx * f; q.y += dy * f; }
    }
  }
  step(dt) {
    const { S, p, sp } = this, g = 900 * S.u * S.ctl.gravity * dt * dt, wind = Math.sin(S.time * .7) * 60 * S.u * S.ctl.swirl * dt * dt;
    for (const q of p) {
      if (q.pin) continue;
      const vx = (q.x - q.px) * .99, vy = (q.y - q.py) * .99;
      q.px = q.x; q.py = q.y;
      q.x += vx + wind * (.5 + .5 * Math.sin(q.y * .01 + S.time)); q.y += vy + g;
    }
    for (let it = 0; it < 4; it++) for (const c of this.c) {
      if (!c[2]) continue;
      const a = p[c[0]], b = p[c[1]], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d > sp * 3.6) { c[2] = false; this.alive--; continue; }
      const k = (d - sp) / d * .5;
      if (!a.pin) { a.x += dx * k; a.y += dy * k; }
      if (!b.pin) { b.x -= dx * k; b.y -= dy * k; }
    }
    if (this.alive < this.total * .45) this.clear();   // demasiado rasgado: tece outro
  }
  draw(G) {
    const { S, p, sp, ca } = this, w = .9 * S.u, glow = .7 + .8 * S.ctl.glow;
    for (const c of this.c) {
      if (!c[2]) continue;
      const a = p[c[0]], b = p[c[1]], st = Math.hypot(b.x - a.x, b.y - a.y) / sp;
      S.cyc(a.x / S.W * .7 + a.y / S.H * .3, ca);
      const k = glow * (.55 + Math.min(1.6, (st - 1) * 1.5));
      ca[0] *= k; ca[1] *= k; ca[2] *= k;
      G.ribbons.seg(a.x, a.y, b.x, b.y, w, w, ca, .85, ca, .85);
    }
    G.ribbons.flush("flat", true, G.W, G.H);
  }
}

/* ================= Cardume (boids) ================= */
export class BoidSys {
  constructor(S) {
    this.S = S; this.n = S.small ? 170 : 320; this.trail = true;
    this.b = new Float32Array(this.n * 4); this.out = new Float32Array(this.n * STRIDE); this.tmp = [0, 0, 0];
    this.clear();
  }
  clear() {
    for (let i = 0; i < this.n; i++) {
      const a = rnd(TAU);
      this.b.set([rnd(this.S.W), rnd(this.S.H), Math.cos(a) * 100 * this.S.u, Math.sin(a) * 100 * this.S.u], i * 4);
    }
  }
  down() {} up() {} stroke() {}
  step(dt) {
    const { S, b, n } = this, u = S.u, R = 72 * u, sep = 26 * u, max = 270 * u * (.6 + .4 * S.ctl.swirl), vps = S.vps;
    for (let i = 0; i < n; i++) {
      const o = i * 4, x = b[o], y = b[o + 1];
      let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, m = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const q = j * 4, dx = b[q] - x, dy = b[q + 1] - y, d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        m++; cx += dx; cy += dy; ax += b[q + 2]; ay += b[q + 3];
        if (d2 < sep * sep) { const d = Math.sqrt(d2) + .01; sx -= dx / d * (sep - d); sy -= dy / d * (sep - d); }
      }
      let fx = sx * 9, fy = sy * 9;
      if (m) { fx += cx / m * .9 + (ax / m - b[o + 2]) * 1.4; fy += cy / m * .9 + (ay / m - b[o + 3]) * 1.4; }
      for (const p of vps) {
        if (!p.down) continue;
        const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) + 1, fast = Math.hypot(p.vx, p.vy) > 1100 * u;
        if (fast && d < 190 * u) { fx -= dx / d * 2600 * u; fy -= dy / d * 2600 * u; }       // gesto brusco: fogem
        else { fx += dx / d * 520 * u; fy += dy / d * 520 * u; }                              // senão, seguem o dedo
      }
      const mg = 70 * u;
      if (x < mg) fx += (mg - x) * 9; else if (x > S.W - mg) fx -= (x - S.W + mg) * 9;
      if (y < mg) fy += (mg - y) * 9; else if (y > S.H - mg) fy -= (y - S.H + mg) * 9;
      let vx = b[o + 2] + fx * dt, vy = b[o + 3] + fy * dt; const sp = Math.hypot(vx, vy) || 1, lim = clamp(sp, max * .45, max);
      vx = vx / sp * lim; vy = vy / sp * lim;
      b[o] = x + vx * dt; b[o + 1] = y + vy * dt; b[o + 2] = vx; b[o + 3] = vy;
    }
  }
  drawTrail(G) {
    const { S, b, n, out, tmp } = this, glow = .5 + .9 * S.ctl.glow;
    for (let i = 0; i < n; i++) {
      const o = i * 4, q = i * STRIDE;
      S.cyc(i / n, tmp);
      out[q] = b[o]; out[q + 1] = b[o + 1]; out[q + 2] = 8 * S.u * S.ctl.size; out[q + 3] = Math.atan2(b[o + 3], b[o + 2]);
      out[q + 4] = tmp[0] * glow; out[q + 5] = tmp[1] * glow; out[q + 6] = tmp[2] * glow; out[q + 7] = .55; out[q + 8] = 1.5; out[q + 9] = 0;
    }
    G.sprites.draw(out, n, "fish", true, G.W, G.H);
  }
}

/* ================= Constelação (teia) ================= */
export class WebSys {
  constructor(S) { this.S = S; this.nodes = []; this.out = new Float32Array(160 * STRIDE); this.ca = [0, 0, 0]; }
  clear() { this.nodes.length = 0; }
  add(x, y) {
    if (this.nodes.length >= (this.S.small ? 80 : 130)) this.nodes.shift();
    const a = rnd(TAU), sp = rnd(8, 26) * this.S.u;
    this.nodes.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: this.S.time, ph: Math.random() });
  }
  down(vp) { this.add(vp.x, vp.y); vp.wb = 0; } up() {}
  stroke(vp) {
    vp.wb = (vp.wb || 0) + Math.hypot(vp.x - vp.px, vp.y - vp.py);
    if (vp.wb > 46 * this.S.u * this.S.ctl.size) { vp.wb = 0; this.add(vp.x + rnd(-14, 14) * this.S.u, vp.y + rnd(-14, 14) * this.S.u); }
  }
  step(dt) {
    const { S } = this, life = 15 * S.ctl.duration;
    this.nodes = this.nodes.filter(n => S.time - n.born < life);
    for (const n of this.nodes) {
      n.x += n.vx * dt; n.y += n.vy * dt;
      if (n.x < 0 || n.x > S.W) n.vx *= -1; if (n.y < 0 || n.y > S.H) n.vy *= -1;
    }
  }
  draw(G) {
    const { S, nodes, out, ca } = this, u = S.u, R = 150 * u * S.ctl.size, life = 15 * S.ctl.duration, glow = 1.2 + 1.6 * S.ctl.glow;
    const al = n => Math.min(1, (S.time - n.born) * 2) * Math.min(1, (life - (S.time - n.born)) * .7);
    const pts = nodes.concat(S.vps.filter(v => v.down).map(v => ({ x: v.x, y: v.y, born: -1e9, ph: 0, live: true })));
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > R) continue;
      const k = (1 - d / R) ** 2 * (a.live ? 1 : al(a)) * (b.live ? 1 : al(b));
      S.cyc(a.ph, ca); ca[0] *= glow; ca[1] *= glow; ca[2] *= glow;
      G.ribbons.seg(a.x, a.y, b.x, b.y, 1.8 * u, 1.8 * u, ca, k, ca, k);
    }
    G.ribbons.flush("glow", true, G.W, G.H);
    nodes.forEach((n, i) => {
      const q = i * STRIDE, c = S.pal[0], tw = .65 + .35 * Math.sin(S.time * 3 + n.ph * 40);
      out[q] = n.x; out[q + 1] = n.y; out[q + 2] = 8 * u; out[q + 3] = 0;
      out[q + 4] = c[0] * glow * 2.4; out[q + 5] = c[1] * glow * 2.4; out[q + 6] = c[2] * glow * 2.4; out[q + 7] = al(n) * tw; out[q + 8] = 1; out[q + 9] = 0;
    });
    G.sprites.draw(out, nodes.length, "star", true, G.W, G.H);
  }
}

/* ================= Órbitas e buraco negro ================= */
export class WellSys {
  constructor(S, c) {
    this.S = S; this.c = c; this.wells = []; this.trail = true; this.acc = [0, 0];
    this.p = new Particles(S, { shape: "dot", size: [1.2, 2.4], life: [5, 11], glow: 2.2, color: "rand", max: S.small ? 1500 : 2800 });
    this.p.hook = (x, y) => {
      const u = S.u, G = 1.35e7 * u * u * u * S.ctl.gravity, acc = this.acc; acc[0] = acc[1] = 0;
      for (const w of this.all) {
        const dx = w.x - x, dy = w.y - y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
        if (d < 15 * u) return false;
        const a = G * w.m / (d2 + 900 * u * u) / d;
        acc[0] += dx * a; acc[1] += dy * a;
      }
      return acc;
    };
    this.center = { x: S.W / 2, y: S.H / 2, m: .7, k: 1 };
    this.all = [this.center];
  }
  clear() { this.wells.length = 0; this.p.clear(); }
  down(vp) {
    if (this.wells.length >= 3) this.wells.shift();
    vp.well = { x: vp.x, y: vp.y, m: 1, held: true, end: 0, k: 1 }; this.wells.push(vp.well);
  }
  up(vp) { if (vp.well) { vp.well.held = false; vp.well.end = this.S.time; vp.well = null; } }
  stroke(vp) { if (vp.well) { vp.well.x = vp.x; vp.well.y = vp.y; } }
  step(dt) {
    const { S, p } = this, u = S.u, linger = 7 * S.ctl.duration;
    this.wells = this.wells.filter(w => w.held || S.time - w.end < linger);
    for (const w of this.wells) w.k = w.held ? 1 : 1 - (S.time - w.end) / linger;
    this.all = this.wells.length ? this.wells : [this.center];
    for (const w of this.all) w.m = (w === this.center ? .7 : 1) * w.k;
    const G = 1.35e7 * u * u * u * Math.abs(S.ctl.gravity);
    let budget = 40;
    while (p.n < p.max * .9 && budget--) {
      const w = this.all[(Math.random() * this.all.length) | 0], r = rnd(70, 460) * u, a = rnd(TAU);
      const v = Math.sqrt(G * Math.max(.15, w.m) / r) * rnd(.72, 1.08);
      p.spawn(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r, -Math.sin(a) * v, Math.cos(a) * v, p.color());
    }
    p.update(dt);
    S.warp.length = 0;
    if (this.c.lens) for (const w of this.all) S.warp.push(w.x / S.W, 1 - w.y / S.H, .05 * Math.sqrt(Math.max(.05, w.m)) * S.ctl.size, Math.min(1, w.k * 1.5));
  }
  drawTrail(G) { this.p.render(G); }
}
