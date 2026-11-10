import { createFireActivation, visibleFingertips, electricConnections, nearestHand, TRACKING_GRACE_MS } from "./elements-gestures.mjs";
import { oneEuro } from "./smooth.mjs";
import { createElementEffects } from "./elements-fx.mjs";
import { roomURL } from "./client.mjs";
import { attachGlow } from "./glow.mjs";
import { createEngine } from "./drawphysics-engine.mjs";
import { EFFECTS } from "./drawphysics-effects.mjs";

const video = document.querySelector("#camera");
const canvas = document.querySelector("#effects");
const guide = document.querySelector("#guide");
const status = document.querySelector("#status");
const trackingStatus = document.querySelector("#tracking-status");
const preview = document.querySelector("#preview");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const embedded = parent !== window;
const mode = document.body.dataset.effect === "electric" ? "electric" : "fire";
// Fogo e raios do motor do Draw Physics, num canvas próprio por cima da câmara.
// Os raios somam-se à imagem (mix-blend-mode: screen). O fogo não: somado a
// uma pele clara ficava cor de pêssego, por isso o canvas é transparente e a
// chama tapa o que tem por trás (post.key). Sem WebGL2, ou com movimento
// reduzido, fica o desenho antigo em Canvas 2D.
const stage = document.createElement("canvas");
stage.setAttribute("aria-hidden", "true");
if (mode === "electric") stage.style.mixBlendMode = "screen";
else stage.style.opacity = ".8";   // a mão vê-se um pouco através da chama
canvas.after(stage);
const engine = reduced.matches ? null : createEngine(stage, null, mode === "fire");
if (!engine) stage.remove();
reduced.addEventListener("change", () => location.reload());   // o desenho escolhe-se no arranque: mudar a preferência recarrega
const effects = engine ? null : createElementEffects(canvas, reduced);
const glow = engine ? null : attachGlow(canvas, { amount: .85 });
const FOGO = EFFECTS.find(e => e.id === "fogo");
const OVER_CAMERA = { bg: [0, 0, 0], vignette: 0, grain: 0, chroma: .1 };
engine?.setEffect(mode === "fire"
  // a mão inteira é o combustível (fuel); os dedos só empurram o ar (amount: 0). Sem brasas: só chama.
  ? { ...FOGO, parts: [], fluid: { ...FOGO.fluid, mode: "flame", amount: 0, fuel: 4, fuelCap: 1.05, radius: .7, diss: 3.1, vdiss: 1, buoy: 300, curl: 14 }, post: { ...OVER_CAMERA, key: 2.4, bloom: 0 } }   // sem halo à volta: só chama
  : { pal: "chama", fluid: { mode: "glow", radius: .45, diss: 3, vdiss: 1, curl: 10, amount: .5 }, bolts: { type: "arc" }, post: { ...OVER_CAMERA, bloom: .85 } });
const FLAME_POINTS = [4, 8, 12, 16, 20, 9, 0];   // pontas dos dedos, meio da palma e pulso
// Silhueta da mão em cápsulas [de, até, raio em palmas]. Mais larga do que a
// mão, para a chama a envolver por fora em vez de só a tapar.
const HAND_FUEL = [
  ...[[1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [9, 10], [10, 11], [11, 12], [13, 14], [14, 15], [15, 16], [17, 18], [18, 19], [19, 20]]
    .map(([a, b]) => [a, b, b % 4 ? .13 : .115]),
  [0, 1, .3], [0, 5, .3], [0, 9, .32], [0, 13, .3], [0, 17, .3], [5, 17, .27], [1, 5, .24],
];
let emitters = new Set();

// Cada ponto em chamas (ou ponta de dedo com raio) é um dedo a desenhar no motor.
function drive(time, fires, electricity) {
  const k = engine.S.W / (stage.clientWidth || 1), seen = new Set();
  const touch = (id, p) => {
    seen.add(id);
    if (engine.fingers.has(id)) engine.fingerMove(id, p.x * k, p.y * k); else engine.fingerDown(id, p.x * k, p.y * k);
  };
  let unit = 0;
  const fuel = engine.S.fuel = [];
  for (const fire of fires) {
    // tamanho da mão: o comprimento da palma ou, com a mão inclinada para a câmara, a largura
    const p = fire.points, palm = Math.max(Math.hypot(p[0].x - p[9].x, p[0].y - p[9].y), Math.hypot(p[5].x - p[17].x, p[5].y - p[17].y) * 1.3);
    for (const i of FLAME_POINTS) touch(fire.id + ":" + i, p[i]);
    for (const [a, b, r] of HAND_FUEL) fuel.push([p[a].x * k, p[a].y * k, p[b].x * k, p[b].y * k, r * palm * k]);
    // punho: o fogo desce um pouco abaixo do pulso, como uma manga
    fuel.push([p[0].x * k, p[0].y * k, (p[0].x + (p[0].x - p[9].x) * .35) * k, (p[0].y + (p[0].y - p[9].y) * .35) * k, .3 * palm * k]);
    unit += palm / fires.length;
  }
  for (const { key, a, b } of electricity?.connections || []) { touch(key + ":a", a); touch(key + ":b", b); }
  engine.S.links = electricity ? electricity.connections.map(({ a, b }) => [a.x * k, a.y * k, b.x * k, b.y * k]) : null;
  if (electricity) unit = electricity.unit;
  // a chama acompanha o tamanho da mão no ecrã (perto da câmara = maior)
  if (unit) engine.ctl.size = Math.min(1.7, Math.max(.45, unit / (Math.min(stage.clientWidth, stage.clientHeight) * .16)));
  if (fires.length) engine.ctl.gravity = engine.ctl.size;   // mão pequena (longe), chama mais baixa
  for (const id of emitters) if (!seen.has(id)) engine.fingerUp(id);
  emitters = seen;
  engine.frame(time);
}
const hands = new Map();
const advice = mode === "fire"
  ? "Abre a palma para acender o fogo. Fecha a mão para apagar. Também podes estalar os dedos."
  : "Mostra as duas mãos e afasta os dedos. Os raios acompanham as pontas expostas.";
const local = window.Palco?.localVision || new URLSearchParams(location.search).get("vision") === "local";
const vision = local ? "/installation/vendor" : "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const handModel = local ? vision + "/hand_landmarker.task" :
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let stream, tracker, frame, previousVideoTime = -1;
let disposed = false, ready = false, demoUntil = 0;

if (embedded) document.body.classList.add("embedded");
for (const link of document.querySelectorAll("[data-room-link]")) {
  const url = new URL(roomURL(link.getAttribute("href")), location.origin);
  if (local) url.searchParams.set("vision", "local");
  link.href = url.pathname + url.search;
}
if (window.Palco && !embedded) document.querySelector("header a").href = roomURL("/");

function releaseCamera() {
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  video.srcObject = null;
  delete video.dataset.live;
  tracker?.close();
  tracker = undefined;
  hands.clear();
}

function limited(reason) {
  releaseCamera();
  ready = false;
  delete guide.dataset.ready;
  status.textContent = reason + " Podes ver uma demonstração do efeito.";
  trackingStatus.textContent = "Câmara indisponível";
  preview.hidden = false;
  window.Palco?.availability("limited", reason + " A projeção tem uma demonstração manual.");
}

function screen(point) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
  const imageW = video.videoWidth * scale, imageH = video.videoHeight * scale;
  return { x: (1 - point.x) * imageW + (w - imageW) / 2, y: point.y * imageH + (h - imageH) / 2 };
}

const FIRE_SMOOTH = { minCutoff: 2, beta: .05 };   // em milésimos da imagem (ver sample)
let handCount = 0;

function sample(result, time) {
  const observed = new Set();
  for (const [index, raw] of result.landmarks.entries()) {
    if (raw.length !== 21) continue;
    const id = nearestHand(hands, raw[9], observed) ?? "h" + handCount++;
    observed.add(id);
    if (!hands.has(id)) hands.set(id, { activate: createFireActivation(), seen: -Infinity, active: false });
    const hand = hands.get(id);
    const corrected = raw.map(point => ({ ...point, y: point.y * video.videoHeight / video.videoWidth }));
    const world = result.worldLandmarks?.[index];
    hand.active = mode === "fire" && hand.activate(corrected, world, time);
    const blend = Math.min(1, (time - hand.seen) / 65);
    hand.points = raw.map((point, i) => {
      if (mode === "fire") {   // One Euro: firme com a mão parada, sem atraso a mexer — a chama não fica para trás
        const [fx, fy] = (hand.filters ||= [])[i] ||= [oneEuro(FIRE_SMOOTH), oneEuro(FIRE_SMOOTH)];
        return { x: fx(point.x * 1000, time / 1000) / 1000, y: fy(point.y * 1000, time / 1000) / 1000, z: point.z ?? 0 };
      }
      const previous = hand.points?.[i] ?? point;
      return { x: previous.x + (point.x - previous.x) * blend, y: previous.y + (point.y - previous.y) * blend, z: point.z ?? 0 };
    });
    hand.geometry = corrected;
    hand.tips = mode === "electric" ? visibleFingertips(corrected, world, hand.tips).filter(tip => {
      const p = screen(raw[tip]);
      return p.x >= 0 && p.y >= 0 && p.x <= canvas.clientWidth && p.y <= canvas.clientHeight;
    }) : [];
    hand.seen = time;
  }
  for (const [id, hand] of hands) {
    if (!observed.has(id)) hand.activate(null, null, time);
    if (time - hand.seen > 600) hands.delete(id);
  }
}

function demoHand(side = 0) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const size = Math.min(w, h) * .115;
  const x = w * (side ? .68 : .32), y = h * .65;
  const pose = [[0, 1.25], [-.24, .83], [-.55, .52], [-.69, .30], [-.78, .19],
    [-.42, .22], [-.50, -.22], [-.54, -.55], [-.58, -.83],
    [-.11, .10], [-.13, -.40], [-.15, -.76], [-.15, -1.04],
    [.19, .17], [.22, -.29], [.24, -.61], [.27, -.86],
    [.45, .32], [.57, -.04], [.63, -.29], [.67, -.50]];
  return pose.map(([dx, dy]) => ({ x: x + dx * size * (side ? -1 : 1), y: y + dy * size }));
}

function render(time) {
  if (disposed) return;
  if (tracker && !document.hidden && video.readyState >= 2 && video.currentTime !== previousVideoTime) {
    previousVideoTime = video.currentTime;
    try {
      sample(tracker.detectForVideo(video, time), time);
      if (!ready) {
        ready = true;
        video.dataset.live = "";
        guide.dataset.ready = "";
        status.textContent = advice;
        preview.hidden = true;
        window.Palco?.availability("ready");
      }
    } catch {
      limited("O reconhecimento de mãos deixou de responder.");
    }
  }
  const tracked = [...hands].filter(([, hand]) => time - hand.seen < TRACKING_GRACE_MS)
    .sort(([a], [b]) => a.localeCompare(b));
  const fires = mode === "fire" ? tracked.filter(([, hand]) => hand.active).map(([id, hand]) => ({
    id, points: hand.points.map(screen), power: 1,
  })) : [];
  let electricity = null;
  if (mode === "electric" && tracked.length === 2) {
    const geometry = tracked.map(([id, hand]) => ({ id, points: hand.geometry, tips: hand.tips }));
    const pairs = electricConnections(geometry);
    const connections = pairs.map(({ key, from, to }) => ({
      key, a: screen(tracked[0][1].points[from]), b: screen(tracked[1][1].points[to]),
    }));
    const palms = tracked.map(([, hand]) => {
      const a = screen(hand.points[0]), b = screen(hand.points[9]);
      return Math.hypot(a.x - b.x, a.y - b.y);
    });
    if (connections.length) electricity = { connections, unit: (palms[0] + palms[1]) / 2, power: 1 };
  }
  const demo = time < demoUntil;
  if (demo && mode === "fire") for (const side of [0, 1]) fires.push({ id: "demo-" + side, points: demoHand(side), power: 1 });
  if (demo && mode === "electric") {
    const [a, b] = [demoHand(0), demoHand(1)];
    electricity = { connections: [4, 8, 12, 16, 20].map(tip => ({ key: "demo-" + tip, a: a[tip], b: b[tip] })),
      unit: Math.hypot(a[0].x - a[9].x, a[0].y - a[9].y), power: 1 };
  }
  if (ready) {
    let message;
    if (mode === "fire") {
      message = tracked.length ? "Abre a palma para acender" : "Mostra uma mão à câmara";
      if (fires.length) message = "Fogo aceso · Fecha a mão para apagar";
    } else {
      message = tracked.length < 2 ? "Mostra as duas mãos à câmara" : "Afasta os dedos para ligar os raios";
      if (electricity) message = "Raios ligados";
    }
    if (trackingStatus.textContent !== message) trackingStatus.textContent = message;
  }
  if (engine) drive(time, fires, electricity);
  else { effects.render(time, fires, electricity); glow?.render(); }
  frame = requestAnimationFrame(render);
}

document.querySelector("#demo-preview").addEventListener("click", () => { demoUntil = performance.now() + 5000; });
if (effects) window.addEventListener("resize", effects.resize);
window.addEventListener("pagehide", () => {
  disposed = true;
  cancelAnimationFrame(frame);
  releaseCamera();
}, { once: true });
if (!window.Palco) window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
effects?.resize();
frame = requestAnimationFrame(render);

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) {
    limited("A câmara requer HTTPS ou localhost.");
    return;
  }
  let failure = "O modelo de mãos não ficou disponível.";
  try {
    const { FilesetResolver, HandLandmarker } = await import(vision + "/vision_bundle.mjs");
    const files = await FilesetResolver.forVisionTasks(vision + "/wasm");
    const create = delegate => HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: handModel, delegate }, runningMode: "VIDEO", numHands: 2,
      minHandPresenceConfidence: .4, minTrackingConfidence: .4,   // segura a mão em movimento rápido (0,5 por omissão)
    });
    const model = await create("GPU").catch(() => disposed ? null : create("CPU"));
    if (disposed) { model?.close(); return; }
    tracker = model;
    failure = "A câmara está indisponível.";
    const camera = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false,
    });
    if (disposed) { camera.getTracks().forEach(track => track.stop()); return; }
    stream = camera;
    video.srcObject = camera;
    camera.getVideoTracks()[0].addEventListener("ended", () => limited("A câmara foi desligada."), { once: true });
    await video.play();
  } catch {
    if (!disposed) limited(failure);
  }
}
start();
