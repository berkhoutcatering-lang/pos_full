package nl.hopbites.posbridge

import android.content.Context
import java.security.SecureRandom

/**
 * The shared secret that ties this terminal to one kassa.
 *
 * Everything on the truck's WiFi can reach port 8080, so possession of this
 * secret is the only thing standing between a stranger on the network and a
 * payment screen. It is generated here rather than on the Pi so it never has to
 * travel — the operator reads it off this screen and types it into the kassa.
 */
object Pairing {

    private const val PREFS = "bridge"
    private const val KEY = "secret"

    /** 16 bytes of entropy, hex-encoded: long enough to be safe, short enough to type. */
    private const val BYTES = 16

    fun secret(ctx: Context): String =
        prefs(ctx).getString(KEY, "").orEmpty()

    /** Returns the existing secret, creating one on first run. */
    fun ensureSecret(ctx: Context): String =
        secret(ctx).ifEmpty { regenerate(ctx) }

    /**
     * Replaces the secret. The kassa stops being able to start payments until it
     * is re-paired, so callers should confirm with the operator first.
     */
    fun regenerate(ctx: Context): String {
        val bytes = ByteArray(BYTES).also { SecureRandom().nextBytes(it) }
        val secret = bytes.joinToString("") { "%02x".format(it) }
        prefs(ctx).edit().putString(KEY, secret).apply()
        return secret
    }

    /** Groups of four, so it can be read aloud and typed without losing your place. */
    fun formatted(secret: String): String =
        secret.chunked(4).joinToString(" ")

    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
