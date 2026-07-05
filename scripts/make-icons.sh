#!/usr/bin/env bash
#
# Génère build/icon.icns (macOS) et build/icon.ico (Windows) à partir de
# build/icon.png. À exécuter localement (utilise iconutil sur macOS et,
# si disponible, ImageMagick pour l'ICO).
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SRC="$ROOT/build/icon.png"
OUT_ICNS="$ROOT/build/icon.icns"
OUT_ICO="$ROOT/build/icon.ico"

if [ ! -f "$SRC" ]; then
  echo "Fichier introuvable : $SRC" >&2
  exit 1
fi

# ----- icon.icns (macOS) -----
if command -v iconutil >/dev/null 2>&1 && command -v sips >/dev/null 2>&1; then
  TMP="$(mktemp -d)/icon.iconset"
  mkdir -p "$TMP"
  for size in 16 32 64 128 256 512 1024; do
    sips -z $size $size "$SRC" --out "$TMP/icon_${size}x${size}.png" >/dev/null
    if [ "$size" != "1024" ]; then
      double=$((size * 2))
      sips -z $double $double "$SRC" --out "$TMP/icon_${size}x${size}@2x.png" >/dev/null
    fi
  done
  iconutil -c icns "$TMP" -o "$OUT_ICNS"
  echo "OK  $OUT_ICNS"
else
  echo "iconutil/sips indisponibles — icon.icns non regénéré (macOS requis)." >&2
fi

# ----- icon.ico (Windows) -----
if command -v magick >/dev/null 2>&1; then
  magick "$SRC" -define icon:auto-resize=16,24,32,48,64,128,256 "$OUT_ICO"
  echo "OK  $OUT_ICO"
elif command -v convert >/dev/null 2>&1; then
  convert "$SRC" -define icon:auto-resize=16,24,32,48,64,128,256 "$OUT_ICO"
  echo "OK  $OUT_ICO"
else
  echo "ImageMagick indisponible — icon.ico non regénéré." >&2
  echo "Installez ImageMagick (brew install imagemagick) puis relancez ce script." >&2
fi
