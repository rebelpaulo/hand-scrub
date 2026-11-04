import { room, roomURL, request, watchState } from "./client.mjs";

const byId = id => document.getElementById(id);
const login = byId("login-panel");
const operations = byId("operations");
const password = byId("password");
const loginButton = byId("login-button");
const logout = byId("logout");
const kioskLink = byId("kiosk-link");
const galleryMode = byId("mode-gallery");
const arMode = byId("mode-ar");
const publicToggle = byId("toggle-public");
const blackout = byId("blackout");
const restart = byId("restart");
const reset = byId("reset");
const calibrationPreview = byId("calibration-preview");
const roomActions = [...document.querySelectorAll("[data-room-action]")];

let state;
let stateVersion = 0;
let busy = false;
let connected = false;
let stopWatching;

byId("room-label").textContent = room === "default" ? "Sala principal" : `Sala · ${room}`;
byId("projector-link").href = roomURL("/display.html");
byId("projector-address").value = byId("projector-link").href;
byId("controls-link").href = roomURL("/index.html?operator=1");
byId("calibrate-link").href = roomURL("/magicdraw.html?calibrate=1");

function put(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function feedback(id, message = "") {
  const target = byId(id);
  put(target, message);
  target.hidden = !message;
}

function showStatus(id, message, tone = "pending") {
  const target = byId(id);
  put(target, message);
  target.dataset.tone = tone;
}

function render() {
  const active = Boolean(state?.session);
  for (const button of roomActions) button.disabled = busy || !connected || !state;
  loginButton.disabled = busy;
  logout.disabled = busy;
  kioskLink.disabled = busy;
  const canControl = connected && state && !busy;
  restart.disabled = !canControl || !active || state.display !== "online" || state.blackout;
  reset.disabled = !canControl || !active;
  calibrationPreview.disabled = !canControl || state.enabled || state.blackout || active || state.display !== "online";
  galleryMode.disabled = !canControl || active;
  arMode.disabled = !canControl || active;
  if (!state || !connected) {
    showStatus("room-status", state ? "Ligação perdida. A tentar recuperar…" : "A consultar estado da sala…", state ? "attention" : "pending");
    for (const id of ["display-health", "camera-health", "ar-health"]) showStatus(id, "Por confirmar");
    return;
  }
  const isAr = state.mode === "ar";
  const displayOnline = state.display === "online";
  const arLabels = { loading: "A preparar", ready: "Pronto", limited: "Modo limitado", error: "Indisponível" };
  const cameraLabels = { ready: "Disponível", unavailable: "Indisponível", unknown: "Por confirmar" };
  const sessionLabels = { loading: "a preparar", ready: "pronta", limited: "em modo limitado", error: "com erro" };
  let summary = state.enabled ? "Sala aberta ao público" : "Sala em preparação";
  if (state.blackout) summary += " · Projeção apagada";
  if (state.session) summary += ` · Experiência ${sessionLabels[state.session.status]}`;
  const roomAttention = state.blackout || !displayOnline || ["limited", "error"].includes(state.session?.status);
  const roomReady = state.enabled && state.session?.status !== "loading";
  const camera = displayOnline ? state.camera : "unknown";
  const ar = displayOnline && isAr ? state.ar : null;
  showStatus("room-status", summary, roomAttention ? "attention" : roomReady ? "ready" : "pending");
  showStatus("display-health", displayOnline ? "Ligado" : "Sem ligação", displayOnline ? "ready" : "attention");
  showStatus("camera-health", cameraLabels[camera], camera === "ready" ? "ready" : camera === "unavailable" ? "attention" : "pending");
  showStatus("ar-health", arLabels[ar] || "Em espera", ar === "ready" ? "ready" : ["limited", "error"].includes(ar) ? "attention" : "pending");
  galleryMode.setAttribute("aria-pressed", String(!isAr));
  arMode.setAttribute("aria-pressed", String(isAr));
  put(byId("mode-description"), isAr
    ? "Em repouso, a projeção mostra a câmara com cartões à volta do corpo. A seleção tátil continua disponível."
    : "A projeção fica em espera e os visitantes escolhem a experiência no touchscreen.");
  put(publicToggle, state.enabled ? "Fechar ao público" : "Abrir ao público");
  put(blackout, state.blackout ? "Retomar projeção" : "Apagar projeção");
}

function showState(next) {
  stateVersion++;
  state = next;
  connected = true;
  render();
}

function showLogin(message = "") {
  stopWatching?.();
  stopWatching = null;
  state = null;
  connected = false;
  login.hidden = false;
  operations.hidden = true;
  feedback("login-error", message);
}

function showOperations(moveFocus) {
  login.hidden = true;
  operations.hidden = false;
  feedback("operation-error");
  stopWatching?.();
  stopWatching = watchState(showState, () => {
    connected = false;
    render();
  });
  if (moveFocus) byId("operations-title").focus();
  render();
}

async function operate(body) {
  if (busy || !connected || !state) return;
  const version = stateVersion;
  busy = true;
  feedback("operation-error");
  render();
  try {
    const next = await request("operator", body);
    if (version === stateVersion) showState(next);
  } catch (failure) {
    if (failure.status === 401 || failure.status === 403) {
      showLogin("A sessão de operador terminou. Volta a entrar.");
      password.focus();
    } else {
      feedback("operation-error", "Não foi possível aplicar a alteração. Confirma o estado do equipamento e tenta novamente.");
    }
  } finally {
    busy = false;
    render();
  }
}

byId("login").addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  feedback("login-error");
  busy = true;
  render();
  try {
    await request("login", { password: password.value });
    password.value = "";
    showOperations(true);
  } catch (failure) {
    const messages = {
      401: "Password incorreta.",
      403: "Password incorreta.",
      429: "Houve várias tentativas. Aguarda um momento e volta a tentar.",
      503: "A password de operador ainda não foi configurada nesta instalação."
    };
    feedback("login-error", messages[failure.status] || "Não foi possível ligar à instalação.");
    password.select();
  } finally {
    busy = false;
    render();
  }
});

async function signOut(returnToKiosk = false) {
  if (busy) return;
  busy = true;
  render();
  try {
    await request("logout", {});
    if (returnToKiosk) location.href = roomURL("/");
    else {
      showLogin();
      password.focus();
    }
  } catch {
    feedback(operations.hidden ? "login-error" : "operation-error", "Não foi possível terminar a sessão. Tenta novamente.");
  } finally {
    busy = false;
    render();
  }
}
logout.addEventListener("click", () => signOut());
kioskLink.addEventListener("click", () => signOut(true));
window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });

galleryMode.addEventListener("click", () => operate({ action: "mode", mode: "gallery" }));
arMode.addEventListener("click", () => operate({ action: "mode", mode: "ar" }));
publicToggle.addEventListener("click", () => operate({ action: "enabled", enabled: !state?.enabled }));
blackout.addEventListener("click", () => operate({ action: "blackout", on: !state?.blackout }));
restart.addEventListener("click", () => operate({ action: "restart" }));
reset.addEventListener("click", () => operate({ action: "reset" }));
calibrationPreview.addEventListener("click", () => operate({ action: "open", app: "magicdraw" }));

byId("copy-projector").addEventListener("click", async () => {
  const address = byId("projector-address");
  const status = byId("copy-status");
  try {
    await navigator.clipboard.writeText(address.value);
    put(status, "Endereço copiado.");
  } catch {
    address.focus();
    address.select();
    put(status, "Endereço selecionado para copiar.");
  }
});

request("operator").then(({ authenticated }) => {
  if (authenticated) showOperations(false);
}).catch(() => feedback("login-error", "Não foi possível ligar à instalação."));
