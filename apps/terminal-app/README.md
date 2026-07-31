# Hop & Bites terminal-app

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

## Status: onvolledig, bouwt nog niet

Dit is een scaffold, geen werkende app. Bewust gecommit zodat het werk niet
verloren gaat, maar draai het niet zonder eerst af te maken.

Wat er is:

- `BridgeService.kt` — HTTP-server op poort 8080, HMAC-ondertekende requests,
  `/health`, `POST /payment`, `GET /payment?key=...`
- `PaymentActivity.kt` — onzichtbare activity die de Smart SDK-betaling host
  (de SDK levert zijn resultaat via `onActivityResult`, dus dat kan niet vanuit
  een service)
- `PaymentStore.kt` — idempotency op de kassasleutel, zodat een herhaald verzoek
  niet twee keer afrekent

Wat ontbreekt:

- **`MainActivity`** — het manifest verwijst ernaar, het bestand bestaat niet.
  Hierdoor compileert het project niet.
- **Gradle wrapper** (`gradlew`, `gradle/wrapper/`)
- Een scherm om het gedeelde geheim en het poortnummer in te stellen
- Elke vorm van testen op echte hardware

## De echte blokkade

Sideloaden op een productie-Ultra wordt geweigerd:

```
INSTALL_PARSE_FAILED_CERTIFICATE_ENCODING: PosAuth failed:
Failed to collect certificates from /data/app/.../base.apk
```

myPOS accepteert alleen apps die met een geautoriseerd certificaat zijn
ondertekend. Dit afmaken heeft dus pas zin als myPOS ons ondertekeningscertificaat
autoriseert, of als we een demo-terminal krijgen — dat is stap 2 van de
integratie-checklist in het Partner Portal.

Zie `raspberry-pos-os/smoke/MYPOS-OVERDRACHT.md` voor de volledige stand van
zaken.
