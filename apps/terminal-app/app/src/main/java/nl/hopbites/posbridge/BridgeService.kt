package nl.hopbites.posbridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.concurrent.Executors
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Small HTTP server on the terminal, so the kassa can start a payment over the
 * local network.
 *
 * This exists because the Pi in the truck has no internet connection — only the
 * terminal does, through its own SIM. Rather than the Pi reaching myPOS, the Pi
 * reaches this app, and the terminal authorises the card itself.
 *
 * Contract (both ends are ours, so it is deliberately boring):
 *
 *   GET  /health                     -> {"ok":true,"version":...}
 *   POST /payment                    -> {"status":"pending"}
 *   GET  /payment?key=<idempotency>  -> {"status":"approved"|"declined"|...}
 *
 * Every request carries X-Signature: an HMAC-SHA256 (hex) over the raw body —
 * or over the query string for GETs — using a secret shared with the Pi. Without
 * it anything on the WiFi could start a payment.
 */
class BridgeService : Service() {

    companion object {
        const val PORT = 8080
        private const val TAG = "BridgeService"
        private const val CHANNEL_ID = "hopbites_bridge"
        private const val PRUNE_AFTER_MS = 24L * 60 * 60 * 1000

        /** Shared secret, set once from MainActivity. */
        fun secret(ctx: Context): String =
            ctx.getSharedPreferences("bridge", Context.MODE_PRIVATE).getString("secret", "").orEmpty()
    }

    private var server: ServerSocket? = null
    private val pool = Executors.newFixedThreadPool(4)
    @Volatile private var running = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForeground(1, buildNotification())
        running = true
        Thread(::serve, "bridge-accept").start()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        running = false
        runCatching { server?.close() }
        pool.shutdownNow()
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Kassa-koppeling", NotificationManager.IMPORTANCE_LOW)
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Hop & Bites kassa-koppeling")
            .setContentText("Luistert op poort $PORT")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .build()
    }

    private fun serve() {
        try {
            server = ServerSocket(PORT)
            Log.i(TAG, "Listening on $PORT")
            while (running) {
                val socket = server!!.accept()
                pool.execute { handle(socket) }
            }
        } catch (e: Exception) {
            if (running) Log.e(TAG, "Accept loop stopped", e)
        }
    }

    private fun handle(socket: Socket) {
        socket.use { s ->
            try {
                s.soTimeout = 10_000
                val input = BufferedInputStream(s.getInputStream())
                val request = readRequest(input) ?: return
                PaymentStore.pruneOlderThan(PRUNE_AFTER_MS)
                route(request, s.getOutputStream())
            } catch (e: Exception) {
                Log.e(TAG, "Request failed", e)
            }
        }
    }

    private data class Request(
        val method: String,
        val path: String,
        val query: String,
        val headers: Map<String, String>,
        val body: String,
    )

    /** Reads one HTTP request. Deliberately minimal — we control both ends. */
    private fun readRequest(input: BufferedInputStream): Request? {
        val head = StringBuilder()
        var last4 = 0
        while (true) {
            val b = input.read()
            if (b < 0) return null
            head.append(b.toChar())
            last4 = (last4 shl 8) or b
            if (last4 and 0xFFFFFFFF.toInt() == 0x0D0A0D0A) break
            if (head.length > 8192) return null
        }

        val lines = head.toString().split("\r\n")
        val parts = lines.firstOrNull()?.split(" ") ?: return null
        if (parts.size < 2) return null

        val headers = lines.drop(1)
            .mapNotNull { line ->
                val i = line.indexOf(':')
                if (i <= 0) null else line.substring(0, i).trim().lowercase() to line.substring(i + 1).trim()
            }.toMap()

        val target = parts[1]
        val qIndex = target.indexOf('?')
        val path = if (qIndex < 0) target else target.substring(0, qIndex)
        val query = if (qIndex < 0) "" else target.substring(qIndex + 1)

        val length = headers["content-length"]?.toIntOrNull() ?: 0
        val body = if (length > 0) {
            val buf = ByteArray(length)
            var read = 0
            while (read < length) {
                val n = input.read(buf, read, length - read)
                if (n < 0) break
                read += n
            }
            String(buf, 0, read, Charsets.UTF_8)
        } else ""

        return Request(parts[0].uppercase(), path, query, headers, body)
    }

    private fun route(req: Request, out: OutputStream) {
        if (req.path == "/health" && req.method == "GET") {
            respond(out, 200, JSONObject().put("ok", true).put("version", "0.1.0"))
            return
        }

        val secret = secret(this)
        if (secret.isEmpty()) {
            respond(out, 503, JSONObject().put("error", "not_configured"))
            return
        }

        // Sign the body for POSTs, the query for GETs — whichever carries intent.
        val signed = if (req.method == "POST") req.body else req.query
        if (!validSignature(secret, signed, req.headers["x-signature"])) {
            respond(out, 401, JSONObject().put("error", "bad_signature"))
            return
        }

        when {
            req.method == "POST" && req.path == "/payment" -> startPayment(req, out)
            req.method == "GET" && req.path == "/payment" -> paymentStatus(req, out)
            else -> respond(out, 404, JSONObject().put("error", "not_found"))
        }
    }

    private fun startPayment(req: Request, out: OutputStream) {
        val json = runCatching { JSONObject(req.body) }.getOrNull()
            ?: return respond(out, 400, JSONObject().put("error", "bad_json"))

        val key = json.optString("idempotency_key")
        val amount = json.optInt("amount_cents", 0)
        val reference = json.optString("reference")

        if (key.isEmpty() || amount <= 0) {
            respond(out, 400, JSONObject().put("error", "bad_request"))
            return
        }

        val (payment, shouldStart) = PaymentStore.startOrReuse(key, amount, reference)

        if (shouldStart) {
            val intent = Intent(this, PaymentActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra(PaymentActivity.EXTRA_KEY, key)
                putExtra(PaymentActivity.EXTRA_AMOUNT_CENTS, amount)
                putExtra(PaymentActivity.EXTRA_REFERENCE, reference)
            }
            startActivity(intent)
        }

        respond(
            out, 200,
            JSONObject()
                .put("status", payment.status.name.lowercase())
                .put("reused", !shouldStart)
        )
    }

    private fun paymentStatus(req: Request, out: OutputStream) {
        val key = req.query.split("&")
            .mapNotNull { it.split("=", limit = 2).takeIf { p -> p.size == 2 } }
            .firstOrNull { it[0] == "key" }?.get(1)

        if (key.isNullOrEmpty()) {
            respond(out, 400, JSONObject().put("error", "missing_key"))
            return
        }

        val payment = PaymentStore.get(key)
            ?: return respond(out, 404, JSONObject().put("error", "unknown_payment"))

        respond(
            out, 200,
            JSONObject()
                .put("status", payment.status.name.lowercase())
                .put("code", payment.code ?: JSONObject.NULL)
                .put("message", payment.message ?: JSONObject.NULL)
        )
    }

    private fun validSignature(secret: String, payload: String, provided: String?): Boolean {
        if (provided.isNullOrEmpty()) return false
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(), "HmacSHA256"))
        val expected = mac.doFinal(payload.toByteArray()).joinToString("") { "%02x".format(it) }
        // Constant-time compare so a wrong signature cannot be guessed by timing.
        return MessageDigest.isEqual(expected.toByteArray(), provided.toByteArray())
    }

    private fun respond(out: OutputStream, code: Int, body: JSONObject) {
        val payload = body.toString().toByteArray(Charsets.UTF_8)
        val reason = when (code) {
            200 -> "OK"; 400 -> "Bad Request"; 401 -> "Unauthorized"
            404 -> "Not Found"; 503 -> "Service Unavailable"; else -> "Error"
        }
        out.write(
            ("HTTP/1.1 $code $reason\r\n" +
                "Content-Type: application/json\r\n" +
                "Content-Length: ${payload.size}\r\n" +
                "Connection: close\r\n\r\n").toByteArray()
        )
        out.write(payload)
        out.flush()
    }
}
