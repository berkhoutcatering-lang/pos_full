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
// Sleutels via de omgeving (zie .env.example):
//   MYPOS_GATEWAY_URL, MYPOS_PARTNER_ID, MYPOS_APPLICATION_ID,
//   MYPOS_INTEGRATION_CLIENT_ID, MYPOS_INTEGRATION_CLIENT_SECRET,
//   MYPOS_MERCHANT_CLIENT_ID, MYPOS_MERCHANT_CLIENT_SECRET, MYPOS_TID

import { MyPOSGateway } from "mypos-api-gateway"
import crypto from "node:crypto"

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith("--")) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true
  else { args[a.slice(2)] = next; i++ }
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
Ontbrekende omgevingsvariabelen:
${missing.map((m) => `  ${m}`).join("\n")}

Op partners.mypos.com bij je Smart POS-integratie:
  Summary  -> Partner ID (mps-p-...) en Application ID (mps-app-...)
           -> Generate API Credentials  -> client_... en secret_...
  Merchants -> merchant koppelen        -> cli_... en sec_...

Zet ze in je shell (PowerShell):
  $env:MYPOS_PARTNER_ID = 'mps-p-...'
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
 * Koppelt de terminal aan deze integratie met de code die de terminal toont.
 *
 * De SDK's terminals.activate() stuurt geen body en krijgt daardoor HTTP 415.
 * De veldnaam is niet gedocumenteerd, dus we proberen de gangbare varianten —
 * de code is maar een minuut geldig, dus dat moet binnen één run.
 */
async function activate(code) {
  if (!code || code === true) {
    console.error("Geef de code mee die de terminal toont: --activate 12345678")
    process.exit(1)
  }

  console.log("Authenticeren…")
  const headers = await authHeaders()
  const url = `${gatewayUrl}/pos/v1/terminals/activation`

  // De API klaagt per keer over één ontbrekend veld. Die naam lezen we uit en
  // vullen we aan, zodat we binnen de geldigheid van één code door alle
  // verplichte velden heen lopen in plaats van per veld een nieuwe code te
  // moeten ophalen.
  const tid = process.env.MYPOS_TID || args.tid
  const body = { product_code: String(code) }

  /** Beste gok per veldnaam; onbekende velden krijgen de code zelf. */
  const guess = (name) => {
    const n = name.toLowerCase()
    if (n.includes("terminal")) return tid ?? String(code)
    if (n.includes("currency")) return "EUR"
    if (n.includes("amount")) return 0
    if (n.includes("app_name") || n === "appname") return "HopBitesPOS"
    if (n.includes("app_version") || n === "appversion") return "1.0.0"
    return String(code)
  }

  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) })
    const text = await res.text()
    console.log(`  ${attempt}. ${Object.keys(body).join(", ")} -> HTTP ${res.status}`)

    if (res.ok) {
      hr()
      console.log("GEACTIVEERD")
      console.log(text || "(lege body)")
      return
    }

    if (res.status === 401 || res.status === 403) {
      console.log(`     ${text.slice(0, 300)}`)
      hr()
      console.log("Geweigerd op rechten, niet op vorm — dit is dezelfde blokkade als bij de betaling.")
      return
    }

    // "Cannot write a null value for property 'product_code'."
    const m = text.match(/property '([^']+)'/i) || text.match(/"([a-z_]+)" is required/i)
    if (!m) {
      console.log(`     ${text.slice(0, 400)}`)
      break
    }
    const field = m[1]
    if (field in body) {
      console.log(`     API blijft klagen over '${field}' — waarde is vermoedelijk verkeerd.`)
      console.log(`     ${text.slice(0, 300)}`)
      break
    }
    body[field] = guess(field)
    console.log(`     ontbrak: ${field} -> ${JSON.stringify(body[field])}`)
  }

  hr()
  console.log(`
Niet gelukt. Is de code verlopen (hij geldt maar een minuut), haal dan een
verse op de terminal en draai opnieuw — het script onthoudt niets tussen runs.
`)
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
  if (args.activate) return activate(args.activate)
  if (args.pay) return pay(args.pay)

  console.log(`
Gebruik:
  node scripts/mypos-pay.mjs --terminals            Terminals van deze integratie
  node scripts/mypos-pay.mjs --terminal <TID>       Details en status van een terminal
  node scripts/mypos-pay.mjs --activate             Terminal aan de integratie koppelen
  node scripts/mypos-pay.mjs --pay 0.01 --tid <TID> Betaling van 1 cent
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
