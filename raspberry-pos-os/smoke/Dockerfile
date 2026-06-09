# Smoke test: replays the exact in-chroot build steps of the image
# (Debian bookworm + NodeSource 22 + native module compile) so we can
# validate them quickly on amd64 without a full qemu image build.
#
#   ./raspberry-pos-os/prepare-stage.sh
#   docker build -f raspberry-pos-os/smoke/Dockerfile \
#     raspberry-pos-os/stage-pos/02-pi-bridge/files
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates build-essential python3 libavahi-compat-libdnssd-dev \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

COPY pi-bridge-src /opt/pi-bridge
WORKDIR /opt/pi-bridge

RUN npm install --omit=optional --no-audit --no-fund \
  && npx tsc \
  && npm prune --omit=dev \
  && node -e "import('better-sqlite3').then(() => console.log('better-sqlite3 ok'))" \
  && node -e "import('@electric-sql/pglite').then(() => console.log('pglite ok'))" \
  && test -f dist/index.js && echo "dist ok"
