import { describe, it, expect, beforeEach, vi } from "vitest"
import Database from "better-sqlite3"

// The cloud transport is the real PIN route, and its uplink is a festival
// WiFi. These tests cover the moments where the answer went missing: the
// question is never "did the call succeed" but "can we still find out whether
// the customer was charged".

const TID = "80561740"

const payments = {
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  cancel: vi.fn(),
  refund: vi.fn(),
}

vi.mock("mypos-api-gateway", () => ({
  MyPOSGateway: class {
    createClient() {
      return { epos: { payments } }
    }
  },
}))

vi.mock("../src/config.js", () => ({
  config: {
    MYPOS_TRANSPORT: "cloud",
    MYPOS_GATEWAY_URL: "https://api-gateway.mypos.com",
    MYPOS_TID: TID,
    MYPOS_MIN_AMOUNT_CENTS: 100,
    MYPOS_OPERATOR_CODE: "1",
    MYPOS_PARTNER_ID: "mps-p-test",
    MYPOS_APPLICATION_ID: "mps-app-test",
    MYPOS_INTEGRATION_CLIENT_ID: "client_test",
    MYPOS_INTEGRATION_CLIENT_SECRET: "secret_test",
    MYPOS_MERCHANT_CLIENT_ID: "cli_test",
    MYPOS_MERCHANT_CLIENT_SECRET: "sec_test",
  },
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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

// Wat er naar de boekhouding wordt geschoven. pos_payments hoort er precies
// één keer in te staan bij een geslaagde betaling — dat is waar de
// dagafsluiting contant en pin uit elkaar haalt.
const queued: Array<{ table_name: string; payload: Record<string, unknown> }> = []
vi.mock("../src/db/outbox.js", () => ({
  piDb,
  enqueueOutbox: vi.fn((row: { table_name: string; payload: Record<string, unknown> }) => {
    queued.push(row)
    return { enqueued: true }
  }),
}))

const auditEvents: unknown[] = []
vi.mock("../src/services/audit-log.js", () => ({
  writeAuditEvent: vi.fn(async (e: unknown) => {
    auditEvents.push(e)
  }),
}))

const { startMyPosTransaction, pollMyPosStatus } = await import(
  "../src/services/mypos-proxy.js"
)

const KEY = "01HMV0AB9F4XCJZK0Q7VAN6T0R"
const args = {
  idempotency_key: KEY,
  amount_cents: 950,
  order_id: "00000000-0000-0000-0000-000000000abc",
  venue_id: "00000000-0000-0000-0000-000000000010",
  actor_terminal_id: "kassa-1",
}

const intent = () =>
  piDb.prepare("SELECT * FROM mypos_intents WHERE idempotency_key = ?").get(KEY) as
    | { status: string; transaction_id: string | null }
    | undefined

/** The SDK reports a dropped connection as status -1, it does not throw. */
const networkError = { success: false, status: -1, statusMessage: "Network error: fetch failed" }

const listing = (items: Array<Record<string, string>>) => ({
  success: true,
  items,
  page: 1,
  pageSize: 50,
  totalPages: 1,
  totalCount: items.length,
})

beforeEach(() => {
  piDb.prepare("DELETE FROM mypos_intents").run()
  auditEvents.length = 0
  vi.clearAllMocks()
})

describe("myPOS cloud transport — losing the answer", () => {
  it("marks a dropped create as unresolved, never as failed", async () => {
    payments.create.mockResolvedValue(networkError)

    const res = await startMyPosTransaction(args)

    expect(res.status).toBe("unresolved")
    expect(res.message).toMatch(/controleer de terminal/i)
    expect(intent()?.status).toBe("unresolved")
  })

  it("adopts the payment when reconciliation finds our reference", async () => {
    payments.create.mockResolvedValue(networkError)
    await startMyPosTransaction(args)

    // Uplink is back: myPOS turns out to have armed the terminal after all,
    // and the customer paid.
    payments.list.mockResolvedValue(
      listing([{ requestId: "pay_abc123", status: "APPROVED", referenceNumber: KEY }]),
    )

    const res = await pollMyPosStatus(KEY)

    expect(res.status).toBe("approved")
    expect(intent()?.transaction_id).toBe("pay_abc123")
    // The money moved, so exactly one payment.captured belongs in the chain.
    expect(auditEvents).toHaveLength(1)
  })

  it("frees the key for a real retry once myPOS proves it never got the payment", async () => {
    payments.create.mockResolvedValue(networkError)
    await startMyPosTransaction(args)

    payments.list.mockResolvedValue(
      listing([{ requestId: "pay_other", status: "APPROVED", referenceNumber: "OTHER-KEY" }]),
    )
    payments.create.mockResolvedValue({
      success: true,
      status: "PENDING",
      paymentId: "pay_fresh",
    })

    const retry = await startMyPosTransaction(args)

    expect(retry.status).toBe("pending")
    expect(retry.transaction_id).toBe("pay_fresh")
    expect(payments.create).toHaveBeenCalledTimes(2)
    expect(auditEvents).toHaveLength(0)
  })

  it("stays unresolved while the gateway is still unreachable", async () => {
    payments.create.mockResolvedValue(networkError)
    await startMyPosTransaction(args)

    payments.list.mockResolvedValue(networkError)

    const res = await pollMyPosStatus(KEY)
    expect(res.status).toBe("unresolved")
    // Crucially not dropped — the key must keep pointing at the open question.
    expect(intent()?.status).toBe("unresolved")
    expect(payments.create).toHaveBeenCalledTimes(1)
  })

  it("treats a 403 as a refusal: nothing created, retry allowed, own message", async () => {
    payments.create.mockResolvedValue({
      success: false,
      status: 403,
      statusMessage: "Forbidden",
    })

    const res = await startMyPosTransaction(args)
    expect(res.status).toBe("failed")
    expect(res.message).toMatch(/geen ePOS-betalingen/i)

    // A refusal creates nothing at myPOS, so tapping again must reach it
    // without any reconciliation round-trip.
    payments.create.mockResolvedValue({
      success: true,
      status: "PENDING",
      paymentId: "pay_after_403",
    })
    const retry = await startMyPosTransaction(args)
    expect(retry.transaction_id).toBe("pay_after_403")
    expect(payments.list).not.toHaveBeenCalled()
  })

  it("flags a payment that has been pending for minutes as stale", async () => {
    payments.create.mockResolvedValue({
      success: true,
      status: "PENDING",
      paymentId: "pay_slow",
    })
    await startMyPosTransaction(args)
    piDb
      .prepare("UPDATE mypos_intents SET created_at = ? WHERE idempotency_key = ?")
      .run(Date.now() - 5 * 60_000, KEY)

    payments.get.mockResolvedValue({ success: true, status: "PENDING" })

    const res = await pollMyPosStatus(KEY)
    expect(res.status).toBe("pending")
    expect(res.stale).toBe(true)
    expect(res.message).toMatch(/kijk op de terminal/i)
  })

  it("finds the payment when myPOS lists oldest-first and ours is on the last page", async () => {
    payments.create.mockResolvedValue(networkError)
    await startMyPosTransaction(args)

    // 40 pages of history; the sort order puts today's payments at the end.
    const filler = { requestId: "pay_old", status: "APPROVED", referenceNumber: "OLD" }
    payments.list.mockImplementation(async ({ page }: { page: number }) => ({
      success: true,
      page,
      pageSize: 50,
      totalPages: 40,
      totalCount: 2000,
      items:
        page === 40
          ? [{ requestId: "pay_tail", status: "APPROVED", referenceNumber: KEY }]
          : [filler],
    }))

    const res = await pollMyPosStatus(KEY)
    expect(res.status).toBe("approved")
    expect(intent()?.transaction_id).toBe("pay_tail")
  })

  it("still concludes absence on a long history when neither end holds our reference", async () => {
    payments.create.mockResolvedValue(networkError)
    await startMyPosTransaction(args)

    payments.list.mockImplementation(async ({ page }: { page: number }) => ({
      success: true,
      page,
      pageSize: 50,
      totalPages: 40,
      totalCount: 2000,
      items: [{ requestId: "pay_old", status: "APPROVED", referenceNumber: "OLD" }],
    }))

    const res = await pollMyPosStatus(KEY)
    expect(res.status).toBe("failed")
    // Key released, so the operator's next tap starts a real payment.
    expect(intent()).toBeUndefined()
    // Head and tail only — not all 40 pages.
    expect(payments.list).toHaveBeenCalledTimes(4)
  })

  it("does not re-ask myPOS about a payment that already settled", async () => {
    payments.create.mockResolvedValue({
      success: true,
      status: "APPROVED",
      paymentId: "pay_done",
    })
    await startMyPosTransaction(args)

    const res = await pollMyPosStatus(KEY)
    expect(res.status).toBe("approved")
    expect(payments.get).not.toHaveBeenCalled()
    expect(auditEvents).toHaveLength(1)
  })
})

describe("een bedrag dat de bank toch niet aanneemt", () => {
  it("biedt geen pin aan onder de ondergrens en raakt de terminal niet", async () => {
    // Een cent kwam terug van de bank als APPROVAL=58 terwijl een euro gewoon
    // doorging. De klant hoort dat niet bij het pinpad te ontdekken.
    const res = await startMyPosTransaction({ ...args, amount_cents: 1 })

    expect(res.status).toBe("failed")
    expect(res.message).toContain("contant")
    expect(payments.create).not.toHaveBeenCalled()
    expect(intent()).toBeUndefined()
  })
})
