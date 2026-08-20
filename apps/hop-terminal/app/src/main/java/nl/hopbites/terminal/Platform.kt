package nl.hopbites.terminal

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * Alles wat de app aan Android vastknoopt. De rest van de logica staat in de
 * core-module en weet hier niets van.
 */

/**
 * Een HTTP-client die zijn verkeer over het WiFi stuurt waar de kassa aan hangt.
 *
 * De terminal zit op het access point van de Pi, en dat netwerk heeft geen
 * internet. Android houdt daardoor de simkaart als standaardroute: zonder deze
 * binding vertrekt een aanroep naar 10.42.0.1 over 4G en komt hij nooit aan.
 * Dat kost je geen foutmelding maar een time-out, en aan de balie is dat een
 * klant die staat te wachten.
 */
fun wifiBoundHttpClient(context: Context): OkHttpClient {
    val cm = context.getSystemService(ConnectivityManager::class.java)
    val wifi = cm?.allNetworks?.firstOrNull { network ->
        cm.getNetworkCapabilities(network)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
    }

    return OkHttpClient.Builder()
        // Ruimer dan de long-poll van 25s aan de kant van de Pi, anders breekt
        // de client elke poll voortijdig af.
        .readTimeout(40, TimeUnit.SECONDS)
        .connectTimeout(5, TimeUnit.SECONDS)
        .apply { wifi?.socketFactory?.let { socketFactory(it) } }
        .build()
}

/**
 * Het koppeltoken, versleuteld opgeslagen. Hiermee mag dit apparaat betalingen
 * ophalen; dat hoort niet in platte voorkeuren te staan.
 */
class SecureTokenStore(context: Context) : TokenStore {

    private val prefs = run {
        val key = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        EncryptedSharedPreferences.create(
            "hop-terminal",
            key,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun load(): String? = prefs.getString(TOKEN, null)

    override fun save(token: String) {
        prefs.edit().putString(TOKEN, token).apply()
    }

    /** Adres van de kassa. Staat hier omdat het samen met het token hoort. */
    var bridgeUrl: String
        get() = prefs.getString(URL, DEFAULT_URL) ?: DEFAULT_URL
        set(value) = prefs.edit().putString(URL, value.trimEnd('/')).apply()

    val paired: Boolean get() = load() != null

    fun forget() {
        prefs.edit().remove(TOKEN).apply()
    }

    private companion object {
        const val TOKEN = "pair-token"
        const val URL = "bridge-url"
        // Standaard de Pi op zijn eigen access point; bij het koppelen aan te passen.
        const val DEFAULT_URL = "https://hopbites.local:3001"
    }
}
