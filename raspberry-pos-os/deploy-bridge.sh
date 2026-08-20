#!/usr/bin/env bash
# Zet de huidige pi-bridge-code op een draaiende Pi, zonder een image te bouwen.
#
# Een volledige image is 9 minuten bouwen plus flashen plus opnieuw inrichten.
# Dat is te traag om een protocolwijziging aan een terminal te toetsen. Deze
# route compileert lokaal en vervangt alleen /opt/pi-bridge/dist.
#
# Gebruik:
#   ./deploy-bridge.sh hopbites@192.168.1.88
#   ./deploy-bridge.sh hopbites@hopbites.local
#
# Wat hij NIET doet: node_modules bijwerken. Zijn er dependencies veranderd in
# package.json, dan is een nieuwe image de eerlijke weg — dat zegt hij ook.
set -euo pipefail

TARGET="${1:-}"
if [ -z "${TARGET}" ]; then
  echo "Gebruik: $0 <gebruiker@host>   (bijv. hopbites@192.168.1.88)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$(cd "${SCRIPT_DIR}/../apps/pi-bridge" && pwd)"

echo "== compileren =="
cd "${BRIDGE_DIR}"
npx tsc

if [ ! -f dist/index.js ]; then
  echo "dist/index.js ontbreekt na het compileren" >&2
  exit 1
fi

# Dependencies vergelijken: de Pi heeft node_modules uit het image, dus een
# nieuwe dependency landt hier niet en de bridge crasht bij het opstarten.
echo "== dependencies vergelijken =="
LOCAL_DEPS=$(node -e "const p=require('./package.json');console.log(JSON.stringify(p.dependencies))")
REMOTE_DEPS=$(ssh "${TARGET}" "node -e \"const p=require('/opt/pi-bridge/package.json');console.log(JSON.stringify(p.dependencies))\"" 2>/dev/null || echo "")
if [ -n "${REMOTE_DEPS}" ] && [ "${LOCAL_DEPS}" != "${REMOTE_DEPS}" ]; then
  echo
  echo "LET OP: package.json verschilt van wat er op de Pi staat."
  echo "Alleen dist kopiëren laat de bridge dan crashen op een ontbrekende module."
  echo "Bouw in dat geval een nieuwe image in plaats van dit script."
  echo
  read -r -p "Toch doorgaan? [j/N] " ok
  [ "${ok}" = "j" ] || exit 1
fi

echo "== kopiëren naar ${TARGET} =="
tar -czf - dist | ssh "${TARGET}" "cat > /tmp/pi-bridge-dist.tgz"

echo "== installeren en herstarten =="
ssh "${TARGET}" bash -s <<'REMOTE'
set -euo pipefail
sudo rm -rf /opt/pi-bridge/dist
sudo tar -xzf /tmp/pi-bridge-dist.tgz -C /opt/pi-bridge
sudo chown -R root:root /opt/pi-bridge/dist
rm -f /tmp/pi-bridge-dist.tgz
sudo systemctl restart pi-bridge
sleep 4
systemctl is-active pi-bridge
REMOTE

echo
echo "== gezondheid =="
ssh "${TARGET}" "curl -sk https://127.0.0.1:3001/_health || true"
echo
echo "Klaar. Bij een crash: ssh ${TARGET} 'journalctl -u pi-bridge -n 40 --no-pager'"
echo
echo "Let op: /etc/pi-bridge/env wordt bij elke boot opnieuw geschreven uit"
echo "pos-setup/pos.env op de bootpartitie. Wijzig instellingen daar, niet op de Pi."
