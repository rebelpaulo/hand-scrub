// Motor do Draw Physics sem página à volta: efeitos, dedos e desenho num canvas.
// Usado pela aplicação (drawphysics.mjs) e pelas Mãos de Fogo / Raios
// (elements.mjs), que lhe dão os pontos das mãos em vez de toques.
//
//   const E = createEngine(canvas);          // null sem WebGL2
//   E.setEffect("fogo");                     // id da lista ou uma receita { fluid, parts, ... }
//   E.fingerDown(id, x, y); E.fingerMove(id, x, y); E.fingerUp(id);   // em píxeis do canvas (E.S.W × E.S.H)
//   E.frame(performance.now());              // um quadro: simula e desenha

import { EFFECTS, PALETTES, symmetryPoints } from "./drawphysics-effects.mjs";
import { createGLX, Sprites, Ribbons, Post, STRIDE } from "./drawphysics-gl.mjs";
import * as Sim from "./drawphysics-sim.mjs";

export const DEFAULT_POST = { bloom: 1, chroma: .22, grain: .03, pixel: 0, kaleido: 0, trailFade: 2.5, bg: [.006, .007, .014], exposure: 1.15, vignette: .5 };

/* ================= cor ================= */
const lin = v => Math.pow(v, 2.2);
const hex = h => [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16) / 255));
function hue(h, out) {   // arco-íris em cores lineares
  h = (h % 1 + 1) % 1 * 6;
  const f = h % 1, i = Math.floor(h), v = [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][i];
  out[0] = lin(v[0]); out[1] = lin(v[1]); out[2] = lin(v[2]);
  return out;
}

// alpha: canvas transparente, para pôr por cima de outra imagem (ver post.key).
export function createEngine(canvas, ctlInit, alpha) {
  const X = createGLX(canvas, alpha);
  if (!X) return null;
  const ctl = { size: 1, duration: 1, swirl: 1, gravity: 1, glow: 1, sym: "none", palette: null, ...ctlInit };

  const S = {
    W: 2, H: 2, u: 1, time: 0, ctl, vps: [], warp: [], pal: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], rainbow: false,
    small: matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820,
    // Percorre a paleta em ciclo (ou o arco-íris): t em voltas.
    cyc(t, out) {
      if (S.rainbow) return hue(t, out);
      t = (t % 1 + 1) % 1 * 3;
      const i = Math.floor(t) % 3, f = t - Math.floor(t), a = S.pal[i], b = S.pal[(i + 1) % 3];
      out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
      return out;
    },
    pick(out) {
      if (S.rainbow) return hue(Math.random(), out);
      const c = S.pal[(Math.random() * 3) | 0];
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
      return out;
    },
  };

  const sprites = new Sprites(X), ribbons = new Ribbons(X), post = new Post(X);
  let systems = [], fx = EFFECTS[0], P = { ...DEFAULT_POST }, last = performance.now();
  const G = { W: 2, H: 2, sprites, ribbons, scene: null };
  const E = { X, S, ctl, cursors: new Float32Array(4 * STRIDE), cursorCount: 0, get fx() { return fx; } };

  function applyPalette() {
    const p = PALETTES[ctl.palette || fx.pal] || PALETTES.neon;
    S.pal = p.c.map(hex); S.rainbow = !!p.rainbow;
  }

  function build() {
    for (const s of systems) s.free?.();
    systems = [];
    const add = s => systems.push(s);
    if (fx.fluid) add(new Sim.FluidSys(S, X, fx.fluid));
    if (fx.waves) add(new Sim.WavesSys(S, X));
    if (fx.rd) add(new Sim.RDSys(S, X, fx.rd));
    if (fx.voronoi) add(new Sim.VoronoiSys(S, X));
    if (fx.meta) add(new Sim.MetaSys(S, X));
    if (fx.ribbon) add(new Sim.RibbonSys(S, fx.ribbon));
    if (fx.ropes) add(new Sim.RopeSys(S, fx.ropes));
    if (fx.cloth) add(new Sim.ClothSys(S));
    if (fx.web) add(new Sim.WebSys(S));
    if (fx.bolts) add(new Sim.BoltSys(S, fx.bolts));
    if (fx.laser) add(new Sim.LaserSys(S));
    if (fx.world) add(new Sim.WorldSys(S));
    if (fx.blocks) add(new Sim.BlockSys(S));
    if (fx.sand) add(new Sim.SandSys(S));
    if (fx.boids) add(new Sim.BoidSys(S));
    if (fx.wells) add(new Sim.WellSys(S, fx.wells));
    for (const p of fx.parts || []) add(new Sim.Particles(S, p));
    S.warp.length = 0;
    post.clearTrail();
    dropStrokes();
  }

  // id de EFFECTS ou uma receita própria (as Mãos de Fogo afinam a sua).
  function setEffect(id) {
    fx = typeof id === "object" ? id : EFFECTS.find(e => e.id === id) || EFFECTS[0];
    P = { ...DEFAULT_POST, ...fx.post };
    applyPalette();
    if (!resize()) build();
  }

  function clearAll() {
    for (const s of systems) s.clear?.();
    post.clearTrail();
    S.warp.length = 0;
    dropStrokes();
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2), cap = S.small ? 1280 : 1920;
    let w = (canvas.clientWidth || innerWidth) * dpr, h = (canvas.clientHeight || innerHeight) * dpr;
    const k = Math.min(1, cap / Math.max(w, h));
    w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
    if (w === S.W && h === S.H) return false;
    canvas.width = w; canvas.height = h;
    S.W = G.W = w; S.H = G.H = h; S.u = Math.min(w, h) / 1000;
    post.resize(w, h);
    G.scene = post.scene;
    build();
    return true;
  }

  /* ================= dedos (toque, rato, mãos, dedo automático) ================= */
  // Cada dedo real gera uma ou mais cópias (simetria); cada cópia é um "dedo
  // virtual" com o seu próprio traço.
  const fingers = new Map();   // id -> { x, y, sx, sy, down }
  const virtual = new Map();   // "id:k" -> dedo virtual
  const symBuf = [];
  let strokeHue = Math.random();

  function dropStrokes() {
    for (const vp of virtual.values()) if (vp.down) for (const s of systems) s.up?.(vp);
    virtual.clear();
  }

  function feed(dt) {
    S.vps.length = 0;
    for (const [id, f] of fingers) {
      if (f.fresh) { f.sx = f.x; f.sy = f.y; f.fresh = false; }
      else { const k = 1 - Math.exp(-dt * 30); f.sx += (f.x - f.sx) * k; f.sy += (f.y - f.sy) * k; }
      const pts = symmetryPoints(f.down ? ctl.sym : "none", f.sx, f.sy, S.W, S.H, symBuf);
      for (let k = 0; k < pts.length / 2; k++) {
        const key = id + ":" + k;
        let vp = virtual.get(key);
        const x = pts[k * 2], y = pts[k * 2 + 1];
        if (!vp) {
          vp = { id: virtual.size, key, x, y, px: x, py: y, vx: 0, vy: 0, down: false, hue: strokeHue, acc: new Map() };
          virtual.set(key, vp);
        }
        vp.px = vp.x; vp.py = vp.y; vp.x = x; vp.y = y;
        vp.vx = (x - vp.px) / dt; vp.vy = (y - vp.py) / dt;
        vp.seen = true;
        if (f.down && !vp.down) {
          vp.down = true; vp.px = x; vp.py = y; vp.vx = vp.vy = 0; vp.hue = strokeHue;
          for (const s of systems) s.down?.(vp);
        } else if (!f.down && vp.down) {
          vp.down = false;
          for (const s of systems) s.up?.(vp);
        }
        if (vp.down) {
          vp.hue += Math.hypot(x - vp.px, y - vp.py) / (S.u * 2600) + dt * .05;
          for (const s of systems) s.stroke?.(vp, dt);
        }
        S.vps.push(vp);
      }
      if (f.gone) fingers.delete(id);
    }
    for (const [key, vp] of virtual) {
      if (vp.seen) { vp.seen = false; continue; }
      if (vp.down) for (const s of systems) s.up?.(vp);
      virtual.delete(key);
    }
  }

  function fingerDown(id, x, y) {
    strokeHue += .137;
    fingers.set(id, { x, y, sx: x, sy: y, down: true, fresh: true });
  }
  function fingerMove(id, x, y, hover) {
    const f = fingers.get(id);
    if (f) { f.x = x; f.y = y; }
    else if (hover) fingers.set(id, { x, y, sx: x, sy: y, down: false, fresh: true });
  }
  function fingerUp(id) {
    const f = fingers.get(id);
    if (f) { if (f.down) { f.down = false; f.gone = true; } else fingers.delete(id); }
  }

  function frame(now) {
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
    last = now;
    S.time += dt;
    resize();
    feed(dt);
    for (const s of systems) s.step?.(dt);

    const trail = systems.some(s => s.trail);
    if (trail) {
      post.trailBegin(Math.exp(-dt * P.trailFade / ctl.duration));
      for (const s of systems) s.drawTrail?.(G);
    }
    post.begin(P.bg);
    for (const s of systems) s.drawBase?.(G);
    if (trail) post.trailToScene(1);
    X.bind(post.scene);
    for (const s of systems) s.draw?.(G);
    if (E.cursorCount) { X.bind(post.scene); sprites.draw(E.cursors, E.cursorCount, "ring", true, G.W, G.H); }
    post.end({ bloom: P.bloom * ctl.glow, exposure: P.exposure, chroma: P.chroma, grain: P.grain, pixel: P.pixel * Math.max(1, S.u * 1.4),
      kaleido: P.kaleido, time: S.time, vignette: P.vignette, warp: S.warp, key: P.key });
  }

  return Object.assign(E, { fingers, setEffect, clearAll, dropStrokes, applyPalette, fingerDown, fingerMove, fingerUp, frame });
}
