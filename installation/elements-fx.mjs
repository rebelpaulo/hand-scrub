import { createHandFire } from "./elements-fire.mjs";

const TIPS = [4, 8, 12, 16, 20];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Midpoint displacement keeps the endpoints fixed while adding detail at
// several scales, like a discharge finding a path through the air.
function discharge(a, b, roughness, random) {
  let points = [a, b];
  for (let level = 0; level < 6; level++) {
    const divided = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1], end = points[i];
      const length = Math.max(1, distance(start, end));
      const offset = (random() - .5) * roughness;
      divided.push({
        x: (start.x + end.x) / 2 - (end.y - start.y) / length * offset,
        y: (start.y + end.y) / 2 + (end.x - start.x) / length * offset,
      }, end);
    }
    points = divided;
    roughness *= .53;
  }
  return points;
}

function seededRandom(seed) {
  let value = seed | 0;
  return () => {
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  };
}

export function createElementEffects(canvas, reduceMotion) {
  const ctx = canvas.getContext("2d");
  const firesByHand = new Map();
  const embers = [];
  let width = 0, height = 0, previousTime, nextEmber = 0;

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = ctx.lineJoin = "round";
  }

  function glow(x, y, radius, color, opacity) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color + opacity);
    gradient.addColorStop(1, color + "00");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawFire(fire, time, spawn, reduced) {
    const { points, power, id } = fire;
    const unit = clamp(distance(points[9], points[0]), 17, height * .22);
    if (!firesByHand.has(id)) firesByHand.set(id, createHandFire());
    ctx.globalAlpha = power;
    firesByHand.get(id).draw(ctx, points, unit, time, reduced);
    if (!spawn) return;
    for (const tip of TIPS) {
      if (embers.length >= 100 || Math.random() > .35) continue;
      embers.push({
        x: points[tip].x, y: points[tip].y,
        vx: (Math.random() - .5) * unit * .8, vy: -unit * (1.2 + Math.random() * 1.6),
        size: .6 + Math.random() * 1.2, age: 0, life: .32 + Math.random() * .6, power,
      });
    }
  }

  function stroke(points, size, color) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.lineWidth = size;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function filament(points, thickness, opacity, branch = false) {
    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.shadowColor = "#509bff";
    ctx.shadowBlur = branch ? 5 : 12;
    stroke(points, thickness * 3.2, "#7baeff33");
    stroke(points, thickness * 1.6, "#add8ff9c");
    ctx.shadowBlur = 0;
    stroke(points, thickness, "#f3f8ff");
    ctx.restore();
  }

  function drawElectric({ connections, unit, power }) {
    const thickness = clamp(unit * .012, .65, 1.5);
    ctx.globalAlpha = power;
    for (const { key, a, b } of connections) {
      let seed = 901;
      for (const letter of key) seed = Math.imul(seed, 31) + letter.charCodeAt(0);
      const random = seededRandom(seed);
      const length = distance(a, b);
      if (length < 3) continue;
      const path = discharge(a, b, Math.min(length * .28, unit * .8), random);
      const opacity = .88;
      filament(path, thickness, opacity);
      for (let branch = 0; branch < 3; branch++) {
        const rootIndex = 8 + Math.floor(random() * 42);
        const root = path[rootIndex];
        const direction = branch % 2 ? -1 : 1;
        const reach = length * (.07 + random() * .13);
        const end = {
          x: root.x + (b.x - a.x) / length * reach + direction * (b.y - a.y) / length * reach * .75,
          y: root.y + (b.y - a.y) / length * reach - direction * (b.x - a.x) / length * reach * .75,
        };
        const twig = discharge(root, end, reach * .45, random);
        // Fade branch sections toward the free end rather than drawing a tube.
        for (let section = 0; section < 4; section++) {
          const start = section * 16;
          filament(twig.slice(start, start + 17), thickness * (.55 - section * .11), opacity * (.50 - section * .12), true);
        }
      }
      for (const point of [a, b]) {
        glow(point.x, point.y, unit * .26, "#6d9fff", "45");
        glow(point.x, point.y, unit * .065, "#dfedff", "bd");
      }
    }
  }

  function render(time, fires, electricity) {
    if (electricity) { fires = []; embers.length = 0; }
    const delta = Math.max(0, Math.min((time - (previousTime ?? time)) / 1000, .05));
    previousTime = time;
    const reduced = reduceMotion.matches;
    const spawn = !reduced && time >= nextEmber && fires.length;
    if (spawn) nextEmber = time + 45;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    const active = new Set(fires.map(fire => fire.id));
    for (const id of firesByHand.keys()) if (!active.has(id)) firesByHand.delete(id);
    for (const fire of fires) drawFire(fire, time, spawn, reduced);
    ctx.globalCompositeOperation = "lighter";
    for (let i = embers.length - 1; i >= 0; i--) {
      const ember = embers[i];
      ember.age += delta;
      if (reduced || ember.age >= ember.life) { embers.splice(i, 1); continue; }
      const fade = 1 - ember.age / ember.life;
      ember.x += ember.vx * delta;
      ember.y += ember.vy * delta;
      ctx.globalAlpha = fade * ember.power;
      ctx.fillStyle = "#ffc383";
      ctx.fillRect(ember.x, ember.y, ember.size, ember.size * fade);
    }
    if (electricity) drawElectric(electricity);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  return { resize, render };
}
