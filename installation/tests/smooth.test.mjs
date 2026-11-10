import test from "node:test";
import assert from "node:assert/strict";
import { oneEuro } from "../smooth.mjs";

test("parado, o filtro corta o tremor para menos de metade", () => {
  const f = oneEuro();
  let seed = 7, min = Infinity, max = -Infinity;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - .5) * 8;   // ±4 px
  for (let i = 0; i < 240; i++) {
    const y = f(500 + noise(), i / 30);
    if (i > 60) { min = Math.min(min, y); max = Math.max(max, y); }
  }
  assert.ok(max - min < 4, "tremor à saída: " + (max - min).toFixed(2) + " px (entrada: 8 px)");
});

test("em movimento rápido quase não atrasa", () => {
  const f = oneEuro();
  let out = 0;
  for (let i = 0; i < 30; i++) out = f(i * 40, i / 30);   // 1200 px/s
  assert.ok(29 * 40 - out < 45, "atraso: " + (29 * 40 - out).toFixed(1) + " px");
});

test("reset recomeça sem arrastar o ponto antigo", () => {
  const f = oneEuro();
  f(100, 0); f(100, .03);
  f.reset();
  assert.equal(f(900, 1), 900);
});
