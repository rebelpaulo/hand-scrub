#!/bin/sh
set -eu
cd "$(dirname "$0")"
dest=vendor
mkdir -p "$dest/wasm"
rm -f "$dest/.ready"

download() {
  target="$dest/$2"
  curl --fail --location --silent --show-error --retry 2 "$1" -o "$target.part"
  mv "$target.part" "$target"
}

vision=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14
models=https://storage.googleapis.com/mediapipe-models

download "$vision/vision_bundle.mjs" vision_bundle.mjs
for variant in vision_wasm_internal vision_wasm_nosimd_internal; do
  for extension in js wasm; do
    download "$vision/wasm/$variant.$extension" "wasm/$variant.$extension"
  done
done
download "$models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" hand_landmarker.task
download "$models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" pose_landmarker_lite.task
download "$models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" blaze_face_short_range.tflite
download "$models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite" selfie_multiclass_256x256.tflite
download 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js' three.module.js
touch "$dest/.ready"
printf '%s\n' 'Modelos locais prontos. Inicia ou reinicia o servidor Palco de Luz.'
