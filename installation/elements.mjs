import { createFireActivation, visibleFingertips, electricConnections, TRACKING_GRACE_MS } from "./elements-gestures.mjs";
import { createElementEffects } from "./elements-fx.mjs";
import { roomURL } from "./client.mjs";

const video = document.querySelector("#camera");
const canvas = document.querySelector("#effects");
const guide = document.querySelector("#guide");
const status = document.querySelector("#status");
const trackingStatus = document.querySelector("#tracking-status");
const preview = document.querySelector("#preview");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const embedded = parent !== window;
const mode = document.body.dataset.effect === "electric" ? "electric" : "fire";
const effects = createElementEffects(canvas, reduced);
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

function sample(result, time) {
  const labels = result.handednesses ?? result.handedness;
  const observed = new Set();
  for (const [index, raw] of result.landmarks.entries()) {
    const id = labels?.[index]?.[0]?.categoryName || String(index);
    if (raw.length !== 21 || observed.has(id)) continue;
    observed.add(id);
    if (!hands.has(id)) hands.set(id, { activate: createFireActivation(), seen: -Infinity, active: false });
    const hand = hands.get(id);
    const corrected = raw.map(point => ({ ...point, y: point.y * video.videoHeight / video.videoWidth }));
    const world = result.worldLandmarks?.[index];
    hand.active = mode === "fire" && hand.activate(corrected, world, time);
    const blend = Math.min(1, (time - hand.seen) / 65);
    hand.points = raw.map((point, i) => {
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
  effects.render(time, fires, electricity);
  frame = requestAnimationFrame(render);
}

document.querySelector("#demo-preview").addEventListener("click", () => { demoUntil = performance.now() + 5000; });
window.addEventListener("resize", effects.resize);
window.addEventListener("pagehide", () => {
  disposed = true;
  cancelAnimationFrame(frame);
  releaseCamera();
}, { once: true });
if (!window.Palco) window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
effects.resize();
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
