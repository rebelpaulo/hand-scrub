import assert from "node:assert/strict";
import test from "node:test";
import { createSnapDetector, electricEndpoints } from "../elements-gestures.mjs";

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

test("connects index tips only while both hands point inward and are in range", () => {
  const left = Object.assign(hand(), { 5: point(-.3, .08), 6: point(.2, 0), 8: point(.62, 0) });
  const right = Object.assign(hand().map(p => point(p.x + 2, p.y)), {
    5: point(2.3, .08), 6: point(1.8, 0), 8: point(1.38, 0),
  });
  assert.deepEqual(electricEndpoints([left, right]), [left[8], right[8]]);
  assert.equal(electricEndpoints([left]), null);
  assert.equal(electricEndpoints([left, right.map(p => point(p.x + 7, p.y))]), null);
  right[6] = point(1.12, 0);
  assert.equal(electricEndpoints([left, right]), null);
});
