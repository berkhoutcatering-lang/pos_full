package nl.hopbites.terminal

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * De app-lus tegen een échte pi-bridge, met de stub in plaats van een kaart.
 *
 * Bedoeld om met de hand te draaien terwijl er een bridge naast staat:
 *
 *   gradle :core:demo --args="http://127.0.0.1:3009 E7FDMAPY"
 *
 * Koppelt met de opgegeven code, gaat dan pollen, rekent elke opdracht af en
 * meldt hem terug. Geen test — een manier om te zien dat de twee kanten elkaar
 * begrijpen voordat er een toestel is.
 */
object LiveBridgeDemo {

    @JvmStatic
    fun main(args: Array<String>) = runBlocking {
        val baseUrl = args.getOrNull(0) ?: "http://127.0.0.1:3009"
        val pairCode = args.getOrNull(1)

        val http = OkHttpClient.Builder()
            .readTimeout(40, TimeUnit.SECONDS)
            .build()
        val tokens = InMemoryTokenStore()
        val bridge = BridgeClient(baseUrl, http, tokens)

        if (pairCode != null) {
            println(if (bridge.pair(pairCode)) "gekoppeld" else "koppelen mislukt")
        }

        val queue = ResultQueue(File.createTempFile("hop-terminal-demo", ".jsonl").also { it.delete() })
        val loop = TerminalLoop(
            bridge = bridge,
            gateway = StubPaymentGateway(thinkTimeMs = 1_000),
            queue = queue,
            appVersion = "demo",
            resultLingerMs = 1_000,
        )

        val scope = CoroutineScope(Dispatchers.IO)
        loop.start(scope)

        scope.launch {
            loop.state.collect { println("scherm: $it") }
        }

        // Draait tot je hem afbreekt, net als op de terminal.
        while (true) delay(1_000)
    }
}
