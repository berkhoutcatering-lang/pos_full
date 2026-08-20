package nl.hopbites.terminal

/**
 * De betaling achter een interface, zodat de app te bouwen en te testen is
 * zonder myPOS-toestel. Er zijn twee implementaties: [StubPaymentGateway] voor
 * op een gewone telefoon of emulator, en MyposPaymentGateway voor de echte
 * Ultra.
 *
 * Dit is geen tijdelijke steiger. Ook met een terminal op tafel wil je de rest
 * van de app kunnen testen zonder elke keer een kaart te moeten aanbieden.
 */
interface PaymentGateway {
    suspend fun purchase(amountCents: Int, reference: String): PaymentOutcome
}

/**
 * De afloop van een betaling, in dezelfde termen als de Pi ze kent.
 *
 * [Unresolved] is het belangrijkste geval en tegelijk het gemakkelijkst te
 * vergeten: de app weet niet of de kaart belast is. Dat mag nooit stilletjes
 * "mislukt" worden — er staat dan misschien geld op het spel dat de kassa
 * moet kunnen terugvinden.
 */
sealed interface PaymentOutcome {
    data class Approved(val receipt: Receipt) : PaymentOutcome
    data class Declined(val statusCode: String?, val message: String?) : PaymentOutcome
    data class Unresolved(val statusCode: String?, val message: String?) : PaymentOutcome
}

/**
 * Wat er op de bon en in de audit-log terecht moet komen. De namen volgen wat
 * de Pi al opslaat vanuit de IPP-route, zodat beide transporten dezelfde
 * gegevens opleveren.
 */
data class Receipt(
    val authCode: String? = null,
    val approval: String? = null,
    val rrn: String? = null,
    val stan: String? = null,
    val panMasked: String? = null,
    val entryMode: String? = null,
    val cardScheme: String? = null,
    val signatureRequired: Boolean? = null,
    val txAt: String? = null,
)
