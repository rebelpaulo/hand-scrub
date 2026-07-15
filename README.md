# Pinch Scrub — hand-tracked video scrubbing

Webcam hand tracking that lets you **pinch (thumb + index) to grab a video's
timeline and drag left/right to scrub** — just like dragging with a mouse.

## Hand-tracking engine
**Google MediaPipe — `HandLandmarker` (Tasks Vision)**. It's the most
reliable, fastest, and most widely recommended in-browser hand tracker:
21 3D landmarks per hand, real-time (20–30+ fps), runs 100% client-side
(GPU/WASM), no backend. Loaded from the jsDelivr CDN — nothing to install.

## Run
Camera needs `localhost` or HTTPS. From this folder:

```bash
python3 -m http.server 8777
# open http://localhost:8777
```

1. Click **Start camera** and allow webcam access.
2. **Pinch** thumb + index together → grabs the scrubber (marker turns red).
3. Move your hand **right = forward**, **left = backward**.
4. **Open your fingers** to release.

- **Load video…** to use your own clip; **Space** = play/pause.
- **Scrub sensitivity** = how much timeline a full drag covers.
- **Pinch threshold** = how closed the fingers must be to grab.

## Files
- `index.html` — the whole app (self-contained, no build step).
