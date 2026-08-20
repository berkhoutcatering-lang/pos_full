package nl.hopbites.terminal

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * De hele app in één activiteit: het scherm volgt de toestand die
 * [TerminalLoop] uitzendt, en dat is alles wat er te sturen valt.
 *
 * Waarom zo weinig: elke wijziging in de APK kost een reviewronde bij myPOS van
 * één tot drie werkdagen. Alles wat kan veranderen — teksten, kleuren, de naam
 * van de zaak — hoort daarom van de Pi te komen en niet hier te staan.
 */
class MainActivity : ComponentActivity() {

    private lateinit var tokens: SecureTokenStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Aan de balie mag dit scherm nooit uitgaan of vergrendelen.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        tokens = SecureTokenStore(this)
        val queue = ResultQueue(File(filesDir, "pending-results.jsonl"))

        setContent {
            var paired by remember { mutableStateOf(tokens.paired) }
            var pairing by remember { mutableStateOf(false) }
            var pairError by remember { mutableStateOf<String?>(null) }

            if (!paired) {
                PairScreen(
                    bridgeUrl = tokens.bridgeUrl,
                    busy = pairing,
                    error = pairError,
                    onPair = { url, code ->
                        pairing = true
                        pairError = null
                        lifecycleScope.launch {
                            tokens.bridgeUrl = url
                            val ok = withContext(Dispatchers.IO) { bridge().pair(code) }
                            pairing = false
                            if (ok) {
                                // Alleen de vlag omzetten; de recompositie start
                                // de lus. Hem hier óók starten gaf twee lussen
                                // die om dezelfde betaling vechten.
                                paired = true
                            } else {
                                pairError = "Koppelen mislukt. Klopt de code nog en is de kassa bereikbaar?"
                            }
                        }
                    },
                )
                return@setContent
            }

            val loop = remember { startLoop(queue) }
            val state by loop.state.collectAsState()
            val online by loop.connected.collectAsState()

            when (val s = state) {
                is TerminalState.Idle -> IdleScreen(venue = VENUE, online = online)
                is TerminalState.Charging -> ChargingScreen(
                    amountCents = s.payment.amount_cents,
                    orderLabel = s.payment.order_label,
                )
                is TerminalState.Result -> ResultScreen(
                    amountCents = s.payment.amount_cents,
                    outcome = s.outcome,
                )
            }
        }
    }

    private fun bridge() = BridgeClient(
        baseUrl = tokens.bridgeUrl,
        http = wifiBoundHttpClient(this),
        tokenStore = tokens,
    )

    private fun startLoop(queue: ResultQueue): TerminalLoop {
        val loop = TerminalLoop(
            bridge = bridge(),
            // Tot er een demo-debugtoestel is, rekent de stub af. De echte
            // SDK-aanroep komt op deze ene plek binnen, de rest van de app
            // merkt er niets van.
            //
            // In een debug-build wisselt hij per betaling van uitkomst. Anders
            // krijg je alleen het gelukkige pad te zien, en juist de twee
            // andere schermen moeten kloppen: daar staat een klant die denkt
            // dat hij betaald heeft.
            // Een release-build keurt niets goed zolang de echte SDK er niet
            // in zit: "gelukt" tonen zonder dat er is afgerekend, is het enige
            // dat erger is dan een app die niets doet.
            gateway = if (BuildConfig.DEBUG) {
                StubPaymentGateway(behaviour = ::nextStubOutcome)
            } else {
                UnavailableGateway
            },
            queue = queue,
            appVersion = BuildConfig.VERSION_NAME,
        )
        loop.start(lifecycleScope)
        return loop
    }

    private var stubRound = 0

    private fun nextStubOutcome(): StubPaymentGateway.Behaviour {
        if (!BuildConfig.DEBUG) return StubPaymentGateway.Behaviour.APPROVE
        val order = listOf(
            StubPaymentGateway.Behaviour.APPROVE,
            StubPaymentGateway.Behaviour.DECLINE,
            StubPaymentGateway.Behaviour.UNRESOLVED,
        )
        return order[stubRound++ % order.size]
    }

    private companion object {
        // Komt straks van de Pi, samen met de kleuren. Zie het ontwerpplan.
        const val VENUE = "Hop & Bites"
    }
}
