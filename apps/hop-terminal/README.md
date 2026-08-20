# Hop Terminal

De eigen Android-app voor de myPOS Ultra. Hij neemt het scherm en de betaling
over van de IPP-route, zodat de klant de naam van de zaak ziet in plaats van
het IP-adres van de kassa.

Ontwerp: [`docs/hop-terminal-plan.html`](../../docs/hop-terminal-plan.html).

## Stand van zaken

Dit is een geraamte, geen werkende app. Wat er staat is geschreven zonder een
toestel om op te compileren, dus reken op scherpe randjes bij de eerste build.
Wat wél doordacht is, is de vorm: de betaling zit achter een interface, en de
enige code die een echte Ultra nodig heeft staat apart in
`MyposPaymentGateway.kt.todo`.

| Bestand | Wat het doet | Getest |
|---|---|---|
| `PaymentGateway.kt` | De betaling als interface, met `Approved` / `Declined` / `Unresolved` | nee |
| `StubPaymentGateway.kt` | Doet alsof er een kaart wordt aangeboden; stuurbaar gedrag | nee |
| `BridgeClient.kt` | Long-poll bij de Pi, resultaat terugsturen, koppelen, levensteken | nee |
| `ResultQueue.kt` | Resultaten op schijf tot de Pi ze aanneemt | nee |
| `TerminalLoop.kt` | Ophalen → afrekenen → melden, met herstel bij elke fout | nee |
| `MyposPaymentGateway.kt.todo` | De Smart SDK-aanroep. Wacht op een developer-terminal | nee |

De kant van de Pi is er wél al, en die is wel getest: `/terminal/next`,
`/terminal/result`, `/terminal/status` en `/terminal/claim` in
`apps/pi-bridge/src/routes/terminal.ts`, met elf tests in
`apps/pi-bridge/tests/mypos-app.spec.ts`.

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
