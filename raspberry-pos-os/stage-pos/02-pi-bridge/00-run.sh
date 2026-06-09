#!/bin/bash -e

# Build the pi-bridge service inside the arm64 chroot so native modules
# (better-sqlite3, mdns) end up as arm64 binaries.
# prepare-stage.sh must have staged the source into files/pi-bridge-src.

if [ ! -f files/pi-bridge-src/package.json ]; then
	echo "files/pi-bridge-src is missing — run raspberry-pos-os/prepare-stage.sh first" >&2
	exit 1
fi

rm -rf "${ROOTFS_DIR}/opt/pi-bridge"
mkdir -p "${ROOTFS_DIR}/opt/pi-bridge"
cp -a files/pi-bridge-src/. "${ROOTFS_DIR}/opt/pi-bridge/"

on_chroot << EOF
set -e
cd /opt/pi-bridge
npm install --omit=optional --no-audit --no-fund
npx tsc
npm prune --omit=dev
rm -rf src tsconfig.json /root/.npm
chown -R root:root /opt/pi-bridge
node -e "import('better-sqlite3').then(() => console.log('better-sqlite3 ok'))"
EOF
