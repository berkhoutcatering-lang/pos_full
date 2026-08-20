package nl.hopbites.terminal

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * De app zonder terminal en zonder Android. Wat hier getest wordt is niet het
 * gelukkige pad maar de momenten waarop er geld in het spel is en het antwoord
 * zoekraakt — precies waarvoor de wachtrij en de status "onbekend" bestaan.
 */
class TerminalLoopTest {

    private val server = MockWebServer()
    private val http = OkHttpClient()

    @AfterTest
    fun stop() = server.shutdown()

    private fun client() = BridgeClient(
        baseUrl = server.url("").toString().trimEnd('/'),
        http = http,
        tokenStore = InMemoryTokenStore("test-token"),
    )

    private fun tempQueue(): ResultQueue =
        ResultQueue(File.createTempFile("hop-terminal", ".jsonl").also { it.delete() })

    // ---------- de lijn met de Pi ----------

    @Test
    fun `204 betekent niets te doen, geen fout`() {
        server.enqueue(MockResponse().setResponseCode(204))
        assertEquals(PollResult.Idle, client().nextPayment())
    }

    @Test
    fun `een klaarstaande betaling wordt gelezen`() {
        server.enqueue(
            MockResponse().setBody(
                """{"idempotency_key":"01M0E0TMAWX1Q2FD5AR4WMPV72","amount_cents":950,
                    "order_id":"c022931e-e788-46b3-8f0c-bda50f0e09a6","order_label":"Bestelling 12"}"""
            )
        )
        val result = client().nextPayment()
        assertTrue(result is PollResult.Work)
        assertEquals(950, result.payment.amount_cents)
        assertEquals("Bestelling 12", result.payment.order_label)
    }

    @Test
    fun `het pairing-token gaat mee als cookie`() {
        server.enqueue(MockResponse().setResponseCode(204))
        client().nextPayment()
        assertEquals("hb-pair=test-token", server.takeRequest().getHeader("Cookie"))
    }

    @Test
    fun `een onbereikbare Pi is geen crash, maar ook geen stilte`() {
        server.shutdown()
        // Offline en Idle uit elkaar houden is het verschil tussen een rustige
        // balie en een kassa die er niet is. De medewerker moet dat zien.
        assertEquals(PollResult.Offline, client().nextPayment())
    }

    @Test
    fun `een resultaat blijft in de wachtrij tot de Pi hem aanneemt`() {
        server.enqueue(MockResponse().setResponseCode(500))
        assertFalse(client().reportResult("""{"idempotency_key":"x"}"""))
    }

    @Test
    fun `een betaling die de Pi niet kent verdwijnt wel uit de wachtrij`() {
        // 404: opnieuw aanbieden heeft geen zin, de Pi is opnieuw ingericht.
        server.enqueue(MockResponse().setResponseCode(404))
        assertTrue(client().reportResult("""{"idempotency_key":"x"}"""))
    }

    // ---------- de wachtrij ----------

    @Test
    fun `de wachtrij overleeft een herstart van de app`() {
        val file = File.createTempFile("hop-terminal", ".jsonl").also { it.delete() }
        ResultQueue(file).add("""{"idempotency_key":"a","approved":true}""")

        // Nieuwe instantie, alsof de app opnieuw is opgestart.
        val opnieuw = ResultQueue(file)
        assertEquals(1, opnieuw.size())
        assertContains(opnieuw.peekAll().first(), "\"approved\":true")
    }

    @Test
    fun `verwijderen raakt alleen het bevestigde resultaat`() {
        val queue = tempQueue()
        queue.add("""{"idempotency_key":"a"}""")
        queue.add("""{"idempotency_key":"b"}""")
        queue.remove("""{"idempotency_key":"a"}""")

        assertEquals(1, queue.size())
        assertContains(queue.peekAll().first(), "\"b\"")
    }

    // ---------- wat de Pi te zien krijgt ----------

    @Test
    fun `goedgekeurd levert de bongegevens op die de bon nodig heeft`() {
        val payload = PaymentOutcome.Approved(
            Receipt(authCode = "P00291", rrn = "623120552024", panMasked = "**** 3839", cardScheme = "Maestro")
        ).toPayload("01M0E0TMAWX1Q2FD5AR4WMPV72")

        assertContains(payload, "\"approved\":true")
        assertContains(payload, "\"auth_code\":\"P00291\"")
        assertContains(payload, "\"rrn\":\"623120552024\"")
        assertContains(payload, "\"card_scheme\":\"Maestro\"")
    }

    @Test
    fun `onbekend wordt nooit stilletjes geweigerd`() {
        val payload = PaymentOutcome.Unresolved("12", "verbinding weg").toPayload("k")
        // Zonder deze vlag zou de kassa denken dat er niets gebeurd is, terwijl
        // de kaart belast kan zijn.
        assertContains(payload, "\"unresolved\":true")
        assertContains(payload, "\"approved\":false")
    }

    @Test
    fun `aanhalingstekens in een foutmelding breken de JSON niet`() {
        val payload = PaymentOutcome.Declined("51", """kaart "geweigerd" \ door bank""").toPayload("k")
        assertContains(payload, """\"geweigerd\"""")
        assertContains(payload, """\\""")
    }

    // ---------- de lus ----------

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun `het resultaat staat op schijf voordat het verstuurd wordt`() = runTest {
        val queue = tempQueue()
        val payment = QueuedPayment("01M0E0TMAWX1Q2FD5AR4WMPV72", 950, "order-1", "Bestelling 12")
        val gateway = StubPaymentGateway(thinkTimeMs = 0)

        val outcome = gateway.purchase(payment.amount_cents, payment.idempotency_key)
        queue.add(outcome.toPayload(payment.idempotency_key))

        // Crash hier: de app is weg, maar het resultaat niet.
        assertEquals(1, ResultQueue(File(queue.path())).size())
    }
}
