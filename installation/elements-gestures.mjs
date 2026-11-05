const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const screenDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const palmScale = points => Math.max(distance(points[0], points[9]), distance(points[5], points[17]));
export const FINGERTIPS = [4, 8, 12, 16, 20];
export const TRACKING_GRACE_MS = 200;

export function createSnapDetector() {
  let chargedAt, lastContact, loaded, lastTime, lockedUntil = 0;
  return (points, time) => {
    if (!points || (lastTime !== undefined && time - lastTime > 180)) {
      chargedAt = lastContact = loaded = undefined;
      if (!points) { lastTime = time; return false; }
    }
    lastTime = time;
    const scale = palmScale(points);
    if (scale <= 0 || !Number.isFinite(scale)) return false;
    const pinch = distance(points[4], points[12]) / scale;
    const curl = distance(points[9], points[12]) / scale;
    const reach = distance(points[0], points[12]) / scale;
    if (time < lockedUntil) return false;
    if (pinch < .34) {
      chargedAt ??= time;
      loaded ??= { curl, reach };
      lastContact = time;
      return false;
    }
    if (chargedAt === undefined) return false;
    const released = pinch > .48;
    const folded = curl < .85 && reach < 1.35;
    const moved = loaded.reach - reach > .12 || loaded.curl - curl > .12;
    const snapped = released && lastContact - chargedAt >= 25 && folded && moved && time - lastContact <= 300;
    if (released || time - lastContact > 300) chargedAt = lastContact = loaded = undefined;
    if (snapped) lockedUntil = time + 650;
    return snapped;
  };
}

function insidePalm(tip, hand) {
  const polygon = [0, 1, 2, 5, 9, 13, 17].map(index => hand[index]);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > tip.y) !== (b.y > tip.y) && tip.x < (b.x - a.x) * (tip.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function behindFinger(tip, hand, ownTip, scale) {
  for (const otherTip of FINGERTIPS) {
    if (otherTip === ownTip) continue;
    for (let joint = otherTip - 3; joint < otherTip; joint++) {
      const a = hand[joint], b = hand[joint + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      if (!lengthSquared) continue;
      const t = Math.max(0, Math.min(1, ((tip.x - a.x) * dx + (tip.y - a.y) * dy) / lengthSquared));
      const near = screenDistance(tip, { x: a.x + dx * t, y: a.y + dy * t }) < scale * .10;
      const depth = (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t;
      if (near && (tip.z ?? 0) > depth + scale * .07) return true;
    }
  }
  return false;
}

// HandLandmarker estimates all 21 points, including hidden fingers. Infer
// exposed tips from extension, projected overlap and relative finger depth.
export function visibleFingertips(points, world = points, previous = []) {
  world ||= points;
  if (points?.length !== 21 || world?.length !== 21) return [];
  const scale = palmScale(points);
  if (!Number.isFinite(scale) || scale <= 0) return [];
  return FINGERTIPS.filter(tip => {
    const wasVisible = previous.includes(tip);
    const start = tip === 4 ? 2 : tip - 3;
    let length = 0;
    for (let i = start; i < tip; i++) length += distance(world[i], world[i + 1]);
    if (!length || distance(world[start], world[tip]) < length * (wasVisible ? .61 : .69)) return false;
    const point = points[tip];
    if (![point.x, point.y, point.z ?? 0].every(Number.isFinite)) return false;
    if (tip === 4 && screenDistance(point, points[5]) < scale * (wasVisible ? .21 : .25)) return false;
    if (tip !== 4 && distance(world[0], world[tip]) < distance(world[0], world[tip - 2]) + palmScale(world) * (wasVisible ? .025 : .06)) return false;
    const inFront = (point.z ?? 0) < (points[9].z ?? 0) - scale * .13;
    return (!insidePalm(point, points) || inFront) && !behindFinger(point, points, tip, scale);
  });
}

export function createFireActivation() {
  const snap = createSnapDetector();
  let active = false, openSince, closedSince, seen = -Infinity;
  return (points, world, time) => {
    if (!points) {
      snap(null, time);
      openSince = closedSince = undefined;
      if (time - seen > 600) active = false;
      return active;
    }
    if (time - seen > 600) {
      active = false;
      openSince = closedSince = undefined;
    }
    seen = time;
    const visible = visibleFingertips(points, world);
    if (visible.length >= 4) {
      openSince ??= time;
      closedSince = undefined;
      if (time - openSince >= 320) active = true;
    } else {
      openSince = undefined;
      if (visible.length <= 1) {
        closedSince ??= time;
        if (time - closedSince >= 550) active = false;
      } else closedSince = undefined;
    }
    if (snap(world || points, time)) active = true;
    return active;
  };
}

export function electricConnections(hands) {
  if (hands.length !== 2) return [];
  const [a, b] = hands;
  if (!a.tips.length || !b.tips.length) return [];
  const scale = (palmScale(a.points) + palmScale(b.points)) / 2;
  const links = new Map();
  const canConnect = (from, to) => {
    const gap = screenDistance(a.points[from], b.points[to]) / scale;
    return gap >= .12 && gap <= 6 && !insidePalm(a.points[from], b.points) && !insidePalm(b.points[to], a.points);
  };
  const connect = (from, to) => {
    const key = a.id + ":" + from + "/" + b.id + ":" + to;
    links.set(key, { key, from, to });
  };
  for (const tip of a.tips) {
    const candidates = b.tips.filter(candidate => canConnect(tip, candidate));
    if (!candidates.length) continue;
    const other = candidates.includes(tip) ? tip : candidates.reduce((best, candidate) =>
      screenDistance(a.points[tip], b.points[candidate]) < screenDistance(a.points[tip], b.points[best]) ? candidate : best);
    connect(tip, other);
  }
  for (const tip of b.tips) {
    if ([...links.values()].some(link => link.to === tip)) continue;
    const candidates = a.tips.filter(candidate => canConnect(candidate, tip));
    if (!candidates.length) continue;
    const other = candidates.reduce((best, candidate) =>
      screenDistance(b.points[tip], a.points[candidate]) < screenDistance(b.points[tip], a.points[best]) ? candidate : best);
    connect(other, tip);
  }
  return [...links.values()];
}
