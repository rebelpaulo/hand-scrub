import assert from "node:assert/strict";
import test from "node:test";
import { polarityVote, polarityGate } from "../polarity.mjs";

test("tapar cantos não inverte a sala; uma máscara ao contrário inverte, mas só se persistir", () => {
  assert.equal(polarityVote([0, 0, 1, 0], 0), null, "um canto de baixo tapado");
  assert.equal(polarityVote([0, 0, 1, 1], 0), null, "os dois cantos de baixo tapados");
  assert.equal(polarityVote([1, 1, 1, 1], 1), null, "lente tapada");
  assert.equal(polarityVote([0, 0, 0, 0], 0), null, "ninguém à frente");
  assert.equal(polarityVote([0, 0, 0, 0], 1), false, "pessoa ao centro, máscara normal");
  assert.equal(polarityVote([1, 1, 1, 1], 0), true, "pessoa ao centro, máscara ao contrário");

  const gate = polarityGate(4);
  assert.deepEqual([true, true, true, null, true, true, true].map(gate), Array(7).fill(false), "três votos e uma pausa não chegam");
  assert.equal(gate(true), true, "o quarto voto seguido inverte");
  assert.deepEqual([false, false, false].map(gate), [true, true, true]);
  assert.equal(gate(false), false);
});
