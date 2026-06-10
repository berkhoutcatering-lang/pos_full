#!/bin/bash
# End-to-end test of pos-provision.sh inside a throwaway Debian container.
# Mocks the systemd/network tools, feeds a Windows-style (CRLF) pos.env and
# asserts the generated bridge env, web env, TLS chain, AP/dnsmasq config,
# NEXT_PUBLIC placeholder substitution, STATUS.txt and the config-invalid
# marker behaviour.
#
# Run (from raspberry-pos-os/):
#   docker run --rm -v "$PWD/stage-pos/04-pos-system:/work" -v "$PWD/smoke:/smoke" \
#     debian:bookworm-slim bash /smoke/provision-test.sh
set -euo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }

# Debian images ship libssl but not the openssl CLI the provision script uses.
if ! command -v openssl >/dev/null 2>&1; then
  apt-get update -qq >/dev/null && apt-get install -y -qq openssl >/dev/null
fi

export PATH="/usr/local/mockbin:${PATH}"
mkdir -p /usr/local/mockbin
for tool in hostnamectl systemctl nmcli raspi-config rfkill update-ca-certificates; do
  printf '#!/bin/sh\necho "[mock] %s $@" >> /tmp/mock.log\nexit 0\n' "$tool" > "/usr/local/mockbin/$tool"
  chmod +x "/usr/local/mockbin/$tool"
done

groupadd -f posbridge
groupadd -f posweb

mkdir -p /boot/firmware/pos-setup /usr/share/pos /usr/local/share/ca-certificates
cp /work/files/pos.env /usr/share/pos/pos.env.template

# Fake web bundle with baked-in placeholders, like /opt/pos-web in the image.
PH_URL="https://pos-placeholder-supabase-url.invalid"
PH_KEY="POS_PLACEHOLDER_SUPABASE_ANON_KEY"
mkdir -p /opt/pos-web/apps/web/.next/static/chunks
cat > /opt/pos-web/apps/web/.next/static/chunks/main-abc123.js <<EOF
const supabaseUrl="${PH_URL}";const supabaseKey="${PH_KEY}";
EOF
echo "{\"url\":\"${PH_URL}\"}" > /opt/pos-web/apps/web/.next/required-server-files.json

# --- Case 1: valid pos.env with CRLF line endings (edited on Windows) ---
sed -e 's/^ORG_ID=$/ORG_ID=3f6f7bfd-4f0d-407e-b505-7c6ab0c2c879/' \
    -e 's/^VENUE_ID=$/VENUE_ID=11111111-2222-4333-8444-555555555555/' \
    -e 's|^SUPABASE_URL=$|SUPABASE_URL=https://example.supabase.co|' \
    -e 's/^SUPABASE_SERVICE_ROLE_KEY=$/SUPABASE_SERVICE_ROLE_KEY=service-role-key-1234567890/' \
    -e 's/^SUPABASE_ANON_KEY=$/SUPABASE_ANON_KEY=anon-key-12345678901234567890/' \
    -e 's/^AP_SSID=$/AP_SSID=HopBites-POS/' \
    -e 's/^AP_PASS=$/AP_PASS=foodtruck2026/' \
    -e 's|^KIOSK_URL=$|KIOSK_URL=https://hopbites.local/cfd|' \
    /usr/share/pos/pos.env.template \
  | sed 's/$/\r/' > /boot/firmware/pos-setup/pos.env

bash /work/files/pos-provision.sh || fail "provision exited non-zero"

[ -f /run/pos/config-invalid ] && fail "config marked invalid for a valid pos.env"
grep -q '^ORG_ID=3f6f7bfd' /etc/pi-bridge/env || fail "ORG_ID missing from bridge env"
grep -q '^NODE_ENV=production' /etc/pi-bridge/env || fail "NODE_ENV missing"
grep -q '^MYPOS_SESSION_SECRET=unset' /etc/pi-bridge/env || fail "myPOS placeholder missing"
grep -Eq '^PI_BRIDGE_PAIRING_SECRET=[0-9a-f]{64}$' /etc/pi-bridge/env || fail "pairing secret not generated"
grep -q $'\r' /etc/pi-bridge/env && fail "CRLF leaked into bridge env"
grep -q '^ALLOWED_ORIGINS=https://hopbites.local' /etc/pi-bridge/env || fail "local web origin not in ALLOWED_ORIGINS"

# Web env (lokale Next.js app)
grep -q '^NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co$' /etc/pos-web/env || fail "web env: supabase url"
grep -q '^NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key-12345678901234567890$' /etc/pos-web/env || fail "web env: anon key"
grep -q '^PI_BRIDGE_URL=https://127.0.0.1:3001$' /etc/pos-web/env || fail "web env: PI_BRIDGE_URL"
grep -Eq '^POS_AUTH_CACHE_SECRET=[0-9a-f]{64}$' /etc/pos-web/env || fail "web env: auth cache secret"
grep -Eq '^CRON_SECRET=[0-9a-f]{64}$' /etc/pos-web/env || fail "web env: cron secret"
grep -q '^POS_OFFLINE_CACHE_DIR=/var/lib/pos-web$' /etc/pos-web/env || fail "web env: cache dir"

# Placeholder substitution into the web bundle
grep -q 'https://example.supabase.co' /opt/pos-web/apps/web/.next/static/chunks/main-abc123.js \
  || fail "supabase url not substituted into web chunk"
grep -q 'anon-key-12345678901234567890' /opt/pos-web/apps/web/.next/static/chunks/main-abc123.js \
  || fail "anon key not substituted into web chunk"
grep -q "${PH_URL}" /opt/pos-web/apps/web/.next/required-server-files.json \
  && fail "placeholder survived in required-server-files.json"
[ -f /var/lib/pos/web-subst.env ] || fail "web-subst.env not written"

# Access point: NM profile + dnsmasq name mapping
grep -q 'pos-ap' /tmp/mock.log || fail "nmcli AP profile not created"
grep -q 'address=/hopbites.local/10.42.0.1' /etc/NetworkManager/dnsmasq-shared.d/00-pos.conf \
  || fail "dnsmasq AP name mapping missing"
grep -q 'address=/pos.lan/10.42.0.1' /etc/NetworkManager/dnsmasq-shared.d/00-pos.conf \
  || fail "dnsmasq pos.lan mapping missing"

openssl verify -CAfile /etc/pi-bridge/tls/ca.crt /etc/pi-bridge/tls/cert.pem >/dev/null \
  || fail "server cert does not verify against CA"
openssl x509 -in /etc/pi-bridge/tls/cert.pem -noout -ext subjectAltName | grep -q 'hopbites.local' \
  || fail "SAN hopbites.local missing"
openssl x509 -in /etc/pi-bridge/tls/cert.pem -noout -ext subjectAltName | grep -q 'pos.lan' \
  || fail "SAN pos.lan missing"
openssl x509 -in /etc/pi-bridge/tls/cert.pem -noout -ext subjectAltName | grep -q '10.42.0.1' \
  || fail "SAN AP-IP missing"
[ -f /boot/firmware/pos-setup/hopbites-ca.crt ] || fail "CA not exported to boot partition"
[ -f /boot/firmware/pos-setup/STATUS.txt ] || fail "STATUS.txt not written"
grep -q 'Config OK' /boot/firmware/pos-setup/STATUS.txt || fail "STATUS.txt does not report Config OK"
grep -q "Access point: SSID 'HopBites-POS'" /boot/firmware/pos-setup/STATUS.txt || fail "STATUS.txt does not mention AP"
[ -f /etc/pos/kiosk.url ] || fail "kiosk.url not written"

PAIR1=$(grep '^PI_BRIDGE_PAIRING_SECRET=' /etc/pi-bridge/env)
WEBSEC1=$(grep '^POS_AUTH_CACHE_SECRET=' /etc/pos-web/env)

# --- Case 2: re-run is idempotent, secrets stable ---
bash /work/files/pos-provision.sh || fail "second provision run failed"
PAIR2=$(grep '^PI_BRIDGE_PAIRING_SECRET=' /etc/pi-bridge/env)
WEBSEC2=$(grep '^POS_AUTH_CACHE_SECRET=' /etc/pos-web/env)
[ "${PAIR1}" = "${PAIR2}" ] || fail "pairing secret changed between boots"
[ "${WEBSEC1}" = "${WEBSEC2}" ] || fail "web auth cache secret changed between boots"

# --- Case 2b: changing the Supabase project re-substitutes the bundle ---
sed -i 's|SUPABASE_URL=https://example.supabase.co|SUPABASE_URL=https://other.supabase.co|' \
  /boot/firmware/pos-setup/pos.env
bash /work/files/pos-provision.sh || fail "provision failed after supabase url change"
grep -q 'https://other.supabase.co' /opt/pos-web/apps/web/.next/static/chunks/main-abc123.js \
  || fail "changed supabase url not re-substituted"
grep -q 'https://example.supabase.co' /opt/pos-web/apps/web/.next/static/chunks/main-abc123.js \
  && fail "old supabase url survived re-substitution"

# --- Case 3: AP_PASS too short blocks the services ---
sed -i 's/AP_PASS=foodtruck2026/AP_PASS=kort/' /boot/firmware/pos-setup/pos.env
bash /work/files/pos-provision.sh || fail "provision crashed on short AP_PASS"
[ -f /run/pos/config-invalid ] || fail "short AP_PASS not flagged invalid"
sed -i 's/AP_PASS=kort/AP_PASS=foodtruck2026/' /boot/firmware/pos-setup/pos.env

# --- Case 4: invalid (empty) pos.env blocks pi-bridge + web ---
cp /usr/share/pos/pos.env.template /boot/firmware/pos-setup/pos.env
bash /work/files/pos-provision.sh || fail "provision crashed on invalid pos.env"
[ -f /run/pos/config-invalid ] || fail "invalid config not flagged"
grep -q 'CONFIG ONGELDIG' /boot/firmware/pos-setup/STATUS.txt || fail "STATUS.txt does not flag invalid config"
grep -q 'SUPABASE_ANON_KEY' /boot/firmware/pos-setup/STATUS.txt || fail "missing anon key not reported"

echo "ALL PROVISION TESTS PASSED"
