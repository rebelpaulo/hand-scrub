import assert from "node:assert/strict";
import test from "node:test";

test("a projeção aguenta falhas de rede curtas e só larga a experiência ao fim de 8 s", async t => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const element = { hidden: true, addEventListener() {} };
  Object.assign(globalThis, {
    location: { search: "", origin: "http://palco.test" },
    sessionStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: () => element, addEventListener() {} },
    window: { addEventListener() {} },
  });
  let online = true;
  t.mock.method(globalThis, "fetch", async () => {
    if (!online) throw new TypeError("fetch failed");
    return { ok: true, json: async () => ({ launch: "L1", app: "lab", state: { enabled: true, session: { id: "L1", status: "ready" } } }) };
  });
  const { connectStage } = await import("../stage.mjs");
  const targets = [];
  connectStage({ frame: {}, selectTarget: app => targets.push(app), showMessage() {}, showCue() {} });
  const settle = () => new Promise(setImmediate);
  const poll = async times => { for (let i = 0; i < times; i++) { t.mock.timers.tick(1250); await settle(); } };

  await settle();
  assert.deepEqual(targets, ["lab"]);
  online = false;
  await poll(6);   // 7,5 s sem servidor: 6 falhas seguidas
  assert.deepEqual(targets, ["lab"], "a experiência continua durante uma falha curta");
  await poll(2);   // 10 s: o servidor já deu o projetor por perdido
  assert.deepEqual(targets, ["lab", "idle"]);
  online = true;
  await poll(1);
  assert.deepEqual(targets, ["lab", "idle", "lab"], "volta sozinha quando o servidor responde");
});
