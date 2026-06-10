#!/bin/bash
# Hop & Bites POS OS — boot-time provisioning.
# Runs as root on every boot, before pi-bridge + pos-web start. Idempotent.
#
# Reads /boot/firmware/pos-setup/pos.env (FAT partition, editable from
# Windows/macOS after flashing), then:
#   - generates persistent secrets + a self-signed TLS CA on first boot
#   - applies hostname / WiFi (client) of een eigen access point (AP)
#   - composes /etc/pi-bridge/env for the pi-bridge service
#   - composes /etc/pos-web/env + substitutes the NEXT_PUBLIC_* build
#     placeholders so the lokale web-app (geen Vercel) de juiste Supabase
#     waarden gebruikt
#   - enables nginx (TLS voor de web-app) and the optional Chromium kiosk
#   - writes STATUS.txt back to the boot partition
set -u

SETUP_DIR=/boot/firmware/pos-setup
POS_ENV="${SETUP_DIR}/pos.env"
TEMPLATE=/usr/share/pos/pos.env.template
STATE_DIR=/var/lib/pos
SECRETS="${STATE_DIR}/secrets.env"
TLS_DIR=/etc/pi-bridge/tls
BRIDGE_ENV=/etc/pi-bridge/env
WEB_ENV=/etc/pos-web/env
WEB_ROOT=/opt/pos-web/apps/web
WEB_SUBST="${STATE_DIR}/web-subst.env"
RUN_DIR=/run/pos
INVALID_MARKER="${RUN_DIR}/config-invalid"

# Placeholders baked into the web bundle at image build time
# (stage-pos/03-pos-web/00-run.sh) — keep these in sync.
PH_SUPABASE_URL="https://pos-placeholder-supabase-url.invalid"
PH_ANON_KEY="POS_PLACEHOLDER_SUPABASE_ANON_KEY"

mkdir -p "${RUN_DIR}" "${STATE_DIR}" "${SETUP_DIR}" "${TLS_DIR}" /etc/pos /etc/pos-web
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
SUPABASE_ANON_KEY="" ANTHROPIC_API_KEY=""
MYPOS_SESSION_SECRET="" MYPOS_PARTNER_ID="" MYPOS_APP_ID=""
MYPOS_BASE="https://eposapi.mypos.com"
PRINTER_NETWORK_ADDR="192.168.1.50" PRINTER_TYPE="star"
POS_HOSTNAME="hopbites" WIFI_SSID="" WIFI_PASS="" WIFI_COUNTRY="NL"
AP_SSID="" AP_PASS="" AP_BAND="bg" AP_CHANNEL="6" AP_IP="10.42.0.1"
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
# Older installs miss the web-app secrets — append once, keep them stable.
if ! grep -q '^POS_AUTH_CACHE_SECRET=' "${SECRETS}"; then
  echo "POS_AUTH_CACHE_SECRET=$(openssl rand -hex 32)" >> "${SECRETS}"
fi
if ! grep -q '^POS_CRON_SECRET=' "${SECRETS}"; then
  echo "POS_CRON_SECRET=$(openssl rand -hex 32)" >> "${SECRETS}"
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

# ---------- 4. netwerk: eigen access point (AP) of WiFi-client ----------
# AP_SSID gezet => de Pi zendt zijn eigen WPA2-netwerk uit (wlan0) waar de
# kassa/KDS/CFD-schermen mee verbinden. Volledig lokaal, geen internet
# nodig. Internet (voor Supabase-sync) kan dan alleen via ethernet/USB.
AP_ACTIVE=0
if [ -n "${AP_SSID}" ]; then
  if [ "${#AP_PASS}" -lt 8 ]; then
    ERRORS+=("AP_PASS moet minimaal 8 tekens zijn (WPA2) als AP_SSID gezet is")
  else
    AP_ACTIVE=1
    [ -n "${WIFI_SSID}" ] && WARNINGS+=("AP_SSID én WIFI_SSID gezet — wlan0 kan maar één van beide; het access point wint, WIFI_SSID wordt genegeerd.")

    # dnsmasq config for the NM 'shared' connection: geef de schermen een
    # vaste naam voor de Pi, ook zonder mDNS-ondersteuning (Android).
    mkdir -p /etc/NetworkManager/dnsmasq-shared.d
    DNSMASQ_CONF=/etc/NetworkManager/dnsmasq-shared.d/00-pos.conf
    DNSMASQ_NEW="address=/${HN}.local/${AP_IP}
address=/hopbites.local/${AP_IP}
address=/pos.lan/${AP_IP}"
    if [ "$(cat "${DNSMASQ_CONF}" 2>/dev/null)" != "${DNSMASQ_NEW}" ]; then
      printf '%s\n' "${DNSMASQ_NEW}" > "${DNSMASQ_CONF}"
      rm -f "${STATE_DIR}/ap.hash"   # force re-up so dnsmasq picks it up
    fi

    AP_HASH=$(printf '%s|%s|%s|%s|%s|%s' "${AP_SSID}" "${AP_PASS}" "${AP_BAND}" "${AP_CHANNEL}" "${AP_IP}" "${WIFI_COUNTRY}" | sha256sum | cut -d' ' -f1)
    if [ "$(cat "${STATE_DIR}/ap.hash" 2>/dev/null)" != "${AP_HASH}" ]; then
      rfkill unblock wifi 2>/dev/null
      raspi-config nonint do_wifi_country "${WIFI_COUNTRY:-NL}" 2>/dev/null
      nmcli connection delete pos-wifi >/dev/null 2>&1
      nmcli connection delete pos-ap >/dev/null 2>&1
      nmcli connection add type wifi ifname wlan0 con-name pos-ap \
        ssid "${AP_SSID}" connection.autoconnect yes \
        802-11-wireless.mode ap 802-11-wireless.band "${AP_BAND}" \
        802-11-wireless.channel "${AP_CHANNEL}" \
        wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${AP_PASS}" \
        wifi-sec.proto rsn wifi-sec.pairwise ccmp wifi-sec.group ccmp \
        ipv4.method shared ipv4.addresses "${AP_IP}/24" \
        ipv6.method disabled >/dev/null \
        || ERRORS+=("Access point aanmaken faalde (SSID '${AP_SSID}')")
      echo "${AP_HASH}" > "${STATE_DIR}/ap.hash"
      nmcli connection up pos-ap >/dev/null 2>&1 &
    fi
  fi
elif [ -n "${WIFI_SSID}" ]; then
  rm -f "${STATE_DIR}/ap.hash"
  nmcli connection delete pos-ap >/dev/null 2>&1
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

# ---------- 5. TLS: own CA + server cert ----------
# pi-bridge refuses to start without TLS in production; nginx serveert de
# web-app met hetzelfde cert. iOS/Android tablets trust it after
# installing hopbites-ca.crt (exported to the boot partition).
SANS="DNS:${HN}.local,DNS:hopbites.local,DNS:pos.lan,DNS:localhost,IP:127.0.0.1"
[ "${AP_ACTIVE}" = 1 ] && SANS="${SANS},IP:${AP_IP}"
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
[ "${#SUPABASE_ANON_KEY}" -ge 20 ] || ERRORS+=("SUPABASE_ANON_KEY ontbreekt of is te kort (nodig voor de lokale web-app)")

MYPOS_OK=1
if [ -z "${MYPOS_SESSION_SECRET}" ] || [ -z "${MYPOS_PARTNER_ID}" ] || [ -z "${MYPOS_APP_ID}" ]; then
  MYPOS_OK=0
  WARNINGS+=("myPOS niet (volledig) ingevuld — PIN-betalingen werken pas na invullen van MYPOS_* in pos.env.")
fi

# De web-app draait op de Pi zelf: sta die origins standaard toe richting
# pi-bridge (CORS), naast wat de gebruiker zelf opgeeft.
LOCAL_ORIGINS="https://${HN}.local,https://hopbites.local,https://pos.lan"
EFFECTIVE_ORIGINS="${LOCAL_ORIGINS}"
[ -n "${ALLOWED_ORIGINS}" ] && EFFECTIVE_ORIGINS="${LOCAL_ORIGINS},${ALLOWED_ORIGINS}"

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
  echo "ALLOWED_ORIGINS=${EFFECTIVE_ORIGINS}"
  [ -n "${MDNS_INTERFACE}" ] && echo "MDNS_INTERFACE=${MDNS_INTERFACE}"
  [ -n "${SENTRY_DSN}" ] && echo "SENTRY_DSN=${SENTRY_DSN}"
  true
} > "${BRIDGE_ENV}"
chown root:posbridge "${BRIDGE_ENV}"
chmod 640 "${BRIDGE_ENV}"

# ---------- 6b. compose /etc/pos-web/env (lokale Next.js app) ----------
{
  echo "# Generated by pos-provision.sh — bewerk pos-setup/pos.env op de bootpartitie, niet dit bestand."
  echo "NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
  echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
  echo "PI_BRIDGE_URL=https://127.0.0.1:3001"
  echo "PI_BRIDGE_ADMIN_TOKEN=${PI_BRIDGE_ADMIN_TOKEN}"
  echo "POS_AUTH_CACHE_SECRET=${POS_AUTH_CACHE_SECRET}"
  echo "POS_OFFLINE_CACHE_DIR=/var/lib/pos-web"
  echo "CRON_SECRET=${POS_CRON_SECRET}"
  [ -n "${ANTHROPIC_API_KEY}" ] && echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"
  [ -n "${SENTRY_DSN}" ] && echo "SENTRY_DSN=${SENTRY_DSN}"
  true
} > "${WEB_ENV}"
chown root:posweb "${WEB_ENV}"
chmod 640 "${WEB_ENV}"

# ---------- 6c. substitueer NEXT_PUBLIC_* placeholders in de web-bundle ----------
# NEXT_PUBLIC_* zit ingebakken in de client-chunks van de build. Het image
# is gebouwd met unieke placeholders; hier vervangen we ze door de échte
# waarden uit pos.env. web-subst.env onthoudt de huidige waarden zodat een
# latere wijziging van Supabase-project opnieuw gesubstitueerd wordt.
if [ -d "${WEB_ROOT}" ] && [[ "${SUPABASE_URL}" =~ ^https:// ]] && [ "${#SUPABASE_ANON_KEY}" -ge 20 ]; then
  CUR_URL="${PH_SUPABASE_URL}"
  CUR_KEY="${PH_ANON_KEY}"
  if [ -f "${WEB_SUBST}" ]; then
    # shellcheck disable=SC1090
    . "${WEB_SUBST}"
    CUR_URL="${WEB_CUR_SUPABASE_URL:-${PH_SUPABASE_URL}}"
    CUR_KEY="${WEB_CUR_ANON_KEY:-${PH_ANON_KEY}}"
  fi
  if [ "${CUR_URL}" != "${SUPABASE_URL}" ] || [ "${CUR_KEY}" != "${SUPABASE_ANON_KEY}" ]; then
    SUBST_FAIL=0
    while IFS= read -r -d '' f; do
      sed -i "s|${CUR_URL}|${SUPABASE_URL}|g; s|${CUR_KEY}|${SUPABASE_ANON_KEY}|g" "$f" || SUBST_FAIL=1
    done < <(grep -rlZ --include='*.js' --include='*.json' --include='*.html' --include='*.rsc' --include='*.meta' \
              -e "${CUR_URL}" -e "${CUR_KEY}" "${WEB_ROOT}" 2>/dev/null)
    if [ "${SUBST_FAIL}" = 0 ]; then
      umask 077
      {
        echo "WEB_CUR_SUPABASE_URL=${SUPABASE_URL}"
        echo "WEB_CUR_ANON_KEY=${SUPABASE_ANON_KEY}"
      } > "${WEB_SUBST}"
    else
      ERRORS+=("web-app placeholder-substitutie faalde — herstart om te herstellen")
    fi
  fi
fi

if [ "${#ERRORS[@]}" -gt 0 ]; then
  touch "${INVALID_MARKER}"
else
  rm -f "${INVALID_MARKER}"
fi

# ---------- 6d. nginx (TLS voor de lokale web-app) ----------
# Pas starten als het cert er is; reload als het net vernieuwd is.
if [ -f "${TLS_DIR}/cert.pem" ]; then
  systemctl enable nginx.service >/dev/null 2>&1
  if [ "${NEED_TLS}" = 1 ]; then
    systemctl reload-or-restart nginx.service >/dev/null 2>&1
  else
    systemctl start --no-block nginx.service >/dev/null 2>&1
  fi
fi

# ---------- 7. kiosk ----------
if [ -n "${KIOSK_URL}" ]; then
  # Chromium gebruikt z'n eigen certificate store — vertrouw onze CA voor
  # de kiosk-gebruiker zodat een lokale https://<host>.local kiosk werkt.
  if command -v certutil >/dev/null 2>&1 && id kiosk >/dev/null 2>&1; then
    KIOSK_NSS=/home/kiosk/.pki/nssdb
    if [ ! -d "${KIOSK_NSS}" ]; then
      mkdir -p "${KIOSK_NSS}"
      certutil -d "sql:${KIOSK_NSS}" -N --empty-password >/dev/null 2>&1
    fi
    certutil -d "sql:${KIOSK_NSS}" -D -n hopbites-ca >/dev/null 2>&1
    certutil -d "sql:${KIOSK_NSS}" -A -t "C,," -n hopbites-ca -i "${TLS_DIR}/ca.crt" >/dev/null 2>&1
    chown -R kiosk:kiosk /home/kiosk/.pki 2>/dev/null
  fi
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
    echo "!! CONFIG ONGELDIG — pi-bridge en de web-app starten NIET. Los dit op in pos.env:"
    for e in "${ERRORS[@]}"; do echo "   - ${e}"; done
  else
    echo "Config OK — pi-bridge + web-app starten."
  fi
  for w in "${WARNINGS[@]}"; do echo "LET OP: ${w}"; done
  echo
  echo "Hostnaam:     ${HN}"
  echo "Web-app:      https://${HN}.local  (draait lokaal op de Pi — geen Vercel/internet nodig)"
  echo "Pi-bridge:    https://${HN}.local:3001"
  if [ "${AP_ACTIVE}" = 1 ]; then
    echo "Access point: SSID '${AP_SSID}' — verbind de schermen hiermee en open https://${HN}.local (of https://${AP_IP})"
  else
    echo "Access point: uit (zet AP_SSID + AP_PASS in pos.env voor een eigen netwerk zonder internet)"
  fi
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
  echo "https://${HN}.local en https://${HN}.local:3001 vertrouwd worden."
  echo
  echo "Wijzigingen in pos.env worden bij elke (her)start opnieuw toegepast."
} > "${SETUP_DIR}/STATUS.txt"

rm -f "${CLEAN}" "${RUN_DIR}/server.csr"
exit 0
