// Sala de Sombras: a máscara de pessoa vem ao contrário?
// corners: fração de "pessoa" (0..1) em cada um dos 4 cantos; bottom: no centro
// em baixo. true = invertida, false = normal, null = sem prova.
// Uma pessoa a tapar um canto (ou os dois de baixo) não chega: pede 3 cantos
// cheios com o centro vazio, forma que ninguém faz à frente da câmara.
export function polarityVote(corners, bottom) {
  const dense = corners.filter(d => d > .8).length, sparse = corners.filter(d => d < .2).length;
  if (dense >= 3 && bottom < .5) return true;
  if (sparse >= 3 && bottom > .5) return false;
  return null;
}

// Só troca ao fim de `need` votos contrários seguidos.
export function polarityGate(need = 4) {
  let state = false, streak = 0;
  return vote => {
    streak = vote === !state ? streak + 1 : 0;
    if (streak >= need) { state = vote; streak = 0; }
    return state;
  };
}
