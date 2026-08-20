# Hop Terminal

De eigen Android-app voor de myPOS Ultra. Hij neemt het scherm en de betaling
over van de IPP-route, zodat de klant de naam van de zaak ziet in plaats van
het IP-adres van de kassa.

Ontwerp: [`docs/hop-terminal-plan.html`](../../docs/hop-terminal-plan.html).

## Twee modules, met opzet

`core` is gewone JVM-Kotlin: de lijn met de Pi, de wachtrij, de betaallus. Geen
Android-import te bekennen, dus het compileert en test zonder toestel en zonder
emulator. `app` wordt de dunne Android-schil eromheen.

| Module | Wat erin zit | Staat |
|---|---|---|
| `core/PaymentGateway.kt` | De betaling als interface: `Approved` / `Declined` / `Unresolved` | getest |
| `core/StubPaymentGateway.kt` | Doet alsof er een kaart wordt aangeboden; stuurbaar gedrag | getest |
| `core/BridgeClient.kt` | Long-poll, resultaat terugsturen, koppelen, levensteken | getest |
| `core/ResultQueue.kt` | Resultaten op schijf tot de Pi ze aanneemt | getest |
| `core/TerminalLoop.kt` | Ophalen → afrekenen → melden, met herstel bij elke fout | getest |
| `MyposPaymentGateway.kt.todo` | De Smart SDK-aanroep. Wacht op een developer-terminal | niet gebouwd |
| `app/` | Activity, schermen, WiFi-binding, tokenopslag | nog leeg |

De kant van de Pi staat er ook, met elf tests: `/terminal/next`,
`/terminal/result`, `/terminal/status` en `/terminal/claim` in
`apps/pi-bridge/src/routes/terminal.ts` en
`apps/pi-bridge/tests/mypos-app.spec.ts`.

## Draaien

Tests (twaalf, geen toestel nodig):

```
gradle :core:test
```

En de proef op de som tegen een échte pi-bridge, met de stub als kaartlezer:

```
gradle :core:demo --args="http://127.0.0.1:3009 <koppelcode>"
```

Die koppelcode haal je bij de bridge op met `/admin/issue-pair-code`. De demo
koppelt, gaat pollen, rekent elke opdracht af en meldt hem terug — precies wat
de app straks op de terminal doet, alleen zonder kaart.

## Zonder toestel verder bouwen

De stub maakt het mogelijk om alles behalve de SDK-aanroep op een gewone
telefoon of in de emulator te bouwen: de schermen, het koppelen, de long-poll,
de wachtrij, en wat er gebeurt als de WiFi wegvalt. Dat is fase 2 en 3 uit het
plan, en dus het meeste werk.

Zet de Pi op de app-route zodat er iets te halen valt:

```
MYPOS_TRANSPORT=app
```

Daarna in `/admin → Apparaten` een koppelcode maken en die in de app invoeren.

## Wat nog ontbreekt

- Gradle-project (`settings.gradle.kts`, `app/build.gradle.kts`, manifest)
- De schermen zelf — nu stuurt `TerminalLoop` alleen een `TerminalState` uit
- `TokenStore` met EncryptedSharedPreferences
- `res/xml/network_security_config.xml` met `hopbites-ca.crt` als trust anchor
- Screen pinning, zodat niemand per ongeluk uit de app stapt

## Twee dingen die geld kosten als je ze vergeet

**Netwerkbinding.** De Ultra hangt aan het access point van de Pi, dat geen
internet heeft. Android houdt daardoor de simkaart als standaardroute en een
aanroep naar de Pi vertrekt over 4G. `BridgeClient` bindt zijn sockets daarom
expliciet aan het WiFi-netwerk. Wat je *niet* moet doen is Android's
internetcontrole op de Pi vervalsen — dan gaat de kaartautorisatie over het
internetloze WiFi en faalt elke betaling.

**Resultaat eerst naar schijf.** In `TerminalLoop` gaat de afloop naar
`ResultQueue` vóór hij verstuurd wordt. Andersom is precies hoe je een
geslaagde betaling kwijtraakt bij een crash: kaart belast, kassa weet van
niets.
