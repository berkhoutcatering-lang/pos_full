package nl.hopbites.terminal

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * De lijn met de pi-bridge. De app haalt hier zijn werk op en meldt de afloop
 * terug; de Pi blijft de bron van waarheid.
 *
 * Bewust vrij van Android: de OkHttpClient komt van buiten. Op de terminal is
 * dat een client die zijn sockets aan het WiFi bindt (zie de app-module) — de
 * Ultra hangt aan een access point zonder internet, en zonder die binding
 * vertrekt elke aanroep over de simkaart en komt hij nooit aan. In tests is
 * het een gewone client.
 */
class BridgeClient(
    private val baseUrl: String,
    private val http: OkHttpClient,
    private val tokenStore: TokenStore,
) {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Blijft hangen tot er een bedrag klaarstaat of tot de long-poll afloopt.
     * `null` betekent "niets te doen" — de normale toestand, geen fout.
     */
    fun nextPayment(): QueuedPayment? {
        val response = execute(Request.Builder().url("$baseUrl/terminal/next").get()) ?: return null
        response.use {
            if (it.code == 204 || !it.isSuccessful) return null
            val body = it.body?.string() ?: return null
            return runCatching { json.decodeFromString<QueuedPayment>(body) }.getOrNull()
        }
    }

    /** Vertelt de Pi dat wij deze opdracht oppakken. */
    fun claim(key: String) {
        post("/terminal/claim", """{"idempotency_key":"$key"}""")?.close()
    }

    /**
     * Meldt de afloop. `true` betekent: definitief antwoord, het resultaat mag
     * uit de wachtrij. Bij een netwerkfout `false` — opnieuw proberen, want een
     * belaste kaart die de Pi niet bereikt is geld zonder bon.
     *
     * 404 telt óók als definitief: dan kent de Pi deze betaling niet meer
     * (opnieuw geflasht, of een sleutel van een vorige installatie) en heeft
     * eeuwig blijven proberen geen zin.
     */
    fun reportResult(payload: String): Boolean {
        val response = post("/terminal/result", payload) ?: return false
        response.use { return it.isSuccessful || it.code == 404 }
    }

    fun heartbeat(batteryPercent: Int?, printerOk: Boolean?, appVersion: String) {
        val body = buildString {
            append("{")
            append(""""battery_percent":${batteryPercent ?: "null"},""")
            append(""""printer_ok":${printerOk ?: "null"},""")
            append(""""app_version":"$appVersion"""")
            append("}")
        }
        post("/terminal/status", body)?.close()
    }

    /** Wisselt de 8-tekens koppelcode in voor een token. */
    fun pair(code: String): Boolean {
        val response = post("/pair", """{"code":"${code.trim().uppercase()}"}""", auth = false)
            ?: return false
        response.use {
            if (!it.isSuccessful) return false
            // De bridge zet het token als HttpOnly-cookie. Wij bewaren hem zelf,
            // zodat hij een herstart van de app overleeft.
            val token = it.headers("set-cookie")
                .firstOrNull { header -> header.startsWith("hb-pair=") }
                ?.substringAfter("hb-pair=")
                ?.substringBefore(";")
            if (token.isNullOrBlank()) return false
            tokenStore.save(token)
            return true
        }
    }

    private fun post(path: String, body: String, auth: Boolean = true) =
        execute(
            Request.Builder()
                .url("$baseUrl$path")
                .post(body.toRequestBody(JSON_MEDIA)),
            auth,
        )

    private fun execute(builder: Request.Builder, auth: Boolean = true) = runCatching {
        if (auth) tokenStore.load()?.let { builder.addHeader("Cookie", "hb-pair=$it") }
        http.newCall(builder.build()).execute()
    }.getOrNull()

    private companion object {
        val JSON_MEDIA = "application/json".toMediaType()
    }
}

@Serializable
data class QueuedPayment(
    val idempotency_key: String,
    val amount_cents: Int,
    val order_id: String,
    val order_label: String? = null,
)

/** Het pairing-token. Op de terminal versleuteld opgeslagen. */
interface TokenStore {
    fun load(): String?
    fun save(token: String)
}

/** Voor tests en voor de eerste start, vóór het koppelen. */
class InMemoryTokenStore(private var token: String? = null) : TokenStore {
    override fun load(): String? = token
    override fun save(token: String) {
        this.token = token
    }
}
