#!/bin/bash
# Hop & Bites POS OS — boot-time provisioning.
# Runs as root on every boot, before pi-bridge starts. Idempotent.
#
# Reads /boot/firmware/pos-setup/pos.env (FAT partition, editable from
# Windows/macOS after flashing), then:
#   - generates persistent secrets + a self-signed TLS CA on first boot
#   - applies hostname / WiFi
#   - composes /etc/pi-bridge/env for the pi-bridge service
#   - enables/disables the Chromium kiosk
#   - writes STATUS.txt back to the boot partition
set -u

SETUP_DIR=/boot/firmware/pos-setup
POS_ENV="${SETUP_DIR}/pos.env"
TEMPLATE=/usr/share/pos/pos.env.template
STATE_DIR=/var/lib/pos
SECRETS="${STATE_DIR}/secrets.env"
TLS_DIR=/etc/pi-bridge/tls
BRIDGE_ENV=/etc/pi-bridge/env
RUN_DIR=/run/pos
INVALID_MARKER="${RUN_DIR}/config-invalid"

mkdir -p "${RUN_DIR}" "${STATE_DIR}" "${SETUP_DIR}" "${TLS_DIR}" /etc/pos
chmod 700 "${STATE_DIR}"

ERRORS=()
WARNINGS=()

# ---------- 1. read pos.env (strip CRLF/BOM from Windows editors) ----------
if [ ! -f "${POS_ENV}" ]; then
  cp "${TEMPLATE}" "${POS_ENV}"
  WARNINGS+=("pos.env ontbrak — een leeg sjabloon is aangemaakt; vul het in en herstart.")
fi

CLEAN="${RUN_DIR}/pos.env.clean"
sed -e 's/\r$//' -e '1s/^\xEF\xBB\xBF//' "${POS_ENV}" > "${CLEAN}"
chmod 600 "${CLEAN}"

# Defaults, then user values.
ORG_ID="" VENUE_ID="" SUPABASE_URL="" SUPABASE_SERVICE_ROLE_KEY=""
MYPOS_SESSION_SECRET="" MYPOS_PARTNER_ID="" MYPOS_APP_ID=""
MYPOS_BASE="https://eposapi.mypos.com"
PRINTER_NETWORK_ADDR="192.168.1.50" PRINTER_TYPE="star"
POS_HOSTNAME="hopbites" WIFI_SSID="" WIFI_PASS="" WIFI_COUNTRY="NL"
KIOSK_URL="" ALLOWED_ORIGINS="" MDNS_INTERFACE="" SENTRY_DSN=""
ENABLE_RPI_CONNECT="0"
set -a
# shellcheck disable=SC1090
. "${CLEAN}"
set +a

# ---------- 2. persistent generated secrets ----------
if [ ! -f "${SECRETS}" ]; then
  umask 077
  {
    echo "PI_BRIDGE_PAIRING_SECRET=$(openssl rand -hex 32)"
    echo "PI_BRIDGE_ADMIN_TOKEN=$(openssl rand -hex 32)"
  } > "${SECRETS}"
fi
# shellcheck disable=SC1090
. "${SECRETS}"

# ---------- 3. hostname ----------
HN="${POS_HOSTNAME:-hopbites}"
if [ "$(hostname)" != "${HN}" ]; then
  hostnamectl set-hostname "${HN}" || ERRORS+=("hostnamectl faalde voor '${HN}'")
  sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t${HN}/" /etc/hosts
  systemctl try-restart avahi-daemon.service 2>/dev/null
fi

# ---------- 4. WiFi via NetworkManager ----------
if [ -n "${WIFI_SSID}" ]; then
  WIFI_HASH=$(printf '%s|%s|%s' "${WIFI_SSID}" "${WIFI_PASS}" "${WIFI_COUNTRY}" | sha256sum | cut -d' ' -f1)
  if [ "$(cat "${STATE_DIR}/wifi.hash" 2>/dev/null)" != "${WIFI_HASH}" ]; then
    rfkill unblock wifi 2>/dev/null
    raspi-config nonint do_wifi_country "${WIFI_COUNTRY:-NL}" 2>/dev/null
    nmcli connection delete pos-wifi >/dev/null 2>&1
    if [ -n "${WIFI_PASS}" ]; then
      nmcli connection add type wifi ifname wlan0 con-name pos-wifi \
        ssid "${WIFI_SSID}" connection.autoconnect yes \
        wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${WIFI_PASS}" >/dev/null \
        || ERRORS+=("WiFi-profiel aanmaken faalde (SSID '${WIFI_SSID}')")
    else
      nmcli connection add type wifi ifname wlan0 con-name pos-wifi \
        ssid "${WIFI_SSID}" connection.autoconnect yes >/dev/null \
        || ERRORS+=("WiFi-profiel aanmaken faalde (SSID '${WIFI_SSID}')")
    fi
    echo "${WIFI_HASH}" > "${STATE_DIR}/wifi.hash"
    nmcli connection up pos-wifi >/dev/null 2>&1 &
  fi
fi

# ---------- 5. TLS: own CA + server cert for <hostname>.local ----------
# pi-bridge refuses to start without TLS in production. iOS/Android tablets
# trust it after installing hopbites-ca.crt (exported to the boot partition).
SANS="DNS:${HN}.local,DNS:hopbites.local,DNS:localhost,IP:127.0.0.1"
NEED_TLS=0
[ -f "${TLS_DIR}/cert.pem" ] || NEED_TLS=1
[ "$(cat "${TLS_DIR}/.sans" 2>/dev/null)" != "${SANS}" ] && NEED_TLS=1
if ! openssl x509 -checkend $((30*24*3600)) -noout -in "${TLS_DIR}/cert.pem" 2>/dev/null; then
  NEED_TLS=1
fi

if [ "${NEED_TLS}" = 1 ]; then
  umask 077
  if [ ! -f "${TLS_DIR}/ca.key" ]; then
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
      -keyout "${TLS_DIR}/ca.key" -out "${TLS_DIR}/ca.crt" -days 3650 \
      -subj "/CN=Hop en Bites POS CA/O=Hop en Bites" \
      -addext "basicConstraints=critical,CA:TRUE" \
      -addext "keyUsage=critical,keyCertSign,cRLSign" \
      || ERRORS+=("CA genereren faalde")
  fi
  openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
    -keyout "${TLS_DIR}/key.pem" -out "${RUN_DIR}/server.csr" \
    -subj "/CN=${HN}.local" || ERRORS+=("server-key genereren faalde")
  openssl x509 -req -in "${RUN_DIR}/server.csr" \
    -CA "${TLS_DIR}/ca.crt" -CAkey "${TLS_DIR}/ca.key" -CAcreateserial \
    -out "${TLS_DIR}/cert.pem" -days 820 \
    -extfile <(printf 'subjectAltName=%s\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n' "${SANS}") \
    || ERRORS+=("server-cert tekenen faalde")
  echo "${SANS}" > "${TLS_DIR}/.sans"
  chown root:posbridge "${TLS_DIR}/key.pem" "${TLS_DIR}/cert.pem"
  chmod 640 "${TLS_DIR}/key.pem" "${TLS_DIR}/cert.pem"
  # Trust our CA system-wide (curl/node debugging on the Pi itself).
  cp "${TLS_DIR}/ca.crt" /usr/local/share/ca-certificates/hopbites-ca.crt
  update-ca-certificates >/dev/null 2>&1
fi
# Always export the CA for tablets, so it survives re-flashing pos-setup/.
cp -f "${TLS_DIR}/ca.crt" "${SETUP_DIR}/hopbites-ca.crt" 2>/dev/null

# ---------- 6. validate + compose /etc/pi-bridge/env ----------
UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
[[ "${ORG_ID}" =~ ${UUID_RE} ]] || ERRORS+=("ORG_ID ontbreekt of is geen geldige UUID")
[[ "${VENUE_ID}" =~ ${UUID_RE} ]] || ERRORS+=("VENUE_ID ontbreekt of is geen geldige UUID")
[[ "${SUPABASE_URL}" =~ ^https:// ]] || ERRORS+=("SUPABASE_URL ontbreekt of begint niet met https://")
[ "${#SUPABASE_SERVICE_ROLE_KEY}" -ge 20 ] || ERRORS+=("SUPABASE_SERVICE_ROLE_KEY ontbreekt of is te kort")

MYPOS_OK=1
if [ -z "${MYPOS_SESSION_SECRET}" ] || [ -z "${MYPOS_PARTNER_ID}" ] || [ -z "${MYPOS_APP_ID}" ]; then
  MYPOS_OK=0
  WARNINGS+=("myPOS niet (volledig) ingevuld — PIN-betalingen werken pas na invullen van MYPOS_* in pos.env.")
fi

umask 027
{
  echo "# Generated by pos-provision.sh — bewerk pos-setup/pos.env op de bootpartitie, niet dit bestand."
  echo "NODE_ENV=production"
  echo "PORT=3001"
  echo "HOST=0.0.0.0"
  echo "ORG_ID=${ORG_ID}"
  echo "VENUE_ID=${VENUE_ID}"
  echo "SUPABASE_URL=${SUPABASE_URL}"
  echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
  echo "PI_BRIDGE_PAIRING_SECRET=${PI_BRIDGE_PAIRING_SECRET}"
  echo "PI_BRIDGE_ADMIN_TOKEN=${PI_BRIDGE_ADMIN_TOKEN}"
  echo "MYPOS_BASE=${MYPOS_BASE}"
  echo "MYPOS_SESSION_SECRET=${MYPOS_SESSION_SECRET:-unset}"
  echo "MYPOS_PARTNER_ID=${MYPOS_PARTNER_ID:-unset}"
  echo "MYPOS_APP_ID=${MYPOS_APP_ID:-unset}"
  echo "PRINTER_NETWORK_ADDR=${PRINTER_NETWORK_ADDR}"
  echo "PRINTER_TYPE=${PRINTER_TYPE}"
  echo "SQLITE_PATH=/data/pi-bridge.sqlite"
  echo "TLS_CERT_PATH=${TLS_DIR}/cert.pem"
  echo "TLS_KEY_PATH=${TLS_DIR}/key.pem"
  [ -n "${ALLOWED_ORIGINS}" ] && echo "ALLOWED_ORIGINS=${ALLOWED_ORIGINS}"
  [ -n "${MDNS_INTERFACE}" ] && echo "MDNS_INTERFACE=${MDNS_INTERFACE}"
  [ -n "${SENTRY_DSN}" ] && echo "SENTRY_DSN=${SENTRY_DSN}"
  true
} > "${BRIDGE_ENV}"
chown root:posbridge "${BRIDGE_ENV}"
chmod 640 "${BRIDGE_ENV}"

if [ "${#ERRORS[@]}" -gt 0 ]; then
  touch "${INVALID_MARKER}"
else
  rm -f "${INVALID_MARKER}"
fi

# ---------- 7. kiosk ----------
if [ -n "${KIOSK_URL}" ]; then
  printf '%s\n' "${KIOSK_URL}" > /etc/pos/kiosk.url
  systemctl disable --now getty@tty1.service >/dev/null 2>&1
  systemctl enable pos-kiosk.service >/dev/null 2>&1
  systemctl start --no-block pos-kiosk.service >/dev/null 2>&1
else
  rm -f /etc/pos/kiosk.url
  systemctl disable --now pos-kiosk.service >/dev/null 2>&1
  systemctl enable --now getty@tty1.service >/dev/null 2>&1
fi

# ---------- 7b. Raspberry Pi Connect (remote shell) ----------
POS_USER=hopbites
if id "${POS_USER}" >/dev/null 2>&1 && command -v rpi-connect >/dev/null 2>&1; then
  PUID=$(id -u "${POS_USER}")
  RUNUSER=(runuser -u "${POS_USER}" -- env "XDG_RUNTIME_DIR=/run/user/${PUID}" \
    "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${PUID}/bus")
  if [ "${ENABLE_RPI_CONNECT}" = "1" ]; then
    loginctl enable-linger "${POS_USER}" 2>/dev/null
    systemctl start "user@${PUID}.service" 2>/dev/null
    "${RUNUSER[@]}" systemctl --user enable rpi-connect.service >/dev/null 2>&1 \
      || WARNINGS+=("rpi-connect service kon niet ge-enabled worden — check 'systemctl --user status rpi-connect' als ${POS_USER}")
    "${RUNUSER[@]}" systemctl --user start rpi-connect.service >/dev/null 2>&1
  else
    "${RUNUSER[@]}" systemctl --user disable --now rpi-connect.service >/dev/null 2>&1
  fi
fi

# ---------- 8. STATUS.txt ----------
FP=$(openssl x509 -in "${TLS_DIR}/cert.pem" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2)
{
  echo "Hop & Bites POS OS — status van $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "============================================================"
  echo
  if [ "${#ERRORS[@]}" -gt 0 ]; then
    echo "!! CONFIG ONGELDIG — pi-bridge start NIET. Los dit op in pos.env:"
    for e in "${ERRORS[@]}"; do echo "   - ${e}"; done
  else
    echo "Config OK — pi-bridge service start."
  fi
  for w in "${WARNINGS[@]}"; do echo "LET OP: ${w}"; done
  echo
  echo "Hostnaam:     ${HN}  (bridge: https://${HN}.local:3001)"
  echo "IP-adressen:  $(hostname -I 2>/dev/null)"
  echo "myPOS PIN:    $([ "${MYPOS_OK}" = 1 ] && echo geconfigureerd || echo 'NIET geconfigureerd')"
  echo "Printer:      ${PRINTER_TYPE} @ ${PRINTER_NETWORK_ADDR}"
  echo "Kiosk:        ${KIOSK_URL:-uit}"
  if [ "${ENABLE_RPI_CONNECT}" = "1" ]; then
    echo "Pi Connect:   aan — eenmalig koppelen: ssh ${POS_USER}@${HN}.local en dan 'rpi-connect signin'"
  else
    echo "Pi Connect:   uit (ENABLE_RPI_CONNECT=1 in pos.env om aan te zetten)"
  fi
  echo
  echo "TLS-certificaat (SHA256): ${FP:-n.v.t.}"
  echo "Installeer 'hopbites-ca.crt' (in deze map) op elke tablet zodat"
  echo "https://${HN}.local:3001 vertrouwd wordt."
  echo
  echo "Wijzigingen in pos.env worden bij elke (her)start opnieuw toegepast."
} > "${SETUP_DIR}/STATUS.txt"

rm -f "${CLEAN}" "${RUN_DIR}/server.csr"
exit 0
