#!/usr/bin/env bash
# Copies the pi-bridge and web-app sources into the pi-gen stage so the
# image build can compile them inside the arm64 chroot. Run before
# build.sh / CI build.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------- pi-bridge ----------
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

# ---------- web-app (Next.js standalone, served from the Pi) ----------
WEB_SRC="${REPO_ROOT}/apps/web"
WEB_DEST="${SCRIPT_DIR}/stage-pos/03-pos-web/files/web-src"

if [ ! -f "${WEB_SRC}/package.json" ]; then
  echo "web source not found at ${WEB_SRC}" >&2
  exit 1
fi

rm -rf "${WEB_DEST}"
mkdir -p "${WEB_DEST}/apps/web" "${WEB_DEST}/apps/pi-bridge" "${WEB_DEST}/packages"

# Workspace skeleton: pnpm needs the root manifest + lockfile + every
# importer's package.json present or --frozen-lockfile bails out.
cp "${REPO_ROOT}/package.json" "${REPO_ROOT}/pnpm-lock.yaml" \
   "${REPO_ROOT}/pnpm-workspace.yaml" "${REPO_ROOT}/tsconfig.base.json" \
   "${WEB_DEST}/"
cp "${SRC}/package.json" "${WEB_DEST}/apps/pi-bridge/package.json"
cp -r "${REPO_ROOT}/packages/shared" "${WEB_DEST}/packages/shared"
rm -rf "${WEB_DEST}/packages/shared/node_modules"

# apps/web: everything the build needs, nothing it doesn't (node_modules,
# build output, test suites).
(
  cd "${WEB_SRC}"
  for entry in *; do
    case "${entry}" in
      node_modules|.next|e2e|tests|test-results|playwright-report|tsconfig.tsbuildinfo)
        continue ;;
    esac
    cp -r "${entry}" "${WEB_DEST}/apps/web/${entry}"
  done
)
# Workbox emits sw.js + precache manifests into public/ on every dev/prod
# build of the host checkout — never ship a stale one; the in-chroot build
# regenerates them.
rm -f "${WEB_DEST}/apps/web/public/sw.js" \
      "${WEB_DEST}/apps/web/public/sw.js.map" \
      "${WEB_DEST}/apps/web/public/workbox-"*.js \
      "${WEB_DEST}/apps/web/public/workbox-"*.js.map 2>/dev/null || true

echo "Staged web source -> ${WEB_DEST}"
