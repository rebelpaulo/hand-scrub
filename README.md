# hand-scrub — instalação interativa por gestos ✋

Instalação de vídeo/música controlada por gestos, 100% no browser (webcam +
MediaPipe, sem build, sem backend). A raiz do site é uma **landing page** onde
o visitante escolhe entre duas experiências, apontando com o dedo e
confirmando com um 👍.

Demo: https://hand-scrub.vercel.app

## Estrutura

- **`index.html`** — landing page. Cursor controlado pela mão (indicador =
  ponteiro) + confirmação por gesto de 👍 sustentado; clique de rato também
  funciona. Duas escolhas:
  - 🦋 **BUTTERFLY EFFECT** → `butterfly.html`
  - 🎼 **HANDESTRO** → `handestro.html`
- **`butterfly.html`** — a experiência original de scrub de vídeo por
  gestos (antigo `index.html`; todas as secções abaixo aplicam-se a ela).
- **`handestro.html`** — modo musical: 4 instrumentos controlados por
  gestos (Banda Sonora que segue o gesto, Modo Maestro, Harpa de Ar,
  Percussão por swipe), usando Tone.js.
- **`media/`** — presets de vídeo re-codificados all-intra (fonte: Wikimedia
  Commons, domínio público) + música de fundo.

## Landing (`index.html`)

- **Cursor por mão**: ponta do indicador (landmark 8 da primeira mão
  detetada) mapeada para o ecrã com espelhamento em X (a câmara é
  selfie-facing) e suavização EMA (fator ≈0.35). Um ponto luminoso mostra a
  posição rastreada.
- **Hover**: passar o cursor sobre um botão realça-o (leve ampliação + borda
  de destaque).
- **Confirmação por 👍**: polegar esticado para cima + restantes dedos
  enrolados junto ao pulso, com debounce de ~150 ms contra jitter. Segurar o
  gesto sobre um botão enche um anel de progresso circular em ~700 ms; ao
  completar, navega para a página. Sair do botão ou largar o gesto reinicia
  o anel. Cooldown de 1 s depois de qualquer ativação.
- **Rato sempre funciona** como alternativa — clique simples em qualquer
  botão navega.
- Câmara arranca automaticamente ao carregar a página (não precisa de
  clique). Se a permissão for negada ou o MediaPipe falhar a carregar,
  aparece um aviso discreto ("câmara indisponível — usa o rato") e a
  navegação por rato continua a funcionar.
- Pequeno preview da câmara (PiP, canto inferior direito, espelhado) com o
  landmark do indicador desenhado, para o visitante ver que está a ser
  seguido.

## Butterfly Effect (`butterfly.html`)

Controla o tempo de um vídeo com a mão, via webcam:
**abre o polegar + indicador → o vídeo avança · fecha-os → rebobina.**
Um foguetão descola na tua mão; fecha os dedos e ele volta à plataforma.

### Hand tracking
**Google MediaPipe `HandLandmarker`** (Tasks Vision) — 21 landmarks 3D por mão,
tempo real, 100% no browser (GPU/WASM), carregado por CDN. É o tracker
in-browser mais fiável/rápido e mais recomendado.

### Funcionalidades
- **Vídeo em fullscreen**, preview do hand-tracking numa **janela flutuante
  arrastável** (posição memorizada).
- **Dois modos de controlo**:
  - ✌️ **Abrir/Fechar** (por omissão): a abertura polegar–indicador **é a
    linha do tempo** — dedos fechados = início do corte, abertos ao máximo =
    fim; abrir e fechar percorre o vídeo, com suavização.
  - 🙏 **Afastar as mãos** (exclusivo da cena 🌊 Moisés): mãos juntas (como
    rezar) = início; à medida que as afastas as águas separam-se, ao juntá-las
    voltam. O modo é forçado ao entrar na cena e restaurado ao sair.
  - 🤏 **Arrastar**: pinch agarra a timeline, arrastar a mão faz scrub
    (como um drag de rato).
- **Scrub fluido frame-a-frame**: os presets estão re-codificados **all-intra**
  (todos os frames são keyframes, H.264) e servidos localmente — o seek é
  instantâneo em qualquer direção, sem saltos entre keyframes.
- **Biblioteca de cenas** (originais de domínio público, Wikimedia Commons):
  🚀 descolagem de Falcon 9 · ☢️ teste nuclear Baker Shot · 🌹🌼 flores a
  desabrochar em time-lapse — e **upload dos teus vídeos** (múltiplos, locais,
  nunca saem do browser). Dica: para máxima fluidez re-codifica os teus clips
  com `ffmpeg -i in.mp4 -c:v libx264 -x264-params keyint=1 -an out.mp4`.
- **✂️ Trim por cena**: define início/fim (ex.: só dos 4s aos 8s) com pegas
  arrastáveis e preview em direto; o gesto, o play e o auto-reset ficam
  confinados ao intervalo. Guardado por cena.
- **Papéis fixos por mão** (handedness): a mão direita controla o tempo, a
  esquerda o som — troca nas definições ("Trocar mãos").
- **🎵 Música na mão do som**: punho fechado roda como um botão de volume
  (Gymnopédie No.1, Kevin MacLeod, CC BY 3.0). Tempo e som funcionam em
  simultâneo.
- **Swipe na mão do som**: varre a mão (não fechada) de um lado ao outro —
  ≥22% do ecrã em ≤450ms, claramente na horizontal — e troca de vídeo
  (próximo/anterior). Sem exigência de pose: funciona mesmo com o motion
  blur do movimento. A mão do tempo fica 100% dedicada à timeline.
- **☁️ Persistência na cloud (Supabase)**: os cortes e a cena ativa gravam-se
  na tabela `hand_config` (projeto ROTDUBAY) — abre a app noutro dispositivo
  e o setup vem da cloud (prioridade: link `#cfg` > cloud > localStorage).
- **Auto-reset**: sem mãos à frente da câmara, o vídeo rebobina lentamente
  para o início do corte (pronto para o próximo visitante).
- Links antigos com `#cfg=` continuam a ser honrados ao abrir (têm
  prioridade sobre a cloud), mas o botão de partilha foi removido — a
  base de dados já sincroniza o setup entre dispositivos.
- UI esconde-se após 4 s de inatividade · **F** = ecrã inteiro · **Espaço** =
  play/pause.

## Handestro (`handestro.html`)

Modo musical com 4 instrumentos controlados por gestos (Tone.js):
- **Banda Sonora** — a música segue o gesto da mão.
- **Modo Maestro** — reges a orquestra com os movimentos.
- **Harpa de Ar** — "tocas" cordas invisíveis no ar.
- **Percussão por swipe** — bate percussão ao varrer a mão.

## Correr localmente
A câmara exige `localhost` ou HTTPS. Usa um servidor com suporte de **Range
requests** (o `python3 -m http.server` NÃO tem — o Chrome marca os vídeos como
não-seekable e o scrub fica preso em 0s):

```bash
npx serve -l 8777
# abrir http://localhost:8777
```

## Ficheiros
- `index.html` — landing page (escolha entre experiências, self-contained).
- `butterfly.html` — experiência original de scrub de vídeo por gestos
  (self-contained, sem build).
- `handestro.html` — modo musical de 4 instrumentos (self-contained).
- `media/` — presets re-codificados all-intra + música de fundo (fonte:
  Wikimedia Commons, domínio público).
