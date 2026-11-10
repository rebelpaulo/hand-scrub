// Draw Physics — aplicação: liga o motor (drawphysics-engine) ao toque, ao
// painel e, na projeção do Palco de Luz, às mãos na câmara.

import { EFFECTS, FAMILIES, PALETTES, SYMMETRIES } from "./drawphysics-effects.mjs";
import { oneEuro } from "./smooth.mjs";
import { STRIDE } from "./drawphysics-gl.mjs";
import { createEngine } from "./drawphysics-engine.mjs";

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
const embedded = parent !== window;
const launch = query.get("launch");
const canvas = $("stage");
const E = createEngine(canvas, { auto: embedded || query.get("auto") === "1" });   // null sem WebGL2
const { S, ctl, fingers, fingerDown, fingerMove, fingerUp, clearAll, dropStrokes, applyPalette } = E || {};
if (E && SYMMETRIES.some(s => s.id === query.get("sym"))) ctl.sym = query.get("sym");
let lastInput = -10;

function setEffect(id, quiet) {
  E.setEffect(id);
  if (!quiet) toast(E.fx.name);
  ui.sync?.();
}

const toCanvas = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * S.W, (e.clientY - r.top) / r.height * S.H]; };
canvas.addEventListener("pointerdown", e => {
  if (!E || e.button > 0) return;
  canvas.setPointerCapture(e.pointerId);
  lastInput = S.time;
  $("hint").dataset.off = "1";
  fingerUp("m" + e.pointerId); fingers.delete("m" + e.pointerId);
  fingerDown("p" + e.pointerId, ...toCanvas(e));
  ui.collapse?.();
  e.preventDefault();
});
canvas.addEventListener("pointermove", e => {
  if (!E) return;
  const [x, y] = toCanvas(e);
  if (fingers.get("p" + e.pointerId)?.down) { lastInput = S.time; fingerMove("p" + e.pointerId, x, y); }
  else if (e.pointerType === "mouse") fingerMove("m" + e.pointerId, x, y, true);
});
for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, e => E && fingerUp("p" + e.pointerId));
canvas.addEventListener("pointerleave", e => fingers?.delete("m" + e.pointerId));
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
let shot = false, snap = null, rotateAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (rotateAt && S.time > rotateAt) { rotateAt = S.time + 32; surprise(true); }
  autoFinger();
  E.frame(now);
  if (shot) { shot = false; save(); }
  if (snap) { const cb = snap; snap = null; cb(canvas); }
}

function save() {
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "draw-physics-" + E.fx.id + "-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}

function surprise(quiet) {
  let next;
  do next = EFFECTS[(Math.random() * EFFECTS.length) | 0]; while (next === E.fx && EFFECTS.length > 1);
  setEffect(next.id, quiet);
}
function stepEffect(d) {
  const i = EFFECTS.indexOf(E.fx);
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
  let family = E.fx.family, shown = null;
  const dots = id => PALETTES[id].c.map(c => `<i style="background:${c}"></i>`).join("");

  function renderEffects() {
    list.replaceChildren(...EFFECTS.filter(e => e.family === family).map(e => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "fx"; b.dataset.id = e.id;
      b.innerHTML = `<span class="dots">${dots(e.pal)}</span><span class="name"></span>`;
      b.querySelector(".name").textContent = e.name;
      b.setAttribute("aria-pressed", e === E.fx);
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
    if (!keepFamily) family = E.fx.family;
    for (const b of families.children) b.setAttribute("aria-pressed", b.dataset.id === family);
    renderEffects();
    for (const b of sym.children) b.setAttribute("aria-pressed", b.dataset.id === ctl.sym);
    for (const b of pals.children) b.setAttribute("aria-pressed", (b.dataset.id || null) === ctl.palette);
    $("t-auto").checked = ctl.auto;
    $("fx-name").textContent = E.fx.name;
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
  if (E) E.cursorCount = 0;
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
  if (E) E.cursorCount = 0;
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
    const q = E.cursorCount++ * STRIDE, c = S.pal[i % 3];
    E.cursors.set([x, y, (point ? 16 : 24) * S.u, 0, c[0] * 2, c[1] * 2, c[2] * 2, point ? .9 : .45, 1, 0], q);
  }
}

/* ================= arranque ================= */
if (!E) {
  $("unsupported").hidden = false;
  window.Palco?.availability("error", "Este equipamento não suporta WebGL2.");
} else {
  E.setEffect(EFFECTS.some(e => e.id === query.get("effect")) ? query.get("effect") : "fumo-colorido");
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
