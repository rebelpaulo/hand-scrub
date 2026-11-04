import { EXPERIENCES } from "./catalog.mjs";
import { request, roomURL, room } from "./client.mjs";

export function connectStage({ frame, selectTarget, showMessage, showCue }) {
  const key = "palco-display:" + room;
  const client = sessionStorage.getItem(key) || crypto.randomUUID();
  sessionStorage.setItem(key, client);
  const generation = crypto.randomUUID();
  let launch, app, busy = false, changed = false, feedback, consecutiveFailures = 0;
  let selecting = false, cueState;
  const fullscreen = document.getElementById("stage-fullscreen");
  fullscreen.hidden = false;
  fullscreen.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { fullscreen.textContent = "Ecrã inteiro indisponível"; }
  });
  document.addEventListener("fullscreenchange", () => { fullscreen.hidden = Boolean(document.fullscreenElement); });

  async function sync() {
    if (busy) { changed = true; return; }
    busy = true;
    try {
      const sent = feedback;
      const next = await request("display", { client, generation, ...sent });
      if (feedback === sent) feedback = undefined;
      consecutiveFailures = 0;
      if (next.launch !== launch || next.app !== app) {
        launch = next.launch;
        app = next.app;
        cueState = undefined;
        selectTarget(app, launch);
      }
      const session = next.state.session;
      if (session?.id === launch && session.status !== cueState) {
        cueState = session.status;
        if (cueState === "ready") showCue(EXPERIENCES.find(item => item.id === app)?.ready || "");
        if (cueState === "limited") showCue(session.reason || "Usa o touchscreen.");
      }
      if (app === "idle") {
        if (next.state.session?.status === "error") showMessage("A experiência não arrancou. Escolhe de novo no touchscreen.");
        else showMessage(next.state.enabled ? "Escolhe uma experiência no touchscreen." : "A equipa está a preparar a sala.");
      }
    } catch (error) {
      if (++consecutiveFailures >= 2 || error.status === 403 || error.status === 409) {
        launch = app = undefined;
        selectTarget("idle");
        showMessage(error.message);
      }
    } finally {
      busy = false;
      if (changed) { changed = false; sync(); }
    }
  }

  async function select(event) {
    selecting = true;
    try {
      await request("visitor", { action: "open", app: event.app, via: "ar", launch: event.launch });
      sync();
    } catch {
      frame.contentWindow?.postMessage({ mapping: 1, cmd: "selectionRejected", launch: event.launch }, location.origin);
    } finally {
      selecting = false;
    }
  }

  window.addEventListener("message", event => {
    const data = event.data;
    if (event.origin !== location.origin || event.source !== frame.contentWindow ||
        data?.mapping !== 1 || !launch || data.launch !== launch) return;
    if (data.evt === "availability" && ["ready", "limited", "error"].includes(data.state)) {
      feedback = { launch, state: data.state, reason: data.reason };
      sync();
    } else if (data.evt === "select" && app === "ar" && !selecting) select(data);
  });

  const interval = setInterval(sync, 1250);
  window.addEventListener("pagehide", () => { clearInterval(interval); }, { once: true });
  sync();
}

export function stageURL(file, launch) {
  const url = new URL(roomURL("/" + file), location.origin);
  url.searchParams.set("launch", launch);
  if (window.Palco?.localVision) url.searchParams.set("vision", "local");
  return url.pathname + url.search;
}
