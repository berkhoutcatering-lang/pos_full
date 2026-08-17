package nl.hopbites.posbridge

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * State of every payment this app has been asked to run.
 *
 * The kassa polls for the outcome rather than holding an HTTP connection open
 * for the minute or two a customer needs to present a card, so the result has
 * to survive between requests. Keyed by the kassa's idempotency key, which also
 * makes a retried request collapse onto the existing payment instead of
 * charging twice.
 *
 * It survives process death too. Android will happily kill this app while the
 * myPOS payment screen is in front of it, and a card that was approved but
 * whose outcome we forgot is money the truck cannot account for.
 */
object PaymentStore {

    enum class Status { PENDING, APPROVED, DECLINED, FAILED }

    /**
     * How long a payment may sit at PENDING before we tell the kassa to stop
     * trusting the silence. We never flip it to DECLINED on our own — a card
     * that was in fact charged must not be reported as unpaid.
     */
    const val STALE_AFTER_MS = 3L * 60 * 1000

    data class Payment(
        val idempotencyKey: String,
        val amountCents: Int,
        val reference: String,
        @Volatile var status: Status = Status.PENDING,
        @Volatile var code: Int? = null,
        @Volatile var message: String? = null,
        val startedAt: Long = System.currentTimeMillis(),
    ) {
        val isStale: Boolean
            get() = status == Status.PENDING && System.currentTimeMillis() - startedAt > STALE_AFTER_MS
    }

    private const val TAG = "PaymentStore"
    private const val FILE = "payments.json"

    private val payments = ConcurrentHashMap<String, Payment>()
    private val fileLock = Any()

    @Volatile private var file: File? = null

    /**
     * Loads whatever survived the last run. Safe to call more than once — both
     * MainActivity and BridgeService may be the first one up.
     */
    @Synchronized
    fun init(ctx: Context) {
        if (file != null) return
        val f = File(ctx.filesDir, FILE)
        file = f
        if (!f.exists()) return

        runCatching {
            val array = JSONArray(f.readText())
            for (i in 0 until array.length()) {
                val o = array.getJSONObject(i)
                val payment = Payment(
                    idempotencyKey = o.getString("key"),
                    amountCents = o.getInt("amount_cents"),
                    reference = o.optString("reference"),
                    status = Status.valueOf(o.getString("status")),
                    code = if (o.isNull("code")) null else o.getInt("code"),
                    message = if (o.isNull("message")) null else o.getString("message"),
                    startedAt = o.getLong("started_at"),
                )
                payments[payment.idempotencyKey] = payment
            }
            Log.i(TAG, "Restored ${payments.size} payments")
        }.onFailure {
            // A corrupt file must not stop the terminal from taking money. Start
            // clean; the kassa re-sends anything it still cares about.
            Log.e(TAG, "Could not read $FILE, starting empty", it)
            payments.clear()
        }
    }

    /**
     * Registers a payment, or returns the existing one if this key was already
     * seen. The boolean says whether the caller should actually start it.
     */
    fun startOrReuse(idempotencyKey: String, amountCents: Int, reference: String): Pair<Payment, Boolean> {
        payments[idempotencyKey]?.let { return it to false }
        val created = Payment(idempotencyKey, amountCents, reference)
        val raced = payments.putIfAbsent(idempotencyKey, created)
        if (raced != null) return raced to false
        persist()
        return created to true
    }

    fun get(idempotencyKey: String): Payment? = payments[idempotencyKey]

    /** Newest first — what MainActivity shows the operator. */
    fun recent(limit: Int): List<Payment> =
        payments.values.sortedByDescending { it.startedAt }.take(limit)

    fun complete(idempotencyKey: String, status: Status, code: Int?, message: String?) {
        val payment = payments[idempotencyKey] ?: return
        payment.status = status
        payment.code = code
        payment.message = message
        // Written before we return, so an approval is on disk even if the
        // process dies on the very next instruction.
        persist()
    }

    /** Keeps the file bounded on a device that may run for weeks without a restart. */
    fun pruneOlderThan(maxAgeMs: Long) {
        val cutoff = System.currentTimeMillis() - maxAgeMs
        val removed = payments.entries.removeAll { it.value.startedAt < cutoff && it.value.status != Status.PENDING }
        if (removed) persist()
    }

    private fun persist() {
        val target = file ?: return
        val snapshot = payments.values.toList()
        synchronized(fileLock) {
            runCatching {
                val array = JSONArray()
                snapshot.forEach { p ->
                    array.put(
                        JSONObject()
                            .put("key", p.idempotencyKey)
                            .put("amount_cents", p.amountCents)
                            .put("reference", p.reference)
                            .put("status", p.status.name)
                            .put("code", p.code ?: JSONObject.NULL)
                            .put("message", p.message ?: JSONObject.NULL)
                            .put("started_at", p.startedAt)
                    )
                }
                // Write beside the real file and rename, so a crash mid-write
                // cannot leave a half-written file where the history was.
                val tmp = File(target.parentFile, "$FILE.tmp")
                tmp.writeText(array.toString())
                if (!tmp.renameTo(target)) {
                    target.writeText(array.toString())
                    tmp.delete()
                }
            }.onFailure { Log.e(TAG, "Could not persist payments", it) }
        }
    }
}
