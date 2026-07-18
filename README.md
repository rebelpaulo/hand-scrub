# Pinch Scrub — instalação interativa de vídeo por gestos ✋

Controla o tempo de um vídeo com a mão, via webcam:
**abre o polegar + indicador → o vídeo avança · fecha-os → rebobina.**
Um foguetão descola na tua mão; fecha os dedos e ele volta à plataforma.

Demo: https://hand-scrub.vercel.app

## Hand tracking
**Google MediaPipe `HandLandmarker`** (Tasks Vision) — 21 landmarks 3D por mão,
tempo real, 100% no browser (GPU/WASM), carregado por CDN. É o tracker
in-browser mais fiável/rápido e mais recomendado.

## Funcionalidades
- **Vídeo em fullscreen**, preview do hand-tracking numa **janela flutuante
  arrastável** (posição memorizada).
- **Quatro modos de controlo**:
  - ✌️ **Abrir/Fechar** (por omissão): a abertura polegar–indicador **é a
    linha do tempo** — dedos fechados = início do corte, abertos ao máximo =
    fim; abrir e fechar percorre o vídeo, com suavização.
  - 🙏 **Afastar as mãos** (exclusivo da cena 🌊 Moisés): mãos juntas (como
    rezar) = início; à medida que as afastas as águas separam-se, ao juntá-las
    voltam. O modo é forçado ao entrar na cena e restaurado ao sair.
  - 🤏 **Arrastar**: pinch agarra a timeline, arrastar a mão faz scrub
    (como um drag de rato).
  - 📄 **Amassar** (exclusivo da cena 📄 Origami): fecha a mão da timeline —
    de palma aberta a punho cerrado — como se estivesses a amarrotar algo;
    palma aberta = cara intacta (início), punho fechado = cara amassada em
    bola de papel (fim). O modo é forçado ao entrar na cena e restaurado ao sair.
- **Scrub fluido frame-a-frame**: os presets estão re-codificados **all-intra**
  (todos os frames são keyframes, H.264) e servidos localmente — o seek é
  instantâneo em qualquer direção, sem saltos entre keyframes.
- **Biblioteca de cenas** (originais de domínio público, Wikimedia Commons):
  🚀 descolagem de Falcon 9 · ☢️ teste nuclear Baker Shot · 🌹🌼 flores a
  desabrochar em time-lapse · 📄 uma cara a amassar-se progressivamente em
  bola de papel/origami (gesto próprio, ver 📄 Amassar acima) — e **upload
  dos teus vídeos** (múltiplos, locais, nunca saem do browser). Dica: para
  máxima fluidez re-codifica os teus clips com
  `ffmpeg -i in.mp4 -c:v libx264 -x264-params keyint=1 -an out.mp4`.
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

## Correr localmente
A câmara exige `localhost` ou HTTPS. Usa um servidor com suporte de **Range
requests** (o `python3 -m http.server` NÃO tem — o Chrome marca os vídeos como
não-seekable e o scrub fica preso em 0s):

```bash
npx serve -l 8777
# abrir http://localhost:8777
```

## Ficheiros
- `index.html` — a app inteira (self-contained, sem build).
- `media/` — presets re-codificados all-intra (fonte: Wikimedia Commons,
  domínio público).
