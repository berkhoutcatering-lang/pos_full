package nl.hopbites.terminal

import java.io.File

/**
 * Betaalresultaten die de Pi nog niet bevestigd heeft.
 *
 * Dit is het onderdeel dat er is omdat het mis kán gaan: als de kaart belast is
 * en het resultaat blijft steken in het netwerk, is er geld weg zonder bon. Het
 * resultaat gaat daarom eerst naar schijf en pas weg als de Pi hem aanneemt.
 *
 * Bewust een plat bestand en geen database: dit moet werken als de app
 * halverwege wordt afgeschoten, en één regel per resultaat is genoeg. De
 * idempotency-key zit in de payload, dus dubbel aanbieden kan geen kwaad.
 */
class ResultQueue(private val file: File) {

    @Synchronized
    fun add(payload: String) {
        file.appendText(payload.replace("\n", " ") + "\n")
    }

    @Synchronized
    fun peekAll(): List<String> =
        if (file.exists()) file.readLines().filter { it.isNotBlank() } else emptyList()

    /** Haalt één resultaat eruit, herkend aan zijn idempotency-key. */
    @Synchronized
    fun remove(payload: String) {
        if (!file.exists()) return
        val rest = file.readLines().filter { it.isNotBlank() && it != payload }
        if (rest.isEmpty()) file.delete() else file.writeText(rest.joinToString("\n") + "\n")
    }

    @Synchronized
    fun size(): Int = peekAll().size

    /** Waar de wachtrij staat — voor logging en tests. */
    fun path(): String = file.absolutePath
}
