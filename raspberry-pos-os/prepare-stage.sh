#!/usr/bin/env bash
# Copies the pi-bridge app source into the pi-gen stage so the image build
# can compile it inside the arm64 chroot. Run before build.sh / CI build.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC="${REPO_ROOT}/apps/pi-bridge"
DEST="${SCRIPT_DIR}/stage-pos/02-pi-bridge/files/pi-bridge-src"

if [ ! -f "${SRC}/package.json" ]; then
  echo "pi-bridge source not found at ${SRC}" >&2
  exit 1
fi

rm -rf "${DEST}"
mkdir -p "${DEST}"

# Only what the in-chroot build needs: sources + tsconfig + package.json.
cp "${SRC}/package.json" "${SRC}/tsconfig.json" "${DEST}/"
cp -r "${SRC}/src" "${DEST}/src"

echo "Staged pi-bridge source -> ${DEST}"
