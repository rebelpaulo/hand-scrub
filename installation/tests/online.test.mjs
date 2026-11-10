import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

test("queued drawing points share a request and keep their order", async () => {
  const calls = [];
  const runtime = await readFile(new URL("../runtime.js", import.meta.url), "utf8");
  const window = { addEventListener() {} };
  window.parent = window;
  runInNewContext(runtime, {
    window, location: { search: "?session=current" }, document: {},
    URLSearchParams, TextEncoder, AbortSignal,
    EventSource: class { addEventListener() {} },
    fetch(url, options) {
      return new Promise(resolve => calls.push({ url, ...JSON.parse(options.body), resolve }));
    },
  });
  const channel = window.Palco.channel("magicdraw:default");
  for (let seq = 1; seq <= 30; seq++) channel.postMessage({ v: 1, src: "tablet", kind: "tstroke", seq });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].messages.map(({ payload }) => payload.seq), [1]);
  calls[0].resolve();
  await new Promise(setImmediate);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].session, "current");
  assert.deepEqual(calls[1].messages.map(({ payload }) => payload.seq), Array.from({ length: 29 }, (_, i) => i + 2));
  calls[1].resolve();
});

test("online server serves offline model and isolates public and operator event identities", { timeout: 9000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "palco-online-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "installation");
  const vendor = join(dir, "vendor");
  await mkdir(vendor, { recursive: true });
  for (const file of ["server.mjs", "catalog.mjs"]) await copyFile(new URL("../" + file, import.meta.url), join(dir, file));
  await writeFile(join(vendor, ".ready"), "");
  const model = "selfie_multiclass_256x256.tflite";
  await writeFile(join(vendor, model), "model fixture");
  const thumbs = join(dir, "art", "drawphysics");
  await mkdir(thumbs, { recursive: true });
  for (const file of ["fumo-colorido.webp", "make.mjs"]) await writeFile(join(thumbs, file), "thumb fixture");

  const password = "test-operator-password";
  const child = spawn(process.execPath, [join(dir, "server.mjs")], {
    env: { ...process.env, PALCO_PASSWORD: password, PALCO_HOST: "127.0.0.1", PALCO_PORT: "0",
      PALCO_DATA: join(root, "config.json"), PALCO_ROOMS: "default", PALCO_PUBLIC_ORIGIN: "",
      PALCO_TLS_KEY: "", PALCO_TLS_CERT: "" },
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exit = once(child, "exit");
    child.kill();
    await exit;
  });
  const [started] = await Promise.race([once(child.stdout, "data"), once(child.stderr, "data")]);
  const origin = String(started).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert.ok(origin, String(started));
  const asset = await fetch(origin + "/installation/vendor/" + model);
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "model fixture");
  // miniaturas do Draw Physics: só os .webp da pasta, não o script que as gera
  const thumb = await fetch(origin + "/installation/art/drawphysics/fumo-colorido.webp");
  assert.equal(thumb.status, 200);
  assert.equal(thumb.headers.get("content-type"), "image/webp");
  await thumb.arrayBuffer();
  const script = await fetch(origin + "/installation/art/drawphysics/make.mjs");
  assert.equal(script.status, 404);
  await script.arrayBuffer();

  const post = (path, body, cookie) => fetch(origin + "/api/" + path, {
    method: "POST", body: JSON.stringify(body), headers: cookie ? { cookie } : {},
  });
  const login = await post("login", { password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  await login.text();
  const controller = new AbortController();
  t.after(() => controller.abort());
  const events = await fetch(origin + "/api/events", { headers: { cookie }, signal: controller.signal });
  const reader = events.body.pipeThrough(new TextDecoderStream()).getReader();
  const command = (seq, kind) => ({ topic: "magicdraw:default", payload: { v: 1, src: "panel", seq, kind } });
  assert.equal((await post("channel", command(Number.MAX_SAFE_INTEGER, "hello"))).status, 200);
  assert.equal((await post("channel", { messages: [command(1, "zones"), command(2, "warp")] }, cookie)).status, 200);
  const received = [];
  let pending = "";
  while (received.length < 3) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    pending += value;
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) if (line.startsWith("data: ")) received.push(JSON.parse(line.slice(6)).payload);
  }
  assert.deepEqual(received.map(({ src, seq }) => [src, seq]), [
    ["visitor:panel", Number.MAX_SAFE_INTEGER], ["panel", 1], ["panel", 2],
  ]);
  await reader.cancel();
});
