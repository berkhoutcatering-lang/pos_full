#!/bin/bash -e

# Build the Next.js web app (kassa/KDS/CFD/admin) inside the arm64 chroot
# and install the standalone bundle to /opt/pos-web. The Pi serves the
# pages itself — no Vercel, the truck runs without internet.
# prepare-stage.sh must have staged the workspace into files/web-src.

if [ ! -f files/web-src/apps/web/package.json ]; then
	echo "files/web-src is missing — run raspberry-pos-os/prepare-stage.sh first" >&2
	exit 1
fi

rm -rf "${ROOTFS_DIR}/opt/pos-web" "${ROOTFS_DIR}/opt/pos-web-build"
mkdir -p "${ROOTFS_DIR}/opt/pos-web-build"
cp -a files/web-src/. "${ROOTFS_DIR}/opt/pos-web-build/"

on_chroot << EOF
set -e
cd /opt/pos-web-build
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile --filter web...

# NEXT_PUBLIC_* values are inlined into the bundles at build time. We bake
# unique placeholders here; pos-provision.sh substitutes the real values
# from pos.env on every boot, so one image works for any Supabase project.
export POS_PI_BUILD=1
export NEXT_PUBLIC_SUPABASE_URL="https://pos-placeholder-supabase-url.invalid"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="POS_PLACEHOLDER_SUPABASE_ANON_KEY"
export NEXT_TELEMETRY_DISABLED=1
pnpm --filter web build

# Standalone bundle (monorepo layout: server.js under apps/web/) + the
# static assets and public/ (incl. the freshly generated service worker).
mkdir -p /opt/pos-web
cp -a apps/web/.next/standalone/. /opt/pos-web/
mkdir -p /opt/pos-web/apps/web/.next
cp -a apps/web/.next/static /opt/pos-web/apps/web/.next/static
cp -a apps/web/public /opt/pos-web/apps/web/public

cd /
rm -rf /opt/pos-web-build /root/.cache /root/.local/share/pnpm /root/.npm
chown -R root:root /opt/pos-web
test -f /opt/pos-web/apps/web/server.js && echo "pos-web standalone ok"
EOF
