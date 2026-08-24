#!/usr/bin/env bash
# Zet de huidige web-app op een draaiende Pi, zonder een image te bouwen.
#
# Tot nu toe was een volledige image de enige weg naar /opt/pos-web. Dat is
# negen minuten bouwen plus flashen plus opnieuw inrichten, en daardoor bleef de
# kassa op de Pi maanden achter op de code — betalingen die contant werden
# afgerekend belandden bijvoorbeeld nergens, omdat de kassa de nieuwe route nog
# niet kende.
#
# Gebruik:
#   ./deploy-web.sh hopbites@192.168.1.88
#   ./deploy-web.sh hopbites@10.42.0.1
#
# Wat hij NIET doet: node_modules bijwerken. Dat kán hier ook niet — de bundel
# die op Windows wordt gebouwd bevat Windows-binaries (sharp, argon2) die op een
# arm64-Pi niet laden. Daarom gaat alleen de code mee en blijven de modules van
# de image staan. Veranderen er dependencies, dan is een nieuwe image de eerlijke
# weg; dat zegt hij ook.
set -euo pipefail

TARGET="${1:-}"
if [ -z "${TARGET}" ]; then
  echo "Gebruik: $0 <gebruiker@host>   (bijv. hopbites@192.168.1.88)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEB_DIR="${REPO_DIR}/apps/web"

# Draait dit in een shell die de Node-toolchain kent? Vanuit cmd.exe kan `bash`
# de WSL-shell zijn, en daar staat je Windows-Node niet in de PATH.
if ! command -v npx >/dev/null 2>&1; then
  echo "npx niet gevonden in deze shell." >&2
  echo "Draai dit vanuit Git Bash of PowerShell, niet vanuit cmd.exe." >&2
  exit 1
fi

cd "${REPO_DIR}"

# Dezelfde placeholders als de image-build. NEXT_PUBLIC_* wordt in de
# client-chunks gebakken; pos-provision.sh vervangt ze bij het opstarten door de
# echte waarden uit pos.env. Bouwen met jouw eigen sleutels zou die van de Pi
# overschrijven met die van deze laptop.
echo "== bouwen =="
POS_PI_BUILD=1 \
NEXT_TELEMETRY_DISABLED=1 \
NEXT_PUBLIC_SUPABASE_URL="https://pos-placeholder-supabase-url.invalid" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="POS_PLACEHOLDER_SUPABASE_ANON_KEY" \
  npx pnpm --filter web build

STANDALONE="${WEB_DIR}/.next/standalone/apps/web"
if [ ! -f "${STANDALONE}/server.js" ]; then
  echo "Geen standalone-build gevonden op ${STANDALONE}." >&2
  echo "Staat output: 'standalone' nog in next.config?" >&2
  exit 1
fi

deps_block() {
  sed -n '/"dependencies"/,/}/p' "$1" | tr -d ' \t'
}

echo "== dependencies vergelijken =="
LOCAL_DEPS=$(deps_block "${WEB_DIR}/package.json")
REMOTE_DEPS=$(ssh "${TARGET}" "sed -n '/\"dependencies\"/,/}/p' /opt/pos-web/apps/web/package.json | tr -d ' \t'" 2>/dev/null || echo "")
if [ -n "${REMOTE_DEPS}" ] && [ "${LOCAL_DEPS}" != "${REMOTE_DEPS}" ]; then
  echo
  echo "LET OP: package.json verschilt van wat er op de Pi staat."
  echo "De modules daar horen bij de oude versie; de app kan dan crashen op"
  echo "een ontbrekende of verkeerde module. Bouw in dat geval een nieuwe image."
  echo
  read -r -p "Toch doorgaan? [j/N] " ok
  [ "${ok}" = "j" ] || exit 1
fi

echo "== inpakken =="
STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT
mkdir -p "${STAGE}/apps/web"

# Alleen wat van ons is: de servercode, de client-chunks en de assets. De
# node_modules blijven op de Pi staan — zie de kop van dit bestand.
cp -a "${STANDALONE}/server.js" "${STAGE}/apps/web/server.js"
cp -a "${STANDALONE}/.next" "${STAGE}/apps/web/.next"

# .next/node_modules bestaat uit symlinks naar node_modules op DEZE machine.
# Meesturen levert kapotte verwijzingen op de Pi; meesturen met -h zou de
# Windows-binaries alsnog meenemen. De Pi heeft daar zijn eigen, juiste versie
# uit de image-build staan, en die blijft dus met rust.
rm -rf "${STAGE}/apps/web/.next/node_modules"

mkdir -p "${STAGE}/apps/web/.next/static" "${STAGE}/apps/web/public"
cp -a "${WEB_DIR}/.next/static/." "${STAGE}/apps/web/.next/static/"
cp -a "${WEB_DIR}/public/." "${STAGE}/apps/web/public/"

# Dezelfde controle als in de image-build: een geneste of halve public levert
# een app op die draait maar er stuk uitziet.
for f in logo.png manifest.json icon-192.png icon-512.png apple-touch-icon.png; do
  [ -f "${STAGE}/apps/web/public/${f}" ] || { echo "public/${f} ontbreekt" >&2; exit 1; }
done
[ ! -d "${STAGE}/apps/web/public/public" ] || { echo "public is genest" >&2; exit 1; }

echo "== kopiëren naar ${TARGET} =="
tar -czf - -C "${STAGE}" apps | ssh "${TARGET}" "cat > /tmp/pos-web.tgz"

echo "== installeren en herstarten =="
ssh "${TARGET}" bash -s <<'REMOTE'
set -euo pipefail

# Eerst een reservekopie. Gaat de nieuwe versie niet starten, dan is de kassa
# anders wég tot er een image gebouwd is — en dat is niet iets wat je op een
# zaterdagochtend wilt ontdekken.
sudo rm -rf /opt/pos-web.vorige
sudo cp -a /opt/pos-web/apps/web /opt/pos-web.vorige

# Alles uit .next weg behalve node_modules — die hoort bij de architectuur van
# de Pi en komt niet uit deze bundel.
sudo find /opt/pos-web/apps/web/.next -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
sudo rm -rf /opt/pos-web/apps/web/public /opt/pos-web/apps/web/server.js
sudo tar -xzf /tmp/pos-web.tgz -C /opt/pos-web
sudo chown -R root:root /opt/pos-web/apps
rm -f /tmp/pos-web.tgz

# De verse bundel bevat weer placeholders, maar web-subst.env onthoudt dat er
# al echte waarden in stonden. Zonder dit blijft de app naar een niet-bestaande
# Supabase-URL wijzen en lijkt hij kapot terwijl de build klopt.
sudo rm -f /var/lib/pos/web-subst.env
sudo systemctl restart pos-provision
sudo systemctl restart pos-web
sleep 3
systemctl is-active pos-web
REMOTE

echo
echo "== gezondheid =="
ssh "${TARGET}" "curl -s --max-time 5 http://127.0.0.1:3000/api/ping || echo '(geen antwoord van de web-app)'"
echo
echo "Klaar. Bij een crash: ssh ${TARGET} 'journalctl -u pos-web -n 40 --no-pager'"
echo
echo "Terug naar de vorige versie:"
echo "  ssh ${TARGET} 'sudo rm -rf /opt/pos-web/apps/web && sudo cp -a /opt/pos-web.vorige /opt/pos-web/apps/web && sudo systemctl restart pos-web'"
echo
echo "Let op: node_modules op de Pi zijn NIET bijgewerkt. Veranderde er iets in"
echo "apps/web/package.json, bouw dan een nieuwe image."
