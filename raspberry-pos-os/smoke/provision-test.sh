#!/bin/bash
# End-to-end test of pos-provision.sh inside a throwaway Debian container.
# Mocks the systemd/network tools, feeds a Windows-style (CRLF) pos.env and
# asserts the generated bridge env, TLS chain, STATUS.txt and the
# config-invalid marker behaviour.
set -euo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }

export PATH="/usr/local/mockbin:${PATH}"
mkdir -p /usr/local/mockbin
for tool in hostnamectl systemctl nmcli raspi-config rfkill update-ca-certificates; do
  printf '#!/bin/sh\necho "[mock] %s $@" >> /tmp/mock.log\nexit 0\n' "$tool" > "/usr/local/mockbin/$tool"
  chmod +x "/usr/local/mockbin/$tool"
done

groupadd -f posbridge

mkdir -p /boot/firmware/pos-setup /usr/share/pos /usr/local/share/ca-certificates
cp /work/files/pos.env /usr/share/pos/pos.env.template

# --- Case 1: valid pos.env with CRLF line endings (edited on Windows) ---
sed -e 's/^ORG_ID=$/ORG_ID=3f6f7bfd-4f0d-407e-b505-7c6ab0c2c879/' \
    -e 's/^VENUE_ID=$/VENUE_ID=11111111-2222-4333-8444-555555555555/' \
    -e 's|^SUPABASE_URL=$|SUPABASE_URL=https://example.supabase.co|' \
    -e 's/^SUPABASE_SERVICE_ROLE_KEY=$/SUPABASE_SERVICE_ROLE_KEY=service-role-key-1234567890/' \
    -e 's/^WIFI_SSID=$/WIFI_SSID=TruckWifi/' \
    -e 's/^WIFI_PASS=$/WIFI_PASS=supergeheim/' \
    -e 's|^KIOSK_URL=$|KIOSK_URL=https://example.app/cfd|' \
    /usr/share/pos/pos.env.template \
  | sed 's/$/\r/' > /boot/firmware/pos-setup/pos.env

bash /work/files/pos-provision.sh || fail "provision exited non-zero"

[ -f /run/pos/config-invalid ] && fail "config marked invalid for a valid pos.env"
grep -q '^ORG_ID=3f6f7bfd' /etc/pi-bridge/env || fail "ORG_ID missing from bridge env"
grep -q '^NODE_ENV=production' /etc/pi-bridge/env || fail "NODE_ENV missing"
grep -q '^MYPOS_SESSION_SECRET=unset' /etc/pi-bridge/env || fail "myPOS placeholder missing"
grep -Eq '^PI_BRIDGE_PAIRING_SECRET=[0-9a-f]{64}$' /etc/pi-bridge/env || fail "pairing secret not generated"
grep -q $'\r' /etc/pi-bridge/env && fail "CRLF leaked into bridge env"

openssl verify -CAfile /etc/pi-bridge/tls/ca.crt /etc/pi-bridge/tls/cert.pem >/dev/null \
  || fail "server cert does not verify against CA"
openssl x509 -in /etc/pi-bridge/tls/cert.pem -noout -ext subjectAltName | grep -q 'hopbites.local' \
  || fail "SAN hopbites.local missing"
[ -f /boot/firmware/pos-setup/hopbites-ca.crt ] || fail "CA not exported to boot partition"
[ -f /boot/firmware/pos-setup/STATUS.txt ] || fail "STATUS.txt not written"
grep -q 'Config OK' /boot/firmware/pos-setup/STATUS.txt || fail "STATUS.txt does not report Config OK"
grep -q 'pos-wifi' /tmp/mock.log || fail "nmcli wifi profile not created"
[ -f /etc/pos/kiosk.url ] || fail "kiosk.url not written"

PAIR1=$(grep '^PI_BRIDGE_PAIRING_SECRET=' /etc/pi-bridge/env)

# --- Case 2: re-run is idempotent, secrets stable ---
bash /work/files/pos-provision.sh || fail "second provision run failed"
PAIR2=$(grep '^PI_BRIDGE_PAIRING_SECRET=' /etc/pi-bridge/env)
[ "${PAIR1}" = "${PAIR2}" ] || fail "pairing secret changed between boots"

# --- Case 3: invalid (empty) pos.env blocks pi-bridge ---
cp /usr/share/pos/pos.env.template /boot/firmware/pos-setup/pos.env
bash /work/files/pos-provision.sh || fail "provision crashed on invalid pos.env"
[ -f /run/pos/config-invalid ] || fail "invalid config not flagged"
grep -q 'CONFIG ONGELDIG' /boot/firmware/pos-setup/STATUS.txt || fail "STATUS.txt does not flag invalid config"

echo "ALL PROVISION TESTS PASSED"
