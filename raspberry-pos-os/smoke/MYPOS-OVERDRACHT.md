# myPOS-integratie — overdrachtsprompt

Plak dit in een nieuwe sessie (of geef het aan iemand anders) zodat het
onderzoek niet opnieuw gedaan wordt.

---

## Wat ik wil

Ik bouw een eigen kassasysteem voor mijn foodtruck (Hop & Bites). Ik wil dat een
medewerker op het kassascherm op **PIN** drukt en dat het bedrag direct op mijn
**myPOS Ultra** verschijnt, draadloos.

**~~De harde eis~~ — vervallen per 2026-08-17.** De oorspronkelijke eis was dat
de kassa (een Raspberry Pi in de truck) **geen internetverbinding** heeft:
alleen de terminal online via zijn eigen simkaart, en de kassa die de terminal
over het lokale netwerk aanstuurt.

Die eis is losgelaten. Geen van de lokale routes bleek begaanbaar (zie
hieronder), en de Pi mag nu gewoon op WiFi. Daarmee is **de ePOS-cloud-API de
gekozen route**. De rest van de kassa blijft wel offline-first: alleen pinnen
heeft de uplink nodig.

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
  ADB shell (geweigerd), sideloaden van een eigen app (`PosAuth failed`).
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

**Gekozen richting per 2026-08-17: de ePOS-cloud-API.** De Pi hangt aan WiFi
met internet en roept de myPOS API Gateway aan; myPOS duwt het bedrag naar de
Ultra, die de kaart via zijn eigen SIM autoriseert.

Dat pad is geïmplementeerd en getest tot aan de openstaande 403 hieronder:
`apps/pi-bridge/src/services/mypos-proxy.ts` (inclusief herstel na een
weggevallen verbinding), `POST /mypos/start|status|cancel|refund`, en de
kassa-flow in `apps/web/app/(pos)/pos/components/checkout-pin.tsx`.

**Het enige dat nu nog blokkeert is de HTTP 403 op `POST /epos/v1/payments`.**
Onbeproefd spoor: de troubleshootinggids eist dat **POSLink Manager** draait
met *Pair Type* expliciet op **EPOS mode**. Die app is eerder terzijde
geschoven als "verkeerd" — dat klopt voor de LAN-route, maar niet voor ePOS.
Test daarna met `node apps/pi-bridge/scripts/mypos-pay.mjs --pay 0.01`.

**De eigen app op de Ultra (`apps/terminal-app/`) ligt stil.** Hij is af en
bouwt, maar hij lost een probleem op dat we niet meer hebben, en hij kost per
codewijziging een reviewcyclus van 1–3 werkdagen bij myPOS. Bewaard voor het
geval de cloud-route alsnog dicht blijkt. Wat daarvoor nodig was:

`PosAuth failed` was géén ontbrekende toestemming op ons certificaat. myPOS
ondertekent apps zélf met hun PCI Certification Key bij distributie — hun eigen
troubleshootinggids zegt letterlijk *"Upload an unsigned release APK — myPOS
applies the correct signature during distribution."* Zelf ondertekenen kan dus
principieel nooit werken; daar is niets aan te repareren.

De weg naar binnen loopt via AppMarket, en dat hoeft niet publiek: de
upload-pagina heeft een **TID Allow List** ("Add terminal IDs if the app should
be visible only on specific POS devices"). Alleen `80561740` erin en de app is
voor niemand anders zichtbaar.

Aan te vragen bij myPOS (`online@mypos.com`, niet `integrations@`):

1. Een demo-developer-account — het Partner Portal heeft "Create (Demo) Account"
   naast de gewone.
2. Een testtoestel via `sales@mypos.com`. Op een developer-terminal werkt
   `adb install` wél. Zonder dat zit elke codewijziging vast aan een
   reviewcyclus van 1–3 werkdagen.
3. Alternatief zonder testtoestel: APK naar je myPOS-contact, die zet hem in de
   test-AppMarket, en je installeert hem op de eigen Ultra via de AppMarket-app.

**Waarom de LAN/ECR-route is losgelaten**, ook als support hem vrijschakelt: in
IPP STAGE 4 kan de terminal de kassa gebruiken als netwerkpad naar de myPOS-host.
Als de Ultra dat doet heeft de Pi alsnog internet nodig en vervalt het hele
offline-voordeel. Dagen wachten op een vrijschakeling voor een route die de eis
misschien niet eens haalt, is niet de moeite.

De oude vraag over `POST /epos/v1/payments` → 403 is daarmee geen zijspoor meer
maar **het** openstaande punt: zonder dat werkt pinnen niet.

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
- `apps/terminal-app/` — Android-app die op de terminal draait (myPOS Smart SDK
  + HTTP-server op het LAN). De enige route die écht zonder internet werkt,
  maar sinds 2026-08-17 stilgelegd ten gunste van de cloud-API. **Af en bouwt**
  (`./gradlew assembleRelease`); zie de README daar.
- `raspberry-pos-os/README.md` — sectie "myPOS PIN-terminal (Ultra)" met de
  volledige status.

## Wat ik van je wil

Help me met de eerstvolgende stap zodra myPOS antwoordt. Ga niet opnieuw het
protocol reverse-engineeren of transporten uitproberen die hierboven als dicht
staan aangemerkt — dat is een volledige werkdag geweest en het resultaat staat
er.
