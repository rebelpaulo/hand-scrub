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
