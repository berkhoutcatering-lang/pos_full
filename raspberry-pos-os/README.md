# Hop & Bites POS OS — flashbaar Raspberry Pi image

Een kant-en-klaar Raspberry Pi OS (Bookworm, arm64) image voor de Pi 5 in de
foodtruck. **Alles draait lokaal op de Pi — geen Vercel, geen internet nodig
tijdens de dienst.** Het image bevat:

- **De web-app zelf** (kassa `/pos`, keuken `/keuken`, klantdisplay `/cfd`,
  `/admin`) als Next.js standalone bundle in `/opt/pos-web`, geserveerd via
  nginx op `https://hopbites.local`
- **pi-bridge** native ingebakken (`/opt/pi-bridge`, systemd-service, geen
  Docker nodig) — myPOS-proxy, tablet-pairing, ESC/POS-printen, offline outbox,
  PGlite-cache, mDNS (`https://hopbites.local:3001`)
- **Eigen WiFi access point** (optioneel maar aanbevolen): de Pi zendt zelf
  een WPA2-netwerk uit waar de schermen mee verbinden — geen router of
  internet in de truck nodig
- **First-boot provisioning**: alle configuratie via één bestand
  (`pos-setup/pos.env`) op de bootpartitie — vanaf Windows/macOS te bewerken
- **Automatische TLS**: eigen CA + servercertificaat worden op de Pi
  gegenereerd; de CA (`pos-setup/hopbites-ca.crt`) installeer je op de tablets
- **Auto-gegenereerde secrets** (pairing-secret, admin-token, offline-auth
  secret) — blijven bewaard over reboots
- **Optionele kiosk**: Chromium fullscreen op de HDMI-uitgang (bijv. het
  lokale CFD: `https://hopbites.local/cfd`)
- Avahi/mDNS, hardware-watchdog, NTP, SSH

## Offline-gedrag (wat werkt zonder internet?)

| Functie | Zonder internet |
|---|---|
| Pagina's laden (kassa/KDS/CFD/admin) | ✅ lokaal geserveerd |
| Bestellen, bonnen printen, KDS-flow | ✅ via Pi-bridge outbox; KDS toont ook offline geplaatste orders |
| Menu (SSR) | ✅ laatste succesvolle snapshot van de Pi |
| Ingelogd blijven | ✅ offline-identity cookie + lokale claims-cache (30 dagen) |
| Opnieuw inloggen (zelfde account) | ✅ lokale wachtwoord-verificatie (argon2-cache, 30 dagen) — werkt per account nadat het één keer online op deze Pi inlogde |
| **Allereerste login van een account** | ❌ Supabase Auth heeft éénmalig internet nodig per account |
| PIN (myPOS) | ❌ nog niet — de pi-bridge gaat vandaag via de myPOS-cloud en heeft dus internet op de Pi nodig. Zie [myPOS PIN-terminal (Ultra)](#mypos-pin-terminal-ultra) voor de LAN-route die dat moet oplossen |
| Supabase-sync, dagafsluiting-data, AI | ⏳ zodra er weer internet is (ethernet/tethering) flusht de outbox |

## Image bouwen

### Optie A — GitHub Actions (aanbevolen, ~25 min)

Draai de workflow **Build Hop & Bites POS OS image** (handmatig, of door een
tag `pos-os-v*` te pushen). Het image komt als artifact uit de run. Zet
optioneel het secret `POS_OS_PASSWORD`.

### Optie B — lokaal met Docker (WSL2 vereist, 1–3 uur door emulatie)

```bash
cd raspberry-pos-os
POS_OS_PASSWORD='kies-een-wachtwoord' ./build.sh
```

Resultaat: `raspberry-pos-os/deploy/hopbites-pos-os-<datum>.img.xz`.
Een gefaalde build hervatten: `CONTINUE=1 ./build.sh`.
Let op: vanuit WSL2 draaien, niet Git Bash.

### Snelle validatie zonder volledige build

```bash
./prepare-stage.sh
docker build -f smoke/Dockerfile stage-pos/02-pi-bridge/files
docker run --rm -v "$PWD/stage-pos/04-pos-system:/work" -v "$PWD/smoke:/smoke" \
  debian:bookworm bash /smoke/provision-test.sh
```

## Flashen + configureren

1. Flash het `.img.xz` met **Raspberry Pi Imager** (kies "Use custom") of
   balenaEtcher naar een SD-kaart (16 GB+).
2. Steek de SD-kaart opnieuw in je PC. Open de partitie **bootfs** en bewerk
   `pos-setup/pos.env`:
   - `ORG_ID` + `VENUE_ID` (UUID's uit Supabase)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` **en `SUPABASE_ANON_KEY`**
     (de anon key is nodig voor de lokale web-app)
   - `AP_SSID` + `AP_PASS` (min. 8 tekens) → de Pi maakt zijn eigen
     WiFi-netwerk voor de schermen. Of gebruik `WIFI_SSID`/`WIFI_PASS` om
     met een bestaand netwerk te verbinden (niet beide — AP wint).
   - `MYPOS_*` (mag later; tot die tijd is PIN uitgeschakeld) — zie
     [myPOS PIN-terminal (Ultra)](#mypos-pin-terminal-ultra)
   - `PRINTER_NETWORK_ADDR` / `PRINTER_TYPE`
   - optioneel `KIOSK_URL=https://hopbites.local/cfd` voor een fullscreen
     CFD op de HDMI-poort
   - optioneel `ANTHROPIC_API_KEY` voor de AI-functies in /admin
3. SD-kaart in de Pi, opstarten. De eerste boot provisioned alles en schrijft
   het resultaat naar `pos-setup/STATUS.txt` op de bootpartitie.
4. Installeer `pos-setup/hopbites-ca.crt` op elke tablet (iOS: AirDrop/mail →
   profiel installeren → Certificate Trust Settings aanzetten; Android:
   Instellingen → Beveiliging → CA-certificaat installeren).
5. Verbind de tablets met het AP (`AP_SSID`) en open
   **`https://hopbites.local`** — dat is de kassa/KDS/CFD/admin. Log élk
   account één keer in terwijl er nog internet is (bijv. thuis of via
   tethering); daarna kan dat account 30 dagen offline in- en uitloggen
   (de Pi verifieert het wachtwoord dan lokaal; wachtwoord-wijzigingen in
   Supabase bereiken de Pi pas bij de volgende online login).
   (Android zonder mDNS: `https://pos.lan` of `https://10.42.0.1` werkt ook.)
6. Pair de tablets met de Pi-bridge via admin → Devices.

`pos.env` wordt bij **elke** boot opnieuw ingelezen: wijziging nodig? Pas het
bestand aan (op de SD-kaart of via SSH in `/boot/firmware/pos-setup/`) en
herstart de Pi.

> **Let op:** wijzig je later `SUPABASE_URL`/`SUPABASE_ANON_KEY`, wis dan op
> de tablets de sitedata (de service worker cachet de oude bundle).

## myPOS PIN-terminal (Ultra)

> **Status: geblokkeerd op myPOS. PIN werkt nog niet.**
>
> De terminal accepteert TCP-verbindingen op poort 7900 maar antwoordt op geen
> enkel protocol dat we konden afleiden uit myPOS' eigen SDK's. Vermoeden: er is
> een koppelstap ("key pairing") nodig voordat de terminal commando's van een
> kassa accepteert. De vraag staat uit bij myPOS — zie
> [MYPOS-SUPPORT-VRAAG.md](smoke/MYPOS-SUPPORT-VRAAG.md).
>
> De transportlaag in de pi-bridge (`MYPOS_TRANSPORT=ecr`) spreekt momenteel het
> JSON+HMAC-protocol uit `mypos-js`, en dat is **aantoonbaar niet** wat deze
> terminal spreekt. Die moet herschreven worden zodra het juiste protocol
> bekend is.
>
> Dit blokkeert de rest niet: PIN staat standaard uit (`MYPOS_TRANSPORT=off`),
> de Pi start daar prima mee op, en alles behalve pinnen werkt volledig.

In de truck heeft alleen de Ultra internet, via zijn eigen simkaart. De Pi niet:
`wlan0` kan niet tegelijk AP zijn én met een ander WiFi verbinden, dus in
AP-modus is er geen uplink. De cloud-route valt daarmee af — de Pi moet de
terminal **direct over het lokale netwerk** aansturen. De Ultra houdt zijn SIM
voor de bankautorisatie; het WiFi is puur het commandokanaal vanaf de Pi.

Het protocol daarvoor is niet gedocumenteerd op developers.mypos.com, maar
myPOS' eigen npm-SDK bevat een werkende implementatie
([`mypos-js`](https://github.com/developermypos/mypos-js),
`resources/devices/semi-integrated/base-request.js`): een kale TCP-socket, één
JSON-blob, HMAC-SHA256-signature, en een `status: 100` die "bezig" betekent
zolang de klant nog niet getikt heeft.

> Rondzwervende handleidingen die een HTTP `POST /payment` met
> `{amount, currency, reference_number}` beschrijven zijn **niet echt** — geen
> authenticatie, en ze spreken myPOS' eigen SDK tegen. Niet op bouwen.

### 1. Sleutels ophalen

Op [merchant.mypos.com](https://merchant.mypos.com) → **Integraties → REST API**
→ *Nieuwe referenties genereren*. Je krijgt een **klantnummer** en
**klantgeheim**; die zijn de `api_key`/`api_secret` uit de SDK.

Let op: dit is een ander paar dan de Partner Portal-credentials
(`MYPOS_PARTNER_ID`/`MYPOS_APP_ID`/`MYPOS_SESSION_SECRET` in `pos.env`) — die
horen bij de cloud-route. Deze sleutels horen **alleen op de Pi**, nooit in de
root-`.env` of bij Vercel.

### 2. Terminal-ID opzoeken

```powershell
$env:MYPOS_API_KEY = '<klantnummer>'
$env:MYPOS_API_SECRET = '<klantgeheim>'
node raspberry-pos-os\smoke\mypos-devices.mjs
```

Draai dit op een machine mét internet (je laptop), niet op de Pi. Je krijgt per
terminal `terminal_id`, `serial_number` en `model`. Heb je meerdere terminals
van hetzelfde model, dan is het serienummer wat ze onderscheidt — dat staat op
de terminal onder `Settings → About Terminal` en op de sticker.

### 3. Ultra aan het netwerk van de Pi

Op de terminal: `Network & Internet → Wi-Fi` → jouw `AP_SSID`. **Vóór** je op
verbinden tikt, geavanceerde opties openen en een statisch IP zetten:

| | |
|---|---|
| IP-adres | `10.42.0.5` |
| Gateway | `10.42.0.1` |
| Prefix | `24` |
| DNS | `10.42.0.1` |

Kies iets **onder** `10.42.0.10`: NetworkManager draait in shared mode een
DHCP-pool van `.10` t/m `.254`, dus een statisch adres daarbinnen kan botsen
met een tablet.

Android meldt dat dit netwerk geen internet heeft — verbonden blijven, en
mobiele data aan laten staan.

### 4. ECR-POS Connect installeren

1. `Settings → About Terminal → Update Configuration → Update Software → Update All`
2. `App Market → Categories → myPOS Apps → ECR-POS Connect` → installeren
3. App openen → BTW-nummer → *Cash Register Machine* → WiFi als verbinding naar
   de kassa

Het scherm toont dan "Waiting for data from cash register" met een IP en poort.
De app moet **open op de voorgrond** blijven: geminimaliseerd weigert de
terminal de socket.

### 5. Protocol bevestigen

Eerst zonder sleutels — dit stuurt geen betaalopdracht, alleen een poortscan en
een passieve banner-lees:

```bash
node raspberry-pos-os/smoke/mypos-ecr-probe.mjs --host 10.42.0.5
```

Vindt hij een open poort, dan de echte probe. De terminal wordt hierbij wakker
en toont het bedrag — laat de transactie aflopen of annuleer hem, niet met een
kaart doorgaan:

```bash
export MYPOS_API_KEY='<klantnummer>'
export MYPOS_API_SECRET='<klantgeheim>'
node raspberry-pos-os/smoke/mypos-ecr-probe.mjs --host 10.42.0.5 \
     --pay 0.01 --tid <TERMINAL_ID> --http
```

Geef de sleutels via de omgeving door, niet als CLI-argument: argumenten zijn
op Linux zichtbaar in de procestabel voor elke andere gebruiker.

### Wat er tot nu toe vaststaat

| | |
|---|---|
| Klantnummer/klantgeheim | geldig — token via `auth-api.mypos.com/oauth/token`, 24u |
| OAuth-scope | `webhooks` (scope `devices` bestaat niet) |
| Terminals opvragen | `GET devices-api.mypos.com/v1/devices` **mét** JSON-body `{}` |
| ePOS API (cloud) | werkt alleen mét internet op de Pi — vandaar deze route |
| Poort op de Ultra | **onbevestigd**: SDK zegt 8888, ECR-docs zeggen 7900 |
| Lokaal protocol | **onbevestigd** — dat is wat stap 5 uitwijst |

`GET` mét body kan niet via `fetch()` (die gooit de body stil weg); de scripts
gebruiken daarom `node:https`.

### 6. Aanzetten

Vul in `pos.env` in: `MYPOS_TRANSPORT=ecr`, `MYPOS_ECR_HOST`, `MYPOS_ECR_PORT`,
`MYPOS_API_KEY`, `MYPOS_API_SECRET` en `MYPOS_TID` (of `MYPOS_SN`). Herstart de
Pi en controleer `pos-setup/STATUS.txt`: daar hoort `myPOS PIN: geconfigureerd
(ecr)` te staan.

Ontbreekt er een sleutel, dan valt de provisioning terug op `off` met een
waarschuwing in STATUS.txt — de pi-bridge start dan gewoon door, alleen zonder
PIN. Controleren kan ook via
`curl -k -H "x-admin-token: <token>" https://hopbites.local:3001/_health`, die
`mypos_transport` en `mypos_target` teruggeeft.

Zit de bedrag-eenheid ernaast, dan is dat `MYPOS_ECR_AMOUNT_UNIT=cent` in
`pos.env` — geen codewijziging.

## Inloggen / beheer

- SSH: `ssh hopbites@hopbites.local` — wachtwoord = `POS_OS_PASSWORD` bij de
  build (default `hopbites2026`, **wijzig dit**).
- **Raspberry Pi Connect** (remote shell via de browser, ook buiten je eigen
  netwerk): zet `ENABLE_RPI_CONNECT=1` in `pos.env`, herstart, en koppel
  eenmalig via SSH met `rpi-connect signin` (Raspberry Pi ID nodig). Daarna
  bereikbaar op https://connect.raspberrypi.com. Let op: alleen shell-toegang;
  screen sharing vereist een desktop en zit niet in dit Lite-image.
  **Pi Connect heeft internet op de Pi nodig** (clouddienst): in AP-modus dus
  een uplink via ethernet of USB-tethering — de signin geeft anders een
  API-error. Zit je zelf op het AP-netwerk, dan is Pi Connect overbodig:
  `ssh hopbites@hopbites.local` werkt daar direct. Zonder internet staat een
  gekoppelde Pi gewoon als "unreachable" en verbindt hij automatisch opnieuw
  zodra er weer internet is.
- Logs: `journalctl -u pos-web -f` (web-app), `journalctl -u pi-bridge -f`,
  provisioning: `journalctl -u pos-provision`.
- Health: `curl -k https://hopbites.local:3001/_health` en
  `curl -k https://hopbites.local` (moet een redirect naar /login geven).
- Config geweigerd? De services starten bewust niet zolang `pos.env` ongeldig
  is — zie `pos-setup/STATUS.txt` voor wat er ontbreekt.

## Architectuur in het image

| Onderdeel | Locatie |
|---|---|
| Web-app (Next.js standalone, arm64) | `/opt/pos-web` (poort 3000, alleen localhost) |
| nginx TLS-proxy voor de web-app | poort 443/80 → `127.0.0.1:3000` |
| pi-bridge app (gebouwd, arm64) | `/opt/pi-bridge` (poort 3001) |
| Runtime-config (gegenereerd) | `/etc/pi-bridge/env`, `/etc/pos-web/env` |
| TLS (CA + servercert, gedeeld) | `/etc/pi-bridge/tls/` |
| Databases (SQLite outbox, PGlite) | `/data/` |
| Offline-cache web-app (menu/claims/orders) | `/var/lib/pos-web/` |
| Gegenereerde secrets | `/var/lib/pos/secrets.env` |
| Bewerkbare config | `/boot/firmware/pos-setup/pos.env` |
| Services | `pos-web.service`, `pi-bridge.service`, `nginx`, `pos-provision.service`, `pos-kiosk.service` |

### Hoe de web-app zijn Supabase-keys krijgt

`NEXT_PUBLIC_*` waarden zitten compile-time in de Next.js bundle. Het image
wordt gebouwd met unieke placeholders; `pos-provision.sh` vervangt die bij
elke boot door de echte waarden uit `pos.env` (en onthoudt de huidige waarden
in `/var/lib/pos/web-subst.env`, zodat een latere wijziging opnieuw
gesubstitueerd wordt). Eén image werkt dus voor elk Supabase-project.

De oude Docker-gebaseerde deploy (`apps/pi-bridge/systemd/pi-bridge.service` +
`Dockerfile`) blijft bestaan voor dev/shadow-omgevingen; het image gebruikt de
native variant hierboven.
