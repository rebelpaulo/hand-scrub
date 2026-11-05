import assert from "node:assert/strict";
import test from "node:test";
import { createSnapDetector, visibleFingertips, electricConnections, createFireActivation } from "../elements-gestures.mjs";

const point = (x, y, z = 0) => ({ x, y, z });
const hand = () => {
  const points = Array.from({ length: 21 }, () => point(0, 0));
  points[0] = point(0, 1);
  points[5] = point(-.36, .08);
  points[17] = point(.36, .08);
  return points;
};
const pose = (thumb, middle) => Object.assign(hand(), { 4: thumb, 12: middle });
const loaded = pose(point(.12, -.37), point(.10, -.41));
const released = pose(point(.48, -.31), point(.10, .51));
const openedOnly = pose(point(.65, -.41), point(.10, -.41));

test("fires once after loading and releasing the middle finger", () => {
  const snap = createSnapDetector();
  assert.equal(snap(loaded, 10), false);
  assert.equal(snap(loaded, 43), false);
  assert.equal(snap(released, 76), true);
  assert.equal(snap(released, 109), false);
  assert.equal(snap(loaded, 142), false);
  assert.equal(snap(loaded, 175), false);
  assert.equal(snap(released, 208), false);
  assert.equal(snap(loaded, 810), false);
  assert.equal(snap(loaded, 843), false);
  assert.equal(snap(released, 876), true);
});

test("ignores an ordinary pinch release and tracking gaps", () => {
  const snap = createSnapDetector();
  snap(loaded, 10);
  snap(loaded, 43);
  assert.equal(snap(openedOnly, 76), false);
  snap(loaded, 109);
  snap(loaded, 142);
  snap(null, 175);
  assert.equal(snap(released, 208), false);
  snap(loaded, 241);
  snap(loaded, 274);
  assert.equal(snap(released, 474), false);
});


const openHand = (side = 0) => [[0, 1.25], [-.24, .83], [-.55, .52], [-.69, .30], [-.78, .19],
  [-.42, .22], [-.50, -.22], [-.54, -.55], [-.58, -.83],
  [-.11, .10], [-.13, -.40], [-.15, -.76], [-.15, -1.04],
  [.19, .17], [.22, -.29], [.24, -.61], [.27, -.86],
  [.45, .32], [.57, -.04], [.63, -.29], [.67, -.50]]
  .map(([x, y]) => point((side ? .7 : .3) + x * .12 * (side ? -1 : 1), .5 + y * .12));

function fold(points, tip) {
  points[tip] = point(points[0].x, points[0].y - .035);
  points[tip - 1] = point(points[tip - 3].x, points[tip - 3].y + .035);
  return points;
}

test("open palm activates fire without catching the instant of a snap", () => {
  const fire = createFireActivation();
  const open = openHand();
  for (let t = 0; t < 320; t += 40) assert.equal(fire(open, undefined, t), false);
  assert.equal(fire(open, undefined, 320), true);
  assert.equal(fire(open, undefined, 5000), false, "a long tracking interruption must re-arm");
  for (let t = 5040; t <= 5360; t += 40) fire(open, undefined, t);
  assert.equal(fire(open, undefined, 5400), true);
  const fist = [8, 12, 16, 20].reduce(fold, openHand());
  for (let t = 5440; t < 6040; t += 40) fire(fist, undefined, t);
  assert.equal(fire(fist, undefined, 6040), false);
});

test("a recognized snap ignites the corresponding hand", () => {
  const fire = createFireActivation();
  fire(loaded, undefined, 10);
  fire(loaded, undefined, 43);
  assert.equal(fire(released, undefined, 76), true);
  assert.equal(fire(null, null, 900), false);
});

test("exposed finger filter excludes curled and covered fingertips", () => {
  assert.deepEqual(visibleFingertips(openHand()), [4, 8, 12, 16, 20]);
  const folded = fold(openHand(), 12);
  assert.equal(visibleFingertips(folded).includes(12), false);
  const covered = openHand();
  covered[12] = { ...covered[8], z: .05 };
  covered[11] = { ...covered[7], z: .05 };
  covered[10] = { ...covered[6], z: .05 };
  assert.equal(visibleFingertips(covered).includes(12), false);
  assert.equal(visibleFingertips(covered).includes(8), true);
});

test("all exposed tips connect even with the opposite corresponding finger curled", () => {
  const left = { id: "Left", points: openHand(), tips: [4, 8, 16, 20] };
  const right = { id: "Right", points: openHand(1), tips: [4, 8, 12, 20] };
  const pairs = electricConnections([left, right]);
  assert.ok(pairs.length);
  assert.deepEqual([...new Set(pairs.map(p => p.from))].sort((a, b) => a - b), left.tips);
  assert.deepEqual([...new Set(pairs.map(p => p.to))].sort((a, b) => a - b), right.tips);
  assert.ok(pairs.every(p => p.from !== 12 && p.to !== 16));
  assert.deepEqual(electricConnections([left]), []);
  assert.deepEqual(electricConnections([left, { ...right, tips: [] }]), []);
});

test("connections persist when visible hands move far apart", () => {
  const shrink = (points, center, target) => points.map(p => point(target + (p.x - center) * .35, p.y * .35 + .3, p.z));
  const left = { id: "Left", points: shrink(openHand(), .3, .1), tips: [4, 8, 12, 16, 20] };
  const right = { id: "Right", points: shrink(openHand(1), .7, .9), tips: [4, 8, 12, 16, 20] };
  assert.equal(electricConnections([left, right]).length, 5);
});
