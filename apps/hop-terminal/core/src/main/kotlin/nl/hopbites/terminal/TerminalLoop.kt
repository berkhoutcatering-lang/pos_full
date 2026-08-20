package nl.hopbites.terminal

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Het hart van de app: haal werk op bij de Pi, reken af, meld terug.
 *
 * De lus is bewust saai en herstelt zichzelf. Elke fout — geen netwerk, Pi
 * herstart, app gekilld — leidt tot opnieuw proberen, nooit tot een betaling
 * die stilletjes verdwijnt.
 */
class TerminalLoop(
    private val bridge: BridgeClient,
    private val gateway: PaymentGateway,
    private val queue: ResultQueue,
    private val appVersion: String,
    /** Hoe lang de klant de uitslag ziet. Nul in tests. */
    private val resultLingerMs: Long = 8_000,
) {
    private val _state = MutableStateFlow<TerminalState>(TerminalState.Idle)
    val state: StateFlow<TerminalState> = _state

    fun start(scope: CoroutineScope) {
        scope.launch { pollLoop() }
        scope.launch { flushLoop() }
        scope.launch { heartbeatLoop() }
    }

    private suspend fun pollLoop() {
        while (true) {
            val payment = bridge.nextPayment()
            if (payment == null) {
                // Niets te doen, of even geen verbinding. Beide: opnieuw.
                delay(500)
                continue
            }

            bridge.claim(payment.idempotency_key)
            _state.value = TerminalState.Charging(payment)

            val outcome = gateway.purchase(payment.amount_cents, payment.idempotency_key)

            // Eerst naar schijf, dan pas versturen. Andersom is precies hoe je
            // een geslaagde betaling kwijtraakt bij een crash.
            val payload = outcome.toPayload(payment.idempotency_key)
            queue.add(payload)

            _state.value = TerminalState.Result(payment, outcome)
            delay(resultLingerMs)
            _state.value = TerminalState.Idle
        }
    }

    /** Blijft aanbieden tot de Pi het resultaat aanneemt. */
    private suspend fun flushLoop() {
        while (true) {
            for (payload in queue.peekAll()) {
                if (bridge.reportResult(payload)) queue.remove(payload)
            }
            delay(if (queue.size() > 0) 2_000 else 5_000)
        }
    }

    private suspend fun heartbeatLoop() {
        while (true) {
            bridge.heartbeat(batteryPercent = null, printerOk = null, appVersion = appVersion)
            delay(60_000)
        }
    }

}

sealed interface TerminalState {
    data object Idle : TerminalState
    data class Charging(val payment: QueuedPayment) : TerminalState
    data class Result(val payment: QueuedPayment, val outcome: PaymentOutcome) : TerminalState
}

/** JSON zoals /terminal/result hem verwacht. */
fun PaymentOutcome.toPayload(key: String): String = when (this) {
    is PaymentOutcome.Approved -> """
        {"idempotency_key":"$key","approved":true,"status_code":"0","receipt":${receipt.toJson()}}
    """.trimIndent()

    is PaymentOutcome.Declined -> """
        {"idempotency_key":"$key","approved":false,"status_code":${statusCode.quoted()},"message":${message.quoted()}}
    """.trimIndent()

    is PaymentOutcome.Unresolved -> """
        {"idempotency_key":"$key","approved":false,"unresolved":true,"status_code":${statusCode.quoted()},"message":${message.quoted()}}
    """.trimIndent()
}

private fun Receipt.toJson(): String = buildString {
    append("{")
    append(""""auth_code":${authCode.quoted()},""")
    append(""""approval":${approval.quoted()},""")
    append(""""rrn":${rrn.quoted()},""")
    append(""""stan":${stan.quoted()},""")
    append(""""pan_masked":${panMasked.quoted()},""")
    append(""""entry_mode":${entryMode.quoted()},""")
    append(""""card_scheme":${cardScheme.quoted()},""")
    append(""""signature_required":${signatureRequired ?: "null"},""")
    append(""""tx_at":${txAt.quoted()}""")
    append("}")
}

private fun String?.quoted(): String =
    if (this == null) "null" else "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""
