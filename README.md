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
- **Dois modos de controlo**:
  - ✌️ **Abrir/Fechar** (por omissão): a abertura polegar–indicador controla a
    **velocidade** — abrir além do neutro avança (quanto mais aberto, mais
    depressa), fechar recua, ao meio o tempo pára.
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
- **🎵 Música com a outra mão**: fecha o punho e roda-o como um botão de
  volume — sobe e desce a música (Gymnopédie No.1, Kevin MacLeod, CC BY 3.0).
  A mão aberta controla o tempo; o punho controla o som; funcionam em
  simultâneo.
- **Auto-reset**: sem mãos à frente da câmara, o vídeo rebobina lentamente
  para o início do corte (pronto para o próximo visitante).
- **Som**: whoosh sintetizado (WebAudio) proporcional à velocidade da viagem
  no tempo.
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
