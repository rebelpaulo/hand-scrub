export const room = new URLSearchParams(location.search).get("room") || "default";

export function roomURL(path) {
  const url = new URL(path, location.origin);
  url.searchParams.set("room", room);
  return url.pathname + url.search + url.hash;
}

export async function request(path, body) {
  const options = body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  const response = await fetch(roomURL("/api/" + path), options);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "Falha de comunicação."), { status: response.status });
  return data;
}

export function watchState(callback, onError) {
  const events = new EventSource(roomURL("/api/state"));
  events.onmessage = event => callback(JSON.parse(event.data));
  events.onerror = onError;
  return () => events.close();
}

// Num alojamento só de ficheiros (ex.: a pré-visualização na Vercel) não há
// servidor da instalação: o /healthz responde 404. Em vez de um erro de
// ligação sem saída, explica-se o que falta e aponta-se para as experiências.
// Falha de rede (servidor em baixo, wi-fi a falhar) não conta: devolve false.
let explained;
export function explainIfStatic() {
  return explained ??= fetch("/healthz", { cache: "no-store" }).then(response => {
    if (response.ok) return false;
    const box = document.createElement("aside");
    box.setAttribute("role", "alert");
    box.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;display:flex;gap:16px;align-items:center;" +
      "justify-content:space-between;flex-wrap:wrap;padding:16px 20px;border:1px solid #ffc487;border-radius:12px;" +
      "background:#1b1923;color:#fffaf2;font:600 1rem/1.45 system-ui,sans-serif";
    const text = document.createElement("span");
    text.textContent = "Neste endereço só estão as experiências. O quiosque e a área da equipa precisam do servidor da instalação, que corre no computador do evento.";
    const link = document.createElement("a");
    link.href = "/index.html";
    link.textContent = "Abrir as experiências";
    link.style.cssText = "padding:10px 16px;border-radius:8px;background:#ffc487;color:#1b1923;text-decoration:none;white-space:nowrap";
    box.append(text, link);
    document.body.append(box);
    return true;
  }, () => false);
}
