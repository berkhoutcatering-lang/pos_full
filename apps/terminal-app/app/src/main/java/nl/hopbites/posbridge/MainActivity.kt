package nl.hopbites.posbridge

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.net.Inet4Address
import java.net.NetworkInterface
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * What the operator sees on the terminal.
 *
 * Three jobs, in the order they matter on a busy service: say whether the kassa
 * can reach this terminal, show the pairing key when a new kassa has to be set
 * up, and show what has been charged so a disputed transaction can be checked
 * without digging through the myPOS app.
 */
class MainActivity : AppCompatActivity() {

    private val refresh = Handler(Looper.getMainLooper())
    private val tick = object : Runnable {
        override fun run() {
            render()
            refresh.postDelayed(this, 2_000)
        }
    }

    private val clock = SimpleDateFormat("HH:mm", Locale("nl", "NL"))

    private lateinit var connectionState: TextView
    private lateinit var address: TextView
    private lateinit var secretView: TextView
    private lateinit var payments: LinearLayout
    private lateinit var paymentsEmpty: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        connectionState = findViewById(R.id.connection_state)
        address = findViewById(R.id.address)
        secretView = findViewById(R.id.secret)
        payments = findViewById(R.id.payments)
        paymentsEmpty = findViewById(R.id.payments_empty)

        PaymentStore.init(applicationContext)
        Pairing.ensureSecret(this)

        findViewById<Button>(R.id.regenerate).setOnClickListener { confirmRegenerate() }

        requestNotificationPermission()
        BridgeService.start(this)
    }

    override fun onResume() {
        super.onResume()
        refresh.post(tick)
    }

    override fun onPause() {
        refresh.removeCallbacks(tick)
        super.onPause()
    }

    /**
     * Without this the foreground notification is silently hidden on Android 13+.
     * The service keeps running either way, but the operator loses the one clue
     * that the bridge is alive when the app is in the background.
     */
    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
        if (granted == PackageManager.PERMISSION_GRANTED) return
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }

    private fun confirmRegenerate() {
        AlertDialog.Builder(this)
            .setTitle(R.string.regenerate_title)
            .setMessage(R.string.regenerate_message)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.regenerate_confirm) { _, _ ->
                Pairing.regenerate(this)
                render()
            }
            .show()
    }

    private fun render() {
        val ip = localAddress()
        val running = BridgeService.isRunning

        connectionState.setText(
            when {
                !running -> R.string.state_stopped
                ip == null -> R.string.state_no_network
                else -> R.string.state_listening
            }
        )
        connectionState.setBackgroundResource(
            if (running && ip != null) R.drawable.pill_ok else R.drawable.pill_warn
        )

        address.text = if (ip == null) {
            getString(R.string.address_unknown)
        } else {
            getString(R.string.address_value, ip, BridgeService.PORT)
        }

        secretView.text = Pairing.formatted(Pairing.secret(this))

        renderPayments()
    }

    private fun renderPayments() {
        val recent = PaymentStore.recent(8)
        paymentsEmpty.visibility = if (recent.isEmpty()) View.VISIBLE else View.GONE
        payments.removeAllViews()

        val inflater = LayoutInflater.from(this)
        recent.forEach { payment ->
            val row = inflater.inflate(R.layout.row_payment, payments, false)

            row.findViewById<TextView>(R.id.row_time).text = clock.format(payment.startedAt)
            row.findViewById<TextView>(R.id.row_amount).text =
                getString(R.string.amount, payment.amountCents / 100, payment.amountCents % 100)
            row.findViewById<TextView>(R.id.row_reference).text =
                payment.reference.ifEmpty { payment.idempotencyKey.takeLast(6) }

            val status = row.findViewById<TextView>(R.id.row_status)
            status.setText(statusLabel(payment))
            status.setBackgroundResource(statusPill(payment))

            payments.addView(row)
        }
    }

    private fun statusLabel(payment: PaymentStore.Payment) = when {
        payment.isStale -> R.string.status_stale
        payment.status == PaymentStore.Status.PENDING -> R.string.status_pending
        payment.status == PaymentStore.Status.APPROVED -> R.string.status_approved
        payment.status == PaymentStore.Status.DECLINED -> R.string.status_declined
        else -> R.string.status_failed
    }

    private fun statusPill(payment: PaymentStore.Payment) = when {
        payment.status == PaymentStore.Status.APPROVED -> R.drawable.pill_ok
        payment.status == PaymentStore.Status.PENDING && !payment.isStale -> R.drawable.pill_neutral
        else -> R.drawable.pill_warn
    }

    /**
     * The address the Pi has to call. Taken off the interfaces rather than from
     * the WiFi manager, because the terminal may also be on Ethernet through a
     * dock and we want whichever one actually carries the truck's subnet.
     */
    private fun localAddress(): String? = runCatching {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }
            .filterIsInstance<Inet4Address>()
            .firstOrNull { it.isSiteLocalAddress }
            ?.hostAddress
    }.getOrNull()
}
