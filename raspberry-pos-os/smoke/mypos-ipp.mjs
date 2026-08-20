#!/usr/bin/env node
// IPP-client voor de myPOS Ultra over LAN — de basis voor de pi-bridge.
//
// Framing komt uit myPOS' eigen myPOSTerminal.dll: een 2-byte big-endian
// lengteprefix (inclusief die twee bytes zelf), daarna `NAAM=WAARDE\r\n`-regels
// in ASCII. De veldnamen in dit bestand zijn letterlijk de constanten uit die
// DLL, niet geraden.
//
// Standaard stuurt hij GET_STATUS: dat leest alleen en zet geen betaling in
// gang. PURCHASE gebeurt uitsluitend met --pay <bedrag>, en dan wordt de
// terminal wakker en toont hij het bedrag.
//
// Gebruik:
//   node mypos-ipp.mjs --host 192.168.1.135
//   node mypos-ipp.mjs --host 192.168.1.135 --version 200
//   node mypos-ipp.mjs --host 192.168.1.135 --method PING
//   node mypos-ipp.mjs --host 192.168.1.135 --pay 0.01
//   node mypos-ipp.mjs --host 192.168.1.135 --complete <sid>
//   node mypos-ipp.mjs --serial /dev/ttyACM0 --method GET_STATUS
//   node mypos-ipp.mjs --host 192.168.1.135 --display "Hop en Bites|Welkom"
//
// --serial praat over USB in plaats van over het netwerk. Zet de terminal dan
// op POSLink Manager -> Settings -> Change connection type -> USB. Reden om
// dit te willen: hangt de terminal aan WiFi zonder internet, dan stuurt Android
// het bankverkeer daarheen in plaats van over de simkaart en mislukt elke
// transactie. Met USB (of Bluetooth) staat WiFi uit en bestaat dat probleem
// niet. Draait alleen op Linux — de Pi dus, niet je laptop.
//
// Zoek de poort met: ls -l /dev/serial/by-id/
//
// --complete sluit een transactie af die bij de terminal is blijven openstaan.
// Zolang dat niet gebeurt weigert hij elke volgende betaling met STATUS=20,
// "NOT COMPLETED LAST TX". Het sessie-id is dat van de betaling die bleef
// hangen; in de bridge-logs staat het bij "ipp refused mid-flow" en bij
// "myPOS LAN session failed". Een onbekend id levert STATUS=17 op en verandert
// niets, dus proberen kost niets.
//
// --display stuurt DISPLAY_TEXT. Op een myPOS Ultra antwoordt hij daar
// STATUS=0 op en verandert er niets op het scherm: de methode staat niet in
// myPOS' methodelijst en komt uit hun SDK voor de klassieke toestellen. Blijft
// hier staan om het opnieuw te toetsen zodra myPOS erover uitsluitsel geeft.
//
// Poort 7901 is waar de Ultra luistert; de bridge gebruikt hetzelfde. De
// demo-app houdt hem bezet zolang die verbonden is: sluit hem eerst, anders
// krijg je hier een weigering of stilte.

import net from "node:net"
import fs from "node:fs"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith("--")) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true
  else { args[a.slice(2)] = next; i++ }
}

const HOST = args.host ?? "192.168.1.135"
const PORT = Number(args.port ?? 7901)
// De terminal antwoordde met CURRENT_VERSION=202 terwijl de demo-app 200
// stuurt. Daarom is 202 hier de standaard — met --version 200 vergelijk je.
const VERSION = String(args.version ?? 202)
const CURRENCY = String(args.currency ?? 978)
const WAIT_MS = Number(args.wait ?? 90_000)

function encode(fields) {
  const body = Buffer.from(
    fields.map(([k, v]) => `${k}=${v}`).join("\r\n") + "\r\n",
    "ascii",
  )
  const out = Buffer.alloc(2 + body.length)
  out.writeUInt16BE(out.length, 0) // lengte inclusief de prefix zelf
  body.copy(out, 2)
  return out
}

function parse(payload) {
  const fields = {}
  for (const line of payload.toString("ascii").split(/\r?\n/)) {
    if (!line) continue
    const eq = line.indexOf("=")
    if (eq === -1) { fields[line] = ""; continue }
    fields[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return fields
}

const sid = args.sid ?? crypto.randomUUID()
const method = args.pay
  ? "PURCHASE"
  : args.complete
    ? "COMPLETE_TX"
    : args.display
      ? "DISPLAY_TEXT"
      : String(args.method ?? "GET_STATUS")

const fields = [
  ["PROTOCOL", "IPP"],
  ["VERSION", VERSION],
  ["METHOD", method],
  ["SID", sid],
]
if (typeof args.complete === "string") {
  // De transactie die dicht moet — niet de sessie waarin we dat vragen.
  fields.push(["SID_ORIGINAL", args.complete])
}
if (typeof args.display === "string") {
  // Wat er tussen betalingen op de terminal staat. Rijen scheiden met | —
  // meer dan vijf regels passen er niet op.
  args.display
    .split("|")
    .slice(0, 5)
    .forEach((text, i) => fields.push([`DISPLAY_TEXT_ROW${i + 1}`, text.trim()]))
}
if (args.pay) {
  // Bedrag met twee decimalen, zoals de demo-app het stuurt (AMOUNT=1.00).
  fields.push(["AMOUNT", Number(args.pay).toFixed(2)])
  fields.push(["CURRENCY", CURRENCY])
  fields.push(["FIXED_PINPAD", args["fixed-pinpad"] === "0" ? "0" : "1"])
  fields.push(["LANG", String(args.lang ?? "EN")])
  if (args.reference) fields.push(["REFERENCE", String(args.reference)])
  if (args.operator) fields.push(["OPERATOR_CODE", String(args.operator)])
}

const hr = () => console.log("-".repeat(66))
const out = encode(fields)
const SERIAL = typeof args.serial === "string" ? args.serial : null
const BAUD = String(args.baud ?? 115200)

hr()
console.log(
  SERIAL
    ? `myPOS IPP — ${SERIAL} @ ${BAUD}   SID ${sid}`
    : `myPOS IPP — ${HOST}:${PORT}   SID ${sid}`,
)
hr()
console.log("VERSTUURD (" + out.length + " bytes, prefix " + out.readUInt16BE(0) + "):")
for (const [k, v] of fields) console.log(`  ${k}=${v}`)
if (args.pay) console.log("\n  LET OP: dit zet een echte betaling klaar op de terminal.")
hr()

/**
 * Eén verbinding, of dat nu een socket of een seriële poort is. Beide leveren
 * dezelfde vier dingen: schrijven, data ontvangen, stil vallen, en dichtgaan.
 */
function openLink() {
  if (!SERIAL) {
    const sock = net.createConnection({ host: HOST, port: PORT })
    sock.setTimeout(WAIT_MS)
    return {
      onOpen: (fn) => sock.on("connect", fn),
      onData: (fn) => sock.on("data", fn),
      onIdle: (fn) => sock.on("timeout", fn),
      onError: (fn) => sock.on("error", fn),
      onClose: (fn) => sock.on("close", fn),
      write: (b) => sock.write(b),
      destroy: () => sock.destroy(),
    }
  }

  // Node kent geen termios, dus de poort wordt met stty in raw-modus gezet
  // voordat we hem openen. Zonder raw kauwt de regeldiscipline op bytes die
  // toevallig op een newline of een Ctrl-teken lijken — en IPP is binair.
  execFileSync("stty", ["-F", SERIAL, "raw", "-echo", "-echoe", "-echok", BAUD])

  const fd = fs.openSync(SERIAL, "r+")
  const rs = fs.createReadStream(null, { fd, autoClose: false })
  const ws = fs.createWriteStream(null, { fd, autoClose: false })
  let idle = null
  let closed = false
  const handlers = { idle: () => {}, close: () => {} }
  const rearm = () => {
    clearTimeout(idle)
    idle = setTimeout(() => handlers.idle(), WAIT_MS)
  }
  const shut = () => {
    if (closed) return
    closed = true
    clearTimeout(idle)
    try { fs.closeSync(fd) } catch {}
    handlers.close()
  }

  return {
    onOpen: (fn) => setImmediate(fn),
    onData: (fn) => rs.on("data", (c) => { rearm(); fn(c) }),
    onIdle: (fn) => { handlers.idle = fn },
    onError: (fn) => { rs.on("error", fn); ws.on("error", fn) },
    onClose: (fn) => { handlers.close = fn },
    write: (b) => { ws.write(b); rearm() },
    destroy: shut,
  }
}

let sock
try {
  sock = openLink()
} catch (e) {
  console.error(`
Kan ${SERIAL ?? HOST} niet openen: ${e.message}`)
  if (SERIAL) {
    console.error(`
Controleer of de poort bestaat en of je erbij mag:
  ls -l /dev/serial/by-id/
  sudo usermod -aG dialout $USER    (daarna opnieuw inloggen)`)
  }
  process.exit(1)
}

let buf = Buffer.alloc(0)
let frames = 0

sock.onOpen(() => {
  console.log("verbonden — frame verstuurd, wachten op antwoord…\n")
  sock.write(out)
})

sock.onData((chunk) => {
  buf = Buffer.concat([buf, chunk])
  // Zolang er een compleet frame in de buffer zit: eruit halen en tonen.
  while (buf.length >= 2) {
    const len = buf.readUInt16BE(0)
    if (len < 2 || buf.length < len) break
    const f = parse(buf.subarray(2, len))
    buf = buf.subarray(len)
    frames++
    console.log(`ONTVANGEN frame ${frames} (${len} bytes):`)
    for (const [k, v] of Object.entries(f)) console.log(`  ${k}=${v}`)
    if (f.STATUS !== undefined) {
      console.log(`  → STATUS=${f.STATUS}${f.STATUS === "0" ? " (ok)" : ""}` +
                  (f.STAGE ? `, STAGE=${f.STAGE}` : ""))
    }
    console.log("")
  }
})

sock.onIdle(() => {
  console.log(`(stil gebleven — ${WAIT_MS / 1000}s zonder nieuw frame)`)
  sock.destroy()
})
sock.onError((e) => console.error("verbindingsfout:", e.message))
sock.onClose(() => {
  hr()
  console.log(frames === 0 ? "Geen enkel frame terug." : `Klaar — ${frames} frame(s) ontvangen.`)
})
