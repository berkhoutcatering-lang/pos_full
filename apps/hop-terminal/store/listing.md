# AppMarket-inzending — Hop Terminal

Wat er in het formulier moet (Partner Portal → Apps → Add New App). De teksten
zijn Engels omdat de review dat is.

## Application Info

| Veld | Waarde |
|---|---|
| App Name | Hop Terminal |
| Category | Finance |
| Device Models | myPOS Ultra (Nexgo) |
| Application depends on myPOS OS Version | Any version is suitable |
| Update App available via | WiFi and Data Card |
| Available in Countries | Netherlands |
| Supported Languages | Dutch, English |
| TID Allow List | 80561740 |
| Privacy Policy | *(URL van de gehoste privacyverklaring)* |

`Update via WiFi and Data Card` is geen detail: het WiFi in de truck is dat van
de Pi en heeft geen internet, dus een update die alleen over WiFi mag komen
bereikt het toestel nooit.

## Short description

> Companion app for the Hop & Bites point-of-sale. Shows the amount due and
> takes the card payment, driven by our own cash register over the local
> network.

## Long description

> Hop Terminal turns a myPOS Ultra into the customer-facing side of the
> Hop & Bites point-of-sale.
>
> The cash register sends the amount to the terminal over the local network in
> the food truck. The terminal shows what the customer owes, takes the card
> payment, and reports the outcome back so it lands on the receipt and in the
> books. Between payments the screen shows the venue's own name instead of a
> network address.
>
> The app is a companion to our own cash register and needs to be paired with
> it before it does anything. It is restricted to our own terminals through the
> TID allow list and is not intended for general use.
>
> No customer data is collected: no names, no e-mail addresses, no analytics,
> no advertising. Card data never passes through the app — reading the card,
> PIN entry and the connection to the bank all happen inside the certified
> payment core of the terminal.

Die derde alinea staat er met opzet in. Een reviewer die de app installeert
zonder onze kassa ernaast krijgt het koppelscherm te zien; zonder die uitleg
lijkt dat een app die niet werkt.

## Beeldmateriaal

| Bestand | Formaat | Eis |
|---|---|---|
| `icon-512.png` | 512×512, 32-bit PNG met alpha | ✓ |
| `banner-720x400.png` | 720×400, 24-bit PNG zonder alpha | ✓ |
| `scherm-rust.png` | 1080×2400 | rustscherm |
| `scherm-betalen.png` | 1080×2400 | bedrag klaar |
| `scherm-gelukt.png` | 1080×2400 | goedgekeurd |
| `scherm-onbekend.png` | 1080×2400 | onbekende afloop |

Alle schermafbeeldingen zijn opnamen uit de draaiende app, niet nagetekend.

## APK

`app/build/outputs/apk/release/app-release-unsigned.apk`, gebouwd met
`gradle :app:assembleRelease`. Ongetekend aanleveren: myPOS zet bij distributie
hun eigen PCI-handtekening erop.

Versiecode ophogen bij elke volgende inzending, anders weigert het formulier de
upload.

## Wat de reviewer te zien krijgt

Zonder gekoppelde kassa: het koppelscherm. Dat is het eerlijke gedrag van een
companion-app.

Wordt hij wél gekoppeld, dan keurt een release-build géén betalingen goed —
zolang de Smart SDK er niet in zit meldt de app "de betaalmodule is nog niet
geïnstalleerd op deze terminal" en behandelt de kassa dat als een geweigerde
betaling. Er wordt dus nooit "gelukt" getoond zonder dat er is afgerekend.
