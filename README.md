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
  - ✌️ **Abrir/Fechar** (scrollytelling): a abertura polegar–indicador mapeia
    diretamente para a posição no tempo, com suavização.
  - 🤏 **Arrastar**: pinch agarra a timeline, arrastar a mão faz scrub
    (como um drag de rato).
- **Biblioteca de cenas** com presets de domínio público (Wikimedia Commons):
  🚀 descolagem de Falcon 9 · ☢️ teste nuclear Baker Shot · 🌹🌼 flores a
  desabrochar em time-lapse · 🐰 Big Buck Bunny — e **upload dos teus vídeos**
  (múltiplos, locais, nunca saem do browser).
- **Auto-reset**: sem mãos à frente da câmara, o vídeo rebobina lentamente
  para o início (pronto para o próximo visitante).
- **Som**: whoosh sintetizado (WebAudio) proporcional à velocidade da viagem
  no tempo.
- UI esconde-se após 4 s de inatividade · **F** = ecrã inteiro · **Espaço** =
  play/pause.

## Correr localmente
A câmara exige `localhost` ou HTTPS:

```bash
python3 -m http.server 8777
# abrir http://localhost:8777
```

## Ficheiros
- `index.html` — a app inteira (self-contained, sem build).
