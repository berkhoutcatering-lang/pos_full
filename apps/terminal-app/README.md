# Hop & Bites terminal-app

> **Stilgelegd per 2026-08-17.** De eis dat de Pi geen internet heeft is
> losgelaten: de Pi hangt aan WiFi en pinnen loopt via de myPOS ePOS API
> (`MYPOS_TRANSPORT=cloud`). Deze app lost daarmee een probleem op dat we niet
> meer hebben, en kost per codewijziging 1–3 werkdagen reviewtijd bij myPOS.
>
> Hij is af en bouwt, en blijft staan voor het geval de cloud-route alsnog
> dichtgaat. Alles hieronder klopt nog; er wordt alleen niet aan doorgewerkt.
> Zie `raspberry-pos-os/smoke/MYPOS-OVERDRACHT.md` voor de afweging.

Android-app die **op de myPOS Ultra zelf** draait, zodat de kassa kan pinnen
zonder eigen internetverbinding.

De Pi in de truck heeft geen uplink; alleen de terminal is online via zijn eigen
simkaart. Deze app draait een kleine HTTP-server op het lokale netwerk, neemt
betaalverzoeken van de kassa aan, en voert ze uit met de myPOS Smart SDK. De
terminal autoriseert de kaart zelf. Beide kanten van dat protocol zijn van ons,
dus er valt niets te reverse-engineeren.

```
Pi (geen internet)
 └── WiFi LAN ──> Ultra (eigen simkaart)
                   └── deze app
                        └── myPOS Smart SDK ──> autorisatie via SIM
```

## Protocol

Alle verzoeken behalve `/health` dragen `X-Signature`: een HMAC-SHA256 (hex) over
de body bij POST, of over de querystring bij GET, met de koppelsleutel die op het
terminalscherm staat. Zonder die sleutel kan alles op het truck-WiFi een
betaalscherm openen.

| Route                             | Antwoord                                                        |
| --------------------------------- | --------------------------------------------------------------- |
| `GET /health`                     | `{ok, version, paired}` — ongetekend, zodat de kassa kan ontdekken |
| `POST /payment`                   | `{status, reused}` — body: `idempotency_key`, `amount_cents`, `reference` |
| `GET /payment?key=<idempotency>`  | `{status, code, message, stale}`                                  |

`status` is `pending`, `approved`, `declined` of `failed`.

**`stale` is het veld dat je niet moet negeren.** Als een betaling langer dan drie
minuten op `pending` staat, is er iets misgegaan tussen deze app en de myPOS-app.
We raden dan níet: de kassa hoort "controleer de terminal" te tonen en de
medewerker beslist. Een kaart die wél belast is maar als onbetaald wordt geboekt,
is erger dan een trage checkout.

Herhaalde `POST /payment` met dezelfde `idempotency_key` levert de bestaande
betaling op (`reused: true`) en start er géén tweede. De uitkomst wordt naar
`filesDir/payments.json` weggeschreven vóórdat de call terugkeert, dus een
goedgekeurde betaling overleeft het wegvallen van het proces.

## Bouwen

```bash
cd apps/terminal-app && ./gradlew assembleRelease
```

Vereist JDK 17 (de JBR van Android Studio voldoet) en Android SDK 34. Levert
`app/build/outputs/apk/release/app-release-unsigned.apk`.

Dat die APK ongetekend is, is geen omissie: myPOS ondertekent zelf bij
distributie (zie hieronder), dus dit ís het bestand dat je uploadt.

## Op de terminal krijgen

Sideloaden op een productie-Ultra wordt geweigerd:

```
INSTALL_PARSE_FAILED_CERTIFICATE_ENCODING: PosAuth failed
```

Dat is geen bug en geen ontbrekende toestemming op ons certificaat: myPOS
ondertekent apps zélf met hun PCI Certification Key bij distributie. Zelf
ondertekenen kan principieel nooit werken. Er zijn twee wegen:

1. **Developer-terminal.** Demo-account via het Partner Portal
   ("Create (Demo) Account"), testtoestel via `sales@mypos.com`. Daarop werkt
   `adb install` wel. Dit is de enige manier om snel te itereren.
2. **Test-AppMarket.** Je stuurt de APK naar je myPOS-contact, die zet hem in de
   testomgeving, en je installeert hem op je eigen Ultra via de AppMarket-app.

Voor productie: indienen bij AppMarket met de **TID Allow List** gevuld met
alleen `80561740`. Daarmee is de app onzichtbaar voor iedere andere myPOS-klant —
dat is de bedoelde weg voor eigen en klant-specifieke uitrol, niet een omweg.
Reactietermijn op een inzending is 1–3 werkdagen.

## Netwerkopstelling — één ding niet verkeerd doen

De Ultra hangt aan het AP van de Pi, dat geen internet heeft. Android merkt dat
en houdt mobiele data als default-route voor internetverkeer, terwijl
`10.42.0.0/24` direct bereikbaar blijft via WiFi. Precies wat we willen.

**Ga daarom Android's connectiviteitscheck niet faken op de Pi** om het
uitroeptekentje bij het WiFi-icoon weg te krijgen. Dan denkt Android dat die
WiFi internet heeft, routeert het de autorisatie daarheen, en faalt elke
transactie.

## Wat er nog niet is

Beide punten zijn blijven liggen toen de cloud-route werd gekozen; ze staan hier
zodat duidelijk is wat er nog moet gebeuren als deze app ooit weer opgepakt
wordt.

- De `terminal`-transport aan de Pi-kant (`apps/pi-bridge`, naast `off` en
  `cloud`). Dit is de tegenkant van bovenstaand protocol.
- Testen op echte hardware — kan pas zodra de app via een van de twee wegen
  hierboven op een toestel staat.

Zie `raspberry-pos-os/smoke/MYPOS-OVERDRACHT.md` voor de volledige stand van
zaken rond myPOS.
