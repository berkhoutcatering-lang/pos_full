package nl.hopbites.posbridge

import java.util.concurrent.ConcurrentHashMap

/**
 * In-memory state of every payment this app has been asked to run.
 *
 * The kassa polls for the outcome rather than holding an HTTP connection open
 * for the minute or two a customer needs to present a card, so the result has
 * to survive between requests. Keyed by the kassa's idempotency key, which also
 * makes a retried request collapse onto the existing payment instead of
 * charging twice.
 */
object PaymentStore {

    enum class Status { PENDING, APPROVED, DECLINED, FAILED }

    data class Payment(
        val idempotencyKey: String,
        val amountCents: Int,
        val reference: String,
        @Volatile var status: Status = Status.PENDING,
        @Volatile var code: Int? = null,
        @Volatile var message: String? = null,
        val startedAt: Long = System.currentTimeMillis(),
    )

    private val payments = ConcurrentHashMap<String, Payment>()

    /**
     * Registers a payment, or returns the existing one if this key was already
     * seen. The boolean says whether the caller should actually start it.
     */
    fun startOrReuse(idempotencyKey: String, amountCents: Int, reference: String): Pair<Payment, Boolean> {
        val existing = payments[idempotencyKey]
        if (existing != null) return existing to false
        val created = Payment(idempotencyKey, amountCents, reference)
        val raced = payments.putIfAbsent(idempotencyKey, created)
        return if (raced != null) raced to false else created to true
    }

    fun get(idempotencyKey: String): Payment? = payments[idempotencyKey]

    fun complete(idempotencyKey: String, status: Status, code: Int?, message: String?) {
        payments[idempotencyKey]?.apply {
            this.status = status
            this.code = code
            this.message = message
        }
    }

    /** Keeps memory bounded on a device that may run for weeks without a restart. */
    fun pruneOlderThan(maxAgeMs: Long) {
        val cutoff = System.currentTimeMillis() - maxAgeMs
        payments.entries.removeAll { it.value.startedAt < cutoff && it.value.status != Status.PENDING }
    }
}
