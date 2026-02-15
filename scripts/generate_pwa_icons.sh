#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT_DIR}/assets/icon-source.png"
OUT_DIR="${ROOT_DIR}/assets/icons"

if [[ ! -f "${SRC}" ]]; then
  echo "Missing ${SRC}"
  echo "Save the app icon image there (PNG, ideally 1024x1024), then re-run:"
  echo "  ${0}"
  exit 1
fi

mkdir -p "${OUT_DIR}"

# Copy + resize using macOS sips.
cp -f "${SRC}" "${OUT_DIR}/icon-512.png"
sips -Z 512 "${OUT_DIR}/icon-512.png" >/dev/null

cp -f "${SRC}" "${OUT_DIR}/icon-192.png"
sips -Z 192 "${OUT_DIR}/icon-192.png" >/dev/null

cp -f "${SRC}" "${OUT_DIR}/apple-touch-icon.png"
sips -Z 180 "${OUT_DIR}/apple-touch-icon.png" >/dev/null

# Maskable icon: we keep it identical to the 512. If you want true mask-safe padding,
# provide a padded source image.
cp -f "${OUT_DIR}/icon-512.png" "${OUT_DIR}/icon-512-maskable.png"

echo "Wrote:"
echo "  ${OUT_DIR}/icon-192.png"
echo "  ${OUT_DIR}/icon-512.png"
echo "  ${OUT_DIR}/icon-512-maskable.png"
echo "  ${OUT_DIR}/apple-touch-icon.png"

