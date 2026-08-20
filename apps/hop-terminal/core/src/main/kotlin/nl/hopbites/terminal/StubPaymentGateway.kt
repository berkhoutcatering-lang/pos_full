package nl.hopbites.terminal

import kotlinx.coroutines.delay

/**
 * Doet alsof er een kaart wordt aangeboden. Hiermee is alles behalve de
 * SDK-aanroep zelf te bouwen en te testen: de schermen, de lijn met de Pi, de
 * wachtrij voor resultaten, en wat er gebeurt als de WiFi wegvalt.
 *
 * Het gedrag is stuurbaar zodat de vervelende gevallen net zo makkelijk te
 * bereiken zijn als het gelukkige pad — die eerste zijn tenslotte de reden dat
 * er een wachtrij en een "onbekend"-status bestaan.
 */
class StubPaymentGateway(
    private val behaviour: () -> Behaviour = { Behaviour.APPROVE },
    private val thinkTimeMs: Long = 2_000,
) : PaymentGateway {

    enum class Behaviour { APPROVE, DECLINE, UNRESOLVED }

    private var counter = 0

    override suspend fun purchase(amountCents: Int, reference: String): PaymentOutcome {
        delay(thinkTimeMs)
        counter++
        return when (behaviour()) {
            Behaviour.APPROVE -> PaymentOutcome.Approved(
                Receipt(
                    authCode = "T%05d".format(counter),
                    approval = "00",
                    rrn = "9%011d".format(System.currentTimeMillis() % 100_000_000_000),
                    stan = counter.toString(),
                    panMasked = "**** 0000",
                    entryMode = "P",
                    cardScheme = "Maestro",
                    signatureRequired = false,
                    txAt = java.time.Instant.now().toString(),
                )
            )
            Behaviour.DECLINE -> PaymentOutcome.Declined("51", "Ontoereikend saldo (stub)")
            Behaviour.UNRESOLVED -> PaymentOutcome.Unresolved("12", "Verbinding met de bank weg (stub)")
        }
    }
}
