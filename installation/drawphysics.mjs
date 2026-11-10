// Draw Physics — aplicação: liga o motor (drawphysics-gl / drawphysics-sim) ao
// toque, ao painel e, na projeção do Palco de Luz, às mãos na câmara.

import { EFFECTS, FAMILIES, PALETTES, SYMMETRIES, symmetryPoints } from "./drawphysics-effects.mjs";
import { oneEuro } from "./smooth.mjs";
import { createGLX, Sprites, Ribbons, Post, STRIDE } from "./drawphysics-gl.mjs";
import * as Sim from "./drawphysics-sim.mjs";

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const embedded = parent !== window;
const launch = query.get("launch");
const canvas = $("stage");
const X = createGLX(canvas);

const DEFAULT_POST = { bloom: 1, chroma: .22, grain: .03, pixel: 0, kaleido: 0, trailFade: 2.5, bg: [.006, .007, .014], exposure: 1.15, vignette: .5 };
const ctl = { size: 1, duration: 1, swirl: 1, gravity: 1, glow: 1, sym: "none", palette: null, auto: embedded || query.get("auto") === "1" };
if (SYMMETRIES.some(s => s.id === query.get("sym"))) ctl.sym = query.get("sym");

/* ================= cor ================= */
const lin = v => Math.pow(v, 2.2);
const hex = h => [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16) / 255));
function hue(h, out) {   // arco-íris em cores lineares
  h = (h % 1 + 1) % 1 * 6;
  const f = h % 1, i = Math.floor(h), v = [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][i];
  out[0] = lin(v[0]); out[1] = lin(v[1]); out[2] = lin(v[2]);
  return out;
}

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

/* ================= motor ================= */
let sprites, ribbons, post, systems = [], fx = EFFECTS[0], P = { ...DEFAULT_POST };
const G = { W: 2, H: 2, sprites: null, ribbons: null, scene: null };
const cursors = new Float32Array(4 * STRIDE);
let cursorCount = 0;

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

function setEffect(id, quiet) {
  fx = EFFECTS.find(e => e.id === id) || EFFECTS[0];
  P = { ...DEFAULT_POST, ...fx.post };
  applyPalette();
  build();
  if (!quiet) toast(fx.name);
  ui.sync?.();
}

function clearAll() {
  for (const s of systems) s.clear?.();
  post.clearTrail();
  S.warp.length = 0;
  dropStrokes();
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2), cap = S.small ? 1280 : 1920;
  let w = innerWidth * dpr, h = innerHeight * dpr;
  const k = Math.min(1, cap / Math.max(w, h));
  w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
  if (w === S.W && h === S.H) return;
  canvas.width = w; canvas.height = h;
  S.W = G.W = w; S.H = G.H = h; S.u = Math.min(w, h) / 1000;
  post.resize(w, h);
  G.scene = post.scene;
  build();
}

/* ================= dedos (toque, rato, mãos, dedo automático) ================= */
// Cada dedo real gera uma ou mais cópias (simetria); cada cópia é um "dedo
// virtual" com o seu próprio traço.
const fingers = new Map();   // id -> { x, y, sx, sy, down }
const virtual = new Map();   // "id:k" -> dedo virtual
const symBuf = [];
let strokeHue = Math.random(), lastInput = -10;

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

const toCanvas = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * S.W, (e.clientY - r.top) / r.height * S.H]; };
canvas.addEventListener("pointerdown", e => {
  if (e.button > 0) return;
  canvas.setPointerCapture(e.pointerId);
  lastInput = S.time;
  $("hint").dataset.off = "1";
  fingerUp("m" + e.pointerId); fingers.delete("m" + e.pointerId);
  fingerDown("p" + e.pointerId, ...toCanvas(e));
  ui.collapse?.();
  e.preventDefault();
});
canvas.addEventListener("pointermove", e => {
  const [x, y] = toCanvas(e);
  if (fingers.get("p" + e.pointerId)?.down) { lastInput = S.time; fingerMove("p" + e.pointerId, x, y); }
  else if (e.pointerType === "mouse") fingerMove("m" + e.pointerId, x, y, true);
});
for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, e => fingerUp("p" + e.pointerId));
canvas.addEventListener("pointerleave", e => fingers.delete("m" + e.pointerId));
canvas.addEventListener("contextmenu", e => e.preventDefault());

// Dedo automático: desenha sozinho quando ninguém toca (modo vitrine).
const auto = { on: false, until: 0, phase: Math.random() * 100 };
function autoFinger() {
  const idle = S.time - lastInput > 3.5 && ![...fingers.keys()].some(k => k[0] === "p" || k[0] === "h");
  if (!ctl.auto || !idle) { if (auto.on) { fingerUp("auto"); auto.on = false; } return; }
  const t = S.time * .55 + auto.phase;
  const x = S.W * (.5 + .4 * Math.sin(t * 1.3) * Math.cos(t * .37 + 1)), y = S.H * (.5 + .36 * Math.sin(t * .93 + 2) * Math.cos(t * .51));
  if (S.time > auto.until) {
    auto.on = !auto.on;
    auto.until = S.time + (auto.on ? 2.2 + Math.random() * 3.2 : .35 + Math.random() * .7);
    if (auto.on) fingerDown("auto", x, y); else fingerUp("auto");
  }
  if (auto.on) fingerMove("auto", x, y);
}

/* ================= ciclo ================= */
let last = performance.now(), shot = false, snap = null, rotateAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
  last = now;
  S.time += dt;
  resize();
  if (rotateAt && S.time > rotateAt) { rotateAt = S.time + 32; surprise(true); }
  autoFinger();
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
  if (cursorCount) { X.bind(post.scene); sprites.draw(cursors, cursorCount, "ring", true, G.W, G.H); }
  post.end({ bloom: P.bloom * ctl.glow, exposure: P.exposure, chroma: P.chroma, grain: P.grain, pixel: P.pixel * Math.max(1, S.u * 1.4),
    kaleido: P.kaleido, time: S.time, vignette: P.vignette, warp: S.warp });
  if (shot) { shot = false; save(); }
  if (snap) { const cb = snap; snap = null; cb(canvas); }
}

function save() {
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "draw-physics-" + fx.id + "-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}

function surprise(quiet) {
  let next;
  do next = EFFECTS[(Math.random() * EFFECTS.length) | 0]; while (next === fx && EFFECTS.length > 1);
  setEffect(next.id, quiet);
}
function stepEffect(d) {
  const i = EFFECTS.indexOf(fx);
  setEffect(EFFECTS[(i + d + EFFECTS.length) % EFFECTS.length].id);
}

/* ================= painel ================= */
const ui = {};
let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text; el.dataset.on = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => delete el.dataset.on, 1500);
}

function initUI() {
  const families = $("families"), list = $("effects"), panel = $("panel");
  let family = fx.family, shown = null;
  const dots = id => PALETTES[id].c.map(c => `<i style="background:${c}"></i>`).join("");

  function renderEffects() {
    list.replaceChildren(...EFFECTS.filter(e => e.family === family).map(e => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "fx"; b.dataset.id = e.id;
      b.innerHTML = `<span class="dots">${dots(e.pal)}</span><span class="name"></span>`;
      b.querySelector(".name").textContent = e.name;
      b.setAttribute("aria-pressed", e === fx);
      b.addEventListener("click", () => setEffect(e.id));
      return b;
    }));
    if (shown !== family) list.scrollLeft = 0;
    shown = family;
    list.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  families.replaceChildren(...FAMILIES.map(f => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "fam"; b.dataset.id = f.id; b.textContent = f.name;
    b.addEventListener("click", () => { family = f.id; ui.sync(true); });
    return b;
  }));

  for (const [key, id] of [["size", "c-size"], ["duration", "c-duration"], ["swirl", "c-swirl"], ["gravity", "c-gravity"], ["glow", "c-glow"]]) {
    const input = $(id), out = input.parentElement.querySelector("output");
    const show = () => { out.textContent = (+input.value).toFixed(1).replace(".", ","); };
    input.addEventListener("input", () => { ctl[key] = +input.value; show(); });
    show();
  }

  const sym = $("symmetry");
  sym.replaceChildren(...SYMMETRIES.map(s => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = s.name; b.dataset.id = s.id;
    b.addEventListener("click", () => { ctl.sym = s.id; dropStrokes(); ui.sync(true); });
    return b;
  }));

  const pals = $("palettes");
  const palBtn = (id, label, inner) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pal"; b.dataset.id = id || ""; b.title = label; b.setAttribute("aria-label", "Paleta " + label);
    b.innerHTML = inner;
    b.addEventListener("click", () => { ctl.palette = id; applyPalette(); ui.sync(true); });
    return b;
  };
  pals.replaceChildren(palBtn(null, "do efeito", `<span class="auto">Auto</span>`),
    ...Object.entries(PALETTES).map(([id, p]) => palBtn(id, p.name, `<span class="dots">${dots(id)}</span>`)));

  $("b-surprise").addEventListener("click", () => surprise());
  $("b-clear").addEventListener("click", () => { clearAll(); toast("Limpo"); });
  $("b-save").addEventListener("click", () => { shot = true; toast("Imagem guardada"); });
  $("b-full").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));
  $("b-panel").addEventListener("click", () => { panel.hidden = !panel.hidden; $("b-panel").setAttribute("aria-expanded", !panel.hidden); });
  $("b-hide").addEventListener("click", () => document.body.classList.add("chrome-off"));
  $("show-ui").addEventListener("click", () => document.body.classList.remove("chrome-off"));
  $("t-auto").addEventListener("change", e => { ctl.auto = e.target.checked; });
  $("t-hands").addEventListener("change", e => e.target.checked ? startHands() : stopHands());

  ui.collapse = () => { if (!panel.hidden && matchMedia("(max-width: 760px)").matches) { panel.hidden = true; $("b-panel").setAttribute("aria-expanded", "false"); } };
  // keepFamily: o separador foi escolhido à mão; senão segue a família do efeito.
  ui.sync = keepFamily => {
    if (!keepFamily) family = fx.family;
    for (const b of families.children) b.setAttribute("aria-pressed", b.dataset.id === family);
    renderEffects();
    for (const b of sym.children) b.setAttribute("aria-pressed", b.dataset.id === ctl.sym);
    for (const b of pals.children) b.setAttribute("aria-pressed", (b.dataset.id || null) === ctl.palette);
    $("t-auto").checked = ctl.auto;
    $("fx-name").textContent = fx.name;
  };
  ui.sync();

  addEventListener("keydown", e => {
    if (e.target.matches("input, textarea") || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === " ") { surprise(); e.preventDefault(); }
    else if (k === "c") clearAll();
    else if (k === "h") document.body.classList.toggle("chrome-off");
    else if (k === "f") $("b-full").click();
    else if (k === "arrowright") stepEffect(1);
    else if (k === "arrowleft") stepEffect(-1);
  });
}

/* ================= mãos (câmara + MediaPipe) ================= */
const video = $("camera"), pip = $("pip");
let tracker, stream, handsOn = false, lastVideoTime = -1, reported = false;
const handState = [0, 1].map(() => ({ on: false, seen: 0, fx: oneEuro(), fy: oneEuro() }));
const LOST_GRACE = 180;   // ms sem ver a mão antes de largar o traço

function report(state, reason) {
  if (reported === state) return;
  reported = state;
  window.Palco?.availability(state, reason);
}

async function startHands() {
  if (handsOn) return;
  handsOn = true;
  try {
    const local = window.Palco?.localVision || query.get("vision") === "local";
    const base = local ? "/installation/vendor" : "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
    const model = local ? base + "/hand_landmarker.task"
      : "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
    const { FilesetResolver, HandLandmarker } = await import(base + "/vision_bundle.mjs");
    const files = await FilesetResolver.forVisionTasks(base + "/wasm");
    const make = delegate => HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate }, runningMode: "VIDEO", numHands: 2 });
    tracker = await make("GPU").catch(() => make("CPU"));
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
    if (!handsOn) return stopHands();
    video.srcObject = stream;
    await video.play();
    pip.hidden = false;
    stream.getVideoTracks()[0].addEventListener("ended", () => { stopHands(); report("limited", "A câmara desligou-se: a demonstração corre sozinha."); });
    trackHands();
  } catch {
    stopHands();
    $("t-hands").checked = false;
    if (embedded) report("limited", "Sem câmara: a demonstração corre sozinha na projeção.");
    else toast("Câmara indisponível");
  }
}

function stopHands() {
  handsOn = false;
  stream?.getTracks().forEach(t => t.stop());
  stream = undefined; video.srcObject = null; pip.hidden = true;
  tracker?.close(); tracker = undefined;
  for (let i = 0; i < 2; i++) { fingerUp("h" + i); handState[i].on = false; }
  cursorCount = 0;
}

const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
function trackHands() {
  if (!handsOn || !tracker) return;
  requestAnimationFrame(trackHands);
  if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const now = performance.now();
  const hands = tracker.detectForVideo(video, now).landmarks || [];
  report("ready");
  cursorCount = 0;
  for (let i = 0; i < 2; i++) {
    const lm = hands[i], st = handState[i], id = "h" + i;
    if (!lm) {
      // a deteção falha quadros soltos: só larga o traço se a mão não voltar
      if (st.on && now - st.seen < LOST_GRACE) continue;
      if (st.on) { fingerUp(id); st.on = false; }
      fingers.delete(id); st.fx.reset(); st.fy.reset();
      continue;
    }
    st.seen = now;
    // Desenha com o indicador esticado; mão fechada pára o traço.
    const ratio = d3(lm[8], lm[0]) / (d3(lm[6], lm[0]) || 1e-4);
    const point = st.on ? ratio > 1.08 : ratio > 1.2;
    // filtro One Euro: firme com a mão parada, sem atraso quando ela corre
    const x = st.fx(S.W * Math.min(1, Math.max(0, .5 + (.5 - lm[8].x) * 1.3)), now / 1000);
    const y = st.fy(S.H * Math.min(1, Math.max(0, .5 + (lm[8].y - .5) * 1.3)), now / 1000);
    if (point && !st.on) { fingerDown(id, x, y); st.on = true; }
    else if (!point && st.on) { fingerUp(id); st.on = false; }
    if (point) { fingerMove(id, x, y); lastInput = S.time; }
    const q = cursorCount++ * STRIDE, c = S.pal[i % 3];
    cursors.set([x, y, (point ? 16 : 24) * S.u, 0, c[0] * 2, c[1] * 2, c[2] * 2, point ? .9 : .45, 1, 0], q);
  }
}

/* ================= arranque ================= */
if (!X) {
  $("unsupported").hidden = false;
  window.Palco?.availability("error", "Este equipamento não suporta WebGL2.");
} else {
  sprites = G.sprites = new Sprites(X);
  ribbons = G.ribbons = new Ribbons(X);
  post = new Post(X);
  fx = EFFECTS.find(e => e.id === query.get("effect")) || EFFECTS.find(e => e.id === "fumo-colorido");
  P = { ...DEFAULT_POST, ...fx.post };
  applyPalette();
  resize();
  initUI();
  if (query.get("ui") === "0") document.body.classList.add("chrome-off");
  if (embedded) {
    document.body.classList.add("chrome-off", "embedded");
    if (!query.get("effect")) rotateAt = 32;
    if (launch) parent.postMessage({ mapping: 1, evt: "ready", launch }, location.origin);
    startHands();
  } else if (query.get("hands") === "1") { $("t-hands").checked = true; startHands(); }
  addEventListener("message", e => {
    if (e.origin !== location.origin || e.data?.mapping !== 1) return;
    if (e.data.cmd === "campreview") pip.style.display = e.data.on ? "" : "none";
    else if (e.data.cmd === "chrome") document.body.classList.toggle("chrome-off", !e.data.on);
  });
  addEventListener("pagehide", stopHands);
  requestAnimationFrame(frame);
}

// Ganchos de teste: deixam um teste de browser escolher o efeito e desenhar
// um traço sem depender de eventos de ponteiro sintéticos.
window.DrawPhysics = {
  effects: EFFECTS, setEffect, clearAll, ctl, state: S,
  // Chama cb(canvas) logo a seguir ao próximo quadro, enquanto a imagem ainda lá está.
  snap(cb) { snap = cb; },
  // points: [[x, y], ...] em frações do ecrã (0..1); um ponto por quadro.
  stroke(points, id = "t") {
    points.forEach(([x, y], i) => setTimeout(() => {
      if (i) fingerMove(id, x * S.W, y * S.H); else fingerDown(id, x * S.W, y * S.H);
      lastInput = S.time;
      if (i === points.length - 1) setTimeout(() => fingerUp(id), 40);
    }, i * 16));
  },
};
