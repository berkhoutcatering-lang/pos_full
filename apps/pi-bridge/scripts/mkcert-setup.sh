#!/usr/bin/env bash
# Local-dev TLS for the Pi-bridge.
#
# Generates a cert valid for hopbites.local + *.hopbites.local + localhost
# using mkcert (https://github.com/FiloSottile/mkcert). Tablets that connect
# to https://hopbites.local will trust this cert after installing the mkcert
# root CA in their OS trust store.
#
# Dev only. In prod use Let's Encrypt via DNS-01 or a self-signed cert with
# fingerprint pinning in the PWA service worker — see references/pi-setup.md.

set -euo pipefail

CERT_DIR="${CERT_DIR:-./.tls}"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert not installed. macOS: brew install mkcert; Linux: see https://github.com/FiloSottile/mkcert#installation"
  exit 1
fi

mkdir -p "$CERT_DIR"
mkcert -install

mkcert -cert-file "$CERT_DIR/cert.pem" -key-file "$CERT_DIR/key.pem" \
  hopbites.local "*.hopbites.local" localhost 127.0.0.1

echo
echo "Cert + key written to $CERT_DIR/"
echo "Mount these in docker-compose.dev.yml or set:"
echo "  TLS_CERT_PATH=$CERT_DIR/cert.pem"
echo "  TLS_KEY_PATH=$CERT_DIR/key.pem"
echo
echo "For tablets (iPad): AirDrop \"\$(mkcert -CAROOT)/rootCA.pem\" to the device,"
echo "then Settings -> General -> VPN & Device Management -> install the profile,"
echo "then Settings -> General -> About -> Certificate Trust Settings -> enable."
