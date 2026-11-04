const tips = [4, 8, 12, 16, 20];
const FIRE_COLORS = ["#ff9942", "#ffd172", "#ffe9bd"];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const ramp = (x, y) => ({ x, y });

export function createElementEffects(canvas, reduceMotion) {
  const ctx = canvas.getContext("2d");
  let width = 0, height = 0, previousTime, nextEmber = 0;
  const embers = [];
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = ctx.lineJoin = "round";
  }

  function glow(x, y, radius, tint, opacity) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, tint + opacity);
    gradient.addColorStop(1, tint + "00");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function flame(x, y, size, height, sway) {
    const gradient = ctx.createLinearGradient(x, y + size * .6, x, y - height);
    gradient.addColorStop(0, "#ff792700");
    gradient.addColorStop(.19, "#fff1beeb");
    gradient.addColorStop(.43, "#ffb64bec");
    gradient.addColorStop(.76, "#ff6026a0");
    gradient.addColorStop(1, "#ef301200");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x - size, y + size * .35);
    ctx.bezierCurveTo(x - size * 1.3, y - height * .36, x + sway, y - height * .61, x + sway, y - height);
    ctx.bezierCurveTo(x + sway * 1.15 + size, y - height * .63, x + size * 1.2, y - height * .32, x + size, y);
    ctx.quadraticCurveTo(x + size * .65, y + size, x - size, y + size * .35);
    ctx.fill();
  }

  function drawDemoHand(points, unit) {
    const bones = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]];
    for (const line of bones) stroke(line.map(i => points[i]), unit * .13, "#ad695c88");
  }

  function drawFire({ points, power, demo }, time, spawn, reduced) {
    const palm = points[9];
    const unit = clamp(Math.hypot(palm.x - points[0].x, palm.y - points[0].y), 17, height * .22);
    if (demo) drawDemoHand(points, unit);
    glow(palm.x, palm.y - unit * .4, unit * 2.6, "#f3652c", "71");
    const phase = reduced ? .9 : time * .009;
    for (const tip of [9, ...tips]) {
      const { x, y } = points[tip];
      const t = phase + tip * 1.13;
      const sway = unit * (.35 * Math.sin(t) + .12 * Math.sin(t * 1.83));
      const rise = unit * (tip === 9 ? 1.78 : 1.25) * (1 + .21 * Math.sin(t * .8));
      flame(x, y, unit * (tip === 9 ? .30 : .20), rise, sway);
      flame(x, y - unit * .1, unit * .095, rise * .62, sway * .67);
      if (spawn && embers.length < 125) {
        embers.push({ x, y, vx: (Math.random() - .5) * unit * 1.7, vy: -unit * (1.05 + Math.random() * 1.85),
          size: 1 + Math.random() * unit * .045, age: 0, life: .28 + Math.random() * .48, power });
      }
    }
  }

  function arc(a, b, phase, amplitude) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const steps = clamp(Math.round(length / 11), 7, 28);
    const points = [a];
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const noise = Math.sin(i * 2.36 + phase) * .54 + Math.sin(i * 4.21 - phase * .72) * .46;
      const offset = noise * amplitude * Math.sin(t * Math.PI);
      points.push(ramp(a.x + dx * t - dy / length * offset, a.y + dy * t + dx / length * offset));
    }
    points.push(b);
    return points;
  }

  function stroke(points, size, color) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.lineWidth = size;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function drawElectric(a, b, time, reduced) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 2) return;
    const phase = reduced ? 1 : time * .014;
    const amplitude = clamp(length * .16, 6, 38);
    const main = arc(a, b, phase, amplitude);
    const branchRoot = main[Math.floor(main.length * .54)];
    const branchTip = ramp(branchRoot.x + (b.x - a.x) * .18, branchRoot.y - amplitude * 1.65);
    const branch = arc(branchRoot, branchTip, phase + 2, amplitude * .42);
    const filament = arc(a, b, phase * .79 + 4, amplitude * .74);
    glow(a.x, a.y, amplitude * 2.3, "#468aff", "b8");
    glow(b.x, b.y, amplitude * 2.3, "#896aff", "b8");
    stroke(main, 16, "#673bff27");
    stroke(main, 9, "#497aff54");
    stroke(filament, 5, "#5ea7ff46");
    stroke(branch, 5, "#8270fa68");
    stroke(branch, 1.4, "#c6bcffd8");
    stroke(filament, 1.3, "#addbffbb");
    stroke(main, 3.6, "#a3dcffea");
    stroke(main, 1.65, "#f4fbff");
  }

  function render(time, fires, electricity) {
    const delta = Math.min((time - (previousTime ?? time)) / 1000, .05);
    previousTime = time;
    const reduced = reduceMotion.matches;
    const spawn = !reduced && time >= nextEmber && fires.length;
    if (spawn) nextEmber = time + 33;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    for (const fire of fires) {
      ctx.globalAlpha = fire.power;
      drawFire(fire, time, spawn, reduced);
    }
    for (let i = embers.length - 1; i >= 0; i--) {
      const ember = embers[i];
      ember.age += delta;
      if (reduced || ember.age >= ember.life) { embers.splice(i, 1); continue; }
      const fade = 1 - ember.age / ember.life;
      ember.x += ember.vx * delta + Math.sin(ember.age * 13) * delta * 12;
      ember.y += ember.vy * delta;
      ctx.globalAlpha = fade * ember.power;
      ctx.fillStyle = FIRE_COLORS[i % FIRE_COLORS.length];
      ctx.beginPath();
      ctx.ellipse(ember.x, ember.y, ember.size * .45, ember.size * fade + .5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (electricity) {
      ctx.globalAlpha = electricity.power;
      drawElectric(...electricity.points, time, reduced);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  return { resize, render };
}
