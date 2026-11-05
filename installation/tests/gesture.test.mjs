import assert from "node:assert/strict";
import test from "node:test";
import { createPalmHold } from "../gesture.mjs";

const card = { id: "magicdraw", x: 100, y: 100, halfWidth: 35, halfHeight: 45 };
const palm = { id: "left", x: 100, y: 100, open: true };

test("selects once after two continuous seconds", () => {
  const hold = createPalmHold();
  for (let time = 0; time < 2000; time += 100) {
    assert.equal(hold({ time, hand: palm, card, radius: 12 }).selected, false);
  }
  assert.equal(hold({ time: 1999, hand: palm, card, radius: 12 }).selected, false);
  assert.deepEqual(hold({ time: 2000, hand: palm, card, radius: 12 }), { progress: 1, selected: true });
  assert.equal(hold({ time: 2100, hand: palm, card, radius: 12 }).selected, false);
});

test("resets if tracking lapses, the hand closes or the front card changes", () => {
  const hold = createPalmHold();
  const update = (time, hand = palm, front = card) => hold({ time, hand, card: front, radius: 12 });
  update(0);
  assert.equal(update(200).progress, 0.1);
  assert.equal(update(700).progress, 0);
  assert.equal(update(800, { ...palm, open: false }).progress, 0);
  update(900);
  assert.equal(update(1000, { ...palm, x: 118 }).progress, 0);
  assert.equal(update(1100, { ...palm, x: 118 }, { ...card, id: "scrub" }).progress, 0);
});
