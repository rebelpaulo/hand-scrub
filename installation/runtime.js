(() => {
  const room = new URLSearchParams(location.search).get("room") || "default";
  const roomQuery = "?room=" + encodeURIComponent(room);
  const query = new URLSearchParams(location.search);
  const session = query.get("session") || query.get("launch");
  const localVision = Boolean(document.currentScript?.dataset.localVision);
  const bus = new Map();
  let outgoing = Promise.resolve();
  let events;
  const emit = (topic, event) => {
    for (const channel of bus.get(topic) || []) channel.onmessage?.(event);
  };
  window.Palco = {
    room,
    localVision,
    configURL: "/api/config/" + encodeURIComponent(room),
    channel(topic) {
      if (!events) {
        events = new EventSource("/api/events" + roomQuery + (query.has("calibrate") ? "&calibrate=1" : ""));
        events.onmessage = event => {
          const { topic, payload } = JSON.parse(event.data);
          emit(topic, { data: payload });
        };
        events.onerror = () => {
          for (const channels of bus.values()) for (const channel of channels) channel.onerror?.();
        };
        events.onopen = () => {
          for (const channels of bus.values()) for (const channel of channels) channel.onopen?.();
        };
      }
      if (!bus.has(topic)) bus.set(topic, new Set());
      const channels = bus.get(topic);
      const channel = {
        postMessage(payload) {
          const send = () => fetch("/api/channel" + roomQuery, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic, payload, session }),
            keepalive: ["zones", "warp", "state"].includes(payload.kind) && JSON.stringify(payload).length < 16000,
          }).catch(() => {});
          outgoing = outgoing.then(send);
        },
        close() {
          channels.delete(channel);
          if ([...bus.values()].every(set => !set.size)) {
            events.close();
            events = null;
          }
        },
      };
      channels.add(channel);
      return channel;
    },
    availability(state, reason) {
      if (parent === window) return;
      const launch = new URLSearchParams(location.search).get("launch");
      if (launch) parent.postMessage({ mapping: 1, evt: "availability", state, reason, launch }, location.origin);
    },
  };
  if (window.parent !== window && query.has("launch")) {
    document.addEventListener("DOMContentLoaded", () => {
      for (const link of document.querySelectorAll('a[href="index.html"]')) {
        link.hidden = true;
        link.style.setProperty("display", "none", "important");
      }
    }, { once: true });
  }
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
  window.addEventListener("pagehide", () => {
    events?.close();
    for (const video of document.querySelectorAll("video")) video.srcObject?.getTracks?.().forEach(track => track.stop());
  });
})();
