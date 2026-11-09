import { createServer as http } from "node:http";
import { createServer as https } from "node:https";
import { createReadStream, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPERIENCES } from "./catalog.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const host = process.env.PALCO_HOST || "127.0.0.1";
const port = Number(process.env.PALCO_PORT || process.env.PORT || 8777);
const password = process.env.PALCO_PASSWORD;
const tlsKey = process.env.PALCO_TLS_KEY;
const tlsCert = process.env.PALCO_TLS_CERT;
const directTLS = Boolean(tlsKey && tlsCert);
const publicOrigin = process.env.PALCO_PUBLIC_ORIGIN ? new URL(process.env.PALCO_PUBLIC_ORIGIN) : null;
const secure = directTLS || Boolean(publicOrigin);
const roomPattern = /^[a-zA-Z0-9_-]{1,40}$/;
const localHosts = ["127.0.0.1", "::1", "localhost"];
if (!password || password.length < 12 || password.length > 256) throw new Error("Define PALCO_PASSWORD com 12 a 256 caracteres.");
if (publicOrigin && (publicOrigin.protocol !== "https:" || publicOrigin.username || publicOrigin.password ||
    publicOrigin.pathname !== "/" || publicOrigin.search || publicOrigin.hash)) {
  throw new Error("PALCO_PUBLIC_ORIGIN tem de ser uma origem HTTPS sem caminho.");
}
if (Boolean(tlsKey) !== Boolean(tlsCert) || (directTLS && publicOrigin) || (!secure && !localHosts.includes(host))) {
  throw new Error("Para ouvir na rede, configura TLS no servidor ou indica a origem HTTPS do proxy.");
}
const ids = (process.env.PALCO_ROOMS || "default").split(",").map(id => id.trim());
if (ids.some(id => !roomPattern.test(id))) throw new Error("PALCO_ROOMS contém um nome de sala inválido.");
const stateFile = resolve(process.env.PALCO_DATA || join(root, ".palco", "config.json"));
const apps = new Map(EXPERIENCES.map(app => [app.id, app]));
const staticFiles = new Set(["display.html", "index.html", "magicdraw.html", "warp.js", ...EXPERIENCES.map(app => app.file)]);
const token = () => randomBytes(24).toString("hex");
const rooms = new Map(ids.map(id => [id, {
  id, mode: "gallery", enabled: false, blackout: false, client: null, generation: null, seen: 0, seekSeq: 0,
  session: null, ar: null, camera: "unknown", arKey: token(), arSince: 0, calibration: new Map(), stateStreams: new Set(), events: new Set(),
}]));
const operators = new Map(), displays = new Map(), loginAttempts = new Map();
const salt = randomBytes(16);
const passwordHash = scryptSync(password, salt, 64);
let config = Object.create(null);
try { config = JSON.parse(readFileSync(stateFile, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }

const displayWindow = 8000, launchWindow = 22000, sessionWindow = 180000;
const operatorWindow = 8 * 60 * 60 * 1000;
const displayWindowCookie = 24 * 60 * 60 * 1000;
const eventLimit = 24;
const loadStates = ["ready", "limited", "error"];
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wasm": "application/wasm",
};
const localVision = existsSync(join(root, "installation/vendor/.ready"));
const localAssets = [
  ["https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs", "vision_bundle.mjs"],
  ["https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm", "wasm"],
  ["https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", "hand_landmarker.task"],
  ["https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite", "blaze_face_short_range.tflite"],
  ["https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite", "selfie_multiclass_256x256.tflite"],
  ["https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "three.module.js"],
];

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
const fail = (res, code, error) => json(res, code, { error });

async function body(req, limit = 128_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.resume();
      throw Object.assign(new Error("Pedido demasiado grande."), { status: 413 });
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw Object.assign(new Error("Pedido inválido."), { status: 400 }); }
}

function cookie(req, name) {
  return req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(name + "="))?.slice(name.length + 1);
}
function sessionCookie(res, name, value, seconds) {
  res.setHeader("Set-Cookie", `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? "; Secure" : ""}`);
}
const isOperator = req => (operators.get(cookie(req, "palco_operator")) || 0) > Date.now();
function isDisplay(req, room) {
  const credential = displays.get(cookie(req, "palco_display_" + room.id));
  return credential?.room === room.id && credential.expires > Date.now();
}
const online = room => Date.now() - room.seen < displayWindow;
function snapshot(room) {
  return {
    room: room.id, mode: room.mode, enabled: room.enabled, blackout: room.blackout,
    display: online(room) ? "online" : "offline", ar: room.ar, session: room.session, camera: room.camera,
  };
}
function sse(res, data, event) {
  if (!res.write((event ? "event: " + event + "\n" : "") + "data: " + JSON.stringify(data) + "\n\n")) res.end();
}
function publish(room) {
  const state = snapshot(room);
  for (const res of room.stateStreams) sse(res, state);
  for (const peer of room.events) if (peer.state) sse(peer.res, state, "state");
  return state;
}
function subscribe(res, peers, entry = res) {
  if (peers.size >= eventLimit) return fail(res, 429, "Demasiadas ligações nesta sala.");
  res.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no",
  });
  res.write(": ligado\n\n");
  peers.add(entry);
  res.on("close", () => peers.delete(entry));
  return true;
}
function resetAR(room) {
  room.ar = room.enabled && room.mode === "ar" && !room.blackout ? "loading" : null;
  room.arKey = token();
  room.arSince = Date.now();
  room.camera = "unknown";
}
function reset(room) {
  room.session = null;
  resetAR(room);
}
function open(room, app, operator = false) {
  const now = Date.now();
  room.camera = "unknown";
  room.ar = null;
  room.session = { id: token(), app, operator, status: "loading", startedAt: now, expiresAt: now + sessionWindow };
}
function target(room) {
  if (room.blackout) return { app: "blank", launch: room.arKey };
  if (room.session && room.session.status !== "error") return { app: room.session.app, launch: room.session.id };
  if (room.ar) return { app: "ar", launch: room.arKey };
  return { app: "idle", launch: room.arKey };
}
function validOrigin(req) {
  if (req.headers["sec-fetch-site"] && !["same-origin", "none"].includes(req.headers["sec-fetch-site"])) return false;
  const expected = publicOrigin?.origin ?? `${secure ? "https" : "http"}://${req.headers.host}`;
  return !req.headers.origin || req.headers.origin === expected;
}
function allowedHost(req) {
  if (publicOrigin) return req.headers.host === publicOrigin.host;
  try {
    const value = new URL("http://" + req.headers.host).hostname;
    return secure || localHosts.includes(value.replace(/^\[|\]$/g, ""));
  } catch { return false; }
}
function loginAddress(req) {
  const forwarded = publicOrigin && req.headers["x-forwarded-for"]?.split(",").at(-1)?.trim();
  return forwarded && isIP(forwarded) ? forwarded : req.socket.remoteAddress;
}
function configId(room, id) {
  return typeof id === "string" &&
    (id === "default" || id === "buildings-index" || /^building:[a-z0-9_-]{1,55}$/i.test(id) ||
    ["mapping-keystone", "magicdraw-zones", "magicdraw-warp", "magicdraw-refimg"].some(name => id === name || id === name + ":" + room.id));
}
function saveConfig(room, id, row) {
  const next = { ...config, [room.id]: { ...(Object.hasOwn(config, room.id) ? config[room.id] : {}) } };
  if (row) next[room.id][id] = row;
  else delete next[room.id][id];
  mkdirSync(dirname(stateFile), { recursive: true, mode: 0o700 });
  writeFileSync(stateFile + ".tmp", JSON.stringify(next), { mode: 0o600 });
  renameSync(stateFile + ".tmp", stateFile);
  config = next;
}
const operatorKinds = new Set(["zones", "warp", "keystone", "campreview", "chrome", "scene", "labEffect", "labDensity", "labClear", "scrubPlay", "scrubMode"]);
const visitorKinds = new Set(["state", "tstroke", "undo", "redo", "clear", "fill"]);
const peerKinds = new Set(["hello", "status", "dstate"]);
function canSend(room, topic, payload, operator, display, session) {
  if (!["magicdraw", "mapping", "mapping-zones"].some(prefix => topic === prefix + ":" + room.id)) return false;
  if (!payload || payload.v !== 1 || typeof payload.src !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(payload.src) ||
      !Number.isSafeInteger(payload.seq) || payload.seq < 0) return false;
  if (peerKinds.has(payload.kind)) return operator || display || (payload.kind === "hello" && topic.startsWith("magicdraw:"));
  if (operatorKinds.has(payload.kind)) return operator;
  return topic.startsWith("magicdraw:") && visitorKinds.has(payload.kind) && room.session?.app === "magicdraw" &&
    session === room.session.id && (!room.session.operator || operator) && !room.blackout && ["ready", "limited"].includes(room.session.status);
}

async function api(req, res, url) {
  const configPath = /^\/api\/config\/([\w-]+)\/rest\/v1\/hand_config$/.exec(url.pathname);
  const room = rooms.get(configPath?.[1] || url.searchParams.get("room") || "default");
  if (!room) return fail(res, 404, "Sala desconhecida.");
  const operator = isOperator(req), display = isDisplay(req, room);
  if (configPath) {
    if (req.method === "GET") {
      const id = url.searchParams.get("id")?.slice(3);
      if (id?.startsWith("building") && !operator) return fail(res, 403, "Inicia sessão como operador.");
      if (!configId(room, id)) return fail(res, 400, "Configuração inválida.");
      if (id === "buildings-index") {
        const records = Object.hasOwn(config, room.id) ? config[room.id] : {};
        const list = Object.entries(records)
          .filter(([key, row]) => key.startsWith("building:") && typeof row.data?.name === "string")
          .map(([id, row]) => ({ id, name: row.data.name }));
        return json(res, 200, [{ data: { list } }]);
      }
      const row = Object.hasOwn(config, room.id) && Object.hasOwn(config[room.id], id) ? config[room.id][id] : null;
      return json(res, 200, row ? [row] : []);
    }
    if (!operator) return fail(res, 403, "Inicia sessão como operador.");
    if (req.method === "DELETE") {
      const id = url.searchParams.get("id")?.slice(3);
      if (!configId(room, id)) return fail(res, 400, "Configuração inválida.");
      saveConfig(room, id);
      return json(res, 200, []);
    }
    if (req.method === "POST") {
      const rows = await body(req, 2_000_000);
      const row = rows?.[0];
      if (!Array.isArray(rows) || rows.length !== 1 || !configId(room, row?.id) || !row.data || typeof row.data !== "object") {
        return fail(res, 400, "Configuração inválida.");
      }
      if (row.id === "buildings-index") return fail(res, 400, "A lista é gerada a partir dos edifícios guardados.");
      saveConfig(room, row.id, { data: row.data, updated_at: new Date().toISOString() });
      return json(res, 200, []);
    }
  }
  if (req.method === "GET") {
    switch (url.pathname) {
      case "/api/state":
        if (!req.headers.accept?.includes("text/event-stream")) return json(res, 200, snapshot(room));
        if (subscribe(res, room.stateStreams) === true) sse(res, snapshot(room));
        return;
      case "/api/events": {
        const state = url.searchParams.has("state");
        if (subscribe(res, room.events, { res, req, state, calibration: url.searchParams.has("calibrate") }) === true && state) {
          sse(res, snapshot(room), "state");
        }
        return;
      }
      case "/api/operator":
        return json(res, 200, { authenticated: operator });
    }
  }
  if (req.method !== "POST") return fail(res, 404, "Pedido desconhecido.");
  if (url.pathname === "/api/login") {
    const input = await body(req, 1024);
    const address = loginAddress(req);
    const tries = loginAttempts.get(address);
    if (tries?.until > Date.now() && tries.count >= 6) return fail(res, 429, "Demasiadas tentativas. Volta a tentar dentro de um minuto.");
    if (typeof input?.password !== "string" || input.password.length > 256 ||
        !timingSafeEqual(scryptSync(input.password, salt, 64), passwordHash)) {
      loginAttempts.set(address, tries?.until > Date.now() ? { ...tries, count: tries.count + 1 } : { count: 1, until: Date.now() + 60_000 });
      return fail(res, 401, "Password incorreta.");
    }
    loginAttempts.delete(address);
    operators.delete(cookie(req, "palco_operator"));
    const id = token();
    operators.set(id, Date.now() + operatorWindow);
    sessionCookie(res, "palco_operator", id, operatorWindow / 1000);
    return json(res, 200, { authenticated: true });
  }
  if (url.pathname === "/api/logout") {
    operators.delete(cookie(req, "palco_operator"));
    sessionCookie(res, "palco_operator", "", 0);
    return json(res, 200, { authenticated: false });
  }
  if (url.pathname === "/api/operator" && !operator) return fail(res, 403, "Inicia sessão como operador.");
  if (url.pathname === "/api/display" && !display) return fail(res, 403, "Emparelha o projetor na Área da equipa.");
  const input = await body(req);
  if (!input || typeof input !== "object") return fail(res, 400, "Pedido inválido.");
  switch (url.pathname) {
    case "/api/visitor":
      if (input.action === "open") {
        if (input.via === "ar" && (!display || target(room).app !== "ar" || input.launch !== room.arKey)) {
          return fail(res, 409, "A escolha no espelho já terminou.");
        }
        if (!apps.has(input.app)) return fail(res, 400, "Experiência desconhecida.");
        if (!room.enabled || room.blackout) return fail(res, 409, "A sala ainda não está aberta.");
        if (!online(room)) return fail(res, 503, "O projetor está sem ligação.");
        if (room.session && room.session.status !== "error") return fail(res, 409, "Já está uma sessão em curso.");
        open(room, input.app);
      } else if (input.action === "seek" && room.enabled && online(room) && room.session?.id === input.id && !room.session?.operator &&
          room.session?.app === "scrub" && ["ready", "limited"].includes(room.session.status) &&
          Number.isFinite(input.position) && input.position >= 0 && input.position <= 1) {
        for (const peer of room.events) if (isDisplay(peer.req, room)) sse(peer.res, {
          topic: "mapping:" + room.id,
          payload: { v: 1, src: "touch-seek", seq: ++room.seekSeq, kind: "scrubSeek", position: input.position, launch: room.session.id },
        });
        return json(res, 200, snapshot(room));
      } else if (input.action === "end" && room.enabled && room.session && room.session.id === input.id && !room.session.operator) {
        reset(room);
      } else return fail(res, 409, "Esta sessão já terminou.");
      return json(res, 200, publish(room));
    case "/api/operator":
      if (input.action === "mode" && ["gallery", "ar"].includes(input.mode)) {
        if (room.mode !== input.mode) { room.mode = input.mode; reset(room); }
      } else if (input.action === "enabled" && typeof input.enabled === "boolean") {
        if (room.enabled !== input.enabled) { room.enabled = input.enabled; reset(room); }
      } else if (input.action === "blackout" && typeof input.on === "boolean") {
        if (room.blackout !== input.on) { room.blackout = input.on; reset(room); }
      } else if (input.action === "reset") reset(room);
      else if (input.action === "restart" && room.session && !room.blackout) open(room, room.session.app, room.session.operator);
      else if (input.action === "open" && apps.has(input.app) && !room.blackout && online(room)) open(room, input.app, true);
      else return fail(res, 409, "A ação não está disponível neste estado.");
      return json(res, 200, publish(room));
    case "/api/display": {
      if (![input.client, input.generation].every(id => typeof id === "string" && /^[a-f0-9-]{16,64}$/.test(id))) return fail(res, 400, "Identificador inválido.");
      if (online(room) && room.client !== input.client) return fail(res, 409, "Já existe um projetor ativo nesta sala.");
      const wasOnline = online(room);
      const reloaded = wasOnline && room.generation !== input.generation;
      room.client = input.client;
      room.generation = input.generation;
      room.seen = Date.now();
      let changed = !wasOnline || reloaded;
      if (reloaded) {
        room.camera = "unknown";
        if (room.session && room.session.status !== "error") {
          room.session.status = "loading";
          room.session.startedAt = Date.now();
          delete room.session.reason;
        } else if (room.ar) resetAR(room);
      }
      if (input.launch === target(room).launch && loadStates.includes(input.state)) {
        const session = room.session && room.session.id === input.launch ? room.session : null;
        const previous = session?.status ?? room.ar;
        if (previous && previous !== input.state && (!session || previous !== "error")) {
          if (session) {
            session.status = input.state;
            session.reason = typeof input.reason === "string" ? input.reason.slice(0, 160) : undefined;
            if (input.state === "error" && room.mode === "ar") resetAR(room);
          } else room.ar = input.state;
          room.camera = input.state === "ready" ? "ready" : "unavailable";
          changed = true;
        }
      }
      if (changed) publish(room);
      return json(res, 200, { ...target(room), state: snapshot(room) });
    }
    case "/api/channel": {
      const messages = input.messages ?? [input];
      if (!Array.isArray(messages) || messages.length < 1 || messages.length > 64) return fail(res, 400, "Lote de comandos inválido.");
      let delivered = 0;
      for (const entry of messages) {
        if (!entry || typeof entry !== "object") continue;
        const { topic, payload: inputPayload } = entry;
        if (!canSend(room, topic, inputPayload, operator, display, input.session)) continue;
        const payload = operator ? inputPayload : { ...inputPayload, src: (display ? "display:" : "visitor:") + inputPayload.src };
        if (payload.kind === "zones" || payload.kind === "warp") {
          const key = topic + "/" + payload.kind;
          if (payload.editing || payload.testPattern || payload.imageTest) room.calibration.set(key, { topic, payload });
          else room.calibration.delete(key);
        }
        for (const peer of room.events) {
          if ((topic.startsWith("magicdraw:") && !operatorKinds.has(payload.kind)) || isOperator(peer.req) || isDisplay(peer.req, room)) sse(peer.res, { topic, payload });
        }
        delivered++;
      }
      if (!delivered) return fail(res, 403, "Comando sem autorização.");
      return json(res, 200, {});
    }
    default:
      return fail(res, 404, "Pedido desconhecido.");
  }
}

function serveFile(req, res, url) {
  const path = url.pathname === "/" ? "installation/kiosk.html" : url.pathname.slice(1);
  if (!staticFiles.has(path) && !/^(?:media\/[a-z-]+\.(?:mp4|mp3|jpg|webp)|installation\/(?:[a-z-]+\.(?:html|css|js|mjs)|art\/[a-z-]+\.(?:jpg|svg)|vendor\/(?:[a-z0-9_]+\.(?:task|tflite)|[a-z_.]+\.(?:mjs|js)|wasm\/[a-z_]+\.(?:js|wasm))))$/.test(path)) {
    return fail(res, 404, "Ficheiro desconhecido.");
  }
  if (path === "installation/server.mjs") return fail(res, 404, "Ficheiro desconhecido.");
  const room = rooms.get(url.searchParams.get("room") || "default");
  const advanced = path === "index.html" || path === "installation/manual.html" ||
    (path === "magicdraw.html" && url.searchParams.get("calibrate") === "1");
  if (advanced && !isOperator(req)) {
    res.writeHead(303, { Location: "/installation/admin.html" + url.search });
    return res.end();
  }
  if (path === "display.html") {
    if (!room) return fail(res, 404, "Sala desconhecida.");
    if (!isDisplay(req, room)) {
      if (!isOperator(req)) {
        res.writeHead(303, { Location: "/installation/admin.html" + url.search });
        return res.end();
      }
      const id = token();
      displays.set(id, { room: room.id, expires: Date.now() + displayWindowCookie });
      sessionCookie(res, "palco_display_" + room.id, id, displayWindowCookie / 1000);
    }
  }
  const file = join(root, path);
  let stat;
  try { stat = statSync(file); } catch { return fail(res, 404, "Ficheiro desconhecido."); }
  if (!stat.isFile()) return fail(res, 404, "Ficheiro desconhecido.");
  const headers = { "Content-Type": contentTypes[extname(file)] || "application/octet-stream" };
  if (staticFiles.has(path) && path.endsWith(".html")) {
    let html = readFileSync(file, "utf8").replace(/<head>/i,
      '<head>\n<script src="/installation/runtime.js"' + (localVision ? ' data-local-vision="true"' : '') + '></script>');
    if (localVision) for (const [url, name] of localAssets) html = html.replaceAll(url, "/installation/vendor/" + name);
    res.writeHead(200, { ...headers, "Cache-Control": "no-store" });
    return res.end(req.method === "HEAD" ? "" : html);
  }
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(stat.size - 1, Number(range[2])) : stat.size - 1;
  if (range && start > end) {
    res.writeHead(416, { "Content-Range": "bytes */" + stat.size });
    return res.end();
  }
  headers["Accept-Ranges"] = "bytes";
  headers["Content-Length"] = end - start + 1;
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === "HEAD" || !stat.size) return res.end();
  const stream = createReadStream(file, { start, end });
  res.on("close", () => stream.destroy());
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (req.url === "/healthz" && (req.method === "GET" || req.method === "HEAD")) {
    return json(res, 200, { status: "ok" });
  }
  if (!allowedHost(req)) return fail(res, 400, "Endereço da instalação inválido.");
  try {
    const url = new URL(req.url, "http://palco.local");
    if (url.pathname.startsWith("/api/")) {
      if (!validOrigin(req)) return fail(res, 403, "Origem inválida.");
      return await api(req, res, url);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "Método inválido.");
    serveFile(req, res, url);
  } catch (error) {
    if (!res.headersSent) fail(res, error.status || 500, error.status ? error.message : "Erro na instalação.");
    else res.end();
    if (!error.status) console.error(error);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    let changed = false;
    if (room.seen && !online(room)) {
      room.seen = 0;
      room.client = room.generation = null;
      reset(room);
      changed = true;
    }
    if (room.ar === "loading" && now - room.arSince >= launchWindow) { room.ar = "error"; changed = true; }
    if (room.session?.expiresAt <= now) { reset(room); changed = true; }
    if (room.session?.status === "loading" && now - room.session.startedAt >= launchWindow) {
      room.session.status = "error";
      room.session.reason = "A experiência não respondeu a tempo.";
      if (room.mode === "ar") resetAR(room);
      changed = true;
    }
    if (room.calibration.size && ![...room.events].some(peer => peer.calibration && isOperator(peer.req))) {
      for (const { topic, payload } of room.calibration.values()) {
        const safe = { ...payload, src: token().slice(0, 24), seq: 0, editing: false, testPattern: false, imageTest: false };
        for (const peer of room.events) if (isDisplay(peer.req, room)) sse(peer.res, { topic, payload: safe });
      }
      room.calibration.clear();
    }
    if (changed) publish(room);
    for (const res of room.stateStreams) res.write(": ativo\n\n");
    for (const { res } of room.events) res.write(": ativo\n\n");
  }
  for (const [id, expiry] of operators) if (expiry <= now) operators.delete(id);
  for (const [id, display] of displays) if (display.expires <= now) displays.delete(id);
  for (const [id, tries] of loginAttempts) if (tries.until <= now) loginAttempts.delete(id);
}, 1000).unref();

const server = directTLS ? https({ key: readFileSync(tlsKey), cert: readFileSync(tlsCert) }, handler) : http(handler);
server.listen(port, host, () => console.log(`Palco de Luz em ${publicOrigin?.origin ?? `${directTLS ? "https" : "http"}://${host}:${server.address().port}`}`));
