package nl.hopbites.terminal

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp

/**
 * De schermen die de klant en de medewerker zien. Vier stuks, plus het
 * koppelscherm dat je alleen bij het inrichten tegenkomt.
 *
 * Wat hier bewust ontbreekt is het betaalscherm zelf: zodra de kaart erbij komt
 * neemt myPOS het scherm over met hun eigen gecertificeerde flow. Daar valt
 * niets aan te stylen, en dat is goed.
 */

@Composable
private fun Screen(
    background: Color = Hop.Offwhite,
    content: @Composable ColumnScopeAlias.() -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(background).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        content = content,
    )
}

// Alias zodat de schermen hieronder kort blijven zonder import-ruis.
typealias ColumnScopeAlias = androidx.compose.foundation.layout.ColumnScope

/**
 * Rust. Dit scherm vervangt het wachtscherm van POSLink Manager, dat het
 * IP-adres van de kassa aan de klant liet zien.
 */
@Composable
fun IdleScreen(venue: String, online: Boolean) {
    Screen {
        Text(venue, style = HopType.Display, color = Hop.Ink, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        Text("Welkom", style = HopType.Body, color = Hop.Muted)
        Spacer(Modifier.height(56.dp))
        ConnectionDot(online)
    }
}

/** Bedrag klaar, kaart mag erbij. */
@Composable
fun ChargingScreen(amountCents: Int, orderLabel: String?) {
    Screen {
        orderLabel?.let {
            Text(it.uppercase(), style = HopType.Label, color = Hop.Muted)
            Spacer(Modifier.height(16.dp))
        }
        Text(euro(amountCents), style = HopType.Amount, color = Hop.Ink)
        Spacer(Modifier.height(28.dp))
        Text(
            "Houd je kaart bij het scherm",
            style = HopType.Title,
            color = Hop.InkSoft,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * De uitslag. Kleur doet hier het werk: iemand die vanaf een meter afstand
 * kijkt moet in één blik weten of het gelukt is.
 */
@Composable
fun ResultScreen(amountCents: Int, outcome: PaymentOutcome) {
    val (bg, accent, heading) = when (outcome) {
        is PaymentOutcome.Approved -> Triple(Hop.GreenWash, Hop.Green, "Gelukt")
        is PaymentOutcome.Declined -> Triple(Hop.BrickWash, Hop.Brick, "Niet gelukt")
        is PaymentOutcome.Unresolved -> Triple(Hop.AmberWash, Hop.Amber, "Controleer de terminal")
    }

    Screen(background = bg) {
        Text(heading, style = HopType.Display, color = accent, textAlign = TextAlign.Center)
        Spacer(Modifier.height(12.dp))
        Text(euro(amountCents), style = HopType.Title, color = Hop.Ink)

        when (outcome) {
            is PaymentOutcome.Approved -> {
                Spacer(Modifier.height(36.dp))
                // Wat de klant op zijn bon terugziet, zodat de bon en het
                // scherm hetzelfde zeggen.
                outcome.receipt.cardScheme?.let { Text(it, style = HopType.Body, color = Hop.InkSoft) }
                outcome.receipt.panMasked?.let {
                    Text(it, style = HopType.Mono, color = Hop.Muted)
                }
                outcome.receipt.authCode?.let {
                    Spacer(Modifier.height(8.dp))
                    Text("autorisatie $it", style = HopType.Mono, color = Hop.Muted)
                }
            }
            is PaymentOutcome.Declined -> {
                Spacer(Modifier.height(28.dp))
                Text(
                    outcome.message ?: "Probeer een andere kaart of reken contant af.",
                    style = HopType.Body,
                    color = Hop.InkSoft,
                    textAlign = TextAlign.Center,
                )
            }
            is PaymentOutcome.Unresolved -> {
                Spacer(Modifier.height(28.dp))
                Text(
                    "Onbekend of de betaling is gelukt. Vraag de medewerker om te kijken voordat je opnieuw betaalt.",
                    style = HopType.Body,
                    color = Hop.InkSoft,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

/** Alleen bij het inrichten van een nieuw toestel. */
@Composable
fun PairScreen(
    bridgeUrl: String,
    busy: Boolean,
    error: String?,
    onPair: (url: String, code: String) -> Unit,
) {
    var url by remember { mutableStateOf(bridgeUrl) }
    var code by remember { mutableStateOf("") }

    Screen(background = Hop.Paper) {
        Text("Terminal koppelen", style = HopType.Title, color = Hop.Ink)
        Spacer(Modifier.height(12.dp))
        Text(
            "Vul de 8-tekens code in die de manager aanmaakt onder Beheer → Apparaten.",
            style = HopType.Body,
            color = Hop.Muted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(32.dp))

        OutlinedTextField(
            value = url,
            onValueChange = { url = it },
            label = { Text("Adres van de kassa") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = code,
            onValueChange = { code = it.uppercase().take(8) },
            label = { Text("Koppelcode") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth(),
        )

        error?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, style = HopType.Body, color = Hop.Brick, textAlign = TextAlign.Center)
        }

        Spacer(Modifier.height(28.dp))
        Button(
            onClick = { onPair(url, code) },
            enabled = !busy && code.length == 8,
            colors = ButtonDefaults.buttonColors(containerColor = Hop.Green),
            modifier = Modifier.fillMaxWidth().height(64.dp),
        ) {
            Text(if (busy) "Koppelen…" else "Koppelen", style = HopType.Body, color = Color.White)
        }
    }
}

/**
 * Verbindingsindicator. Klein en rustig: de klant hoeft dit niet te lezen, de
 * medewerker moet het wél kunnen zien zonder de app te verlaten.
 */
@Composable
private fun ConnectionDot(online: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(10.dp)
                .background(if (online) Hop.Green else Hop.Amber, CircleShape)
        )
        Spacer(Modifier.width(10.dp))
        Text(
            if (online) "verbonden met de kassa" else "geen verbinding met de kassa",
            style = HopType.Label,
            color = Hop.Muted,
        )
    }
}
