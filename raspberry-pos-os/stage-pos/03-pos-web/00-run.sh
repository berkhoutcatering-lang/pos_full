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
#
# Altijd de INHOUD kopieren (trailing /.), nooit de map zelf: de standalone
# output bevat zelf al een apps/web/public (Next traceert o.a. manifest.json
# uit de metadata). `cp -a public <bestaande map>` legt de bron er dan IN,
# en dan serveert Next /public/logo.png i.p.v. /logo.png — het logo is overal
# stuk terwijl de build "geslaagd" meldt.
mkdir -p /opt/pos-web
cp -a apps/web/.next/standalone/. /opt/pos-web/
mkdir -p /opt/pos-web/apps/web/.next/static /opt/pos-web/apps/web/public
cp -a apps/web/.next/static/. /opt/pos-web/apps/web/.next/static/
cp -a apps/web/public/. /opt/pos-web/apps/web/public/

cd /
rm -rf /opt/pos-web-build /root/.cache /root/.local/share/pnpm /root/.npm
chown -R root:root /opt/pos-web
test -f /opt/pos-web/apps/web/server.js || { echo "pos-web standalone ontbreekt" >&2; exit 1; }
# Assets die de app zelf opvraagt moeten op de WORTEL van public staan. Een
# geneste of half gekopieerde public levert een app op die het doet maar er
# kapot uitziet — dat hoort de build te weigeren, niet de kassa. Geen shell-
# variabelen hier: deze heredoc is niet gequote, dus die zou de host invullen.
test ! -d /opt/pos-web/apps/web/public/public || { echo "pos-web: public is genest (public/public)" >&2; exit 1; }
test -f /opt/pos-web/apps/web/public/logo.png || { echo "pos-web: public/logo.png ontbreekt" >&2; exit 1; }
test -f /opt/pos-web/apps/web/public/manifest.json || { echo "pos-web: public/manifest.json ontbreekt" >&2; exit 1; }
test -f /opt/pos-web/apps/web/public/icon-192.png || { echo "pos-web: public/icon-192.png ontbreekt" >&2; exit 1; }
test -f /opt/pos-web/apps/web/public/icon-512.png || { echo "pos-web: public/icon-512.png ontbreekt" >&2; exit 1; }
test -f /opt/pos-web/apps/web/public/apple-touch-icon.png || { echo "pos-web: public/apple-touch-icon.png ontbreekt" >&2; exit 1; }
echo "pos-web standalone ok"
EOF
