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
//   node mypos-ipp.mjs --host 192.168.1.135 --display "Hop en Bites|Welkom"
//   node mypos-ipp.mjs --host 192.168.1.135 --hide
//
// De demo-app houdt poort 7900 bezet zolang hij verbonden is: sluit hem eerst,
// anders krijg je hier een weigering of stilte.

import net from "node:net"
import crypto from "node:crypto"

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith("--")) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true
  else { args[a.slice(2)] = next; i++ }
}

const HOST = args.host ?? "192.168.1.135"
const PORT = Number(args.port ?? 7900)
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
  : args.display
    ? "DISPLAY_TEXT"
    : args.hide
      ? "HIDE_TEXT"
      : String(args.method ?? "GET_STATUS")

const fields = [
  ["PROTOCOL", "IPP"],
  ["VERSION", VERSION],
  ["METHOD", method],
  ["SID", sid],
]
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

hr()
console.log(`myPOS IPP — ${HOST}:${PORT}   SID ${sid}`)
hr()
console.log("VERSTUURD (" + out.length + " bytes, prefix " + out.readUInt16BE(0) + "):")
for (const [k, v] of fields) console.log(`  ${k}=${v}`)
if (args.pay) console.log("\n  LET OP: dit zet een echte betaling klaar op de terminal.")
hr()

const sock = net.createConnection({ host: HOST, port: PORT })
sock.setTimeout(WAIT_MS)

let buf = Buffer.alloc(0)
let frames = 0

sock.on("connect", () => {
  console.log("verbonden — frame verstuurd, wachten op antwoord…\n")
  sock.write(out)
})

sock.on("data", (chunk) => {
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

sock.on("timeout", () => {
  console.log(`(stil gebleven — ${WAIT_MS / 1000}s zonder nieuw frame)`)
  sock.destroy()
})
sock.on("error", (e) => console.error("socketfout:", e.message))
sock.on("close", () => {
  hr()
  console.log(frames === 0 ? "Geen enkel frame terug." : `Klaar — ${frames} frame(s) ontvangen.`)
})
