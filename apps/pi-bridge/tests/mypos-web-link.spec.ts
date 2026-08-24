import Database from "better-sqlite3"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { encodeFrame, parseFields, takeFrames } from "../src/services/mypos-ipp.js"

// De kabel hangt aan het kassascherm en de browser daar geeft de bytes door.
// Deze test speelt die browser na: hij haalt commando's op zoals de pagina dat
// doet en antwoordt met de frames die een echte Ultra stuurt. Zo staat de hele
// route vast zonder terminal op tafel.

const cfg = {
  MYPOS_TRANSPORT: "browser",
  MYPOS_TERMINAL_BAUD: 115200,
  MYPOS_TERMINAL_LANG: "NL",
  MYPOS_TERMINAL_IDLE_SCREEN: false,
  MYPOS_OPERATOR_CODE: "1",
  MYPOS_MIN_AMOUNT_CENTS: 100,
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
const link = await import("../src/services/mypos-web-link.js")

const KEY = "01M0E0TMAWX1Q2FD5AR4WMPV72"
const args = {
  idempotency_key: KEY,
  amount_cents: 950,
  order_id: "c022931e-e788-46b3-8f0c-bda50f0e09a6",
  venue_id: cfg.VENUE_ID,
  actor_terminal_id: "00000000-0000-0000-0000-000000000000",
}

/**
 * Het kassascherm, nagespeeld: commando's ophalen, "naar de kabel schrijven",
 * en terugsturen wat de terminal zou antwoorden.
 */
function fakeKassascherm() {
  const linkId = link.attachBrowser()
  const seen: string[] = []
  let stop = false

  const reply = (session: string, fields: Array<[string, string]>) =>
    link.pushFromBrowser(session, encodeFrame([["PROTOCOL", "IPP"], ...fields]))

  const loop = (async () => {
    while (!stop) {
      const cmd = await link.nextCommand(linkId, 50)
      if (!cmd || cmd.op !== "write") continue

      const frames = takeFrames(Buffer.from(cmd.data, "base64")).frames
      for (const sent of frames) {
        const method = sent.METHOD ?? "?"
        seen.push(method)

        if (method === "PURCHASE") {
          reply(cmd.session, [["METHOD", "PURCHASE"], ["STAGE", "1"], ["STATUS", "0"], ["TIMEOUT", "60"]])
          reply(cmd.session, [
            ["METHOD", "PURCHASE"],
            ["STAGE", "5"],
            ["STATUS", "0"],
            ["TX_STATUS", "0"],
            ["APPROVAL", "00"],
            ["AUTH_CODE", "P00291"],
            ["RRN", "623120552024"],
          ])
          continue
        }
        // PING, GET_STATUS en COMPLETE_TX zijn in één klap klaar.
        reply(cmd.session, [["METHOD", method], ["STAGE", "5"], ["STATUS", "0"]])
      }
    }
  })()

  return {
    linkId,
    seen,
    async close() {
      stop = true
      await loop
    },
  }
}

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
  link._resetWebLink()
})

describe("pinnen via het kassascherm", () => {
  it("laat de browser de kabel doen en boekt de betaling", async () => {
    const scherm = fakeKassascherm()
    try {
      const started = await startLanTransaction(args)
      expect(started.status).toBe("pending")

      const row = await settled()
      expect(row.status).toBe("approved")
      expect(row.transaction_id).toBe("623120552024")

      // Handshake, betaling, en daarna dicht bij de terminal — zonder dat
      // laatste weigert hij de volgende met STATUS=20.
      expect(scherm.seen).toContain("PING")
      expect(scherm.seen).toContain("PURCHASE")
      expect(scherm.seen).toContain("COMPLETE_TX")
      expect(queued.filter((q) => q.table_name === "pos_payments")).toHaveLength(1)
    } finally {
      await scherm.close()
    }
  })

  it("zegt dat de terminal niet gekoppeld is in plaats van te blijven wachten", async () => {
    // Geen kassascherm dat de kabel vasthoudt. De klant hoort dat meteen te
    // horen, niet na een minuut staren naar een leeg terminalscherm.
    const res = await startLanTransaction(args)

    expect(res.status).toBe("failed")
    expect(res.message).toContain("niet gekoppeld")
  })
})

describe("de koppeling zelf", () => {
  it("geeft de kabel aan de nieuwste pagina, zodat herladen niet blokkeert", () => {
    const first = link.attachBrowser()
    const second = link.attachBrowser()

    expect(first).not.toBe(second)
    expect(link.linkStatus().attached).toBe(true)

    // De oude pagina laat los; dat mag de nieuwe niet meeslepen.
    link.detachBrowser(first)
    expect(link.linkStatus().attached).toBe(true)

    link.detachBrowser(second)
    expect(link.linkStatus().attached).toBe(false)
  })
})
