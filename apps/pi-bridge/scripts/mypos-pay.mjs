#!/usr/bin/env node
// Losse betaaltest tegen de myPOS ePOS API — zonder kassa, zonder Pi.
//
// myPOS duwt het bedrag naar de terminal; die autoriseert de kaart via zijn
// eigen simkaart. Deze machine heeft alleen internet nodig voor de API-aanroep.
//
// Draaien vanuit apps/pi-bridge, zodat de SDK oplost:
//
//   node scripts/mypos-pay.mjs --terminals
//   node scripts/mypos-pay.mjs --pay 0.01
//
// Sleutels komen uit een .env-bestand (zie .env.example):
//   MYPOS_GATEWAY_URL, MYPOS_PARTNER_ID, MYPOS_APPLICATION_ID,
//   MYPOS_INTEGRATION_CLIENT_ID, MYPOS_INTEGRATION_CLIENT_SECRET,
//   MYPOS_MERCHANT_CLIENT_ID, MYPOS_MERCHANT_CLIENT_SECRET, MYPOS_TID
//
// Gezocht wordt apps/pi-bridge/.env en daarna de .env in de repo-root; met
// --env <pad> wijs je er zelf een aan. Staat een variabele al in de omgeving,
// dan wint die — zo blijft een eenmalige override vanaf de shell mogelijk.

import { MyPOSGateway } from "mypos-api-gateway"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith("--")) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true
  else { args[a.slice(2)] = next; i++ }
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDir, "..")
const repoRoot = path.resolve(packageRoot, "..", "..")

/**
 * Minimale .env-lezer — geen dependency, want die heeft dit pakket verder ook
 * niet. Alleen `KEY=waarde`; aanhalingstekens eromheen gaan eraf.
 *
 * Hij klaagt hardop over twee dingen, omdat een .env die met de hand is
 * geplakt daar in de praktijk op stukgaat en het gevolg anders pas als een
 * onbegrijpelijke HTTP-fout terugkomt:
 *
 *  - een regel zonder `=` na een toewijzing: de waarde is over meerdere regels
 *    afgebroken, en dan laadt alleen het eerste stuk. Een half secret ziet er
 *    in de foutmelding uit als een geweigerde sleutel.
 *  - een tweede `KEY=` middenin een waarde: hier zijn twee regels aan elkaar
 *    geplakt, dus de ene variabele is te lang en de andere bestaat niet.
 */
function readEnvFile(file) {
  const values = {}
  const problems = []
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/)
  let lastWasAssignment = false

  lines.forEach((line, index) => {
    const lineNo = index + 1
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) {
      lastWasAssignment = false
      return
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (!match) {
      if (lastWasAssignment) {
        problems.push(`regel ${lineNo}: hoort bij de waarde erboven maar staat op een eigen regel`)
      } else {
        problems.push(`regel ${lineNo}: geen KEY=waarde en geen comment`)
      }
      return
    }

    lastWasAssignment = true
    const key = match[1]
    let value = match[2].trim()
    const quoted = /^(["'])(.*)\1$/.exec(value)
    if (quoted) value = quoted[2]

    // Alleen HOOFDLETTER-namen, anders slaat hij aan op de waarde zelf en
    // echoot hij een stuk van een secret mee in de waarschuwing.
    const glued = /[A-Z][A-Z0-9_]{2,}=/.exec(value)
    if (glued) {
      problems.push(
        `regel ${lineNo}: de waarde van ${key} bevat "${glued[0]}" — hier zijn twee regels aan elkaar geplakt`,
      )
    }

    values[key] = value
  })

  return { values, problems }
}

const envPath = (() => {
  if (typeof args.env === "string") return path.resolve(args.env)
  for (const candidate of [path.join(packageRoot, ".env"), path.join(repoRoot, ".env")]) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
})()

if (envPath && fs.existsSync(envPath)) {
  const { values, problems } = readEnvFile(envPath)
  console.log(`Sleutels uit ${path.relative(process.cwd(), envPath) || envPath}`)
  for (const p of problems) console.warn(`  LET OP  ${p}`)
  // De omgeving wint, zodat een override vanaf de shell blijft werken.
  for (const [k, v] of Object.entries(values)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
} else if (typeof args.env === "string") {
  console.error(`\nGeen .env gevonden op ${path.resolve(args.env)}\n`)
  process.exit(1)
} else {
  console.warn(
    `\nGeen .env gevonden in ${packageRoot} of ${repoRoot} — ` +
      `ik val terug op wat er in de omgeving staat.\n`,
  )
}

const need = [
  "MYPOS_PARTNER_ID",
  "MYPOS_APPLICATION_ID",
  "MYPOS_INTEGRATION_CLIENT_ID",
  "MYPOS_INTEGRATION_CLIENT_SECRET",
  "MYPOS_MERCHANT_CLIENT_ID",
  "MYPOS_MERCHANT_CLIENT_SECRET",
]
const missing = need.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`
Ontbrekende sleutels${envPath ? ` in ${envPath}` : ""}:
${missing.map((m) => `  ${m}`).join("\n")}

Staat de regel er wel in, kijk dan of hij niet is afgebroken of vastgeplakt
aan de regel erboven — daar waarschuw ik hierboven over.

Op partners.mypos.com bij je Smart POS-integratie:
  Summary  -> Partner ID (mps-p-...) en Application ID (mps-app-...)
           -> Generate API Credentials  -> client_... en secret_...
  Merchants -> merchant koppelen        -> cli_... en sec_...
`)
  process.exit(1)
}

const gatewayUrl = process.env.MYPOS_GATEWAY_URL || "https://api-gateway.mypos.com"

const gateway = new MyPOSGateway({
  gatewayUrl,
  integration: {
    clientId: process.env.MYPOS_INTEGRATION_CLIENT_ID,
    clientSecret: process.env.MYPOS_INTEGRATION_CLIENT_SECRET,
  },
  partnerId: process.env.MYPOS_PARTNER_ID,
  applicationId: process.env.MYPOS_APPLICATION_ID,
})

// De merchant-credentials komen uit het Partner Portal (tab Merchants) en zijn
// te herkennen aan hun prefix. Het klantnummer/klantgeheim van
// merchant.mypos.com -> Integraties -> REST API is een ander paar en werkt hier
// niet — dat levert "Session creation failed (HTTP 400)" op.
if (!process.env.MYPOS_MERCHANT_CLIENT_ID.startsWith("cli_")) {
  console.warn(
    `Let op: MYPOS_MERCHANT_CLIENT_ID begint niet met "cli_".\n` +
      `Deze API wil de merchant-credentials uit het Partner Portal (tab Merchants),\n` +
      `niet het klantnummer van merchant.mypos.com.\n`,
  )
}

const client = gateway.createClient({
  clientId: process.env.MYPOS_MERCHANT_CLIENT_ID,
  clientSecret: process.env.MYPOS_MERCHANT_CLIENT_SECRET,
})

const hr = () => console.log("-".repeat(66))

/** De SDK gooit niet bij API-fouten maar geeft {success:false,...} terug. */
function fail(label, result) {
  console.error(`\n${label} mislukt — HTTP ${result.status}: ${result.statusMessage}`)
  if (result.errorDetails) console.error(JSON.stringify(result.errorDetails, null, 2))
  process.exit(2)
}

async function listTerminals() {
  const result = await client.epos.terminals.list({ page: 1, size: 50 })
  if (!result.success) fail("Terminals ophalen", result)

  const items = result.items ?? result.data ?? result.terminals ?? []
  if (!items.length) {
    console.log("Geen terminals gevonden op deze integratie.")
    console.log("Is de merchant gekoppeld en de terminal aan de integratie toegewezen?")
    return
  }
  for (const t of items) {
    hr()
    for (const [k, v] of Object.entries(t)) {
      if (v === null || typeof v === "object") continue
      console.log(`  ${k.padEnd(22)} ${v}`)
    }
  }
  hr()
}

/** Alles wat myPOS over deze terminal weet — status, outlet, activatie. */
async function terminalDetails(tid) {
  const result = await client.epos.terminals.get(tid)
  if (!result.success) fail(`Terminal ${tid} ophalen`, result)
  hr()
  console.log(JSON.stringify(result, null, 2))
  hr()
}

/**
 * Doet de authenticatie zelf: OAuth met de integration-credentials, daarna een
 * sessie met de merchant-credentials. Nodig omdat de SDK zijn tokens niet
 * blootstelt en activate() geen body meestuurt.
 */
async function authHeaders() {
  const tokenRes = await fetch(`${gatewayUrl}/api/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MYPOS_INTEGRATION_CLIENT_ID,
      client_secret: process.env.MYPOS_INTEGRATION_CLIENT_SECRET,
      grant_type: "client_credentials",
    }).toString(),
  })
  if (!tokenRes.ok) throw new Error(`OAuth ${tokenRes.status}: ${await tokenRes.text()}`)
  const { access_token } = await tokenRes.json()

  const sessionRes = await fetch(`${gatewayUrl}/api/v1/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
    body: JSON.stringify({
      client_id: process.env.MYPOS_MERCHANT_CLIENT_ID,
      client_secret: process.env.MYPOS_MERCHANT_CLIENT_SECRET,
    }),
  })
  if (!sessionRes.ok) throw new Error(`Session ${sessionRes.status}: ${await sessionRes.text()}`)
  const { session } = await sessionRes.json()

  return {
    Authorization: `Bearer ${access_token}`,
    "X-Session": session,
    "X-Partner-Id": process.env.MYPOS_PARTNER_ID,
    "X-Application-Id": process.env.MYPOS_APPLICATION_ID,
    "Content-Type": "application/json",
  }
}

/**
 * DOODLOPEND SPOOR — bewaard zodat niemand het opnieuw probeert.
 *
 * `/pos/v1/terminals/activation` is provisioning, geen koppeling. Empirisch
 * vastgesteld op 2026-07-31: met een lege body antwoordt de API HTTP 500,
 * "Cannot write a null value for property 'product_code'". Aanvullen van die
 * velden maakt vermoedelijk een nieuwe terminal aan — niet doen.
 *
 * De docstring in mypos-api-gateway@0.1.2 ("Generate an activation code for a
 * terminal — returns an activation code to be entered on the terminal") klopt
 * niet met het gedrag van dit endpoint. Bovendien zit alles rond `terminals`
 * onder `/pos/v1/`, terwijl de hele ePOS-API uit drie paden bestaat:
 * `/epos/v1/payments`, `/epos/v1/payments/{id}` en `/epos/v1/payments/refund`.
 * Er bestaat dus geen koppel-endpoint, en de HTTP 403 op een betaling is niet
 * met een API-aanroep te verhelpen — dat zit in de terminalconfiguratie
 * (POSLink Manager, Pair Type = EPOS) of in een recht op de integratie.
 *
 * De body is bewust een leeg object: de SDK stuurt helemaal geen body en zet
 * daardoor geen Content-Type, wat HTTP 415 oplevert.
 */
async function activate() {
  console.log("Authenticeren…")
  const headers = await authHeaders()
  const url = `${gatewayUrl}/pos/v1/terminals/activation`

  const res = await fetch(url, { method: "POST", headers, body: "{}" })
  const text = await res.text()
  console.log(`POST /pos/v1/terminals/activation -> HTTP ${res.status}`)

  if (res.ok) {
    const code = (() => {
      try {
        const json = JSON.parse(text)
        return json.code ?? json.data?.code ?? null
      } catch {
        return null
      }
    })()

    hr()
    if (code) {
      console.log(`Activatiecode: ${code}`)
      console.log(`
Tik deze code in op de terminal om hem aan deze integratie te koppelen.
Draai daarna --pay 0.01 om te zien of de 403 weg is.`)
    } else {
      console.log("Gelukt, maar geen 'code' in de respons:")
      console.log(text || "(lege body)")
    }
    hr()
    return
  }

  hr()
  console.log(text.slice(0, 600) || "(lege body)")
  hr()

  if (res.status === 401 || res.status === 403) {
    console.log("Geweigerd op rechten — dezelfde blokkade als bij de betaling.")
  } else if (/property|required/i.test(text)) {
    console.log(`
De API vraagt om velden. Vul die NIET blind aan: velden als product_code,
currency en account_number horen bij het aanmaken van een terminal, niet bij
het koppelen ervan. Leg dit antwoord voor aan myPOS.`)
  }
}

async function pay(amountEuro) {
  const tid = process.env.MYPOS_TID || args.tid
  if (!tid) {
    console.error("Geen terminal opgegeven. Zet MYPOS_TID of gebruik --tid <TID>.")
    process.exit(1)
  }

  const cents = Math.round(Number(amountEuro) * 100)
  if (!Number.isFinite(cents) || cents <= 0) {
    console.error(`Ongeldig bedrag: ${amountEuro}`)
    process.exit(1)
  }

  const reference = args.reference || `TEST-${crypto.randomUUID().slice(0, 8)}`

  console.log(`Betaling van ${(cents / 100).toFixed(2)} EUR naar terminal ${tid}`)
  console.log(`Referentie: ${reference}`)
  console.log("De terminal hoort nu wakker te worden en het bedrag te tonen.\n")

  const created = await client.epos.payments.create({
    referenceNumber: reference,
    // Bedragen zijn in centen: 2500 = 25,00 EUR.
    amount: { value: cents, currencyCode: "EUR", tip: 0 },
    description: "Testbetaling Hop & Bites",
    terminalId: tid,
    appName: "HopBitesPOS",
    appVersion: "1.0.0",
    operatorCode: process.env.MYPOS_OPERATOR_CODE || "1",
  })
  if (!created.success) fail("Betaling aanmaken", created)

  console.log(`Aangemaakt: paymentId=${created.paymentId} status=${created.status}`)
  hr()

  // Pollen tot de klant getikt heeft of het afloopt.
  const deadline = Date.now() + 180_000
  let last = created.status
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    const detail = await client.epos.payments.get(created.paymentId)
    if (!detail.success) {
      // Een mislukte poll is geen mislukte betaling; gewoon opnieuw proberen.
      process.stdout.write("?")
      continue
    }
    if (detail.status !== last) {
      last = detail.status
      console.log(`\nstatus -> ${detail.status}`)
      if (detail.statusMessage) console.log(`  ${detail.statusMessage}`)
    } else {
      process.stdout.write(".")
    }

    const s = String(detail.status).toLowerCase()
    if (["approved", "captured", "completed", "paid", "success", "successful"].includes(s)) {
      hr()
      console.log("GOEDGEKEURD")
      console.log(`  authCode ${detail.authCode ?? "-"}   rrn ${detail.rrn ?? "-"}`)
      console.log(`  pan      ${detail.pan ?? "-"}`)
      return
    }
    if (["declined", "failed", "canceled", "cancelled", "expired", "rejected", "error"].includes(s)) {
      hr()
      console.log(`AFGEWEZEN (${detail.status}) ${detail.statusMessage ?? ""}`)
      return
    }
  }
  hr()
  console.log("Time-out: geen eindstatus binnen 3 minuten.")
}

const main = async () => {
  hr()
  console.log(`myPOS ePOS — ${gatewayUrl}`)
  hr()

  if (args.terminals) return listTerminals()
  if (args.terminal) return terminalDetails(args.terminal)
  if (args.activate) return activate()
  if (args.pay) return pay(args.pay)

  console.log(`
Gebruik:
  node scripts/mypos-pay.mjs --terminals            Terminals van deze integratie
  node scripts/mypos-pay.mjs --terminal <TID>       Details en status van een terminal
  node scripts/mypos-pay.mjs --activate             Activatiecode ophalen (tik je op de terminal in)
  node scripts/mypos-pay.mjs --pay 0.01 --tid <TID> Betaling van 1 cent

  --env <pad>   Ander .env-bestand dan apps/pi-bridge/.env of de repo-root
`)
}

main().catch((e) => {
  console.error("\nFout:", e.message)
  if (e.name === "GatewayAuthError") {
    if (/session/i.test(e.message)) {
      console.error(`
De OAuth-stap lukte, dus je integration-credentials kloppen. Het gaat mis bij de
sessie, en dat wijst op de merchant-credentials.

Haal die op in het Partner Portal bij je integratie, tab Merchants: koppel je
eigen account, keur het goed, en gebruik het cli_/sec_-paar dat je daar krijgt.
Het klantnummer van merchant.mypos.com hoort bij een andere API.`)
    } else {
      console.error("Authenticatie mislukt — controleer de integration-credentials.")
    }
  }
  process.exit(1)
})
