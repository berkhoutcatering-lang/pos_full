# Vraag aan myPOS integrations

Concept voor `integrations@mypos.com`. Vul de `<...>`-velden in en stuur vanaf
het e-mailadres dat aan het myPOS-account gekoppeld is.

Waarom in het Engels: myPOS' integratieteam werkt internationaal en de
technische termen komen uit hun eigen (Engelstalige) SDK.

**Zet er geen `api_secret`/`klantgeheim` in.** Klantnummer en TID mogen wel.

---

**Subject:** Please enable Cash Register (ECR) mode for our myPOS Ultra — terminal accepts connections but never responds

Hello,

**We have two requests**, either of which would unblock us:

1. Please enable **Cash Register (ECR) mode** on our account for the terminal
   below, so we can drive it over the local network.
2. Please tell us **why `POST /epos/v1/payments` returns HTTP 403** for our
   terminal, and what permission is missing.

Request 1 is what we would prefer — our cash register has no internet
connection, only the terminal does, through its own SIM.

---

**On request 2 — the ePOS API**

Our Smart POS integration is approved (Partner ID `mps-p-10007182`, Application
ID `mps-app-30033712`). Authentication works: the OAuth token and merchant
session are created without error, `GET /pos/v1/terminals` lists our three
terminals, and `GET /pos/v1/terminals/80561740` returns the terminal as
`"status": "Active"`.

But creating a payment on that same terminal fails:

```
POST /epos/v1/payments
{ "referenceNumber": "...", "amount": { "value": 1, "currencyCode": "EUR", "tip": 0 },
  "terminalId": "80561740", "appName": "HopBitesPOS", "appVersion": "1.0.0",
  "operatorCode": "1" }

-> HTTP 403 Forbidden
```

Since it is 403 rather than 401 or 404, we assume the integration is
authenticated and the terminal exists, but is not permitted to take payments
through this integration. What do we need to do?

Separately: your TypeScript SDK's `terminals.activate()` sends no request body
and therefore returns HTTP 415. When we send a body, the endpoint asks for
`product_code`, `currency`, `account_number` and `billing_descriptor` — which
looks like provisioning a new terminal rather than linking an existing one, so
we did not proceed. Is that the correct endpoint for linking a terminal to an
integration, and if not, which is?

**Related: the ERP-mode activation code**

In ECR-POS Connect, selecting *ERP System* shows an 8-digit code that refreshes
every 60 seconds, with the text "Connect your ERP to this POS device using this
code". We could not find anywhere to submit that code — not in the API, not in
the Partner Portal. Where does it go?

---

**On request 1 — Cash Register mode over the local network**

Your troubleshooting guide states that "on some accounts, Cash Register mode
activation requires manual enablement by the myPOS support team", and everything
we observe matches an account that has not been enabled: ECR-POS Connect runs and
shows "Awaiting data…", port 7900 accepts TCP connections, but the terminal never
answers a single message — not even to your own .NET SDK (details below).

If enabling it requires anything from our side, please tell us what.

**Every prerequisite in your ECR/ERP setup guide is already satisfied:**

- myPOS OS updated (Settings → About Terminal → Update Configuration → Update
  Software → Update All)
- ECR-POS Connect installed and updated from the App Market
- ECR-POS Connect configured with our VAT number, Cash Register Machine, WiFi
- Static IP configured through Android WiFi settings (192.168.1.135/24,
  gateway 192.168.1.1) — not DHCP
- Terminal linked to our merchant account and online through its own SIM
- Cash register on the same subnet; TCP to port 7900 confirmed reachable

The behaviour is unchanged after each of these steps.

**Account and device**

- Merchant account: `<bedrijfsnaam>` / `<klantnummer of merchant ID>`
- Terminal: myPOS Ultra, model K3WT
- Serial: `<serienummer>`
- Terminal ID: `<TID>`

**What we set up**

1. Installed **ECR-POS Connect** from the App Market (after running Update All).
2. Entered our VAT number, then tried both of the offered modes, in each case
   selecting **WiFi** as the connection to the cash register.
3. Our cash register is on the same subnet as the terminal.

**What we observe — the two modes behave completely differently**

*Cash Register Machine mode:* the app shows `192.168.1.135` port `7900` and
stays in the foreground waiting for the cash register.

- TCP port 7900 is open and accepts connections.
- The terminal never sends anything on its own.
- It never responds to anything we send, and the screen does not react.
- It does not close the connection either — it simply stays silent.

*ERP System mode:* the app displays an **8-digit code that refreshes by itself**
after a short interval.

- Port 7900 is **closed** in this mode (connections are actively refused).
- We could not determine what the code is for, or where it should be entered.

The self-refreshing code looks like a one-time pairing code, similar to the
security code flow in your Cash Register Remote API. We could not find anywhere
to enter it, either in the app or in the merchant portal.

*USB mode (Cash Register Machine + USB):* the terminal enumerates on Windows as
a serial device (COM3) alongside an ADB interface.

- We opened the port exactly as your .NET SDK does — 115200 baud, no parity,
  8 data bits, 1 stop bit, buffers discarded — and sent the same GET_STATUS
  frame its `Initialize(comPort)` sends.
- No response, with or without DTR/RTS asserted.

We also tried **POSLink Manager** in USB mode (with ECR-POS Connect closed), with
the same result: no response on COM3.

So the terminal does not answer us over WiFi **or** USB, in either app. Since the
framing and port settings are copied directly from your own SDK, we suspect this
is an authorisation or pairing issue rather than a protocol mismatch — the
terminal appears to be deliberately ignoring an unknown counterpart rather than
rejecting a malformed message.

To be explicit about what we did *not* do: the device exposes an ADB interface,
but `adb shell` is denied (`error: closed`), so we have not inspected or modified
anything on the terminal. All of our testing was done from the outside, over the
documented ECR interfaces.

**The decisive test: your own SDK does not work either**

We built a small console application against **your own .NET SDK**
(`myPOS-SDK-dotNET`, `myPOSTerminal.dll` v2.0.0.1), connected it over TCP exactly
as your demo application does, and called `Initialize(stream)`. With the terminal
sitting on the "Awaiting data…" screen showing `192.168.1.135:7900`, your SDK's
own log reads:

```
TCP connected. Calling Initialize()...
Initialize -> Processing
[LOG] Sending to terminal:
PROTOCOL=IPP
VERSION=200
METHOD=GET_STATUS
SID=4fd778eb-55a2-4a3d-9f0c-247b83708d17
[LOG] Waiting for input
[FINISHED] status=Timeout
```

The TCP connection is accepted. Your SDK sends its standard GET_STATUS. The
terminal never replies, and the "You are all set!" screen from your ECR-POS
Connect guide never appears.

So this is not a mistake in our client — your own software cannot talk to this
terminal either. Something on the terminal or in our account configuration is
preventing it from accepting a cash register connection at all.

**What we tried before that**

*1. The IPP protocol from your own .NET SDK.* We took the wire format from
`myPOS-SDK-dotNET` (`myPOS-SDK/myPOSTerminal.dll`, FileVersion 2.0.0.1,
described as "Library for communication via IPP protocol with traditional myPOS
Devices"), because its demo application connects to a terminal over TCP:

```csharp
tcpClientTerminal = new TcpClient(ip, port);
t.Initialize(tcpClientTerminal.GetStream());
```

We send a 2-byte big-endian length prefix (length includes the two prefix
bytes), followed by `NAME=VALUE\r\n` lines, exactly as `GetDataForSending()`
produces. For example, GET_STATUS (90 bytes total):

```
00 5A
PROTOCOL=IPP\r\n
VERSION=200\r\n
METHOD=GET_STATUS\r\n
SID=9e761f3d-18d3-4745-9e40-93b850cace7b\r\n
```

And PURCHASE (154 bytes total):

```
PROTOCOL=IPP\r\n VERSION=200\r\n METHOD=PURCHASE\r\n SID=<uuid>\r\n
AMOUNT=0.01\r\n CURRENCY=978\r\n REFERENCE=<ref>\r\n FIXED_PINPAD=0\r\n
```

Both time out with no reply after 120 seconds.

*2. The semi-integrated JSON protocol from your Node SDK.* From `mypos-js`
(`resources/devices/semi-integrated/base-request.js`): a raw JSON object with an
HMAC-SHA256 signature over the serialised parameters. Also no reply.

*3. Unframed probes* (plain JSON, newline-terminated JSON, length-prefixed JSON,
STX/ETX/LRC framing, a single ENQ byte). All silent. Interestingly, on
POSLink Manager (which was preinstalled and listens on a configurable port,
default 60180) single-byte frames caused the terminal to close the connection,
whereas longer frames kept it open — suggesting it waits for a complete,
length-framed message.

**We also tried running our own app on the terminal**

Since the Smart SDK would let our own Android app take payments using the
terminal's own connectivity, we tried to sideload a minimal signed test APK
(manifest only, no code) over ADB. It is rejected:

```
INSTALL_PARSE_FAILED_CERTIFICATE_ENCODING: PosAuth failed:
Failed to collect certificates from /data/app/vmdl468822469.tmp/base.apk
```

The APK transfers and parses; the device rejects the signing certificate.

**Our situation, and why this matters to us**

Our cash register is a Raspberry Pi in a food truck with **no internet
connection**. Only the terminal is online, through its own SIM. We are looking
for any supported way to take a card payment in that setup — either by driving
the terminal over the local network, or by running our own application on the
terminal itself using the Smart SDK.

**Our questions**

1. **Which protocol and message format does ECR-POS Connect expect on port
   7900** for a myPOS Ultra? Is there a specification or SDK we can implement
   against?

2. **What is the 8-digit refreshing code in ERP System mode, and where do we
   enter it?** We assume this is the pairing step that Cash Register Machine
   mode is missing, and that this is why the terminal ignores us there. If a
   pairing step is required before the terminal accepts commands, please tell us
   how to perform it.

2b. **Which of the two modes should we use** for driving the terminal from our
   own cash register software, and what is the difference between them?

3. **Does the IPP protocol from the .NET SDK apply to Android Smart terminals**
   (Ultra, Carbon), or only to the "traditional" devices its description
   mentions?

4. **In ECR mode, does the Ultra authorise transactions over its own SIM, or
   does it expect the cash register to relay host traffic?** In the .NET SDK's
   IPP flow, STAGE 4 hands binary data plus an IP and port to the cash register,
   which must forward it to the myPOS host. This distinction matters a great
   deal to us: our cash register has **no internet connection**, only the
   terminal does, via its own SIM. If the terminal requires the cash register to
   act as its network path, this integration cannot work for us and we need to
   know that now.

5. Is there any **documentation or SDK for Linux / Node.js**? Our cash register
   runs on a Raspberry Pi, so the Windows .NET SDK is not an option for us.

6. Should we be using **POSLink Manager instead of ECR-POS Connect**? Both are
   present on the device, which is not what your documentation led us to expect
   (it describes POSLink Manager as being for the Go2).

7. **How do we get our signing certificate authorised** so we can install our
   own Smart SDK application on our own terminal? If this requires joining a
   developer or partner programme, please tell us what to apply for — this looks
   like the cleanest solution for our offline setup, since the app would use the
   terminal's own SIM and our cash register would never need internet.

Thank you,

`<naam>`
`<bedrijf>`
`<telefoonnummer>`
