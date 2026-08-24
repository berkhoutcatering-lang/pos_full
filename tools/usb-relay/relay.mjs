#!/usr/bin/env node
// De betaalterminal aan de kassa, de bridge op de Pi.
//
// De myPOS Ultra hangt met een USB-kabel aan het kassascherm (een Surface) en
// meldt zich daar als COM-poort. De pi-bridge draait op de Raspberry Pi en kan
// daar niet bij. Dit doorgeefluik zet die COM-poort op het netwerk, zodat de
// bridge er precies zo tegen praat als tegen een terminal die zelf op WiFi zit:
// `MYPOS_TRANSPORT=lan` met dit apparaat als host.
//
// Waarom de kabel überhaupt: hangt de terminal aan WiFi zonder internet, dan
// stuurt Android het bankverkeer daarheen in plaats van over de simkaart en
// mislukt elke transactie. Aan een kabel staat zijn WiFi uit en is de sim de
// enige uitweg. Dat de Pi vervolgens over het netwerk met dit programma praat
// verandert daar niets aan — dat is ons eigen verkeer, niet dat van de bank.
//
// Er wordt niets geïnterpreteerd. Bytes van het netwerk gaan naar de kabel en
// omgekeerd; IPP-frames, stages en bedragen blijven het werk van de bridge.
//
// Gebruik:
//   npm install
//   node relay.mjs --list                 welke poorten zijn er
//   node relay.mjs                        zoekt de terminal zelf op
//   node relay.mjs --serial COM3 --allow 192.168.1.88

import net from "node:net"
import os from "node:os"
import { SerialPort } from "serialport"

const args = {}
const allow = []
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith("--")) continue
  const next = process.argv[i + 1]
  const value = next === undefined || next.startsWith("--") ? true : next
  if (value !== true) i++
  if (a === "--allow") allow.push(String(value))
  else args[a.slice(2)] = value
}

const TCP_PORT = Number(args["tcp-port"] ?? 7901)
const BAUD = Number(args.baud ?? 115200)

const hr = () => console.log("-".repeat(66))
const stamp = () => new Date().toLocaleTimeString("nl-NL")
const log = (msg) => console.log(`${stamp()}  ${msg}`)

/** De terminal herkennen zonder dat iemand een poortnaam hoeft op te zoeken. */
function looksLikeTerminal(p) {
  const vid = String(p.vendorId ?? "").toLowerCase()
  const text = [p.manufacturer, p.friendlyName, p.pnpId].filter(Boolean).join(" ")
  // 294a is myPOS' USB-leverancier-id; QCM2290 en N96 zijn de chip en het model
  // van de Ultra, zoals hij zich op de Pi meldde.
  return vid === "294a" || /mypos|qcm2290|n96/i.test(text)
}

async function listPorts() {
  const ports = await SerialPort.list()
  if (ports.length === 0) {
    console.log("Geen seriële poorten gevonden.")
    return ports
  }
  for (const p of ports) {
    const mark = looksLikeTerminal(p) ? " <-- lijkt de terminal" : ""
    console.log(`  ${p.path.padEnd(10)} ${p.friendlyName ?? p.manufacturer ?? ""}${mark}`)
  }
  return ports
}

async function pickPort() {
  if (typeof args.serial === "string") return args.serial
  const ports = await SerialPort.list()
  const hit = ports.find(looksLikeTerminal)
  if (hit) return hit.path
  console.error(`
Geen myPOS-terminal gevonden op een COM-poort.

Controleer of:
  - de kabel een DATAkabel is (een brandend laadlampje bewijst niets)
  - de terminal op POSLink Manager -> Settings -> Change connection type -> USB staat
  - hij niet in slaapstand is

Welke poorten er wel zijn:`)
  await listPorts()
  process.exit(1)
}

/** De adressen waarop de Pi dit programma kan vinden. */
function ownAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address)
}

async function main() {
  if (args.list) {
    hr()
    console.log("Seriële poorten op dit apparaat")
    hr()
    await listPorts()
    return
  }

  const path = await pickPort()
  const server = net.createServer()

  // Eén verbinding tegelijk. De kabel is er maar één, en de bridge opent per
  // verzoek een verbinding — twee tegelijk zou twee gesprekken door elkaar
  // heen laten lopen op dezelfde draad.
  let busy = false

  server.on("connection", (socket) => {
    const from = socket.remoteAddress?.replace(/^::ffff:/, "") ?? "?"

    if (allow.length > 0 && !allow.includes(from)) {
      log(`geweigerd: ${from} staat niet in --allow`)
      socket.destroy()
      return
    }
    if (busy) {
      log(`geweigerd: ${from} — er loopt al een gesprek over de kabel`)
      socket.destroy()
      return
    }

    busy = true
    log(`verbonden: ${from}`)

    const port = new SerialPort({ path, baudRate: BAUD, autoOpen: false })
    let bytesUp = 0
    let bytesDown = 0

    const cleanup = () => {
      if (!busy) return
      busy = false
      socket.destroy()
      if (port.isOpen) port.close(() => {})
      log(`losgelaten: ${from} — ${bytesUp} bytes heen, ${bytesDown} terug`)
    }

    port.open((err) => {
      if (err) {
        log(`kan ${path} niet openen: ${err.message}`)
        cleanup()
        return
      }
      socket.on("data", (chunk) => {
        bytesUp += chunk.length
        port.write(chunk)
      })
      port.on("data", (chunk) => {
        bytesDown += chunk.length
        socket.write(chunk)
      })
    })

    port.on("error", (err) => {
      log(`kabelfout: ${err.message}`)
      cleanup()
    })
    // De terminal losgetrokken tijdens een betaling. De bridge ziet de
    // verbinding wegvallen en meldt "onbekend" in plaats van te gokken.
    port.on("close", cleanup)
    socket.on("error", () => cleanup())
    socket.on("close", cleanup)
  })

  server.listen(TCP_PORT, "0.0.0.0", () => {
    hr()
    console.log(`Terminal op ${path} @ ${BAUD}`)
    console.log(`Luistert op poort ${TCP_PORT}`)
    if (allow.length > 0) console.log(`Alleen voor: ${allow.join(", ")}`)
    hr()
    console.log("Zet dit in pos.env op de Pi:\n")
    for (const addr of ownAddresses()) {
      console.log(`  MYPOS_TERMINAL_HOST=${addr}`)
    }
    console.log(`  MYPOS_TERMINAL_PORT=${TCP_PORT}`)
    console.log(`  MYPOS_TRANSPORT=lan`)
    hr()
    console.log("Laat dit venster open staan zolang je kassa draait.")
  })

  server.on("error", (err) => {
    console.error(`\nKan niet luisteren op poort ${TCP_PORT}: ${err.message}`)
    if (err.code === "EADDRINUSE") {
      console.error("Draait dit programma al in een ander venster?")
    }
    process.exit(1)
  })
}

main().catch((err) => {
  console.error("\nFout:", err.message)
  process.exit(1)
})
