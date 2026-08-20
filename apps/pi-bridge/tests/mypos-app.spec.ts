import { describe, it, expect, beforeEach, vi } from "vitest"
import Database from "better-sqlite3"

// De app-route: onze eigen app op de myPOS Ultra haalt de betaling op bij de
// Pi en meldt de afloop terug. Wat hier getest wordt is niet het gelukkige
// pad — dat is één regel — maar de momenten waarop er geld in het spel is en
// het antwoord zoek raakt.

vi.mock("../src/config.js", () => ({
  config: { MYPOS_TRANSPORT: "app", MYPOS_OPERATOR_CODE: "1" },
  myposEnabled: true,
}))

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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)
vi.mock("../src/db/outbox.js", () => ({ piDb }))

const auditEvents: Array<{ event_type: string }> = []
vi.mock("../src/services/audit-log.js", () => ({
  writeAuditEvent: vi.fn(async (e: { event_type: string }) => {
    auditEvents.push(e)
  }),
}))

const {
  startAppTransaction,
  reportAppResult,
  pollAppStatus,
  cancelAppTransaction,
  takeNextIntent,
  reportTerminalStatus,
  terminalOnline,
  _resetAppTransport,
} = await import("../src/services/mypos-app.js")

const KEY = "01M0E0TMAWX1Q2FD5AR4WMPV72"
const KEY2 = "01M0E0TMAWX1Q2FD5AR4WMPV73"

function args(key = KEY, amount = 950) {
  return {
    idempotency_key: key,
    amount_cents: amount,
    order_id: "c022931e-e788-46b3-8f0c-bda50f0e09a6",
    venue_id: "29dea874-1274-4a0d-98f2-99899851bb4e",
    actor_terminal_id: "00000000-0000-0000-0000-000000000000",
  }
}

/** De app is verbonden — anders weigert de kassa terecht te starten. */
function terminalPresent() {
  reportTerminalStatus({ app_version: "1.0.0", battery_percent: 80 })
}

beforeEach(() => {
  piDb.exec("DELETE FROM mypos_intents")
  auditEvents.length = 0
  _resetAppTransport()
})

describe("betaling klaarzetten", () => {
  it("weigert als de terminal zich niet gemeld heeft", async () => {
    const res = await startAppTransaction(args())
    expect(res.status).toBe("failed")
    expect(res.message).toContain("niet verbonden")
    // Niets in de wachtrij: de kassa moet contant afrekenen, niet wachten.
    expect(await takeNextIntent(10)).toBeNull()
  })

  it("zet het bedrag klaar en levert het aan de wachtende app", async () => {
    terminalPresent()
    const waiting = takeNextIntent(1_000)
    const res = await startAppTransaction(args())

    expect(res).toEqual({ transaction_id: KEY, status: "pending" })
    const intent = await waiting
    expect(intent?.idempotency_key).toBe(KEY)
    expect(intent?.amount_cents).toBe(950)
  })

  it("laat een tweede kassa niet over de eerste betaling heen walsen", async () => {
    terminalPresent()
    await startAppTransaction(args())
    const second = await startAppTransaction(args(KEY2))

    expect(second.status).toBe("failed")
    expect(second.message).toContain("staat al een betaling klaar")
  })

  it("geeft bij dezelfde key hetzelfde antwoord terug in plaats van opnieuw af te rekenen", async () => {
    terminalPresent()
    await startAppTransaction(args())
    const again = await startAppTransaction(args())

    expect(again.reused).toBe(true)
    expect(again.status).toBe("pending")
  })
})

describe("afloop melden", () => {
  it("keurt goed, bewaart de bongegevens en schrijft payment.captured één keer", async () => {
    terminalPresent()
    await startAppTransaction(args())

    const first = await reportAppResult({
      idempotency_key: KEY,
      approved: true,
      status_code: "0",
      receipt: { auth_code: "P00291", rrn: "623120552024", pan_masked: "**** 3839" },
    })
    expect(first).toEqual({ status: "approved", already_settled: false })

    // De app biedt hetzelfde resultaat nog een keer aan omdat ons antwoord
    // onderweg verdween. Dat mag geen tweede boeking opleveren.
    const retry = await reportAppResult({ idempotency_key: KEY, approved: true })
    expect(retry).toEqual({ status: "approved", already_settled: true })

    expect(auditEvents.filter((e) => e.event_type === "payment.captured")).toHaveLength(1)

    const poll = pollAppStatus(KEY)
    expect(poll.status).toBe("approved")
    expect(poll.raw).toMatchObject({ rrn: "623120552024" })
  })

  it("neemt 'onbekend' over van de app in plaats van er goedgekeurd van te maken", async () => {
    terminalPresent()
    await startAppTransaction(args())

    const res = await reportAppResult({
      idempotency_key: KEY,
      approved: false,
      unresolved: true,
      message: "SDK brak af na autorisatie",
    })

    expect(res.status).toBe("unresolved")
    expect(auditEvents).toHaveLength(0)
    expect(pollAppStatus(KEY).message).toContain("SDK brak af")
  })

  it("een geweigerde kaart is geen fout van de kassa", async () => {
    terminalPresent()
    await startAppTransaction(args())
    const res = await reportAppResult({ idempotency_key: KEY, approved: false })

    expect(res.status).toBe("declined")
    expect(auditEvents).toHaveLength(0)
  })

  it("kent een betaling van vóór een herflash niet en zegt dat ook", async () => {
    await expect(
      reportAppResult({ idempotency_key: KEY, approved: true }),
    ).rejects.toThrow("mypos_unknown_transaction")
  })
})

describe("intrekken", () => {
  it("nog niet opgehaald: er is niets gebeurd op de terminal", async () => {
    terminalPresent()
    await startAppTransaction(args())

    const res = cancelAppTransaction(KEY)
    expect(res.status).toBe("failed")
    // En de app mag hem daarna niet alsnog oppakken.
    expect(await takeNextIntent(10)).toBeNull()
  })

  it("al opgehaald: de afloop is onbekend tot iemand op de terminal kijkt", async () => {
    terminalPresent()
    await startAppTransaction(args())
    await takeNextIntent(10) // app pakt hem op
    const { clearQueuedIntent } = await import("../src/services/mypos-app.js")
    clearQueuedIntent(KEY)

    const res = cancelAppTransaction(KEY)
    expect(res.status).toBe("unresolved")
    expect(res.message).toContain("terminal")
  })
})

describe("levensteken", () => {
  it("de terminal geldt als offline zodra hij twee minuten zwijgt", () => {
    reportTerminalStatus({ battery_percent: 55 })
    expect(terminalOnline()).toBe(true)
    expect(terminalOnline(Date.now() + 3 * 60_000)).toBe(false)
  })
})
