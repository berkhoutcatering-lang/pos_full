# USB-doorgeefluik voor de betaalterminal

De myPOS Ultra hangt met een kabel aan het kassascherm (een Surface). De
pi-bridge draait op de Raspberry Pi en kan niet bij die USB-poort. Dit
programma zet de COM-poort van de terminal op het netwerk, zodat de bridge er
precies zo tegen praat als tegen een terminal die zelf op WiFi zit.

## Waarom een kabel en niet WiFi

Hangt de terminal aan een WiFi-netwerk zonder internet, dan stuurt Android het
bankverkeer daarheen in plaats van over de simkaart, en mislukt elke
transactie. Aan een kabel staat zijn WiFi uit en is de sim de enige uitweg.

Dat de Pi vervolgens over het netwerk met dit programma praat verandert daar
niets aan: dat is ons eigen verkeer tussen twee apparaten die we zelf beheren,
niet het verkeer naar de bank.

## Eenmalig instellen

Op het kassascherm, met [Node.js](https://nodejs.org) geïnstalleerd:

```
cd tools\usb-relay
npm install
```

Zet de terminal op **POSLink Manager → Settings → Change connection type →
USB** en sluit hem met een **datakabel** aan. Een brandend laadlampje bewijst
niet dat het er een is.

Kijken of hij gezien wordt:

```
npm run list
```

## Draaien

```
node relay.mjs --allow 192.168.1.88
```

Hij zoekt de terminal zelf op en drukt af wat er in `pos.env` op de Pi moet:

```
MYPOS_TRANSPORT=lan
MYPOS_TERMINAL_HOST=<adres van dit kassascherm>
MYPOS_TERMINAL_PORT=7901
```

`--allow` beperkt wie er verbinding mag maken tot de Pi. Zonder die vlag mag
iedereen op het netwerk de terminal aansturen — op een festivalterrein is dat
geen theoretisch bezwaar.

**Geef álle adressen van de Pi op.** Zolang er een netwerkkabel in zit heeft hij
er twee: die van de kabel én die van zijn eigen access point. Welke hij als
afzender kiest is niet aan ons, en een geweigerde verbinding ziet er in de kassa
uit als een terminal die niet bereikbaar is. Het venster zegt bij een weigering
welk adres het was.

```
node relay.mjs --allow 10.42.0.1 --allow 192.168.1.88
```

Andere vlaggen: `--serial COM3` als de automatische keuze ernaast zit,
`--tcp-port` en `--baud` om af te wijken van 7901 en 115200.

## Wat je moet weten voordat je hierop vertrouwt

**Het venster moet open blijven** zolang de kassa draait. Sluit je het, dan
stopt pinnen. Wil je dat het vanzelf start, maak er dan een taak van in de
Windows Taakplanner (bij aanmelden, met "uitvoeren of gebruiker is aangemeld of
niet" uit — hij heeft de sessie nodig).

**De Windows Firewall vraagt bij de eerste start om toestemming.** Sta het toe
voor privénetwerken, anders komt de Pi er niet doorheen en lijkt de terminal
stuk.

**Het kassascherm mag niet in slaapstand.** Zet bij Energiebeheer de slaapstand
uit terwijl hij aan de stroom hangt; anders valt midden op de dag de kabel weg.

**Het IP-adres van het kassascherm moet vast staan.** Krijgt hij van DHCP een
ander adres, dan wijst `MYPOS_TERMINAL_HOST` naar niets. Geef hem een vaste
reservering op de router, of een statisch adres.

## Als het niet werkt

`npm run list` toont geen terminal → het is de kabel, of POSLink Manager staat
nog op WiFi. Dan heeft verder zoeken in de software geen zin.

De Pi kan niet verbinden → firewall, of het verkeerde adres in `pos.env`.
Toetsen vanaf de Pi, dit leest alleen:

```
node mypos-ipp.mjs --host <adres van het kassascherm> --method GET_STATUS
```
