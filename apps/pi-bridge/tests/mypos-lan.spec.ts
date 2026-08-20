import net from "node:net"
import Database from "better-sqlite3"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { encodeFrame, takeFrames } from "../src/services/mypos-ipp.js"

// De terminal weigerde elke betaling met STATUS=20 — "vorige transactie niet
// afgerond" — en de kassa bleef dat herhalen tot iemand het toestel herstartte.
// Oorzaak: een betaling die niet op STAGE=5 eindigde (een annulering op het
// pinpad) werd nooit bij de terminal afgesloten. Deze test houdt zowel het
// afsluiten als het zelf losmaken vast.

const cfg = {
  MYPOS_TRANSPORT: "lan",
  MYPOS_TERMINAL_HOST: "127.0.0.1",
  MYPOS_TERMINAL_PORT: 0,
  MYPOS_TERMINAL_LANG: "NL",
  MYPOS_TERMINAL_IDLE_SCREEN: false,
  MYPOS_OPERATOR_CODE: "1",
  ORG_ID: "3f1d6f4a-6e2c-4a4a-9a1e-2b7b6b7d1a11",
  VENUE_ID: "29dea874-1274-4a0d-98f2-99899851bb4e",
}
vi.mock("../src/config.js", () => ({ config: cfg, myposEnabled: true }))

const piDb = new Database(":memory:")
piDb.exec(`
  CREATE TABLE mypos_intents (
    idempotency_key TEXT PRIMARY KEY,
    transaction_id TEXT,
    status TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    order_id TEXT NOT NULL,
    venue_id TEXT NOT NULL,
    actor_terminal_id TEXT,
    captured_at INTEGER,
    status_code TEXT,
    last_error TEXT,
    receipt_json TEXT,
    terminal_sid TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

const queued: Array<{ table_name: string }> = []
vi.mock("../src/db/outbox.js", () => ({
  piDb,
  enqueueOutbox: vi.fn((row: { table_name: string }) => {
    queued.push(row)
    return { enqueued: true }
  }),
}))

vi.mock("../src/services/audit-log.js", () => ({ writeAuditEvent: vi.fn(async () => {}) }))

const { startLanTransaction } = await import("../src/services/mypos-lan.js")
const { findIntent } = await import("../src/services/mypos-intents.js")

const KEY = "01M0E0TMAWX1Q2FD5AR4WMPV72"
const args = {
  idempotency_key: KEY,
  amount_cents: 950,
  order_id: "c022931e-e788-46b3-8f0c-bda50f0e09a6",
  venue_id: cfg.VENUE_ID,
  actor_terminal_id: "00000000-0000-0000-0000-000000000000",
}

/** Wat de nagespeelde terminal binnenkreeg, in volgorde. */
interface Seen {
  method: string
  sid: string
  sidOriginal?: string
}

/**
 * Een terminal die zich gedraagt als de Ultra aan de balie: de eerste betaling
 * weigert hij omdat er nog iets van hem openstaat, en pas nadat die met
 * COMPLETE_TX is afgesloten neemt hij een nieuwe aan.
 */
function fakeTerminal(opts: { refuseFirstPurchase: boolean }) {
  const seen: Seen[] = []
  let purchases = 0

  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0)
    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const taken = takeFrames(buf)
      buf = taken.rest
      for (const f of taken.frames) {
        seen.push({ method: f.METHOD, sid: f.SID, sidOriginal: f.SID_ORIGINAL })

        const reply = (fields: Array<[string, string]>) =>
          socket.write(encodeFrame([["PROTOCOL", "IPP"], ["METHOD", f.METHOD], ...fields]))

        if (f.METHOD === "PURCHASE") {
          purchases++
          if (opts.refuseFirstPurchase && purchases === 1) {
            reply([["STAGE", "1"], ["STATUS", "20"]])
            return
          }
          reply([["STAGE", "1"], ["STATUS", "0"], ["TIMEOUT", "60"]])
          reply([
            ["STAGE", "5"],
            ["STATUS", "0"],
            ["TX_STATUS", "0"],
            ["AUTH_CODE", "P00291"],
            ["RRN", "623120552024"],
            ["PAN_MASKED", "**** 3839"],
          ])
          return
        }
        // PING en COMPLETE_TX zijn in één klap klaar.
        reply([["STAGE", "5"], ["STATUS", "0"]])
      }
    })
  })

  return {
    seen,
    async listen() {
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
      cfg.MYPOS_TERMINAL_PORT = (server.address() as net.AddressInfo).port
    },
    close: () => server.close(),
  }
}

/** Wachten tot de achtergrondsessie de intent-rij heeft weggeschreven. */
async function settled(timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const row = findIntent(KEY)
    if (row && row.status !== "pending") return row
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`intent bleef pending: ${JSON.stringify(findIntent(KEY))}`)
}

beforeEach(() => {
  piDb.exec("DELETE FROM mypos_intents")
  queued.length = 0
})

describe("pinnen over de LAN", () => {
  it("sluit de transactie af bij de terminal en boekt de betaling", async () => {
    const term = fakeTerminal({ refuseFirstPurchase: false })
    await term.listen()
    try {
      const started = await startLanTransaction(args)
      expect(started.status).toBe("pending")

      const row = await settled()
      expect(row.status).toBe("approved")
      expect(row.transaction_id).toBe("623120552024")

      const purchase = term.seen.find((s) => s.method === "PURCHASE")!
      const complete = term.seen.find((s) => s.method === "COMPLETE_TX")
      // Zonder deze bevestiging blijft de transactie bij de terminal open
      // staan en weigert hij de volgende met STATUS=20.
      expect(complete?.sidOriginal).toBe(purchase.sid)
      expect(queued.filter((q) => q.table_name === "pos_payments")).toHaveLength(1)
    } finally {
      term.close()
    }
  })

  it("maakt een blijven hangende transactie zelf los en zet het bedrag opnieuw klaar", async () => {
    // Eerst een betaling die wél door mag, zodat er een sessie-id bekend is om
    // mee af te sluiten — precies wat de bridge in de praktijk heeft.
    const warmup = fakeTerminal({ refuseFirstPurchase: false })
    await warmup.listen()
    await startLanTransaction(args)
    await settled()
    warmup.close()

    piDb.prepare("UPDATE mypos_intents SET idempotency_key = ? WHERE idempotency_key = ?")
      .run("01M0E0TMAWX1Q2FD5AR4WMPV73", KEY)

    const term = fakeTerminal({ refuseFirstPurchase: true })
    await term.listen()
    try {
      await startLanTransaction(args)
      const row = await settled()

      // De klant merkt er niets van: de betaling gaat gewoon door.
      expect(row.status).toBe("approved")
      expect(term.seen.filter((s) => s.method === "PURCHASE")).toHaveLength(2)
      expect(term.seen.some((s) => s.method === "COMPLETE_TX")).toBe(true)
    } finally {
      term.close()
    }
  })
})
