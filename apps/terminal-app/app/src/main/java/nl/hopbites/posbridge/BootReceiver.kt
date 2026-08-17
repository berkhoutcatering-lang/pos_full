package nl.hopbites.posbridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Brings the bridge back after the terminal restarts.
 *
 * A terminal that reboots overnight — or after a myPOS OS update — would
 * otherwise sit there looking fine while the kassa reports "geen verbinding",
 * and nobody finds out until the first customer wants to pay.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        // Without a secret there is nothing to serve; MainActivity starts the
        // service once the terminal has been paired.
        if (Pairing.secret(context).isEmpty()) return
        BridgeService.start(context)
    }
}
