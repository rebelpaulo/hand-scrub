// Filtro One Euro (Casiez, Roussel e Vogel, 2012) para pontos do tracking.
// Parado, corta o tremor (frequência de corte baixa); em movimento rápido
// abre o corte e deixa de haver atraso. Um filtro por coordenada.
//
//   const fx = oneEuro(), fy = oneEuro();
//   x = fx(xCru, segundos); y = fy(yCru, segundos);
//
// minCutoff (Hz): mais baixo = mais firme parado. beta: mais alto = menos
// atraso em movimento. Os valores por omissão são para coordenadas em píxeis.
export function oneEuro({ minCutoff = 1, beta = .004, dCutoff = 1 } = {}) {
  let x, dx = 0, last;
  const alpha = (cutoff, dt) => { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); };
  const filter = (value, t) => {
    if (last === undefined || t <= last) { x = value; dx = 0; last = t; return value; }
    const dt = t - last; last = t;
    dx += alpha(dCutoff, dt) * ((value - x) / dt - dx);
    x += alpha(minCutoff + beta * Math.abs(dx), dt) * (value - x);
    return x;
  };
  filter.reset = () => { last = undefined; };
  return filter;
}
