# myPOS-integratie — overdrachtsprompt

Plak dit in een nieuwe sessie (of geef het aan iemand anders) zodat het
onderzoek niet opnieuw gedaan wordt.

---

## Wat ik wil

Ik bouw een eigen kassasysteem voor mijn foodtruck (Hop & Bites). Ik wil dat een
medewerker op het kassascherm op **PIN** drukt en dat het bedrag direct op mijn
**myPOS Ultra** verschijnt, draadloos.

**De harde eis:** de kassa (een Raspberry Pi in de truck) heeft **geen
internetverbinding**. Alleen de terminal is online, via zijn eigen simkaart. Ik
wil dus dat de kassa de terminal over het lokale netwerk aanstuurt, en dat de
terminal de kaart zelf autoriseert via zijn SIM.

Een 4G-router of hotspot is een noodoplossing die ik liever niet neem, maar wel
overweeg als het echt niet anders kan.

## Mijn opstelling

- **Terminal:** myPOS Ultra, TID `80561740`, serienummer `N96N960WC05078`,
  model N96. Status `Active`, billing descriptor `HOP-BITES`.
  (Let op: mijn account heeft ook twee K3WT-terminals, `80303466` en
  `80371476` — dat zijn andere toestellen, niet degene die ik in handen heb.)
- **Kassa:** Raspberry Pi 5 met een eigen WiFi access point (`10.42.0.0/24`),
  Next.js-app en een Fastify-service ("pi-bridge") die lokaal draait.
- **Partner Portal:** Smart POS-integratie, goedgekeurd.
  Partner ID `mps-p-10007182`, Application ID `mps-app-30033712`.
- Merchant gekoppeld; integration- en merchant-credentials werken.

## Wat al is uitgezocht — niet opnieuw doen

**Lokaal aansturen over LAN (mijn voorkeur) werkt niet.**

- De juiste app is **ECR-POS Connect** (App Market → myPOS Apps), niet POSLink
  Manager. In *Cash Register Machine* + WiFi luistert hij op poort **7900**.
- Het protocol heet **IPP** en staat in myPOS' eigen .NET-SDK
  (`developermypos/myPOS-SDK-dotNET`, `myPOSTerminal.dll`). Formaat:
  2-byte big-endian lengteprefix (inclusief zichzelf), daarna
  `NAAM=WAARDE\r\n`-regels in ASCII. Elk verzoek begint met `PROTOCOL=IPP`,
  `VERSION=200`, `METHOD=...`, `SID=<uuid>`. Antwoorden dragen `STAGE` en
  `STATUS`. Geen HMAC, geen api_key.
- **Doorslaggevend:** ik heb myPOS' eigen SDK gecompileerd en tegen de terminal
  gedraaid. Die stuurt exact hetzelfde frame en krijgt **timeout**. Het ligt dus
  niet aan mijn implementatie — de terminal antwoordt niemand.
- Ook getest en dicht: USB serieel (COM-poort verschijnt, geen antwoord),
  ADB shell (geweigerd), sideloaden van een eigen app
  (`PosAuth failed`, handtekening niet geautoriseerd).
- **Vermoedelijke oorzaak:** myPOS' eigen troubleshootinggids zegt *"on some
  accounts, Cash Register mode activation requires manual enablement by the
  myPOS support team"*. Alle andere voorwaarden uit die gids zijn afgevinkt
  (firmware bijgewerkt, app bijgewerkt, statisch IP, juiste modus).

**De cloudroute (ePOS API) werkt tot aan de betaling.**

- Officiële SDK: `mypos-api-gateway` (npm, MIT, geen dependencies, Node 18+).
- Auth werkt: OAuth-token en merchant-sessie komen door,
  `GET /pos/v1/terminals` toont mijn terminals, terminaldetails werken.
- **`POST /epos/v1/payments` geeft HTTP 403 Forbidden** op mijn terminal.
  Geen 401 en geen 404, dus geauthenticeerd en de terminal bestaat — maar geen
  toestemming. Dit is de openstaande vraag.
- `terminals.activate()` uit de SDK is géén pairing maar provisioning: hij eist
  `product_code`, `currency`, `account_number`, `billing_descriptor`. Daar niet
  blind mee experimenteren, dat maakt vermoedelijk een nieuwe terminal aan.
- ERP-modus in ECR-POS Connect toont een 8-cijferige code die elke 60 seconden
  ververst ("Connect your ERP to this POS device using this code"). Waar die
  code heen moet, is nog onbekend.

## Waar het op wacht

Twee vragen liggen bij myPOS (`integrations@mypos.com`), concept staat in
`raspberry-pos-os/smoke/MYPOS-SUPPORT-VRAAG.md`:

1. Cash Register (ECR) modus vrijschakelen op mijn account.
2. Waarom geeft `POST /epos/v1/payments` een 403, en welk recht ontbreekt?

## Wat er in de codebase staat

- `apps/pi-bridge/` — Fastify-service op de Pi. myPOS-transport staat achter
  `MYPOS_TRANSPORT` (`off` of `cloud`); default `off` zodat de bridge altijd
  opstart en de rest van de kassa werkt. Cloudtransport draait op de officiële
  SDK.
- `apps/pi-bridge/scripts/mypos-pay.mjs` — losse CLI: terminals tonen,
  terminaldetails, activatie, en een testbetaling. Draait vanaf een laptop,
  heeft de Pi niet nodig.
- `raspberry-pos-os/smoke/mypos-ipp-probe.mjs` — IPP-codec en probe voor de
  LAN-route. Werkt zodra de terminal antwoordt.
- `raspberry-pos-os/smoke/mypos-ecr-probe.mjs` — poortscan en protocol-fingerprint.
- `apps/terminal-app/` — half afgebouwde Android-app die op de terminal zou
  draaien (myPOS Smart SDK + HTTP-server op het LAN). Dit is de enige route die
  écht zonder internet werkt, maar vereist dat myPOS mijn
  ondertekeningscertificaat autoriseert.
- `raspberry-pos-os/README.md` — sectie "myPOS PIN-terminal (Ultra)" met de
  volledige status.

## Wat ik van je wil

Help me met de eerstvolgende stap zodra myPOS antwoordt. Ga niet opnieuw het
protocol reverse-engineeren of transporten uitproberen die hierboven als dicht
staan aangemerkt — dat is een volledige werkdag geweest en het resultaat staat
er.
