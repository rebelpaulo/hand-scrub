// Gera as miniaturas dos efeitos do Draw Physics com o próprio motor:
//
//   node installation/art/drawphysics/make.mjs
//
// e abre o endereço que ele imprime num browser com WebGL2. Cada efeito é
// desenhado com o mesmo traço e fica em <id>.webp nesta pasta; o script
// fecha-se no fim. Com ?only=<id> refaz só um.

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "../../..");

const PAGE = `<!doctype html><meta charset="utf-8"><title>Miniaturas</title>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui">
<canvas id="c" style="display:block;width:640px;height:400px"></canvas><p id="log">A gerar…</p>
<script type="module">
import { EFFECTS } from "/installation/drawphysics-effects.mjs";
import { createEngine } from "/installation/drawphysics-engine.mjs";
const canvas = document.getElementById("c"), E = createEngine(canvas, { size: 1.5 });   // traço grosso: lê-se melhor em pequeno
const small = Object.assign(document.createElement("canvas"), { width: 320, height: 200 });
const only = new URLSearchParams(location.search).get("only");
let now = performance.now(), done = 0;
for (const fx of EFFECTS) {
  if (only && only !== fx.id) continue;
  E.setEffect(fx.id); E.clearAll();
  const { W, H } = E.S;
  // primeiro sozinho (neve e chuva enchem o ecrã), depois uma onda da esquerda
  // para a direita; a fotografia é tirada com o dedo ainda em baixo
  for (let i = -90; i <= 56; i++) {
    const t = i / 56, x = W * (.14 + .72 * t), y = H * (.52 + .24 * Math.sin(t * 6.3));
    if (!i) E.fingerDown("t", x, y); else if (i > 0) E.fingerMove("t", x, y);
    E.frame(now += 1000 / 60);
  }
  small.getContext("2d").drawImage(canvas, 0, 0, 320, 200);
  E.fingerUp("t");
  const blob = await new Promise(r => small.toBlob(r, "image/webp", .82));
  await fetch("/thumb/" + fx.id, { method: "PUT", body: blob });
  document.getElementById("log").textContent = ++done + " · " + fx.id;
}
await fetch("/done", { method: "POST" });
document.getElementById("log").textContent = "Feito: " + done + " miniaturas.";
</script>`;

createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  try {
    if (req.method === "PUT" && /^\/thumb\/[a-z-]+$/.test(path)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      await writeFile(join(here, path.slice(7) + ".webp"), Buffer.concat(chunks));
      return res.end();
    }
    if (path === "/done") { res.end(); return setTimeout(() => process.exit(), 100); }
    if (path === "/") return res.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
    if (!/^\/installation\/[a-z-]+\.mjs$/.test(path)) throw 0;
    res.writeHead(200, { "Content-Type": "text/javascript" }).end(await readFile(join(root, path)));
  } catch { res.writeHead(404).end(); }
}).listen(8797, "127.0.0.1", () => console.log("Abre http://127.0.0.1:8797/ num browser com WebGL2"));
