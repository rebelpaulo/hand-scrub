import { createSnapDetector, electricEndpoints } from "./elements-gestures.mjs";
import { createElementEffects } from "./elements-fx.mjs";
import { roomURL } from "./client.mjs";

const video = document.querySelector("#camera");
const canvas = document.querySelector("#effects");
const guide = document.querySelector("#guide");
const status = document.querySelector("#status");
const preview = document.querySelector("#preview");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const embedded = parent !== window;
const effects = createElementEffects(canvas, reduced);
const hands = new Map();
const advice = "Estala os dedos para acender fogo. Aponta os indicadores um para o outro para criar um raio.";
const local = window.Palco?.localVision;
const vision = local ? "/installation/vendor" : "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const handModel = local ? vision + "/hand_landmarker.task" :
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FIRE_MS = 3100;
const LOST_MS = 140;

let stream, tracker, frame, previousVideoTime = -1, lastSample = -Infinity;
let disposed = false, ready = false, bolt, pointingSince;
let demoFireUntil = 0, demoBoltUntil = 0;

if (embedded) document.body.classList.add("embedded");
if (window.Palco && !embedded) document.querySelector("header a").href = roomURL("/");

function releaseCamera() {
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  video.srcObject = null;
  delete video.dataset.live;
  tracker?.close();
  tracker = undefined;
  hands.clear();
  bolt = pointingSince = undefined;
}

function limited(reason) {
  releaseCamera();
  delete guide.dataset.ready;
  status.textContent = reason + " Podes experimentar os efeitos com os botões.";
  preview.hidden = false;
  window.Palco?.availability("limited", reason + " A projeção tem uma demonstração manual.");
}

function screen(point) {
  // Mirror and crop exactly like object-fit: cover on the source video.
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
  const imageW = video.videoWidth * scale, imageH = video.videoHeight * scale;
  return { x: (1 - point.x) * imageW + (w - imageW) / 2, y: point.y * imageH + (h - imageH) / 2 };
}

function sample(result, time) {
  const rawHands = result.landmarks;
  const labels = result.handednesses ?? result.handedness;
  const observed = new Set();
  const geometry = [];
  for (const [index, raw] of rawHands.entries()) {
    const id = labels?.[index]?.[0]?.categoryName || String(index);
    if (raw.length !== 21 || observed.has(id)) continue;
    observed.add(id);
    if (!hands.has(id)) hands.set(id, { detect: createSnapDetector(), seen: -Infinity, fireUntil: 0 });
    const hand = hands.get(id);
    const corrected = raw.map(point => ({ ...point, y: point.y * video.videoHeight / video.videoWidth }));
    if (hand.detect(corrected, time)) hand.fireUntil = time + FIRE_MS;
    const blend = Math.min(1, (time - hand.seen) / 42);
    hand.points = raw.map((point, i) => {
      const previous = hand.points?.[i] ?? point;
      return { x: previous.x + (point.x - previous.x) * blend, y: previous.y + (point.y - previous.y) * blend };
    });
    hand.seen = time;
    geometry.push({ corrected, hand });
  }
  for (const [id, hand] of hands) {
    if (!observed.has(id)) hand.detect(null, time);
    if (time - hand.seen > 600 && time > hand.fireUntil) hands.delete(id);
  }

  const endpoints = electricEndpoints(geometry.map(item => item.corrected), Boolean(bolt && time - bolt.seen < LOST_MS));
  if (endpoints) {
    pointingSince ??= time;
    if (time - pointingSince >= 50) bolt = { seen: time, points: geometry.map(item => item.hand.points[8]) };
  } else pointingSince = undefined;
}

function demoHand() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const size = Math.min(w, h) * .115;
  const x = w * .39, y = h * .60;
  const pose = [[0, 1.25], [-.24, .83], [-.55, .52], [-.69, .30], [-.78, .19],
    [-.42, .22], [-.50, -.22], [-.54, -.55], [-.58, -.83],
    [-.11, .10], [-.13, -.40], [-.15, -.76], [-.15, -1.04],
    [.19, .17], [.22, -.29], [.24, -.61], [.27, -.86],
    [.45, .32], [.57, -.04], [.63, -.29], [.67, -.50]];
  return pose.map(([dx, dy]) => ({ x: x + dx * size, y: y + dy * size }));
}

function render(time) {
  if (disposed) return;
  if (tracker && !document.hidden && video.readyState >= 2 && video.currentTime !== previousVideoTime) {
    previousVideoTime = video.currentTime;
    if (time - lastSample > LOST_MS) pointingSince = undefined;
    lastSample = time;
    try {
      sample(tracker.detectForVideo(video, time), time);
      if (!ready) {
        ready = true;
        video.dataset.live = "";
        guide.dataset.ready = "";
        status.textContent = advice;
        preview.hidden = embedded;
        window.Palco?.availability("ready");
      }
    } catch {
      limited("O reconhecimento de mãos deixou de responder.");
    }
  }
  const fires = [];
  for (const hand of hands.values()) {
    if (time >= hand.fireUntil || time - hand.seen >= LOST_MS) continue;
    fires.push({
      points: hand.points.map(screen),
      power: Math.min(1, (hand.fireUntil - time) / 460, (LOST_MS - time + hand.seen) / 75),
    });
  }
  if (time < demoFireUntil) fires.push({ points: demoHand(), power: Math.min(1, (demoFireUntil - time) / 460), demo: true });
  let electricity = bolt && time - bolt.seen < LOST_MS ? {
    points: bolt.points.map(screen),
    power: Math.min(1, (LOST_MS - time + bolt.seen) / 90),
  } : null;
  if (time < demoBoltUntil) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    electricity = {
      points: [{ x: w * .43, y: h * .52 }, { x: w * .77, y: h * .40 }],
      power: Math.min(1, (demoBoltUntil - time) / 300),
    };
  }
  effects.render(time, fires, electricity);
  frame = requestAnimationFrame(render);
}

document.querySelector("#fire-preview").addEventListener("click", () => { demoFireUntil = performance.now() + FIRE_MS; });
document.querySelector("#electric-preview").addEventListener("click", () => { demoBoltUntil = performance.now() + 2300; });
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
