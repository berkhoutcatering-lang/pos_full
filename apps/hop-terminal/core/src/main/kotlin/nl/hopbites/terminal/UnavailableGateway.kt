package nl.hopbites.terminal

/**
 * De betaalmodule die er nog niet is.
 *
 * Zolang de Smart SDK niet is ingebouwd, mag een release-build géén betaling
 * goedkeuren. De stub doet dat wel — die is bedoeld om schermen en de lijn met
 * de kassa te testen — en een app die aan een balie "gelukt" toont zonder dat
 * er iets is afgerekend, is erger dan een app die niets doet.
 *
 * Vandaar deze: hij zegt eerlijk dat er niets is afgerekend, en de kassa
 * behandelt het als een geweigerde betaling. Er staat geen geld op het spel,
 * en de medewerker rekent contant af.
 */
object UnavailableGateway : PaymentGateway {
    override suspend fun purchase(amountCents: Int, reference: String): PaymentOutcome =
        PaymentOutcome.Declined(
            statusCode = "no_gateway",
            message = "De betaalmodule is nog niet geïnstalleerd op deze terminal.",
        )
}
