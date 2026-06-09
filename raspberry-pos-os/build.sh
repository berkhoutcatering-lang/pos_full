#!/usr/bin/env bash
# Builds the flashable Hop & Bites POS OS image with pi-gen inside Docker.
#
# Requirements: Docker with arm64 binfmt emulation (Docker Desktop has this
# out of the box; on plain Linux: `docker run --privileged --rm tonistiigi/binfmt --install arm64`).
# Run from WSL2/Linux/macOS, or Git Bash (handled via MSYS_NO_PATHCONV).
#
#   ./build.sh                      # full build -> deploy/hopbites-pos-os-*.img.xz
#   POS_OS_PASSWORD=geheim ./build.sh
#   CONTINUE=1 ./build.sh           # resume a previously failed build
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_GEN_DIR="${SCRIPT_DIR}/.pi-gen"
PI_GEN_REPO="https://github.com/RPi-Distro/pi-gen.git"
# Pinned to the pi-gen tag of an official Bookworm arm64 release, so the
# stage0 keyrings match the target RELEASE (arm64 HEAD targets trixie and
# fails apt signature checks for bookworm).
PI_GEN_REF="2025-11-24-raspios-bookworm-arm64"

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
command -v git >/dev/null || { echo "git is required" >&2; exit 1; }

case "$(uname -s)" in
  MINGW*|MSYS*)
    echo "Git Bash kan geen Docker-buildcontext op /c/... aanleveren." >&2
    echo "Draai dit script vanuit WSL2 (Ubuntu), bijv.:" >&2
    echo "  wsl -d Ubuntu -- bash ${BASH_SOURCE[0]}" >&2
    exit 1
    ;;
esac

STAGED_SRC="${SCRIPT_DIR}/stage-pos/02-pi-bridge/files/pi-bridge-src"
if [ -f "${SCRIPT_DIR}/../apps/pi-bridge/package.json" ]; then
  "${SCRIPT_DIR}/prepare-stage.sh"
elif [ -f "${STAGED_SRC}/package.json" ]; then
  echo "Monorepo niet gevonden — gebruik eerder gestagede pi-bridge source."
else
  echo "Geen pi-bridge source: draai eerst prepare-stage.sh vanuit de repo." >&2
  exit 1
fi

if [ "$(git -C "${PI_GEN_DIR}" describe --tags 2>/dev/null)" != "${PI_GEN_REF}" ]; then
  rm -rf "${PI_GEN_DIR}"
  git clone --depth 1 --branch "${PI_GEN_REF}" "${PI_GEN_REPO}" "${PI_GEN_DIR}"
fi

# Our stage must live inside the pi-gen dir: build-docker.sh only mounts that
# directory into the build container.
rm -rf "${PI_GEN_DIR}/stage-pos"
cp -r "${SCRIPT_DIR}/stage-pos" "${PI_GEN_DIR}/stage-pos"
# pi-gen silently SKIPS prerun.sh and *-run.sh that are not executable, which
# breaks the build later with "Unable to chroot" — never rely on checkout modes.
find "${PI_GEN_DIR}/stage-pos" -type f -name '*.sh' -exec chmod +x {} +

# Export only our image, not the intermediate lite image.
touch "${PI_GEN_DIR}/stage2/SKIP_IMAGES"

# Render the config on the host: the container that sources it does not
# inherit our environment, so ${POS_OS_PASSWORD} must be resolved here.
sed "s|^FIRST_USER_PASS=.*|FIRST_USER_PASS=\"${POS_OS_PASSWORD:-hopbites2026}\"|" \
  "${SCRIPT_DIR}/config.template" > "${PI_GEN_DIR}/config"

cd "${PI_GEN_DIR}"
# MSYS_NO_PATHCONV: keep Git Bash from mangling container paths on Windows.
MSYS_NO_PATHCONV=1 POS_OS_PASSWORD="${POS_OS_PASSWORD:-}" CONTINUE="${CONTINUE:-0}" \
  ./build-docker.sh

mkdir -p "${SCRIPT_DIR}/deploy"
cp -f "${PI_GEN_DIR}/deploy/"*.img.xz "${SCRIPT_DIR}/deploy/" 2>/dev/null || true
cp -f "${PI_GEN_DIR}/deploy/"*.info "${SCRIPT_DIR}/deploy/" 2>/dev/null || true

echo
echo "Done. Image(s) in ${SCRIPT_DIR}/deploy/:"
ls -lh "${SCRIPT_DIR}/deploy/" || true
