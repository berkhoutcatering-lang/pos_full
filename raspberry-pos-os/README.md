# Hop & Bites POS OS — flashbaar Raspberry Pi image

Een kant-en-klaar Raspberry Pi OS (Bookworm, arm64) image voor de Pi 5 in de
foodtruck. Het image bevat:

- **pi-bridge** native ingebakken (`/opt/pi-bridge`, systemd-service, geen
  Docker nodig) — myPOS-proxy, tablet-pairing, ESC/POS-printen, offline outbox,
  PGlite-cache, mDNS (`https://hopbites.local:3001`)
- **First-boot provisioning**: alle configuratie via één bestand
  (`pos-setup/pos.env`) op de bootpartitie — vanaf Windows/macOS te bewerken
- **Automatische TLS**: eigen CA + servercertificaat worden op de Pi
  gegenereerd; de CA (`pos-setup/hopbites-ca.crt`) installeer je op de tablets
- **Auto-gegenereerde secrets** (pairing-secret, admin-token) — blijven bewaard
  over reboots
- **Optionele kiosk**: Chromium fullscreen op de HDMI-uitgang (bijv. de CFD)
- Avahi/mDNS, hardware-watchdog, NTP, SSH

De web-app zelf (kassa/KDS/CFD/admin) blijft op Vercel draaien; tablets
gebruiken de PWA en praten via LAN met de Pi-bridge.

## Image bouwen

### Optie A — lokaal met Docker (WSL2 aanbevolen)

Vereist Docker met arm64-emulatie (Docker Desktop heeft dat standaard).
De build draait pi-gen in een privileged container en duurt 1–3 uur
(qemu-emulatie). Vanuit WSL2 of Git Bash:

```bash
cd raspberry-pos-os
POS_OS_PASSWORD='kies-een-wachtwoord' ./build.sh
```

Resultaat: `raspberry-pos-os/deploy/hopbites-pos-os-<datum>.img.xz`.
Een gefaalde build hervatten: `CONTINUE=1 ./build.sh`.

### Optie B — GitHub Actions

Push de repo naar GitHub en draai de workflow **Build Hop & Bites POS OS
image** (handmatig, of door een tag `pos-os-v*` te pushen). Het image komt als
artifact uit de run. Zet optioneel het secret `POS_OS_PASSWORD`.

### Snelle validatie zonder volledige build

```bash
./prepare-stage.sh
docker build -f smoke/Dockerfile stage-pos/02-pi-bridge/files
```

Dit draait exact dezelfde npm/tsc-stappen als de image-build (op amd64).

## Flashen + configureren

1. Flash het `.img.xz` met **Raspberry Pi Imager** (kies "Use custom") of
   balenaEtcher naar een SD-kaart (16 GB+).
2. Steek de SD-kaart opnieuw in je PC. Open de partitie **bootfs** en bewerk
   `pos-setup/pos.env`:
   - `ORG_ID` + `VENUE_ID` (UUID's uit Supabase)
   - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
   - `MYPOS_*` (mag later; tot die tijd is PIN uitgeschakeld)
   - `WIFI_SSID` / `WIFI_PASS` (of gebruik ethernet)
   - `PRINTER_NETWORK_ADDR` / `PRINTER_TYPE`
   - `ALLOWED_ORIGINS=https://<jouw-app>.vercel.app` — verplicht als de PWA
     niet op `hopbites.app` draait, anders blokkeert CORS de tablets
   - optioneel `KIOSK_URL` voor een fullscreen CFD op de HDMI-poort
3. SD-kaart in de Pi, opstarten. De eerste boot provisioned alles en schrijft
   het resultaat naar `pos-setup/STATUS.txt` op de bootpartitie.
4. Installeer `pos-setup/hopbites-ca.crt` op elke tablet (iOS: AirDrop/mail →
   profiel installeren → Certificate Trust Settings aanzetten; Android:
   Instellingen → Beveiliging → CA-certificaat installeren).
5. Tablets verbinden met `https://hopbites.local:3001` (pairing via de
   admin → Devices flow).

`pos.env` wordt bij **elke** boot opnieuw ingelezen: wijziging nodig? Pas het
bestand aan (op de SD-kaart of via SSH in `/boot/firmware/pos-setup/`) en
herstart de Pi.

## Inloggen / beheer

- SSH: `ssh hopbites@hopbites.local` — wachtwoord = `POS_OS_PASSWORD` bij de
  build (default `hopbites2026`, **wijzig dit**).
- **Raspberry Pi Connect** (remote shell via de browser, ook buiten je eigen
  netwerk): zet `ENABLE_RPI_CONNECT=1` in `pos.env`, herstart, en koppel
  eenmalig via SSH met `rpi-connect signin` (Raspberry Pi ID nodig). Daarna
  bereikbaar op https://connect.raspberrypi.com. Let op: alleen shell-toegang;
  screen sharing vereist een desktop en zit niet in dit Lite-image.
- Logs: `journalctl -u pi-bridge -f`, provisioning: `journalctl -u pos-provision`.
- Health: `curl -k https://hopbites.local:3001/_health`.
- Config geweigerd? De service start bewust niet zolang `pos.env` ongeldig is —
  zie `pos-setup/STATUS.txt` voor wat er ontbreekt.

## Architectuur in het image

| Onderdeel | Locatie |
|---|---|
| pi-bridge app (gebouwd, arm64) | `/opt/pi-bridge` |
| Runtime-config (gegenereerd) | `/etc/pi-bridge/env` |
| TLS (CA + servercert) | `/etc/pi-bridge/tls/` |
| Databases (SQLite outbox, PGlite) | `/data/` |
| Gegenereerde secrets | `/var/lib/pos/secrets.env` |
| Bewerkbare config | `/boot/firmware/pos-setup/pos.env` |
| Services | `pi-bridge.service`, `pos-provision.service`, `pos-kiosk.service` |

De oude Docker-gebaseerde deploy (`apps/pi-bridge/systemd/pi-bridge.service` +
`Dockerfile`) blijft bestaan voor dev/shadow-omgevingen; het image gebruikt de
native variant hierboven.
