#!/usr/bin/env bash
# De myPOS Ultra over Bluetooth aan de Pi knopen.
#
# Waarom Bluetooth of USB en niet WiFi: hangt de terminal aan een WiFi-netwerk
# zonder internet, dan stuurt Android het bankverkeer daarheen in plaats van
# over de simkaart, en mislukt elke transactie. Met WiFi uit is de sim de enige
# uitweg en bestaat dat probleem niet.
#
# Bluetooth SPP komt in Linux binnen als een gewone seriële poort
# (/dev/rfcomm0), dus daarna praat de IPP-client er net zo tegen als tegen USB:
#
#   node mypos-ipp.mjs --serial /dev/rfcomm0 --method GET_STATUS
#
# Zet de terminal eerst op POSLink Manager -> Settings -> Change connection
# type -> Bluetooth, en zorg dat hij zichtbaar is.
#
# Draaien op de Pi:
#   ./mypos-bt.sh scan
#   ./mypos-bt.sh pair AA:BB:CC:DD:EE:FF
#   ./mypos-bt.sh discoverable
#   ./mypos-bt.sh bind AA:BB:CC:DD:EE:FF
#   ./mypos-bt.sh status
set -uo pipefail

CMD="${1:-}"
MAC="${2:-}"

need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  echo "'$1' ontbreekt. Installeren met: sudo apt install ${2:-bluez}" >&2
  exit 1
}

case "${CMD}" in
  scan)
    need bluetoothctl
    echo "== radio aan =="
    bluetoothctl power on >/dev/null
    bluetoothctl agent on >/dev/null
    bluetoothctl default-agent >/dev/null 2>&1
    echo "== 20 seconden zoeken; zet de terminal op zichtbaar =="
    bluetoothctl --timeout 20 scan on >/dev/null 2>&1
    echo
    echo "== gevonden =="
    bluetoothctl devices
    echo
    echo "Zoek de regel van de terminal (myPOS / N96) en gebruik dat MAC-adres:"
    echo "  $0 pair <MAC>"
    ;;

  pair)
    need bluetoothctl
    [ -z "${MAC}" ] && { echo "Gebruik: $0 pair <MAC>" >&2; exit 1; }

    # Koppelen MOET in één bluetoothctl-sessie. Een agent — het stukje dat de
    # PIN- of bevestigingsvraag afhandelt — bestaat alleen zolang het proces
    # draait dat hem registreerde. Losse aanroepen (`bluetoothctl agent on`
    # gevolgd door `bluetoothctl pair`) laten dus niemand achter om te
    # antwoorden, en de terminal meldt "verkeerde pin of toegangscode".
    bluetoothctl power on >/dev/null
    cat <<TXT

Er opent nu een bluetoothctl-sessie. Tik daarin, regel voor regel:

  agent KeyboardDisplay
  default-agent
  pairable on
  pair ${MAC}

Kijk dan op de TERMINAL: hij toont een code of vraagt om bevestiging.
  - Toont hij een getal en vraagt de Pi 'Confirm passkey?' -> tik yes
  - Vraagt de Pi 'Enter PIN code:'                        -> neem over wat de
    terminal toont; heeft hij niets, probeer 0000 en daarna 1234

Daarna nog, in dezelfde sessie:

  trust ${MAC}
  quit

Lukt koppelen niet omdat de terminal zélf wil zoeken, gebruik dan:
  $0 discoverable        (maakt de Pi vindbaar, zoek dan vanaf de terminal)

TXT
    exec bluetoothctl
    ;;

  discoverable)
    need bluetoothctl
    # De andere richting: niet wij zoeken de terminal, maar de terminal zoekt
    # ons. POSLink Manager heeft in Bluetooth-modus zijn eigen koppelscherm, en
    # sommige toestellen willen per se zelf het initiatief nemen.
    bluetoothctl power on >/dev/null
    cat <<TXT

Er opent nu een bluetoothctl-sessie. Tik daarin:

  agent KeyboardDisplay
  default-agent
  discoverable on
  pairable on

Zoek daarna VANAF de terminal naar deze Pi (hij heet 'hopbites') en koppel
daar. Bevestig hier wat er gevraagd wordt en laat de sessie open staan tot het
koppelen klaar is.

TXT
    exec bluetoothctl
    ;;

  bind)
    need bluetoothctl
    [ -z "${MAC}" ] && { echo "Gebruik: $0 bind <MAC>" >&2; exit 1; }

    if ! command -v rfcomm >/dev/null 2>&1; then
      echo "'rfcomm' ontbreekt. Op Raspberry Pi OS zit hij in bluez-tools of in" >&2
      echo "een oudere bluez; probeer: sudo apt install bluez-tools" >&2
      exit 1
    fi

    # Welk RFCOMM-kanaal de terminal aanbiedt staat in zijn SDP-record. Meestal
    # is dat 1, maar raden is hier niet nodig.
    CHAN=1
    if command -v sdptool >/dev/null 2>&1; then
      FOUND=$(sdptool browse "${MAC}" 2>/dev/null \
        | awk '/Serial Port|SerialPort|SPP/{f=1} f&&/Channel:/{print $2; exit}')
      [ -n "${FOUND}" ] && CHAN="${FOUND}"
      echo "SPP-kanaal: ${CHAN}${FOUND:+ (uit het SDP-record)}"
    else
      echo "sdptool ontbreekt — ik gok kanaal ${CHAN}."
    fi

    sudo rfcomm release 0 >/dev/null 2>&1
    echo "== binden aan /dev/rfcomm0 =="
    sudo rfcomm bind 0 "${MAC}" "${CHAN}"
    sleep 1
    ls -l /dev/rfcomm0

    echo
    echo "Toetsen (leest alleen, zet geen betaling klaar):"
    echo "  node mypos-ipp.mjs --serial /dev/rfcomm0 --method GET_STATUS"
    echo
    echo "Let op: 'bind' overleeft geen herstart. Werkt het, zeg het dan, dan"
    echo "zet ik het vast in de image in plaats van in dit scriptje."
    ;;

  status)
    command -v rfcomm >/dev/null 2>&1 && rfcomm show 0 2>/dev/null
    ls -l /dev/rfcomm* 2>/dev/null || echo "geen /dev/rfcomm* — nog niet gebonden"
    command -v bluetoothctl >/dev/null 2>&1 && bluetoothctl devices Paired 2>/dev/null
    ;;

  *)
    sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
