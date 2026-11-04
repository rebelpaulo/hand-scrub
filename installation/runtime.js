(() => {
  const room = new URLSearchParams(location.search).get("room") || "default";
  const roomQuery = "?room=" + encodeURIComponent(room);
  const query = new URLSearchParams(location.search);
  const session = query.get("session") || query.get("launch");
  const localVision = Boolean(document.currentScript?.dataset.localVision);
  const bus = new Map();
  const outgoing = [];
  const stateListeners = new Set();
  const encoder = new TextEncoder();
  let sending = false;
  let events;
  let state;
  const emit = (topic, event) => {
    for (const channel of bus.get(topic) || []) channel.receive(event);
  };
  async function flush() {
    if (sending) return;
    sending = true;
    try {
      while (outgoing.length) {
        const messages = [];
        let bytes = 0;
        while (outgoing.length && messages.length < 64) {
          const next = outgoing[0];
          if (messages.length && bytes + next.bytes > 100_000) break;
          outgoing.shift();
          messages.push(next.message);
          bytes += next.bytes;
        }
        await fetch("/api/channel" + roomQuery, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session, messages }),
          keepalive: bytes < 16_000 && messages.every(({ payload }) => ["zones", "warp", "state"].includes(payload.kind)),
          signal: AbortSignal.timeout(8000),
        }).catch(() => {});
      }
    } finally { sending = false; }
  }
  window.Palco = {
    room,
    localVision,
    configURL: "/api/config/" + encodeURIComponent(room),
    watchState(callback) {
      stateListeners.add(callback);
      if (state) callback(state);
      return () => stateListeners.delete(callback);
    },
    channel(topic) {
      if (!events) {
        const options = (query.has("calibrate") ? "&calibrate=1" : "") + (query.has("session") ? "&state=1" : "");
        events = new EventSource("/api/events" + roomQuery + options);
        events.addEventListener("state", event => {
          state = JSON.parse(event.data);
          for (const callback of stateListeners) callback(state);
        });
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
      const senders = new Set();
      const channel = {
        postMessage(payload) {
          senders.add(payload.src);
          const message = { topic, payload };
          outgoing.push({ message, bytes: encoder.encode(JSON.stringify(message)).length + 1 });
          flush();
        },
        receive(event) {
          const src = event.data.src;
          if (typeof src === "string" && /^(display|visitor):/.test(src) && senders.has(src.split(":")[1])) return;
          channel.onmessage?.(event);
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
