const WIDTH = 192;
const HEIGHT = 292;
const SIZE = WIDTH * HEIGHT;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function noiseField() {
  const field = new Float32Array(SIZE);
  const layers = [5, 11, 23, 47];
  for (const [octave, cells] of layers.entries()) {
    const grid = Float32Array.from({ length: (cells + 1) ** 2 }, () => Math.random());
    for (let row = 0; row < cells; row++) grid[row * (cells + 1) + cells] = grid[row * (cells + 1)];
    for (let column = 0; column <= cells; column++) grid[cells * (cells + 1) + column] = grid[column];
    const weight = .54 / 2 ** octave;
    for (let y = 0; y < HEIGHT; y++) {
      const gy = y / HEIGHT * cells;
      const iy = Math.floor(gy);
      const fy = gy - iy;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < WIDTH; x++) {
        const gx = x / WIDTH * cells;
        const ix = Math.floor(gx);
        const fx = gx - ix;
        const sx = fx * fx * (3 - 2 * fx);
        const row = iy * (cells + 1) + ix;
        const top = grid[row] * (1 - sx) + grid[row + 1] * sx;
        const bottom = grid[row + cells + 1] * (1 - sx) + grid[row + cells + 2] * sx;
        field[y * WIDTH + x] += (top * (1 - sy) + bottom * sy) * weight;
      }
    }
  }
  return field;
}

// Advect heat from the complete hand silhouette. The heat keeps rising while
// fresh fuel comes from the palm and every finger, so moving hands stay alight.
export function createHandFire() {
  const surface = document.createElement("canvas");
  const mask = document.createElement("canvas");
  surface.width = mask.width = WIDTH;
  surface.height = mask.height = HEIGHT;
  const pixels = surface.getContext("2d");
  const source = mask.getContext("2d", { willReadFrequently: true });
  const image = pixels.createImageData(WIDTH, HEIGHT);
  const noise = noiseField();
  let heat = new Float32Array(SIZE);
  let next = new Float32Array(SIZE);
  let previousTime;

  function handMask(points, origin, unit) {
    const project = p => ({ x: (p.x - origin.x) / (unit * 4) * WIDTH, y: (p.y - origin.y) / (unit * 6.1) * HEIGHT });
    const hand = points.map(project);
    source.clearRect(0, 0, WIDTH, HEIGHT);
    source.fillStyle = source.strokeStyle = "white";
    source.lineCap = source.lineJoin = "round";
    source.filter = "blur(0.7px)";
    const across = { x: hand[17].x - hand[5].x, y: hand[17].y - hand[5].y };
    const size = Math.max(1, Math.hypot(across.x, across.y));
    const wrist = hand[0];
    source.beginPath();
    source.moveTo(wrist.x - across.x * .24, wrist.y - across.y * .24);
    for (const index of [1, 2, 5, 9, 13, 17]) source.lineTo(hand[index].x, hand[index].y);
    source.lineTo(wrist.x + across.x * .24, wrist.y + across.y * .24);
    source.closePath();
    source.fill();
    for (const finger of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
      for (let joint = 0; joint < 3; joint++) {
        source.lineWidth = size * (joint === 0 ? .21 : joint === 1 ? .17 : .14);
        source.beginPath();
        source.moveTo(hand[finger[joint]].x, hand[finger[joint]].y);
        source.lineTo(hand[finger[joint + 1]].x, hand[finger[joint + 1]].y);
        source.stroke();
      }
    }
    source.filter = "none";
    const fade = source.createLinearGradient(wrist.x, wrist.y, hand[9].x, hand[9].y);
    fade.addColorStop(0, "transparent");
    fade.addColorStop(.28, "white");
    fade.addColorStop(1, "white");
    source.globalCompositeOperation = "destination-in";
    source.fillStyle = fade;
    source.fillRect(0, 0, WIDTH, HEIGHT);
    source.globalCompositeOperation = "source-over";
    return source.getImageData(0, 0, WIDTH, HEIGHT).data;
  }

  function simulate(fuel, time, step) {
    const driftX = Math.floor(time * .009) % WIDTH;
    const driftY = Math.floor(time * .027) % HEIGHT;
    const data = image.data;
    next.fill(0);
    for (let y = 1; y < HEIGHT - 2; y++) {
      for (let x = 1; x < WIDTH - 2; x++) {
        const index = y * WIDTH + x;
        const noiseX = (x + driftX) % WIDTH, noiseY = (y + driftY) % HEIGHT;
        const n = noise[noiseY * WIDTH + noiseX];
        const eddy = noise[((y * 2 + driftY) % HEIGHT) * WIDTH + (x * 2 + driftX) % WIDTH];
        const curlX = (noise[((noiseY + 1) % HEIGHT) * WIDTH + noiseX] - noise[((noiseY + HEIGHT - 1) % HEIGHT) * WIDTH + noiseX]) * 80;
        const curlY = (noise[noiseY * WIDTH + (noiseX + WIDTH - 1) % WIDTH] - noise[noiseY * WIDTH + (noiseX + 1) % WIDTH]) * 55;
        const fromX = clamp(x + ((n - .5) * 5 + curlX) * step, 0, WIDTH - 2);
        const fromY = clamp(y + (2.8 + eddy * 2.8 + curlY) * step, 0, HEIGHT - 2);
        const ix = Math.floor(fromX), iy = Math.floor(fromY);
        const fx = fromX - ix, fy = fromY - iy;
        const sample = iy * WIDTH + ix;
        const top = heat[sample] * (1 - fx) + heat[sample + 1] * fx;
        const bottom = heat[sample + WIDTH] * (1 - fx) + heat[sample + WIDTH + 1] * fx;
        const rising = Math.max(0, (top * (1 - fy) + bottom * fy) - (.018 + eddy * .027) * step);
        const injection = fuel[index * 4 + 3] / 255 * (.62 + n * .46);
        const temperature = Math.max(rising, injection);
        next[index] = temperature;
        const detail = noise[((y * 5 + driftY * 3) % HEIGHT) * WIDTH + (x * 5 + driftX * 2) % WIDTH];
        const brightness = temperature * (.7 + detail * .7);
        const density = clamp((temperature - .10 - detail * .05) * 1.48, 0, 1);
        const hot = clamp((brightness - .32) * 2.2, 0, 1);
        const core = clamp((brightness - .61) * 3.4, 0, 1);
        const offset = index * 4;
        data[offset] = 255;
        data[offset + 1] = Math.round(35 + hot * 174 + core * 43);
        data[offset + 2] = Math.round(3 + hot * 17 + core * 188);
        data[offset + 3] = Math.round(255 * density * (.58 + detail * .50));
      }
    }
    [heat, next] = [next, heat];
    pixels.putImageData(image, 0, 0);
  }

  function draw(ctx, points, unit, time, reduced) {
    const palm = { x: (points[0].x + points[9].x) / 2, y: (points[0].y + points[9].y) / 2 };
    const origin = { x: palm.x - unit * 2, y: palm.y - unit * 4.4 };
    const elapsed = previousTime === undefined ? 33 : time - previousTime;
    if (previousTime === undefined || elapsed >= 30) {
      const fuel = handMask(points, origin, unit);
      if (reduced) heat.fill(0);
      simulate(fuel, reduced ? 0 : time, reduced ? 0 : clamp(elapsed / 33, .5, 1.8));
      previousTime = time;
    }
    const w = unit * 4, h = unit * 6.1;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.filter = "blur(" + Math.max(4, unit * .14) + "px)";
    ctx.globalAlpha *= .48;
    ctx.drawImage(surface, origin.x, origin.y, w, h);
    ctx.restore();
    ctx.save();
    ctx.filter = "blur(0.6px)";
    ctx.drawImage(surface, origin.x, origin.y, w, h);
    ctx.restore();
  }

  return { draw };
}
