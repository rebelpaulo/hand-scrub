import { EXPERIENCES } from './catalog.mjs';
import { createHandDrag, createPalmHold, isOpenPalm } from './gesture.mjs';

const get = id => document.getElementById(id);
const mirror = get('mirror'), video = get('camera'), deck = get('deck'), cursor = get('palm');
const help = get('help').firstChild, subhelp = get('subhelp'), count = get('count'), signal = get('signal');
const query = new URLSearchParams(location.search);
const launch = query.get('launch');
const embedded = window.parent !== window;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const updateHold = createPalmHold(), updateDrag = createHandDrag();
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const wrap = (value, length) => (value % length + length) % length;
const length = EXPERIENCES.length;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

let current = -1, position = 0, target = 0, width, height, cardWidth, cardHeight, spacing;
let body, x, y, hand, motion, previousFrame, pending, pendingTimer, waitForRelease, recenter;
let retryUntil = 0, holdProgress = 0;
let lastPose = -Infinity, lastHands = -Infinity, lastFrameChange = -Infinity, lastVideoTime = -1;
let handTracker, poseTracker, stream, frameId, status = 'loading', disposed = false;

const cards = EXPERIENCES.map((experience, index) => {
  const button = document.createElement('button');
  button.className = 'card';
  button.type = 'button';
  button.tabIndex = -1;
  button.style.setProperty('--card-color', experience.color);
  const image = document.createElement('img');
  image.src = experience.image;
  image.alt = '';
  image.draggable = false;
  const number = document.createElement('span');
  number.className = 'number tag';
  number.setAttribute('aria-hidden', 'true');
  number.textContent = String(index + 1).padStart(2, '0');
  const front = document.createElement('span');
  front.className = 'front-label tag';
  front.setAttribute('aria-hidden', 'true');
  front.textContent = 'Selecionar';
  const caption = document.createElement('span');
  caption.className = 'caption';
  const title = document.createElement('strong'), name = document.createElement('small');
  title.textContent = experience.title;
  name.textContent = experience.name;
  caption.append(title, name);
  const progress = document.createElement('span');
  progress.className = 'progress';
  progress.setAttribute('aria-hidden', 'true');
  button.append(image, number, front, caption, progress);
  button.addEventListener('click', () => {
    if (index === current) choose(experience);
    else rotate(wrap(index - current + length / 2, length) - length / 2, true);
  });
  deck.append(button);
  return button;
});

function tellParent(data) {
  if (embedded) parent.postMessage({ mapping: 1, launch, ...data }, location.origin);
}

function setHelp(primary, secondary = embedded ? 'Também podes escolher pelo quiosque.' : 'Também podes escolher com as setas ou por toque.') {
  if (help.nodeValue !== primary) help.nodeValue = primary;
  if (subhelp.textContent !== secondary) subhelp.textContent = secondary;
}

function setSignal(state, label) {
  if (mirror.dataset.signal !== state) mirror.dataset.signal = state;
  if (signal.textContent !== label) signal.textContent = label;
}

function readyHelp() {
  if (pending || performance.now() < retryUntil) return;
  if (status === 'limited') {
    setSignal('limited', 'Controlo manual');
    setHelp('Gestos indisponíveis.', embedded ? 'Usa as setas, toca num cartão ou escolhe pelo quiosque.' : 'Usa as setas ou toca num cartão.');
  } else if (status === 'ready') {
    if (!body) {
      setSignal('search', 'À tua espera');
      setHelp('Coloca-te em frente à câmara.', 'Os cartões acompanham o teu corpo.');
    } else if (holdProgress > 0) {
      setSignal('hold', 'A selecionar');
      setHelp('Mantém a palma aberta.', 'O cartão abre após 2 segundos.');
    } else if (hand) {
      setSignal('hand', 'Mão detetada');
      setHelp('Move a mão para rodar os cartões.', 'Deixa a palma aberta sobre o cartão central durante 2 segundos.');
    } else {
      setSignal('body', 'Corpo detetado');
      setHelp('Mostra a palma da mão.', 'Move-a para os lados para escolher um cartão.');
    }
  }
}

function choose(experience) {
  if (pending || disposed) return;
  pending = true;
  waitForRelease = true;
  setSignal('opening', 'A abrir');
  setHelp('A abrir ' + experience.title + '…');
  if (!embedded) {
    const url = new URL('/' + experience.file, location.href);
    if (query.has('room')) url.searchParams.set('room', query.get('room'));
    location.assign(url);
    return;
  }
  tellParent({ evt: 'select', app: experience.id });
  // If the current iframe stays visible, the parent hasn't advanced.
  pendingTimer = setTimeout(selectionRejected, 4500);
}

function selectionRejected() {
  if (!pending || disposed) return;
  clearTimeout(pendingTimer);
  pending = false;
  waitForRelease = true;
  retryUntil = performance.now() + 3500;
  setSignal('retry', 'Tenta novamente');
  setHelp('A projeção não mudou. Tenta outra vez.', 'Baixa a mão para recomeçar ou escolhe pelo quiosque.');
}

window.addEventListener('message', event => {
  if (!embedded || event.origin !== location.origin || event.source !== parent) return;
  const data = event.data;
  if (data?.mapping === 1 && data.launch === launch && data.cmd === 'selectionRejected') selectionRejected();
});

function rotate(delta, focus = false) {
  if (pending) return;
  target = Math.round(target) + delta;
  waitForRelease = true;
  updateHold({});
  updateDrag(null, performance.now(), target, 1);
  render(performance.now());
  if (focus) cards[wrap(Math.round(target), length)].focus({ preventScroll: true });
}

get('previous').addEventListener('click', () => rotate(-1));
get('next').addEventListener('click', () => rotate(1));
document.addEventListener('keydown', event => {
  if (event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    rotate(event.key === 'ArrowLeft' ? -1 : 1, true);
  }
});

function resize() {
  width = mirror.clientWidth;
  height = mirror.clientHeight;
  cardWidth = clamp(width * (width < 600 ? .37 : .205), 116, 330);
  cardHeight = Math.min(cardWidth * 1.1, height * .46);
  spacing = Math.min(cardWidth * 1.12, width * .255);
  deck.style.setProperty('--card-width', cardWidth + 'px');
  deck.style.setProperty('--card-height', cardHeight + 'px');
}
window.addEventListener('resize', resize);
resize();

function render(now) {
  const dt = clamp(now - (previousFrame ?? now), 0, 50);
  const snap = reduced.matches;
  const blend = 1 - Math.exp(-dt / 74);
  previousFrame = now;
  position = snap || Math.abs(target - position) < .006 ? target : position + (target - position) * blend;
  const anchorX = body && !snap ? clamp(body.x, width * .20, width * .80) : width / 2;
  const anchorY = body && !snap ? clamp(body.y, cardHeight / 2 + 62, height - cardHeight / 2 - 92) : height * .49;
  x = x == null || snap ? anchorX : x + (anchorX - x) * blend;
  y = y == null || snap ? anchorY : y + (anchorY - y) * blend;
  const index = wrap(Math.round(target), length);
  if (current !== index) {
    const focused = cards[current] === document.activeElement;
    cards[current]?.removeAttribute('aria-current');
    if (cards[current]) cards[current].tabIndex = -1;
    current = index;
    cards[index].setAttribute('aria-current', 'true');
    cards[index].tabIndex = 0;
    count.textContent = (index + 1) + ' / ' + length;
    if (focused) cards[index].focus({ preventScroll: true });
  }

  for (const [i, button] of cards.entries()) {
    const offset = wrap(i - (snap ? Math.round(target) : position) + length / 2, length) - length / 2;
    const depth = Math.abs(offset);
    button.hidden = depth > 2.55 && i !== current;
    if (button.hidden) continue;
    const scale = 1 - .12 * depth;
    const lateral = Math.sign(offset) * Math.pow(depth, .8) * spacing;
    const rotation = snap ? 0 : clamp(offset * -30, -60, 60);
    button.style.transform = 'translate3d(' + (x + lateral) + 'px,' + (y - depth * cardHeight * .10) +
      'px,0) translate(-50%,-50%) scale(' + scale + ') rotateY(' + rotation + 'deg)';
    button.style.opacity = String(1 - .22 * depth);
    button.style.zIndex = String(8 - Math.round(depth * 2));
  }
}

function project(point) {
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  return {
    x: (1 - point.x) * video.videoWidth * scale + (width - video.videoWidth * scale) / 2,
    y: point.y * video.videoHeight * scale + (height - video.videoHeight * scale) / 2
  };
}

function readBody(landmarks) {
  const left = landmarks?.[11], right = landmarks?.[12];
  if (!left || !right || Math.min(left.visibility, right.visibility) < .55) return;
  const a = project(left), b = project(right);
  const shoulder = distance(a, b);
  if (shoulder < 35) return;
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + shoulder * .54 };
  const wrists = [15, 16].flatMap(index => {
    const point = landmarks[index];
    return point?.visibility >= .38 ? [{ ...project(point), id: index }] : [];
  });
  return { ...center, shoulder, wrists };
}

function readHand(result) {
  if (!body) return;
  const labels = result.handednesses ?? result.handedness;
  const wristTolerance = clamp(body.shoulder * .56, 42, 130);
  const options = result.landmarks.flatMap((points, index) => {
    const wrist = project(points[0]);
    const label = labels?.[index]?.[0]?.categoryName ?? '';
    let closest = body.wrists.reduce((best, next) =>
      !best || distance(next, wrist) < distance(best, wrist) ? next : best, null);
    if (!closest || distance(wrist, closest) > wristTolerance) return [];
    // Pose is sampled less often than the hands. Keep a plausible existing
    // match when the hands pass each other between pose samples.
    const previous = hand?.label === label && body.wrists.find(item => item.id === hand.wristId);
    if (previous && distance(wrist, previous) <= Math.min(wristTolerance, distance(wrist, closest) + body.shoulder * .12)) {
      closest = previous;
    }
    const palm = project({ x: (points[0].x + points[9].x) / 2, y: (points[0].y + points[9].y) / 2 });
    if (Math.abs(palm.x - body.x) > body.shoulder * 2.6 ||
      Math.abs(palm.y - body.y) > body.shoulder * 1.8) return [];
    return [{ ...palm, id: closest.id + ':' + label, label, wristId: closest.id, open: isOpenPalm(result.worldLandmarks?.[index] ?? points) }];
  });
  return options.find(option => option.id === hand?.id && option.open) ??
    options.find(option => option.open);
}

function resetInput(now) {
  const result = updateDrag(null, now, target, 1);
  if (!pending) target = result.target;
  motion = result;
  hand = undefined;
  recenter = false;
  updateHold({});
  cursor.hidden = true;
  holdProgress = 0;
  deck.style.setProperty('--hold', 0);
  cursor.style.setProperty('--hold', 0);
}

function inspectCamera(now) {
  if (video.readyState < 2 || !video.videoWidth || video.currentTime === lastVideoTime) {
    if (now - lastFrameChange > 250) {
      body = undefined;
      resetInput(now);
      readyHelp();
    }
    return false;
  }
  lastVideoTime = video.currentTime;
  lastFrameChange = now;
  if (now - lastPose >= 69) {
    body = readBody(poseTracker.detectForVideo(video, now).landmarks[0]);
    lastPose = now;
  }
  if (now - lastHands < 33) return false;
  hand = readHand(handTracker.detectForVideo(video, now));
  lastHands = now;
  if (!hand) waitForRelease = false;
  if (!hand || Math.abs(hand.x - x) < cardWidth * .24) recenter = false;
  const relative = hand && !recenter && { ...hand, x: hand.x - body.x, y: hand.y - body.y };
  const result = updateDrag(relative, now, target, clamp((body?.shoulder ?? 140) * .76, 88, 240));
  if (motion?.dragging && !result.dragging && hand) recenter = true;
  motion = result;
  if (!pending) target = motion.target;
  if (status !== 'ready') {
    status = 'ready';
    tellParent({ evt: 'availability', state: 'ready', reason: 'Câmara e reconhecimento de gestos prontos.' });
  }
  readyHelp();
  return true;
}

function inspectHold(now) {
  const moving = motion?.dragging || (!reduced.matches && Math.abs(position - Math.round(target)) > .07);
  const card = { x, y, id: current, halfWidth: cardWidth / 2, halfHeight: cardHeight / 2 };
  const canHold = !moving && !pending && !waitForRelease;
  const hold = updateHold({ time: now, hand: canHold ? hand : undefined, card, radius: clamp(cardWidth * .09, 14, 29) });
  const startedOrStopped = Boolean(holdProgress) !== Boolean(hold.progress);
  holdProgress = hold.progress;
  deck.style.setProperty('--hold', holdProgress);
  cursor.style.setProperty('--hold', holdProgress);
  if (startedOrStopped) readyHelp();
  cursor.hidden = !hand;
  if (hand) {
    cursor.style.transform = 'translate3d(' + (hand.x - 12) + 'px,' + (hand.y - 12) + 'px,0)';
    cursor.classList.toggle('holding', hold.progress > 0);
  }
  if (hold.selected) choose(EXPERIENCES[current]);
}

function tick(now) {
  if (disposed) return;
  let sample = false;
  try {
    if (stream && !document.hidden) sample = inspectCamera(now);
  } catch {
    limited('Falhou o processamento dos gestos.');
  }
  render(now);
  if (sample) inspectHold(now);
  frameId = requestAnimationFrame(tick);
}
frameId = requestAnimationFrame(tick);

function releaseCamera() {
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  video.srcObject = null;
  mirror.dataset.camera = 'off';
  handTracker?.close();
  poseTracker?.close();
  handTracker = undefined;
  poseTracker = undefined;
}

function limited(reason) {
  releaseCamera();
  body = undefined;
  resetInput(performance.now());
  status = 'limited';
  tellParent({ evt: 'availability', state: 'limited', reason });
  readyHelp();
}

const visionCDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const modelCDN = 'https://storage.googleapis.com/mediapipe-models';
const handModel = 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const poseModel = 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

async function createTracker(Tracker, files, modelAssetPath, options) {
  const settings = { ...options, runningMode: 'VIDEO' };
  try {
    return await Tracker.createFromOptions(files, { ...settings, baseOptions: { modelAssetPath, delegate: 'GPU' } });
  } catch {
    return await Tracker.createFromOptions(files, { ...settings, baseOptions: { modelAssetPath, delegate: 'CPU' } });
  }
}

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) {
    limited('A câmara requer HTTPS ou localhost.');
    return;
  }
  let startingCamera = false;
  try {
    const local = query.get('vision') === 'local';
    const vision = local ? '/installation/vendor' : visionCDN;
    const { FilesetResolver, HandLandmarker, PoseLandmarker } = await import(vision + '/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(vision + '/wasm');
    if (disposed) return;
    const hands = await createTracker(HandLandmarker, files, local ? vision + '/hand_landmarker.task' : modelCDN + '/' + handModel, { numHands: 2 });
    if (disposed) { hands.close(); return; }
    handTracker = hands;
    const pose = await createTracker(PoseLandmarker, files, local ? vision + '/pose_landmarker_lite.task' : modelCDN + '/' + poseModel, { numPoses: 1 });
    if (disposed) { pose.close(); return; }
    poseTracker = pose;

    setHelp('A ligar a câmara…');
    startingCamera = true;
    const camera = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false
    });
    if (disposed) { camera.getTracks().forEach(track => track.stop()); return; }
    video.srcObject = camera;
    stream = camera;
    await video.play();
    if (disposed) return;
    mirror.dataset.camera = 'on';
    setHelp('A preparar o reconhecimento dos gestos…');
    camera.getVideoTracks()[0].addEventListener('ended', () => limited('A câmara foi desligada.'), { once: true });
  } catch {
    if (!disposed) limited(startingCamera ? 'A câmara está indisponível.' : 'Os modelos de gestos estão indisponíveis.');
  }
}

window.addEventListener('pagehide', () => {
  disposed = true;
  clearTimeout(pendingTimer);
  cancelAnimationFrame(frameId);
  releaseCamera();
}, { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetInput(performance.now());
});
if (!embedded && !window.Palco) window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload();
});
start();
