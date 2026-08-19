# Vraag aan myPOS integrations

Concept voor `integrations@mypos.com`. Vul de `<...>`-velden in en stuur vanaf
het e-mailadres dat aan het myPOS-account gekoppeld is.

Waarom in het Engels: myPOS' integratieteam werkt internationaal en de
technische termen komen uit hun eigen (Engelstalige) SDK.

**Zet er geen `api_secret`/`klantgeheim` in.** Klantnummer, TID en serienummer
mogen wel.

Status 2026-08-19: de terminal praat inmiddels IPP over LAN (dat deed hij in
juli nog niet), maar weigert elke transactie op STAGE 2 met STATUS 13. De
`Change Profile`-optie die de terminal in Cash Register-profiel zou zetten,
ontbreekt op het toestel. Dat is precies het geval waarvan myPOS' eigen gids
zegt dat support het handmatig moet vrijschakelen — vandaar dat deze mail nu
één concreet verzoek heeft in plaats van een reeks vragen.

---

**Subject:** Please enable Cash Register profile for myPOS Ultra 80561740 — "Change Profile" is missing and ECR transactions abort with STATUS 13

Hello,

**Our request:** please enable the **Cash Register profile** for the terminal
below, so it can be driven by our own cash register software.

Your troubleshooting guide (Terminal Configuration & ECR/ERP Mode) states that
"on some accounts, Cash Register mode activation requires manual enablement by
the myPOS support team. If the 'Change Profile' option is missing even after
updating, contact support." That is exactly our situation.

**Device**

- myPOS Ultra, model N96
- Serial: N96N960WC05078
- Terminal ID: 80561740
- myPOS OS v2.3.3, last update 30.07.2026
- Merchant: HOP-BITES, Merchant ID 000000042211622
- Partner ID mps-p-10007182, Application ID mps-app-30034098 (integration
  "pi ultra", Cash Register, Active)

**What we did**

Settings → About Terminal → Configuration update completed successfully
("Configuration updated successfully"). After that, **there is no "Change
Profile" entry** in that menu — the only options are Configuration update,
Send log and Reset device. So we cannot switch the device into Cash Register
profile ourselves.

Two ECR applications are present on the device. The listener our cash register
talks to on TCP 7900 is **POSLink Manager** (Settings -> Change connection type:
WIFI (TCP/IP), Edit port: 7900). **ECR-POS Connect** is also installed and
updated from the App Market, configured with our VAT number, set to Cash
Register Machine over WiFi. The terminal has a static IP (192.168.1.135/24) and
shows "Please enter the amount on the cash register" throughout everything
below.

**Symptom 1 — IPP over LAN: accepted at STAGE 1, aborted at STAGE 2 with
STATUS 13**

The terminal listens on TCP port 7900 and speaks IPP. A PING completes
normally, so our framing and protocol version are correct:

```
→ PROTOCOL=IPP  VERSION=202  METHOD=PING  SID=<uuid>
← STAGE=1  STATUS=0   TIMEOUT=60  CURRENT_VERSION=202
← STAGE=5  STATUS=0
```

A PURCHASE is accepted and then aborted by the terminal:

```
→ PROTOCOL=IPP  VERSION=202  METHOD=PURCHASE  SID=<uuid>
  AMOUNT=0.01  CURRENCY=978  FIXED_PINPAD=1  LANG=EN
← STAGE=1  STATUS=0   TIMEOUT=65  CURRENT_VERSION=202
← STAGE=2  STATUS=13  TIMEOUT=25
← STAGE=5  STATUS=13  (+ TERMINAL_ID, MERCHANT_NAME, SN, SOFTWARE_VERSION=2.3.3)
```

STATUS 13 is USER CANCEL in your status table, but **nobody touches the
terminal** — the card prompt never appears at all, and the screen keeps showing
"Please enter the amount on the cash register" for the whole 65 seconds. The
same happens with FIXED_PINPAD=0.

Your own **Windows Test Tool** (IPP demo app 2.0.0.1, myPOSTerminal.dll)
behaves identically against this terminal: request accepted, then
`Terminal Status: "UserCancel"` with empty transaction data. So this is not our
client — your own software cannot complete a transaction on this device either.

For contrast, GET_STATUS through your Test Tool *does* return real data
(last transaction, merchant details, software version), so the link itself is
healthy.

**Symptom 2 — ePOS cloud API: HTTP 403 on payments for the same terminal**

Authentication and reads work: the OAuth token and merchant session are
created, `GET /pos/v1/terminals` lists our three terminals, and
`GET /pos/v1/terminals/80561740` returns `"status": "Active"`.

Creating a payment on that terminal fails:

```
POST /epos/v1/payments
{ "referenceNumber": "...", "amount": { "value": 1, "currencyCode": "EUR", "tip": 0 },
  "terminalId": "80561740", "appName": "HopBitesPOS", "appVersion": "1.0.0",
  "operatorCode": "1" }

-> HTTP 403 Forbidden
{ "type": "https://tools.ietf.org/html/rfc7231#section-6.5.3",
  "title": "Forbidden", "status": 403 }
```

No error code or detail is returned. Since it is 403 rather than 401 or 404, we
assume the integration is authenticated and the terminal exists, but is not
permitted to take payments through it.

Both routes therefore fail on the same terminal, in a way that is consistent
with a device that has never been enabled for cash register operation.

**Our questions**

1. Please enable the Cash Register profile for terminal 80561740, or tell us
   what we must do to make "Change Profile" appear.

2. Which application should be used on a myPOS Ultra for this: **POSLink
   Manager** or **ECR-POS Connect**? Both are installed on our device, which is
   not what your documentation led us to expect. Can having both present cause
   the abort we see?

3. Once it is enabled, which route should we use for a myPOS Ultra driven by a
   local cash register: **IPP over LAN** (port 7900), or the **Cash Register
   Remote API**?

4. Our cash register is a Raspberry Pi in a food truck **without an internet
   connection** — only the terminal is online, through its own SIM. Can the
   terminal use its own SIM as the connection to the financial host while the
   cash register only speaks to it over the local network? If the cash register
   must relay host traffic, please tell us, because that would rule this out
   for us.

Thank you,

`<naam>`
`<bedrijf>`
`<telefoonnummer>`

---

## Achtergrond (niet meesturen)

De uitgebreide geschiedenis — de USB/serieel-pogingen, POSLink Manager, het
sideloaden van een eigen APK, de reconstructie van IPP uit `myPOSTerminal.dll`
en de eerdere periode waarin de terminal helemaal niet antwoordde — staat in
[MYPOS-OVERDRACHT.md](MYPOS-OVERDRACHT.md) en in de git-geschiedenis van dit
bestand.

Wat sindsdien veranderd is:

- De terminal antwoordt nu wél op IPP over TCP 7900 (juli: volledige stilte).
- Het protocol is bevestigd door myPOS' eigen documentatie in plaats van
  afgeleid: 2-byte big-endian lengteprefix inclusief zichzelf, `NAAM=WAARDE\r\n`,
  `PROTOCOL=IPP` als eerste regel. De statuscodes staan op
  developers.mypos.com/apis/payment-api/api-reference/stage-status.
- STATUS 13 = USER CANCEL, STATUS 2 = SYNTAX ERROR, STATUS 25 = ACTIVATION
  REQUIRED.
- De 8-cijferige code in ERP System-modus is een OTP van 60 seconden die je aan
  de technicus van je ERP-leverancier geeft; hij hoort bij de Cash Register
  Remote API en is niets wat wij zelf ergens invullen. Vraag afgehandeld.
- Onze eigen client staat in [mypos-ipp.mjs](mypos-ipp.mjs) — Node, geen
  dependencies, draait ongewijzigd op de Pi.
