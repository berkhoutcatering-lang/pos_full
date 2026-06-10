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
- [ ] Testbestelling: plaats → keuken → klaar → uitgegeven. Check dat hij op
      het CFD verscheen en (met internet) in Supabase landt.
- [ ] Testprint keukenbon + kassabon; test de lade ("Lade"-knop).
- [ ] PIN-test met de myPOS-terminal als je PIN gebruikt (klein bedrag, daarna
      refund via de myPOS-app).

## Festivaldag

- Pi aan → AP komt vanzelf op → tablets verbinden automatisch.
- Alles werkt **zonder internet**: bestellen, keuken, CFD, bonnen, lade,
  offline inloggen, menu-items toevoegen (syncen later), afroepnummers.
- PIN vereist dat de **myPOS-terminal zelf** verbinding heeft (eigen simkaart
  of het AP — de Pi-bridge praat met de myPOS-cloud, dus de Pi heeft daarvoor
  óók een uplink nodig: telefoon-tethering op de ethernet/usb-poort).
  **Zonder uplink: cash-only — de kassa zegt het er eerlijk bij.**
- Bij rare problemen: Pi herstarten mag altijd — orders staan veilig in de
  outbox op de SD-kaart en niets gaat verloren.

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
