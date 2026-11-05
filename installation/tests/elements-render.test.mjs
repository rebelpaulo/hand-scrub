import assert from "node:assert/strict";
import test from "node:test";
import { createElementEffects } from "../elements-fx.mjs";

function recordingCanvas() {
  let path, strokes = [], saved = [];
  const context = {
    globalAlpha: 1,
    clearRect() { strokes = []; },
    setTransform() {},
    beginPath() { path = []; },
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    stroke() { strokes.push({ path: [...path], alpha: this.globalAlpha, width: this.lineWidth, color: this.strokeStyle }); },
    save() { saved.push({ globalAlpha: this.globalAlpha }); },
    restore() { Object.assign(this, saved.pop()); },
    createRadialGradient() { return { addColorStop() {} }; },
    fillRect() {},
  };
  const canvas = { clientWidth: 1000, clientHeight: 700, getContext: () => context };
  return { canvas, strokes: () => structuredClone(strokes) };
}

test("a stationary electrical connection keeps its path and brightness across frames", t => {
  const previous = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const recording = recordingCanvas();
  const effects = createElementEffects(recording.canvas, { matches: false });
  effects.resize();
  const electricity = { connections: [{ key: "Left:8/Right:12", a: { x: 200, y: 250 }, b: { x: 700, y: 330 } }], unit: 100, power: 1 };
  effects.render(0, [], electricity);
  const reference = recording.strokes();
  assert.ok(reference.length > 0);
  assert.ok(reference.some(stroke => stroke.path[0][0] === 200 && stroke.path.at(-1)[0] === 700));
  for (const time of [48, 100, 500, 1000, 5000]) {
    effects.render(time, [], electricity);
    assert.deepEqual(recording.strokes(), reference, "elapsed time must not randomize the bolt or pulse its brightness");
  }
  effects.render(5100, [], null);
  assert.deepEqual(recording.strokes(), []);
});
