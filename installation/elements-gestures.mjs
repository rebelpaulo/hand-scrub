const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const screenDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const palmScale = points => Math.max(distance(points[0], points[9]), distance(points[5], points[17]));
const STALE_FRAME_MS = 130;

// Use the loaded pose and the release. A webcam may miss the strike itself.
export function createSnapDetector() {
  let chargedAt, lastContact, previous, lockedUntil = 0;
  return (points, time) => {
    if (!points || (previous && time - previous.time > STALE_FRAME_MS)) {
      chargedAt = lastContact = previous = undefined;
      if (!points) return false;
    }
    const scale = palmScale(points);
    if (scale <= 0 || !Number.isFinite(scale)) return false;
    const [wrist, , , , thumb, , , , , middleBase, , , middle] = points;
    const pinch = distance(thumb, middle) / scale;
    const curl = distance(middleBase, middle) / scale;
    const reach = distance(wrist, middle) / scale;
    const contact = pinch < .28;
    let snapped = false;
    if (time < lockedUntil) {
      chargedAt = lastContact = undefined;
    } else if (contact) {
      chargedAt ??= time;
      lastContact = time;
    } else if (chargedAt !== undefined) {
      const released = pinch > .44;
      const enoughCharge = lastContact - chargedAt >= 28;
      const folded = reach < 1.12 && curl < .67;
      const dropped = previous && (previous.reach - reach > .09 || previous.curl - curl > .10);
      if (released && enoughCharge && folded && dropped && time - lastContact <= 150) {
        snapped = true;
        lockedUntil = time + 650;
      }
      if (released || time - lastContact > 150) chargedAt = lastContact = undefined;
    }
    previous = { time, curl, reach };
    return snapped;
  };
}

function faces(base, tip, target, minimum) {
  const dx = tip.x - base.x, dy = tip.y - base.y;
  const length = screenDistance(base, tip) * screenDistance(tip, target);
  return length > 0 && (dx * (target.x - tip.x) + dy * (target.y - tip.y)) / length > minimum;
}

export function electricEndpoints(hands, active = false) {
  if (hands.length !== 2) return null;
  const [left, right] = hands;
  const a = left[8], b = right[8];
  const leftScale = palmScale(left), rightScale = palmScale(right);
  if (screenDistance(left[5], a) < leftScale * .54 || screenDistance(right[5], b) < rightScale * .54) return null;
  const scale = (leftScale + rightScale) / 2;
  const gap = screenDistance(a, b) / scale;
  const direction = active ? -.08 : .16;
  if (gap < .14 || gap > (active ? 4.4 : 3.7) ||
      !faces(left[6], a, b, direction) || !faces(right[6], b, a, direction)) return null;
  return [a, b];
}
