import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { EFFECTS, ENGINES, FAMILIES, PALETTES, SYMMETRIES, symmetryPoints } from "../drawphysics-effects.mjs";
import { EXPERIENCES } from "../catalog.mjs";

test("cada efeito tem id único, família, paleta e pelo menos um motor", () => {
  assert.ok(EFFECTS.length >= 63);
  assert.equal(new Set(EFFECTS.map(e => e.id)).size, EFFECTS.length);
  const families = new Set(FAMILIES.map(f => f.id));
  for (const e of EFFECTS) {
    assert.ok(families.has(e.family), e.id + ": família");
    assert.ok(PALETTES[e.pal], e.id + ": paleta");
    assert.ok(ENGINES.some(k => e[k]), e.id + ": sem motor");
  }
  for (const f of families) assert.ok(EFFECTS.some(e => e.family === f), f + ": família vazia");
});

test("cada efeito tem a sua miniatura e não sobra nenhuma", () => {
  // refazem-se com: node installation/art/drawphysics/make.mjs
  const files = readdirSync(new URL("../art/drawphysics/", import.meta.url)).filter(f => f.endsWith(".webp")).sort();
  assert.deepEqual(files, EFFECTS.map(e => e.id + ".webp").sort());
  for (const e of EFFECTS) assert.match(e.id, /^[a-z-]+$/, e.id + ": o servidor só serve miniaturas com este formato de nome");
});

test("as paletas têm três cores hexadecimais", () => {
  for (const [id, p] of Object.entries(PALETTES)) {
    assert.equal(p.c.length, 3, id);
    for (const c of p.c) assert.match(c, /^#[0-9a-f]{6}$/i, id);
  }
});

test("a simetria devolve o número certo de pontos e mantém o original", () => {
  const out = [];
  const counts = { none: 1, mirror: 2, quad: 4, kaleido: 8 };
  for (const s of SYMMETRIES) {
    symmetryPoints(s.id, 300, 200, 1000, 800, out);
    assert.equal(out.length / 2, counts[s.id], s.id);
    assert.deepEqual([out[0], out[1]], [300, 200], s.id);
  }
  symmetryPoints("mirror", 300, 200, 1000, 800, out);
  assert.deepEqual([out[2], out[3]], [700, 200]);
});

test("está no catálogo da instalação", () => {
  const app = EXPERIENCES.find(e => e.id === "drawphysics");
  assert.equal(app.file, "drawphysics.html");
  assert.equal(app.camera, true);
});
