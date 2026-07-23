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
- `index.html` — a **home** da instalação: ecrã de atração (attract) com o
  nome da experiência a rodar + mão fantasma, seguido do seletor de 4
  cartões (🦋 Butterfly Effect · 🌑 Sala de Sombras · ✍️ Pinch Draw ·
  🌬️ Enxame). Toca, clica, tecla ou aproxima a mão para passar do attract
  ao seletor; os cartões respondem a clique, hover-dwell do rato e dwell
  por gesto (👍 700ms).
- `scrub.html` — 🦋 Butterfly Effect, a app original (self-contained, sem
  build): controla o tempo do vídeo com a mão.
- `shadow.html` — 🌑 Sala de Sombras (beta): a sombra do corpo projetada
  numa sala 3D.
- `draw.html` — ✍️ Pinch Draw: pintura de luz no ar com o gesto de pinch.
- `enxame.html` — 🌬️ Enxame: milhares (12000, 3000 no mínimo) de partículas
  brancas orbitam num **cilindro que enche o ecrã todo**, à volta do eixo
  vertical da cabeça (MediaPipe `FaceDetector` localiza a cabeça, a cada 3ª
  frame). O raio de cada partícula vai de `head.r×1.15` até à distância ao
  canto mais afastado do ecrã (`×1.05`), com densidade **areal** (`r =
  sqrt(lerp(rMin², rMax², seed))`) para encher o ecrã de forma uniforme em
  vez de se amontoar junto à cabeça; a altura (`hOff`) também é relativa ao
  ecrã (`±0.48×H`). Todas giram sempre no **mesmo sentido entre si**
  (velocidade angular base sempre positiva, banda 0.35–0.6 rad/s) mas o
  sentido GLOBAL do tornado (`tornadoSign`, ±1) é decidido pela **mão que
  inicia o pinch** — direita ou esquerda, ver `HAND_SWIRL` — e persiste depois
  de largar: o tornado continua a girar nesse sentido até outra mão apertar de
  novo. Com `tornadoSign=+1` o lado de trás do cilindro (`sin(theta)<0`)
  desloca-se da **esquerda para a direita** atrás da cabeça; com `-1` inverte.
  A profundidade (`z=sin(theta)`) não depende do sinal — mas com um perfil de
  **tornado**: a velocidade angular efetiva sobe perto do eixo da cabeça e cai
  para a periferia
  (`baseSpeed·(rRef/max(r,rRef))^0.6`, `rRef = head.r×2`), pelo que os anéis
  interiores giram visivelmente mais depressa do que os exteriores, como um
  vórtice, não uma deriva plana. Essa profundidade faz as
  partículas do lado de trás passarem **atrás da cabeça/corpo** — agora com
  **oclusão pixel-a-pixel**: MediaPipe `ImageSegmenter`
  (`selfie_multiclass_256x256`, a cada 2ª frame trackeada) segmenta a pessoa
  (categoria 0 = fundo, qualquer outra = pessoa), a máscara é pintada num
  canvas offscreen à resolução nativa e apagada no palco através da MESMA
  transformação "cover" (espelho + escala + recortes) usada para mãos/cara —
  a máscara recorta exatamente a silhueta visível, já não uma elipse
  aproximada; a tecla **`o`** tinge essa máscara de vermelho durante 3s para
  conferir o alinhamento. O rasto de cada partícula agora estica-se
  proporcionalmente à velocidade (`kTrail≈0.06s`, entre 4px e 70px) — parada
  fica um pontinho, a espiralar para um pinch ou lançada na largada vira um
  feixe de luz "quase warp". Aperta o polegar e o indicador
  (`HandLandmarker`, em qualquer das mãos) para as atrair com **física real**
  em vez de uma reta: gravidade + espiral (`F = G/(d+40)^1.5` radial mais uma
  componente tangencial `swirlK×|F|`, com a quiralidade do `tornadoSign`
  global — o remoinho do pinch gira sempre no mesmo sentido do tornado) faz as
  partículas curvarem para dentro e **orbitar** o dedo em vez de colapsarem
  num ponto (velocidade capada a ~1400px/s, atrito 0.985 que preserva o
  momento angular do giro). Com as **duas mãos em pinch**, o enxame estica-se
  numa **banda viva** entre os dois pinches: cada partícula tem uma posição
  estável (`bandT∈[0,1]`, atribuída no spawn) ao longo do segmento entre as
  mãos, com um pequeno deslocamento lateral estável (±`head.r×0.15`) que dá
  espessura à banda; larga uma mão e volta ao comportamento de pinch único
  em direção à que resta. **Largada honesta, sem teleporte**: ao largar, cada
  partícula recupera o seu ângulo a partir da posição onde ficou (já com a
  inércia tangencial da espiral projetada no sentido do `tornadoSign`, que
  alimenta bem a rotação de regresso) e **adota essa mesma posição** como o
  seu raio/altura de órbita (`rOverridePx`/`hOverridePx`) — nada de cluster
  nem de salto. Esses valores relaxam exponencialmente (constante de tempo de
  8s) de volta ao seu lugar próprio no cilindro, e são descartados quando lá
  chegam (a 5% de distância); uma partícula apanhada a meio do caminho na
  largada quase não se mexe, e o ecrã reenche-se organicamente ao longo de
  ~10–20s — só as que tiveram tempo de lá chegar é que se veem espalhadas.
  **Arremesso**: se a **palma** (ponto médio pulso↔base do dedo médio, não o
  ponto de pinch) estiver a mover-se rápido (≥350px/s) no instante em que
  larga o pinch — e o pinch tiver durado pelo menos 200ms —, o enxame é
  atirado nessa direção — cada partícula ganha velocidade da mão mais um
  espalhamento em cone que abre mais quanto mais rápido o gesto, voa livre
  por ~0,7s e só depois aterra e derrete de volta no tornado a partir de onde
  ficou; uma largada lenta, ou um pinch demasiado curto, continuam a
  comportar-se como antes (sem arremesso). Rastrear a velocidade na palma em
  vez do ponto de pinch evita um "arremesso fantasma" quando só se abrem os
  dedos com a mão parada; um pequeno atraso (120ms) a ativar o pinch e a
  exigência dos 200ms filtram falsos pinches causados por ruído da câmara
  durante um movimento rápido da mão.
- `media/` — presets re-codificados all-intra (fonte: Wikimedia Commons,
  domínio público).
