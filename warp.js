/**
 * warp.js — Warp de projeção N×N (projection mapping) via WebGL2/WebGL1.
 *
 * Método: mapeamento INVERSO por pixel de saída, com inversão bilinear por
 * Newton-Raphson (standard da indústria para projection mapping em GPU).
 *
 * DECISÕES DE IMPLEMENTAÇÃO (documentadas, ver ticket):
 *
 * 1) Pontos de controlo → TEXTURA DE DADOS (não uniforms).
 *    O mínimo garantido de MAX_FRAGMENT_UNIFORM_VECTORS em WebGL1 é 16 vec4
 *    (64 floats) — insuficiente para N=17 (17*17*2 = 578 floats). Uma
 *    textura de dados RGBA8 (sem extensões, funciona igual em WebGL1/2)
 *    evita esse limite por completo e mantém o MESMO caminho de código para
 *    qualquer N. Cada ponto (x,y) é codificado em 4 bytes: 2 bytes (R,G)
 *    para x, 2 bytes (B,A) para y, mapeados no intervalo [POINT_MIN,
 *    POINT_MIN+POINT_RANGE] (permite arrastar pontos ligeiramente fora de
 *    [0,1] para correções tipo keystone).
 *
 * 2) Loop das células → GERADO DINAMICAMENTE NO JS (shader recompilado por N).
 *    GLSL ES 1.00 (o dialeto usado, ver ponto 3) exige que o limite de um
 *    for-loop seja uma expressão CONSTANTE — um `for (i=0; i<uniformN; i++)`
 *    falha a compilar em validadores estritos (ANGLE, usado pelo Chrome/
 *    Firefox no Windows). Por isso o número de células (N-1)² é injetado
 *    como `const int` no texto do shader e este é recompilado sempre que
 *    setGrid() muda N. É a abordagem mais robusta entre browsers/drivers.
 *
 * 3) Sintaxe do shader: sempre GLSL ES 1.00 (texture2D/varying/gl_FragColor),
 *    mesmo em contexto WebGL2 — o WebGL2 aceita shaders sem `#version` como
 *    ES 1.00 por compatibilidade. Assim não há dois caminhos de shader para
 *    manter; só a escolha do contexto (webgl2 > webgl) muda.
 *
 * 4) Precisão: tenta `precision highp float` (necessário para o
 *    Newton-Raphson: det > 1e-6, resíduo < 0.0025). Se o hardware não
 *    suportar highp no fragment shader, cai para mediump com tolerâncias
 *    mais folgadas (evita shader inválido em GPUs móveis antigas).
 *
 * 5) Otimização de desempenho: antes de varrer todas as (N-1)² células,
 *    tenta primeiro a célula "estimada" por identidade
 *    (col≈x*(N-1), row≈y*(N-1)). Para warps suaves (o caso comum em
 *    projection mapping) isto resolve o pixel em 1 tentativa em vez de até
 *    (N-1)². ponytail: pior caso continua O(N²) por pixel (N=17 ⇒ até 256
 *    testes de bounding-box); se o FPS a N=17 for insuficiente num alvo
 *    real, o upgrade natural é indexar as células numa grelha espacial
 *    (hash 2D) em vez de varrer tudo.
 *
 * Sem dependências externas. Robusto a webglcontextlost/restored.
 */

// ---- Constantes de codificação dos pontos na textura de dados ----
const POINT_MIN = -0.5; // intervalo coberto pela codificação: [-0.5, 1.5]
const POINT_RANGE = 2.0;

// ---------------------------------------------------------------------

export function createWarp(outputCanvas, opts = {}) {
  if (!outputCanvas || typeof outputCanvas.getContext !== 'function') {
    throw new Error('createWarp: outputCanvas inválido');
  }

  let n = clampN(opts.n || 5);
  let points = identityPoints(n);
  let showTest = false;

  let gl = null;
  let program = null;
  let quadBuffer = null;
  let sourceTex = null;
  let pointsTex = null;
  let uLoc = {};
  let contextLost = false;
  let highp = true;

  initGL();
  buildProgramForN(n);
  uploadPointsTexture();

  outputCanvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost = true;
  });
  outputCanvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    initGL(); // o próprio contexto `gl` mantém-se válido, mas os recursos não
    buildProgramForN(n);
    uploadPointsTexture();
  });

  function initGL() {
    // preserveDrawingBuffer: true — o canvas de saída pode ser lido/capturado
    // por outro sistema (ex.: magicdraw-display.html), por isso o conteúdo
    // tem de sobreviver entre frames em vez de poder ser limpo pelo browser.
    const ctxAttrs = { premultipliedAlpha: false, preserveDrawingBuffer: true };
    gl =
      outputCanvas.getContext('webgl2', ctxAttrs) ||
      outputCanvas.getContext('webgl', ctxAttrs) ||
      outputCanvas.getContext('experimental-webgl', ctxAttrs);
    if (!gl) throw new Error('createWarp: WebGL não suportado neste browser');

    // Deteta suporte a highp no fragment shader (necessário para o Newton-Raphson).
    const fmt = gl.getShaderPrecisionFormat
      ? gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
      : null;
    highp = !!(fmt && fmt.precision > 0);

    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    sourceTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    pointsTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, pointsTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  // ---- Shader ----

  function vertexSrc() {
    return `
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  // vUV.y = 0 no TOPO do canvas de saída (convenção usada em toda a lib:
  // linha 0 da grelha = topo).
  vUV = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  }

  function fragmentSrc(nn) {
    const numCells = (nn - 1) * (nn - 1);
    const prec = highp ? 'highp' : 'mediump';
    const detEps = highp ? 1e-6 : 1e-3;
    const residualEps = highp ? 0.0025 : 0.02;
    const uvSlack = highp ? 0.001 : 0.01;
    return `
precision ${prec} float;

const int N = ${nn};
const int NUM_CELLS = ${numCells};
const float POINT_MIN = ${POINT_MIN.toFixed(4)};
const float POINT_RANGE = ${POINT_RANGE.toFixed(4)};
const float CELL_TOL = 0.002;
const float DET_EPS = ${detEps};
const float RESIDUAL_EPS = ${residualEps};
const float UV_SLACK = ${uvSlack};

uniform sampler2D uSource;
uniform sampler2D uPoints;
uniform float uShowTestPattern;
uniform float uAspect;
varying vec2 vUV;

// Lê o ponto de controlo (col,row) da textura de dados RGBA8.
vec2 getPoint(float col, float row) {
  vec2 uv = vec2((col + 0.5) / float(N), (row + 0.5) / float(N));
  vec4 enc = texture2D(uPoints, uv);
  float xHi = floor(enc.r * 255.0 + 0.5);
  float xLo = floor(enc.g * 255.0 + 0.5);
  float yHi = floor(enc.b * 255.0 + 0.5);
  float yLo = floor(enc.a * 255.0 + 0.5);
  float xN = (xHi * 256.0 + xLo) / 65535.0;
  float yN = (yHi * 256.0 + yLo) / 65535.0;
  return vec2(xN * POINT_RANGE + POINT_MIN, yN * POINT_RANGE + POINT_MIN);
}

// Tenta resolver P(u,v) = target dentro da célula (col,row).
// Devolve (u, v, 1.0) se aceite, (0,0,0.0) caso contrário.
vec3 solveCell(float col, float row, vec2 target) {
  vec2 p00 = getPoint(col, row);
  vec2 p10 = getPoint(col + 1.0, row);
  vec2 p01 = getPoint(col, row + 1.0);
  vec2 p11 = getPoint(col + 1.0, row + 1.0);

  vec2 bboxMin = min(min(p00, p10), min(p01, p11)) - CELL_TOL;
  vec2 bboxMax = max(max(p00, p10), max(p01, p11)) + CELL_TOL;
  if (target.x < bboxMin.x || target.x > bboxMax.x ||
      target.y < bboxMin.y || target.y > bboxMax.y) {
    return vec3(0.0, 0.0, 0.0);
  }

  vec2 b = p10 - p00;
  vec2 c = p01 - p00;
  vec2 d = p00 - p10 - p01 + p11;

  float u = 0.5;
  float v = 0.5;
  for (int i = 0; i < 7; i++) {
    vec2 F = p00 + b * u + c * v + d * u * v - target;
    float Jbx = b.x + d.x * v;
    float Jcx = c.x + d.x * u;
    float Jby = b.y + d.y * v;
    float Jcy = c.y + d.y * u;
    float det = Jbx * Jcy - Jcx * Jby;
    if (abs(det) > DET_EPS) {
      float du = (F.x * Jcy - F.y * Jcx) / det;
      float dv = (Jbx * F.y - Jby * F.x) / det;
      u -= du;
      v -= dv;
    }
  }

  vec2 Ffinal = p00 + b * u + c * v + d * u * v - target;
  float err = length(Ffinal);
  if (u >= -UV_SLACK && u <= 1.0 + UV_SLACK &&
      v >= -UV_SLACK && v <= 1.0 + UV_SLACK &&
      err < RESIDUAL_EPS) {
    return vec3(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 1.0);
  }
  return vec3(0.0, 0.0, 0.0);
}

void main() {
  vec2 target = vUV;
  bool found = false;
  vec2 uv = vec2(0.0);
  float foundCol = 0.0;
  float foundRow = 0.0;

  float estCol = clamp(floor(target.x * float(N - 1)), 0.0, float(N - 2));
  float estRow = clamp(floor(target.y * float(N - 1)), 0.0, float(N - 2));
  vec3 fast = solveCell(estCol, estRow, target);
  if (fast.z > 0.5) {
    found = true;
    uv = fast.xy;
    foundCol = estCol;
    foundRow = estRow;
  }

  if (!found) {
    for (int idx = 0; idx < NUM_CELLS; idx++) {
      float row = floor(float(idx) / float(N - 1) + 0.0001);
      float col = float(idx) - row * float(N - 1);
      if (abs(col - estCol) < 0.5 && abs(row - estRow) < 0.5) continue;
      vec3 r = solveCell(col, row, target);
      if (r.z > 0.5) {
        found = true;
        uv = r.xy;
        foundCol = col;
        foundRow = row;
        break;
      }
    }
  }

  if (!found) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float sourceX = (foundCol + uv.x) / float(N - 1);
  float sourceY = (foundRow + uv.y) / float(N - 1);

  if (uShowTestPattern > 0.5) {
    // Grelha de teste gerada no shader, passa pela MESMA deformação —
    // serve para calibrar visualmente os pontos de controlo.
    float divisionsX = 16.0;
    float divisionsY = max(2.0, floor(divisionsX / uAspect + 0.5));
    float gx = sourceX * divisionsX;
    float gy = sourceY * divisionsY;
    float checker = mod(floor(gx) + floor(gy), 2.0);
    vec3 darkA = vec3(0.10, 0.11, 0.13);
    vec3 darkB = vec3(0.17, 0.19, 0.22);
    vec3 base = mix(darkA, darkB, checker);
    float fx = fract(gx);
    float fy = fract(gy);
    float distX = min(fx, 1.0 - fx);
    float distY = min(fy, 1.0 - fy);
    float lineW = 0.035;
    float lineMask = 1.0 - smoothstep(0.0, lineW, min(distX, distY));
    vec3 aqua = vec3(0.55, 0.95, 0.9);
    vec3 color = mix(base, aqua, lineMask);
    gl_FragColor = vec4(color, 1.0);
  } else {
    // Inversão Y do WebGL: a textura fonte é carregada com
    // UNPACK_FLIP_Y_WEBGL, por isso sourceY (0 = topo) lê-se em (1-sourceY).
    vec2 texCoord = vec2(sourceX, 1.0 - sourceY);
    gl_FragColor = texture2D(uSource, texCoord);
  }
}`;
  }

  function compileShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('warp.js: erro a compilar shader: ' + log);
    }
    return sh;
  }

  function buildProgramForN(nn) {
    const vs = compileShader(gl.VERTEX_SHADER, vertexSrc());
    const fs = compileShader(gl.FRAGMENT_SHADER, fragmentSrc(nn));
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      throw new Error('warp.js: erro a ligar programa: ' + log);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (program) gl.deleteProgram(program);
    program = prog;
    uLoc = {
      aPos: 0,
      uSource: gl.getUniformLocation(program, 'uSource'),
      uPoints: gl.getUniformLocation(program, 'uPoints'),
      uShowTestPattern: gl.getUniformLocation(program, 'uShowTestPattern'),
      uAspect: gl.getUniformLocation(program, 'uAspect'),
    };
  }

  // ---- Textura de dados dos pontos ----

  function uploadPointsTexture() {
    const bytes = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      const x = points[i * 2];
      const y = points[i * 2 + 1];
      const vx = Math.round(clamp01((x - POINT_MIN) / POINT_RANGE) * 65535);
      const vy = Math.round(clamp01((y - POINT_MIN) / POINT_RANGE) * 65535);
      bytes[i * 4 + 0] = (vx >> 8) & 0xff;
      bytes[i * 4 + 1] = vx & 0xff;
      bytes[i * 4 + 2] = (vy >> 8) & 0xff;
      bytes[i * 4 + 3] = vy & 0xff;
    }
    gl.bindTexture(gl.TEXTURE_2D, pointsTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  // ---- API pública ----

  function setGrid(newN) {
    newN = clampN(newN);
    if (newN === n) return;
    const corners = getCorners();
    const next = new Float32Array(newN * newN * 2);
    for (let row = 0; row < newN; row++) {
      const v = newN === 1 ? 0 : row / (newN - 1);
      for (let col = 0; col < newN; col++) {
        const u = newN === 1 ? 0 : col / (newN - 1);
        const p = bilinearCorner(corners, u, v);
        const idx = (row * newN + col) * 2;
        next[idx] = p[0];
        next[idx + 1] = p[1];
      }
    }
    n = newN;
    points = next;
    buildProgramForN(n);
    uploadPointsTexture();
  }

  function getCorners() {
    // topLeft, topRight, bottomLeft, bottomRight (row 0 = topo)
    const tl = [points[0], points[1]];
    const tr = [points[(n - 1) * 2], points[(n - 1) * 2 + 1]];
    const blIdx = (n - 1) * n * 2;
    const bl = [points[blIdx], points[blIdx + 1]];
    const brIdx = ((n - 1) * n + (n - 1)) * 2;
    const br = [points[brIdx], points[brIdx + 1]];
    return { tl, tr, bl, br };
  }

  function bilinearCorner(corners, u, v) {
    const { tl, tr, bl, br } = corners;
    const topX = tl[0] + (tr[0] - tl[0]) * u;
    const topY = tl[1] + (tr[1] - tl[1]) * u;
    const botX = bl[0] + (br[0] - bl[0]) * u;
    const botY = bl[1] + (br[1] - bl[1]) * u;
    return [topX + (botX - topX) * v, topY + (botY - topY) * v];
  }

  function setPoints(flatArray) {
    if (!flatArray || flatArray.length !== n * n * 2) {
      throw new Error(`warp.js: setPoints espera ${n * n * 2} floats para N=${n}`);
    }
    points = Float32Array.from(flatArray);
    uploadPointsTexture();
  }

  function getPoints() {
    return Float32Array.from(points);
  }

  function identity() {
    points = identityPoints(n);
    uploadPointsTexture();
  }

  function isIdentity() {
    const id = identityPoints(n);
    const eps = 1e-6;
    for (let i = 0; i < points.length; i++) {
      if (Math.abs(points[i] - id[i]) > eps) return false;
    }
    return true;
  }

  function showTestPattern(on) {
    showTest = !!on;
  }

  function resize() {
    if (!gl || contextLost) return;
    gl.viewport(0, 0, outputCanvas.width, outputCanvas.height);
  }

  function render(sourceCanvas) {
    if (!gl || contextLost) return;
    if (
      outputCanvas.width !== gl.drawingBufferWidth ||
      outputCanvas.height !== gl.drawingBufferHeight
    ) {
      resize();
    }

    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    if (sourceCanvas) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    }
    gl.uniform1i(uLoc.uSource, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, pointsTex);
    gl.uniform1i(uLoc.uPoints, 1);

    gl.uniform1f(uLoc.uShowTestPattern, showTest ? 1.0 : 0.0);
    gl.uniform1f(
      uLoc.uAspect,
      outputCanvas.width / Math.max(1, outputCanvas.height)
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.viewport(0, 0, outputCanvas.width, outputCanvas.height);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return {
    setGrid,
    setPoints,
    getPoints,
    identity,
    render,
    showTestPattern,
    resize,
    isIdentity,
  };
}

// ---- Helpers ----

function clampN(v) {
  v = Math.round(v);
  if (!Number.isFinite(v)) return 5;
  return Math.max(2, Math.min(17, v));
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function identityPoints(n) {
  const arr = new Float32Array(n * n * 2);
  for (let row = 0; row < n; row++) {
    const y = n === 1 ? 0 : row / (n - 1);
    for (let col = 0; col < n; col++) {
      const x = n === 1 ? 0 : col / (n - 1);
      const idx = (row * n + col) * 2;
      arr[idx] = x;
      arr[idx + 1] = y;
    }
  }
  return arr;
}
