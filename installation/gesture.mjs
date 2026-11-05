// All input positions share the mirror's pixel coordinates.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const vector = (from, to) => [to.x - from.x, to.y - from.y, (to.z ?? 0) - (from.z ?? 0)];

function straight(a, b, c, threshold) {
  const first = vector(a, b);
  const next = vector(b, c);
  const length = Math.hypot(...first) * Math.hypot(...next);
  return length > 0 && first.reduce((sum, value, index) => sum + value * next[index], 0) / length >= threshold;
}

export function isOpenPalm(points) {
  if (points?.length !== 21) return false;
  const fingers = [5, 9, 13, 17].filter(index =>
    straight(points[index], points[index + 1], points[index + 2], .60) &&
    straight(points[index + 1], points[index + 2], points[index + 3], .72)
  );
  const palmWidth = Math.hypot(...vector(points[5], points[17]));
  return fingers.length === 4 &&
    straight(points[2], points[3], points[4], .38) &&
    Math.hypot(...vector(points[4], points[5])) >= palmWidth * .50;
}

export const HOLD_MS = 2000;
const MAX_SAMPLE_GAP = 250;

export function createPalmHold() {
  let anchor;
  return function update({ time, hand, card, radius }) {
    const hitsCard = hand?.open && card &&
      Math.abs(hand.x - card.x) <= card.halfWidth &&
      Math.abs(hand.y - card.y) <= card.halfHeight;
    if (!hitsCard) {
      anchor = undefined;
      return { progress: 0, selected: false };
    }
    if (!anchor || anchor.hand !== hand.id || anchor.card !== card.id ||
      time < anchor.last || time - anchor.last > MAX_SAMPLE_GAP || distance(hand, anchor) > radius) {
      anchor = { x: hand.x, y: hand.y, hand: hand.id, card: card.id, start: time, last: time };
    }
    anchor.last = time;
    const progress = Math.min(1, (time - anchor.start) / HOLD_MS);
    const selected = progress === 1 && !anchor.selected;
    if (selected) anchor.selected = true;
    return { progress, selected };
  };
}

// Relative to the torso, so shifting the entire body doesn't turn the deck.
export function createHandDrag() {
  let anchor, sample, dragging, lastMove;
  return function update(hand, time, target, stride) {
    if (!hand?.open || hand.id !== anchor?.id || time - (sample?.time ?? time) > MAX_SAMPLE_GAP) {
      const position = dragging ? Math.round(target) : target;
      anchor = hand?.open ? { ...hand, position } : undefined;
      sample = anchor && { x: hand.x, time };
      dragging = false;
      return { target: position, dragging: false };
    }
    const dx = hand.x - anchor.x;
    const dy = hand.y - anchor.y;
    if (!dragging && Math.abs(dy) > stride * .15 && Math.abs(dy) > Math.abs(dx)) {
      anchor = { ...hand, position: target };
    } else if (!dragging && Math.abs(dx) >= stride * .13 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      dragging = true;
      lastMove = time;
    }
    if (dragging && Math.abs(hand.x - sample.x) > stride * .023) lastMove = time;
    sample = { x: hand.x, time };
    if (!dragging) return { target, dragging: false };

    const position = anchor.position - dx / stride;
    if (time - lastMove < 180) return { target: position, dragging: true };
    const snapped = Math.round(position);
    anchor = { ...hand, position: snapped };
    dragging = false;
    return { target: snapped, dragging: false };
  };
}
