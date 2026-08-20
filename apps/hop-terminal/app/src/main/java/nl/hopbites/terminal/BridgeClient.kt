package nl.hopbites.terminal

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

/**
 * De lijn met de pi-bridge. De app haalt hier zijn werk op en meldt de afloop
 * terug; de Pi blijft de bron van waarheid.
 *
 * Twee dingen zijn geen detail:
 *
 * 1. De verbinding wordt expliciet aan het WiFi-netwerk gebonden. De Ultra
 *    hangt aan het access point van de Pi, dat geen internet heeft, en Android
 *    houdt daardoor de simkaart als standaardroute. Zonder binding vertrekt
 *    een aanroep naar 10.42.0.1 over 4G en komt hij nooit aan.
 * 2. De pi-bridge draait TLS met een eigen CA. Die zit als trust anchor in
 *    res/xml/network_security_config.xml — certificaatcontrole uitzetten is
 *    geen alternatief.
 */
class BridgeClient(
    private val context: Context,
    private val baseUrl: String,
    private val tokenStore: TokenStore,
) {
    private val json = Json { ignoreUnknownKeys = true }

    private val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            // Ruimer dan de long-poll van 25s, anders breekt hij elke poll af.
            .readTimeout(40, TimeUnit.SECONDS)
            .connectTimeout(5, TimeUnit.SECONDS)
            .socketFactory(wifiSocketFactory())
            .build()
    }

    /** Sockets dwingen over het WiFi waar de Pi aan hangt. */
    private fun wifiSocketFactory(): javax.net.SocketFactory {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        val wifi = cm.allNetworks.firstOrNull { network ->
            cm.getNetworkCapabilities(network)
                ?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        }
        return wifi?.socketFactory ?: javax.net.SocketFactory.getDefault()
    }

    /**
     * Blijft hangen tot er een bedrag klaarstaat of tot de long-poll afloopt.
     * `null` betekent "niets te doen" — dat is de normale toestand, geen fout.
     */
    suspend fun nextPayment(): QueuedPayment? {
        val response = call(Request.Builder().url("$baseUrl/terminal/next").get())
            ?: return null
        if (response.code == 204) return null
        val body = response.body?.string() ?: return null
        return runCatching { json.decodeFromString<QueuedPayment>(body) }.getOrNull()
    }

    /** Vertelt de Pi dat wij deze opdracht oppakken. */
    suspend fun claim(key: String) {
        post("/terminal/claim", """{"idempotency_key":"$key"}""")
    }

    /**
     * Meldt de afloop. Geeft `true` bij een definitief antwoord — dan mag het
     * resultaat uit de wachtrij. Bij een netwerkfout `false`: opnieuw proberen,
     * want een belaste kaart die de Pi niet bereikt is geld zonder bon.
     */
    suspend fun reportResult(payload: String): Boolean {
        val response = post("/terminal/result", payload) ?: return false
        // 404 betekent dat de Pi deze betaling niet kent (opnieuw geflasht).
        // Eeuwig blijven proberen heeft dan geen zin.
        return response.isSuccessful || response.code == 404
    }

    suspend fun heartbeat(batteryPercent: Int?, printerOk: Boolean?, appVersion: String) {
        post(
            "/terminal/status",
            """{"battery_percent":${batteryPercent ?: "null"},"printer_ok":${printerOk ?: "null"},"app_version":"$appVersion"}""",
        )
    }

    /** Wisselt de 8-tekens koppelcode in voor een token. */
    suspend fun pair(code: String): Boolean {
        val response = post("/pair", """{"code":"${code.trim().uppercase()}"}""", auth = false)
        if (response?.isSuccessful != true) return false
        // De bridge zet het token als cookie; die bewaren we zelf zodat we hem
        // ook na een herstart nog hebben.
        val cookie = response.headers("set-cookie").firstOrNull { it.startsWith("hb-pair=") }
        val token = cookie?.substringAfter("hb-pair=")?.substringBefore(";")
        if (token.isNullOrBlank()) return false
        tokenStore.save(token)
        return true
    }

    private suspend fun post(path: String, body: String, auth: Boolean = true) =
        call(
            Request.Builder()
                .url("$baseUrl$path")
                .post(body.toRequestBody("application/json".toMediaType())),
            auth,
        )

    private suspend fun call(builder: Request.Builder, auth: Boolean = true) =
        suspendCancellableCoroutine { cont ->
            if (auth) {
                tokenStore.load()?.let { builder.addHeader("Cookie", "hb-pair=$it") }
            }
            val call = http.newCall(builder.build())
            cont.invokeOnCancellation { call.cancel() }
            runCatching { cont.resume(call.execute()) }
                .onFailure { cont.resume(null) }
        }
}

@Serializable
data class QueuedPayment(
    val idempotency_key: String,
    val amount_cents: Int,
    val order_id: String,
    val order_label: String? = null,
)

/** Het pairing-token, versleuteld opgeslagen. */
interface TokenStore {
    fun load(): String?
    fun save(token: String)
}
