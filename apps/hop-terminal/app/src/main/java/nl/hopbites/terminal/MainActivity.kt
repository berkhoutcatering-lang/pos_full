package nl.hopbites.terminal

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Proefversie: doet niets anders dan opstarten en de naam van de zaak tonen.
 *
 * Dat is met opzet. De vraag die dit beantwoordt is niet "werkt de app" maar
 * "komt een door onszelf ondertekende APK überhaupt op de terminal" — en die
 * vraag is het waard om te beantwoorden met een lege app in plaats van met
 * weken werk erin.
 *
 * De echte schermen komen in fase 3; de logica eronder zit al in de
 * core-module en is daar getest.
 */
class MainActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(GROUND)
            layoutParams = ViewGroup.LayoutParams(MATCH, MATCH)
        }

        root.addView(TextView(this).apply {
            text = getString(R.string.app_name)
            textSize = 34f
            setTextColor(INK)
            gravity = Gravity.CENTER
        })

        root.addView(TextView(this).apply {
            text = "proefversie ${BuildConfig.VERSION_NAME}"
            textSize = 15f
            setTextColor(MUTED)
            gravity = Gravity.CENTER
        })

        setContentView(root)
    }

    private companion object {
        const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT

        // Dezelfde tokens als de kassa: offwhite grond, antraciet inkt.
        val GROUND = Color.parseColor("#F4F1E8")
        val INK = Color.parseColor("#1B201D")
        val MUTED = Color.parseColor("#697069")
    }
}
