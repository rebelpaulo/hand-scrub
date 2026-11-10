// Draw Physics — catálogo de efeitos. Só dados: cada efeito é uma receita que
// diz que peças do motor ligar (fluido, partículas, cordas, ...) e com que
// regulações. O motor vive em drawphysics-gl.mjs / drawphysics-sim.mjs.

export const PALETTES = {
  neon:      { name: "Néon",        c: ["#00f0ff", "#ff2bd6", "#fff36b"] },
  fogo:      { name: "Fogo",        c: ["#ffd166", "#ff6b1a", "#c1121f"] },
  chama:     { name: "Chama azul",  c: ["#e8fbff", "#39b6ff", "#1a2bff"] },
  gelo:      { name: "Gelo",        c: ["#e0fbff", "#7fd8ff", "#3a6bff"] },
  oceano:    { name: "Oceano",      c: ["#0aefff", "#0077ff", "#00ffa3"] },
  aurora:    { name: "Aurora",      c: ["#6effc5", "#3dd6ff", "#a56bff"] },
  ouro:      { name: "Ouro",        c: ["#fff2b0", "#ffc233", "#b8730a"] },
  lava:      { name: "Lava",        c: ["#ffe066", "#ff5a1f", "#8a0f0f"] },
  floresta:  { name: "Floresta",    c: ["#c9ff7a", "#3ddc84", "#0b8a5a"] },
  cereja:    { name: "Cerejeira",   c: ["#ffe3ee", "#ff9ec4", "#ff5c9a"] },
  outono:    { name: "Outono",      c: ["#ffb347", "#e2582d", "#8f2d0f"] },
  arcoiris:  { name: "Arco-íris",   c: ["#ff4d4d", "#4dff88", "#4d88ff"], rainbow: true },
  galaxia:   { name: "Galáxia",     c: ["#b388ff", "#5a6bff", "#ff7ad9"] },
  toxico:    { name: "Tóxico",      c: ["#d4ff3a", "#3aff8a", "#00c2a8"] },
  pastel:    { name: "Pastel",      c: ["#ffd6e8", "#c9e4ff", "#d7ffd9"] },
  mono:      { name: "Branco",      c: ["#ffffff", "#cfd6e6", "#8792ad"] },
  mercurio:  { name: "Mercúrio",    c: ["#f4f7fb", "#aeb9c9", "#5d6a80"] },
  poente:    { name: "Pôr do sol",  c: ["#ffd27d", "#ff7a59", "#b03a9b"] },
  retro:     { name: "8-bit",       c: ["#ff4d4d", "#ffd23f", "#3ad1ff"] },
  tricolor:  { name: "Tricolor",    c: ["#ff3355", "#ffffff", "#3377ff"] },
  vapor:     { name: "Vaporwave",   c: ["#ff5ea8", "#a05cff", "#4cc9ff"] },
  plasma:    { name: "Plasma",      c: ["#ff5cf4", "#7a5cff", "#35e0ff"] },
  areia:     { name: "Areia",       c: ["#ffe2a8", "#e0b064", "#a8743a"] },
  coral:     { name: "Coral",       c: ["#ffe6d5", "#ff7b6b", "#7a1f4d"] },
};

export const FAMILIES = [
  { id: "fumo",     name: "Fumo e névoa" },
  { id: "fogo",     name: "Fogo e energia" },
  { id: "liquido",  name: "Líquidos" },
  { id: "luz",      name: "Luz e cor" },
  { id: "estilo",   name: "Estilizados" },
  { id: "natureza", name: "Natureza" },
  { id: "fisica",   name: "Física e objetos" },
  { id: "festa",    name: "Festa" },
  { id: "jogos",    name: "Jogos e anime" },
  { id: "lab",      name: "Laboratório" },
];

// Atalhos para as receitas de partículas mais repetidas.
const part = (shape, o) => ({ shape, ...o });

export const EFFECTS = [
  /* ---------- Fumo e névoa ---------- */
  { id: "fumo", name: "Fumo", family: "fumo", pal: "mono",
    fluid: { mode: "smoke", radius: 1.3, diss: .32, vdiss: .25, curl: 26, buoy: 60, amount: .55 } },
  { id: "fumo-colorido", name: "Fumo colorido", family: "fumo", pal: "neon",
    fluid: { mode: "smoke", radius: 1.25, diss: .3, vdiss: .22, curl: 28, buoy: 45, amount: .7 } },
  { id: "nevoa-gelada", name: "Névoa gelada", family: "fumo", pal: "gelo",
    fluid: { mode: "smoke", radius: 1.9, diss: .24, vdiss: .5, curl: 9, buoy: -55, amount: .5 } },
  { id: "vapor", name: "Vapor", family: "fumo", pal: "mono",
    fluid: { mode: "glow", radius: 1.7, diss: .75, vdiss: .3, curl: 14, buoy: 150, amount: .45 } },
  { id: "fantasma", name: "Fantasma", family: "fumo", pal: "toxico",
    fluid: { mode: "smoke", radius: 1.1, diss: .55, vdiss: .15, curl: 38, buoy: 25, amount: .8 },
    post: { chroma: .7, bloom: 1.3 } },

  /* ---------- Fogo e energia ---------- */
  { id: "fogo", name: "Fogo", family: "fogo", pal: "fogo",
    fluid: { mode: "fire", radius: .95, diss: 1.4, vdiss: .5, curl: 30, buoy: 420, amount: 2 },
    parts: [part("ember", { rate: 7, size: [2, 4.5], life: [.6, 1.5], speed: 60, grav: -200, wander: 320, glow: 3, color: 0 })] },
  { id: "chama-azul", name: "Chama azul", family: "fogo", pal: "chama",
    fluid: { mode: "fire", radius: .8, diss: 1.6, vdiss: .5, curl: 24, buoy: 480, amount: 2.1 } },
  { id: "faiscas", name: "Faíscas", family: "fogo", pal: "ouro",
    fluid: { mode: "glow", radius: .6, diss: 3, vdiss: 1, curl: 6, amount: .25 },
    parts: [part("spark", { rate: 70, size: [2, 4], life: [.5, 1.4], speed: 520, follow: .5, grav: 900, drag: .5, bounce: .55, glow: 4, stretch: .016, color: "rand" })] },
  { id: "plasma", name: "Plasma", family: "fogo", pal: "plasma",
    fluid: { mode: "glow", radius: 1, diss: .45, vdiss: .1, curl: 60, amount: 1.1 },
    post: { chroma: .9, bloom: 1.3 } },
  { id: "raios", name: "Raios", family: "fogo", pal: "chama",
    fluid: { mode: "glow", radius: .7, diss: 2, vdiss: 1, curl: 10, amount: .6 },
    bolts: { type: "strike" } },
  { id: "brasas", name: "Brasas", family: "fogo", pal: "lava",
    fluid: { mode: "fire", radius: .8, diss: 1.1, vdiss: .6, curl: 16, buoy: 150, amount: 1.3 },
    parts: [part("ember", { rate: 24, size: [2.5, 5.5], life: [1.5, 3.6], speed: 50, grav: -60, wander: 230, twinkle: .6, glow: 3.2, color: "rand" })] },

  /* ---------- Líquidos ---------- */
  { id: "tinta", name: "Tinta na água", family: "liquido", pal: "vapor",
    fluid: { mode: "smoke", radius: .75, diss: .07, vdiss: .15, curl: 9, amount: .95 },
    post: { bg: [.006, .014, .04] } },
  { id: "lava", name: "Lava", family: "liquido", pal: "lava",
    fluid: { mode: "lava", radius: 1.15, diss: .2, vdiss: 1.7, curl: 4, grav: -150, amount: 1.1 } },
  { id: "mercurio", name: "Mercúrio", family: "liquido", pal: "mercurio",
    fluid: { mode: "liquid", radius: 1, diss: .1, vdiss: .9, curl: 6, grav: -230, amount: 1.1 } },
  { id: "ouro-liquido", name: "Ouro líquido", family: "liquido", pal: "ouro",
    fluid: { mode: "liquid", radius: 1.05, diss: .1, vdiss: .9, curl: 6, grav: -160, amount: 1.1 } },
  { id: "oceano", name: "Oceano", family: "liquido", pal: "oceano",
    fluid: { mode: "liquid", radius: 1.4, diss: .14, vdiss: .3, curl: 24, amount: 1 } },

  /* ---------- Luz e cor ---------- */
  { id: "neon", name: "Néon", family: "luz", pal: "neon",
    fluid: { mode: "glow", radius: .7, diss: 1.5, vdiss: .5, curl: 10, amount: .3 },
    ribbon: { style: "core", width: 9, life: 1.7 } },
  { id: "arco-iris", name: "Arco-íris", family: "luz", pal: "arcoiris",
    fluid: { mode: "glow", radius: 1.05, diss: .34, vdiss: .2, curl: 24, amount: .95 } },
  { id: "aurora", name: "Aurora", family: "luz", pal: "aurora",
    fluid: { mode: "glow", radius: 2.2, diss: .3, vdiss: .3, curl: 8, buoy: 34, amount: .5 } },
  { id: "prisma", name: "Prisma", family: "luz", pal: "arcoiris",
    fluid: { mode: "glow", radius: .9, diss: .6, vdiss: .25, curl: 18, amount: .9 },
    post: { chroma: 2.6 } },
  { id: "galaxia", name: "Galáxia", family: "luz", pal: "galaxia",
    fluid: { mode: "glow", radius: 1.1, diss: .2, vdiss: .05, curl: 42, amount: .7 },
    parts: [part("star", { rate: 10, size: [2.5, 7], life: [2, 5], speed: 30, follow: .15, twinkle: 1, glow: 3, color: "rand" })] },

  /* ---------- Estilizados ---------- */
  { id: "psicadelico", name: "Psicadélico", family: "estilo", pal: "arcoiris",
    fluid: { mode: "psy", radius: 1.2, diss: .18, vdiss: .12, curl: 36, amount: 1 } },
  { id: "topografico", name: "Topográfico", family: "estilo", pal: "floresta",
    fluid: { mode: "topo", radius: 1.5, diss: .15, vdiss: .3, curl: 12, amount: 1 } },
  { id: "pixel", name: "Pixel", family: "estilo", pal: "retro",
    fluid: { mode: "glow", radius: 1.1, diss: .5, vdiss: .2, curl: 20, amount: 1 },
    post: { pixel: 14, bloom: .5 } },
  { id: "cometa", name: "Cometa", family: "estilo", pal: "gelo",
    fluid: { mode: "glow", radius: .6, diss: 1.9, vdiss: .6, curl: 10, amount: .5 },
    ribbon: { style: "core", width: 13, life: .55 },
    parts: [part("dot", { rate: 44, size: [1.5, 3.8], life: [.4, 1.3], speed: 70, follow: -.08, drag: 1, glow: 3, color: "rand" })] },
  { id: "vortice", name: "Vórtice", family: "estilo", pal: "vapor",
    fluid: { mode: "glow", radius: 1, diss: .3, vdiss: .05, curl: 50, amount: .9, spin: 1 } },

  /* ---------- Natureza ---------- */
  { id: "folhas", name: "Folhas de outono", family: "natureza", pal: "outono",
    parts: [part("leaf", { add: false, rate: 5, size: [14, 27], life: [4, 8], speed: 90, follow: .35, grav: 115, drag: 1.2, wander: 270, spin: 2.6, color: "rand", flip: true })] },
  { id: "petalas", name: "Pétalas de cerejeira", family: "natureza", pal: "cereja",
    parts: [part("petal", { add: false, rate: 7, size: [9, 16], life: [4, 8], speed: 70, follow: .3, grav: 55, drag: 1.3, wander: 210, spin: 1.9, color: "rand", flip: true })] },
  { id: "neve", name: "Neve", family: "natureza", pal: "gelo",
    parts: [part("snow", { rate: 6, ambient: 90, from: "top", size: [4, 11], life: [7, 13], speed: 20, grav: 46, drag: 1.5, wander: 120, spin: .8, push: 1, glow: 1.4, color: 0 })] },
  { id: "chuva", name: "Chuva", family: "natureza", pal: "chama",
    parts: [part("rain", { rate: 26, ambient: 260, from: "top", size: [1.2, 2], life: [1.2, 2], vy: 1500, vx: -120, push: .5, glow: 1.2, stretch: .012, color: "rand", splash: true })] },
  { id: "pirilampos", name: "Pirilampos", family: "natureza", pal: "toxico",
    parts: [part("dot", { rate: 3, ambient: 55, from: "any", size: [3, 6.5], life: [6, 12], speed: 25, drag: 1.6, wander: 170, twinkle: 1, slow: true, magnet: 420, glow: 3.2, color: "rand", trail: true })],
    post: { trailFade: 3.2 } },
  { id: "lago", name: "Lago", family: "natureza", pal: "oceano", waves: {} },
  { id: "bolhas", name: "Bolhas de sabão", family: "natureza", pal: "pastel",
    parts: [part("bubble", { rate: 4, size: [10, 30], life: [3, 7], speed: 50, follow: .2, grav: -52, drag: 1.2, wander: 130, glow: 1.5, color: "rand" })] },
  { id: "areia", name: "Areia", family: "natureza", pal: "areia", sand: {} },
  { id: "polen", name: "Pólen ao vento", family: "natureza", pal: "floresta",
    parts: [part("dot", { rate: 14, ambient: 110, from: "any", size: [2.6, 5.6], life: [6, 12], speed: 25, vx: 42, drag: 1.2, wander: 95, push: 1.2, glow: 3, color: "rand" })] },

  /* ---------- Física e objetos ---------- */
  { id: "corda", name: "Corda", family: "fisica", pal: "areia", ropes: { type: "rope" } },
  { id: "arame", name: "Arame farpado", family: "fisica", pal: "mercurio", ropes: { type: "barbed" } },
  { id: "corrente", name: "Corrente", family: "fisica", pal: "mercurio", ropes: { type: "chain" } },
  { id: "tentaculos", name: "Tentáculos néon", family: "fisica", pal: "neon", ropes: { type: "tentacle" } },
  { id: "laser", name: "Laser ricochete", family: "fisica", pal: "tricolor", laser: {} },
  { id: "raio-eletrico", name: "Raio elétrico", family: "fisica", pal: "galaxia", bolts: { type: "arc" } },
  { id: "bolas", name: "Bolas saltitonas", family: "fisica", pal: "neon", world: {} },

  /* ---------- Festa ---------- */
  { id: "fogo-artificio", name: "Fogo de artifício", family: "festa", pal: "arcoiris",
    parts: [part("dot", { emit: "burst", burst: 110, every: 150, size: [2, 4.2], life: [1, 2.1], speed: 560, grav: 260, drag: 1.5, twinkle: .5, glow: 4, color: "burst", trail: true })],
    post: { trailFade: 5 } },
  { id: "confete", name: "Confete", family: "festa", pal: "arcoiris",
    parts: [part("confetti", { add: false, rate: 34, size: [6, 11], life: [2.5, 5], speed: 400, follow: .3, grav: 430, drag: 1.7, wander: 150, spin: 6, color: "rand", flip: true })] },
  { id: "coracoes", name: "Corações", family: "festa", pal: "cereja",
    parts: [part("heart", { rate: 6, size: [10, 23], life: [2, 4.2], speed: 60, follow: .2, grav: -72, drag: 1.1, wander: 115, glow: .9, color: "rand", wobble: true })] },

  /* ---------- Jogos e anime ---------- */
  { id: "moedas", name: "Chuva de moedas", family: "jogos", pal: "ouro",
    parts: [part("coin", { add: false, rate: 9, size: [11, 16], life: [2.6, 4.6], speed: 300, up: 420, grav: 1500, drag: .2, bounce: .5, color: 1, flip: true, spinFlip: 9 })] },
  { id: "estrelinhas", name: "Estrelinhas", family: "jogos", pal: "ouro",
    parts: [part("star", { rate: 22, size: [4, 12], life: [.7, 1.9], speed: 115, follow: .15, drag: 1.2, twinkle: 1, glow: 3.4, color: "rand" })] },
  { id: "rajada", name: "Rajada de energia", family: "jogos", pal: "chama",
    fluid: { mode: "glow", radius: 1, diss: 2, vdiss: .4, curl: 26, amount: .9, force: 2 },
    ribbon: { style: "core", width: 27, life: .5 },
    parts: [part("spark", { rate: 34, size: [2, 4], life: [.3, .8], speed: 420, follow: .9, drag: 1.5, glow: 4, stretch: .02, color: "rand" })] },
  { id: "aura", name: "Aura dourada", family: "jogos", pal: "ouro",
    fluid: { mode: "fire", radius: 1.5, diss: 1.3, vdiss: .5, curl: 22, buoy: 270, amount: 1.5 },
    parts: [part("spark", { rate: 16, size: [1.6, 3], life: [.5, 1.2], speed: 40, grav: -560, drag: .4, glow: 4, stretch: .02, color: 0 })] },
  { id: "tricolor", name: "Rasto tricolor", family: "jogos", pal: "tricolor",
    ribbon: { style: "tri", width: 24, life: 2.2 } },
  { id: "blocos", name: "Blocos 8-bit", family: "jogos", pal: "retro", blocks: {} },

  /* ---------- Laboratório (novos) ---------- */
  { id: "coral", name: "Coral", family: "lab", pal: "coral", rd: { F: .0545, k: .062 } },
  { id: "labirinto", name: "Labirinto", family: "lab", pal: "floresta", rd: { F: .029, k: .057 } },
  { id: "mitose", name: "Mitose", family: "lab", pal: "galaxia", rd: { F: .034, k: .0605 } },
  { id: "vitral", name: "Vitral", family: "lab", pal: "retro", voronoi: {} },
  { id: "lampada-lava", name: "Lâmpada de lava", family: "lab", pal: "poente", meta: {} },
  { id: "tecido", name: "Tecido", family: "lab", pal: "vapor", cloth: {} },
  { id: "cardume", name: "Cardume", family: "lab", pal: "oceano", boids: {},
    post: { trailFade: 6 } },
  { id: "orbitas", name: "Órbitas", family: "lab", pal: "galaxia", wells: { lens: false },
    post: { trailFade: 1.5 } },
  { id: "buraco-negro", name: "Buraco negro", family: "lab", pal: "poente", wells: { lens: true },
    post: { trailFade: 2.2, chroma: .8 } },
  { id: "constelacao", name: "Constelação", family: "lab", pal: "chama", web: {} },
  { id: "mandala", name: "Mandala", family: "lab", pal: "arcoiris",
    fluid: { mode: "glow", radius: .7, diss: .4, vdiss: .15, curl: 26, amount: 1 },
    post: { kaleido: 12 } },
  { id: "seda", name: "Seda", family: "lab", pal: "aurora",
    parts: [part("dot", { rate: 26, size: [.9, 1.5], life: [3, 6], speed: 30, follow: .25, flow: 130, glow: 1.1, color: "stroke", trail: true, max: 5000 })],
    post: { trailFade: .22, bloom: .7 } },
];

// Peças que um efeito pode ligar — usado pelo teste de dados e pelo motor.
export const ENGINES = ["fluid", "parts", "ribbon", "bolts", "ropes", "laser", "world", "blocks",
  "waves", "sand", "rd", "voronoi", "meta", "cloth", "boids", "wells", "web"];

export const SYMMETRIES = [
  { id: "none", name: "Nenhuma" },
  { id: "mirror", name: "Espelho" },
  { id: "quad", name: "4 cantos" },
  { id: "kaleido", name: "Caleidoscópio" },
];

// Transforma um ponto (em píxeis, origem em cima à esquerda) nas suas cópias
// simétricas. Função pura, para poder ser testada sem browser.
export function symmetryPoints(mode, x, y, W, H, out = []) {
  out.length = 0;
  out.push(x, y);
  if (mode === "mirror") out.push(W - x, y);
  else if (mode === "quad") out.push(W - x, y, x, H - y, W - x, H - y);
  else if (mode === "kaleido") {
    const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy, n = 8;
    for (let k = 1; k < n; k++) {
      const a = k * Math.PI * 2 / n, c = Math.cos(a), s = Math.sin(a);
      const mx = k % 2 ? -dx : dx; // cópias ímpares são espelhadas
      out.push(cx + mx * c - dy * s, cy + mx * s + dy * c);
    }
  }
  return out;
}
