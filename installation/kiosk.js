import { EXPERIENCES } from "./catalog.mjs";
import { room, roomURL, request, watchState, explainIfStatic } from "./client.mjs";

const byId = id => document.getElementById(id);
const gallery = byId("gallery");
const dialog = byId("experience");
const start = byId("start");
const end = byId("end");
const back = byId("back");
const draw = byId("draw");
const error = byId("experience-error");
const byApp = new Map(EXPERIENCES.map(entry => [entry.id, entry]));

let state;
let stateVersion = 0;
let selected;
let busy = false;
let connected = false;

byId("room-label").textContent = room === "default" ? "Sala principal" : `Sala · ${room}`;
byId("operator-link").href = roomURL("/installation/admin.html");

function put(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function feedback(message = "") {
  put(error, message);
  error.hidden = !message;
}

function choose(entry) {
  if (selected?.id !== entry.id) {
    selected = entry;
    dialog.style.setProperty("--tile-color", entry.color);
    const showsGestures = entry.id === "elements" || entry.id === "electric";
    byId("experience-art").hidden = showsGestures;
    byId("gesture-lesson").hidden = !showsGestures;
    byId("experience-instruction").hidden = false;
    document.querySelector(".gesture-fire").hidden = entry.id !== "elements";
    document.querySelector(".gesture-electric").hidden = entry.id !== "electric";
    put(byId("experience-gesture"), entry.instruction);
    byId("preview").src = entry.image;
    put(byId("experience-name"), entry.name);
    put(byId("experience-title"), entry.title);
  }
  feedback();
  render();
  if (!dialog.open) {
    dialog.showModal();
    byId("experience-title").focus();
  }
}

const featuredId = "elements";
const galleryEntries = [...EXPERIENCES].sort((a, b) => Number(b.id === featuredId) - Number(a.id === featuredId));
byId("gallery-count").textContent = String(galleryEntries.length).padStart(2, "0") + " experiências";
for (const [index, entry] of galleryEntries.entries()) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = entry.id === featuredId ? "tile tile-featured" : "tile";
  tile.style.setProperty("--tile-color", entry.color);
  tile.setAttribute("aria-haspopup", "dialog");
  tile.innerHTML = `<span class="art"><img alt=""><span class="stamp" aria-hidden="true"></span><span class="mode"></span></span><span class="caption"><span><strong></strong><small></small></span><span class="arrow" aria-hidden="true">↗</span></span>`;
  tile.querySelector("img").src = entry.image;
  tile.querySelector(".stamp").textContent = entry.id === featuredId ? "Em destaque" : String(index + 1).padStart(2, "0");
  tile.querySelector(".mode").textContent = entry.mode;
  tile.querySelector("strong").textContent = entry.title;
  tile.querySelector("small").textContent = entry.name;
  tile.addEventListener("click", () => choose(entry));
  gallery.append(tile);
}

function unavailable() {
  if (!state || !connected) return "A aguardar ligação à instalação.";
  if (state.blackout) return "A projeção está pausada. Volta a tentar daqui a pouco.";
  if (!state.enabled) return "A equipa está a preparar a sala.";
  if (state.display !== "online") return "A projeção está sem ligação. Volta a tentar daqui a pouco.";
  return "";
}

function render() {
  const session = state?.session?.operator ? null : state?.session;
  const healthy = connected && state?.display === "online" && state.enabled && !state.blackout;
  const projectionStatus = byId("projection-status");
  const blocked = unavailable();
  let status = blocked.replace(/\..*$/, "") || "Projeção pronta";
  if (healthy && session) {
    const labels = { loading: "A preparar experiência", ready: "Sessão em curso", limited: "Sessão em modo limitado", error: "A experiência falhou" };
    status = labels[session.status];
  }
  projectionStatus.toggleAttribute("data-ready", healthy && session?.status !== "error");
  put(projectionStatus, status);
  put(byId("welcome"), healthy && state.mode === "ar" && state.ar === "ready"
    ? "Escolhe aqui ou usa a mão para rodar os cartões no espelho da projeção."
    : "Escolhe uma experiência e vê o que acontece na projeção.");
  byId("session-banner").hidden = !state?.enabled || !session || !byApp.has(session.app);
  if (session) put(byId("session-banner-text"), `${status} · ${byApp.get(session.app)?.name ?? "Palco de Luz"}`);

  if (!selected) return;
  const own = session?.app === selected.id ? session : null;
  const launchBlock = unavailable();
  const occupied = session && !own && session.status !== "error";
  const retry = own?.status === "error";
  start.hidden = Boolean(occupied || (own && !retry));
  start.disabled = busy || Boolean(launchBlock);
  put(start, retry ? "Tentar novamente" : "Começar");
  end.hidden = !own || !state?.enabled;
  end.disabled = busy || !connected;
  draw.hidden = !(own && selected.id === "magicdraw" && (own.status === "ready" || own.status === "limited") && healthy);
  if (!draw.hidden) draw.href = roomURL("/magicdraw.html?session=" + encodeURIComponent(own.id));

  byId("seek-control").hidden = !(own && selected.id === "scrub" && ["ready", "limited"].includes(own.status) && healthy);
  let message = "Projeção pronta para começar.";
  if (occupied) message = "Já há outra experiência nesta sala. Escolhe «Ver sessão» na galeria para acompanhar.";
  else if (launchBlock) message = launchBlock;
  else if (own?.status === "loading") message = "A preparar a experiência na projeção…";
  else if (own?.status === "ready") message = selected.ready;
  else if (own?.status === "limited") {
    message = selected.id === "magicdraw"
      ? "Podes desenhar no touchscreen. Os traços aparecem na projeção."
      : own.reason || "A experiência está pronta em modo limitado.";
  } else if (retry) message = own.reason || "A projeção não conseguiu iniciar a experiência. Tenta novamente.";
  else if (selected.camera && state?.camera === "unavailable") {
    message = "A câmara está indisponível. Experimenta iniciar novamente ou escolhe «Pinta a fachada» para desenhar por toque.";
  }
  const detailStatus = byId("experience-status");
  detailStatus.dataset.tone = launchBlock || occupied || retry || own?.status === "limited" ? "wait" :
    own?.status === "ready" || !own ? "ready" : "loading";
  put(detailStatus, message);
}

function showState(next) {
  stateVersion++;
  const previous = state?.session;
  state = next;
  connected = true;
  if (previous && !next.session && dialog.open && previous.app === selected?.id) dialog.close();
  render();
}

function connectionLost() {
  connected = false;
  render();
}

async function visitor(body) {
  if (busy) return;
  const version = stateVersion;
  feedback();
  busy = true;
  render();
  try {
    const next = await request("visitor", body);
    if (version === stateVersion) showState(next);
    if (body.action === "end" && (!state?.session || state.session.id !== body.id)) dialog.close();
  } catch (failure) {
    const messages = {
      409: "A sala mudou entretanto. Confirma o estado e tenta novamente.",
      429: "Espera um momento antes de tentar novamente.",
      503: "A projeção ainda não está disponível."
    };
    feedback(messages[failure.status] || "O pedido não chegou à instalação. Tenta novamente.");
    request("state").then(next => {
      if (version === stateVersion) showState(next);
    }).catch(connectionLost);
  } finally {
    busy = false;
    render();
  }
}

start.addEventListener("click", () => {
  if (selected) visitor({ action: "open", app: selected.id });
});
end.addEventListener("click", () => {
  const session = state?.session;
  if (session?.app === selected?.id) visitor({ action: "end", id: session.id });
});
back.addEventListener("click", () => dialog.close());
byId("view-session").addEventListener("click", () => {
  const entry = byApp.get(state?.session?.app);
  if (entry) choose(entry);
});
watchState(showState, () => { connectionLost(); explainIfStatic(); });

byId("seek").addEventListener("change", async event => {
  const session = state?.session;
  if (session?.app !== "scrub") return;
  try { await request("visitor", { action: "seek", id: session.id, position: Number(event.target.value) / 100 }); }
  catch (error) { feedback(error.message); }
});
