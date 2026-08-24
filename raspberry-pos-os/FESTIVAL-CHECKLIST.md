# Festival-runbook — Hop & Bites POS op de Pi

Go-live checklist voor een foodtruckfestival. Versie: **pos-os-v0.5.0 of
nieuwer** (oudere images syncen geen orders naar de cloud — niet gebruiken).

## Een week ervoor

- [ ] Flash het nieuwste image (`pos-os-v*` artifact uit GitHub Actions).
- [ ] Vul `pos-setup/pos.env` op de bootfs-partitie:
  - `ORG_ID`, `VENUE_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
  - `AP_SSID` + `AP_PASS` (eigen netwerk voor de schermen)
  - `PRINTER_NETWORK_ADDR` + `PRINTER_TYPE` (printer moet op het AP of via ethernet aan de Pi hangen)
  - `MYPOS_*` voor PIN (zonder deze is de kassa cash-only — werkt ook)
  - optioneel `KIOSK_URL=https://hopbites.local/cfd` voor het klantenscherm op HDMI
- [ ] Eerste boot **met internet** (ethernetkabel): provisioning draait, menu-cache
      warmt op, `pos-setup/STATUS.txt` zegt "Config OK".
- [ ] Installeer `pos-setup/hopbites-ca.crt` op élke tablet/laptop.
- [ ] Menu invullen op `https://hopbites.local/admin/menu` (items, optiegroepen,
      combo's, staffels) — menu bewerken vereist internet.

## De avond ervoor (met internet!)

- [ ] **Log élk account in** dat op het festival gebruikt wordt (kassa, keuken,
      CFD). Eén keer online inloggen = 30 dagen offline kunnen inloggen.
- [ ] **Pair elke tablet**: admin → Apparaten → code genereren → invoeren op
      `https://hopbites.local/pair` op de tablet.
- [ ] Open op elke tablet één keer het scherm dat hij gaat tonen (/pos, /keuken,
      /cfd) zodat menu- en claims-caches gevuld zijn.
- [ ] Sunmi T3 (of ander dual-screen apparaat): open op het klantgerichte
      scherm een tweede browservenster met `https://hopbites.local/klant` —
      dat kijkt live mee met de bon en toont na betaling het afroepnummer.
- [ ] Testbestelling: plaats → keuken → klaar → uitgegeven. Check dat hij op
      het CFD verscheen en (met internet) in Supabase landt.
- [ ] Testprint keukenbon + kassabon; test de lade ("Lade"-knop).
- [ ] PIN-test met de myPOS-terminal als je PIN gebruikt (klein bedrag, daarna
      refund via de myPOS-app).

## Festivaldag

- Pi aan → AP komt vanzelf op → tablets verbinden automatisch.
- Alles werkt **zonder internet**: bestellen, keuken, CFD, bonnen, lade,
  offline inloggen, menu-items toevoegen (syncen later), afroepnummers.
- PIN werkt **zonder internet op de Pi**, mits de terminal aan de USB van het
  kassascherm hangt en zijn eigen WiFi uit staat — zie het hoofdstuk hieronder.
  Gaat er iets mis met de terminal, dan zegt de kassa het er eerlijk bij en kun
  je contant door.
- Bij rare problemen: Pi herstarten mag altijd — orders staan veilig in de
  outbox op de SD-kaart en niets gaat verloren.

## PIN op het eigen netwerk — de terminal aan het kassascherm

De opstelling waar geen router en geen internet aan te pas komt.

```
  terminal --USB--> kassascherm --WiFi--> Pi (access point)
     |
     +-- simkaart --> de bank
```

**Waarom via een kabel en niet via het AP.** Hangt de terminal aan een
WiFi-netwerk zonder internet, dan stuurt Android het bankverkeer daarheen in
plaats van over de simkaart en mislukt élke transactie — je ziet dan
`APPROVAL=91` ("issuer or switch inoperative") op de terminal. Aan een kabel
staat zijn WiFi uit en is de sim de enige uitweg. Dat de Pi vervolgens over het
AP met het kassascherm praat is ons eigen verkeer en raakt de bank niet.

**De Pi heeft dus geen uplink nodig voor pinnen.** Wat er zonder internet niet
gebeurt is de sync naar Supabase; die wacht in de outbox tot je weer thuis bent.

### Eenmalig klaarzetten

- [ ] **Terminal**: POSLink Manager → Settings → Change connection type → **USB**.
      Daarna WiFi op de terminal **helemaal uit** — vergeet dit niet, dit is de
      hele reden voor deze opstelling.
- [ ] **Datakabel** van de terminal naar het kassascherm. Een brandend
      laadlampje bewijst niet dat het er een is.
- [ ] **Kassascherm** op het AP (`AP_SSID` uit pos.env). Windows vraagt bij een
      nieuw netwerk om openbaar of privé: kies **privé**, anders blokkeert de
      firewall poort 7901 en lijkt de terminal stuk.
- [ ] **Vast adres** voor het kassascherm op dat netwerk. De DHCP-pool van de Pi
      begint bij `.10`, dus neem iets daaronder: IP `10.42.0.5`, gateway en DNS
      `10.42.0.1`, masker `255.255.255.0`. Zonder vast adres wijst
      `MYPOS_TERMINAL_HOST` na een herstart naar niets.
- [ ] **Doorgeefluik installeren** op het kassascherm (eenmalig, met internet):
      `cd tools/usb-relay && npm install`
- [ ] In `pos-setup/pos.env` op de Pi:
      ```
      MYPOS_TRANSPORT=lan
      MYPOS_TERMINAL_HOST=10.42.0.5
      MYPOS_TERMINAL_PORT=7901
      ```

### Op de dag, in deze volgorde

1. Pi aan. Het AP komt vanzelf op.
2. Kassascherm verbindt met het AP; controleer dat hij `10.42.0.5` heeft.
3. Terminal met de kabel aan het kassascherm, WiFi op de terminal uit.
4. Doorgeefluik starten en **open laten staan**:
   ```
   node tools/usb-relay/relay.mjs --allow 10.42.0.1
   ```
   Hij zoekt de terminal zelf op en drukt af wat er in pos.env hoort.
5. Toets vanaf de Pi of er een frame doorheen komt (leest alleen):
   ```
   ssh hopbites@10.42.0.1 "node mypos-ipp.mjs --host 10.42.0.5 --method GET_STATUS"
   ```
   `STAGE=5 STATUS=0` = klaar. Staat er `STATUS=20`, dan hangt er nog een
   transactie open; de bridge maakt die bij de eerste betaling zelf los.
6. Eén echte betaling van **€1,00**. Onder een euro weigert de bridge zelf en
   stelt contant voor — dat is geen storing maar een ondergrens van de bank.

### Als pinnen het niet doet

| Wat je ziet | Waar het bijna altijd aan ligt |
|---|---|
| `npm run list` toont geen terminal | Kabel (laad-only), of POSLink Manager staat nog op WiFi |
| Pi kan niet verbinden | Windows-firewall op openbaar, of het kassascherm heeft een ander adres |
| `APPROVAL=91` op de terminal | De WiFi van de terminal staat nog aan |
| Kassa zegt "vorige betaling staat nog open" | De bridge ruimt dat zelf op; herhalen. Lukt het niet: terminal herstarten |
| Kassascherm reageert niet meer | Slaapstand. Zet die uit in Energiebeheer terwijl hij aan de stroom hangt |

## Na afloop

- [ ] Pi aan internet (thuis/ethernet). De outbox flusht automatisch binnen
      seconden alles naar Supabase (orders, statussen, audit-events).
- [ ] Check admin → Dashboard: omzet en orders van vandaag kloppen.
- [ ] Draai de **Dagafsluiting** (vereist internet): "Dag afsluiten + Z-bon
      printen". Dit verzegelt de dag in de audit-keten — kan maar één keer.

## Eerlijke beperkingen (geaccepteerd voor festivalgebruik)

| Beperking | Workaround |
|---|---|
| Refund-registratie vereist internet (knop "Terugbetalen" in KDS-geschiedenis, manager-only) | Geld zelf kan altijd direct handmatig retour (lade / myPOS-app); registreer de refund 's avonds alsnog. |
| Dagafsluiting offline | Doe hem 's avonds thuis met internet — de cijfers zijn dan compleet gesynct. |
| Menu/optiegroepen/deals bewerken offline | Alleen losse items toevoegen werkt offline; groepen/deals thuis voorbereiden. |
| Eerste login van een NIEUW account | Vereist internet — regel accounts de avond ervoor. |
