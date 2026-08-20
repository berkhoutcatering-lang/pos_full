package nl.hopbites.terminal

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp

/**
 * Dezelfde vijf kleuren als de kassa (apps/web/app/globals.css), zodat de
 * terminal en het scherm van de medewerker één ding lijken in plaats van twee
 * losse apparaten.
 *
 * Op termijn komen deze waarden van de Pi, zodat een andere zaak zijn eigen
 * kleuren krijgt zonder nieuwe APK — dat is de white-label-belofte van het
 * kassasysteem, en de reden dat ze hier op één plek staan.
 */
object Hop {
    val Offwhite = Color(0xFFF4F1E8)
    val Paper = Color(0xFFFBF9F2)
    val Ink = Color(0xFF1B201D)
    val InkSoft = Color(0xFF4C544E)
    val Muted = Color(0xFF697069)
    val Line = Color(0xFFD6D1C2)

    val Green = Color(0xFF34794D)      // goedgekeurd, accenten
    val GreenWash = Color(0xFFEDF4EC)
    val Brick = Color(0xFFB64536)      // geweigerd
    val BrickWash = Color(0xFFF4E0DB)
    val Amber = Color(0xFFC2851C)      // let op, onbekende afloop
    val AmberWash = Color(0xFFF6E9CC)
}

/**
 * Grote maten, met opzet. Dit scherm wordt op armlengte gelezen door iemand die
 * al met een pinpas in de hand staat, niet van dichtbij door een gebruiker die
 * de tijd heeft.
 */
object HopType {
    val Display = TextStyle(fontSize = 72.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-2).sp)
    val Amount = TextStyle(fontSize = 96.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-3).sp)
    val Title = TextStyle(fontSize = 34.sp, fontWeight = FontWeight.Bold)
    val Body = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Normal)
    val Label = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp)
    val Mono = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.Normal)
}

/** Bedrag in centen naar wat de klant op het scherm hoort te zien. */
fun euro(cents: Int): String = "€ %,.2f".format(cents / 100.0).replace(",", " ").replace(".", ",")
