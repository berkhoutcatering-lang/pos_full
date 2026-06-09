import { describe, it, expect, beforeAll } from "vitest"
import { SignJWT } from "jose"

// P0-1 validation — POST /orders/create met een tampered org_id moet 403
// returnen, ook met een geldige tablet pairing JWT.
//
// Runs against the Docker stack: pi-bridge container op localhost:3001
// + paired tablet via /admin/issue-pair-code + /pair.

const PI_URL = process.env.PI_BRIDGE_URL ?? "http://localhost:3001"
const ADMIN_TOKEN = process.env.PI_BRIDGE_ADMIN_TOKEN ?? "test-admin-token-min-32-chars-long-xx"
const REAL_ORG = "00000000-0000-0000-0000-000000000001"
const REAL_VENUE = "00000000-0000-0000-0000-000000000010"

async function pairTablet(): Promise<string> {
  // Issue a code as admin
  const issue = await fetch(`${PI_URL}/admin/issue-pair-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
    body: JSON.stringify({ role: "cashier" }),
  })
  expect(issue.ok).toBe(true)
  const { code } = (await issue.json()) as { code: string }

  // Redeem
  const redeem = await fetch(`${PI_URL}/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  })
  expect(redeem.ok).toBe(true)
  const cookie = redeem.headers.get("set-cookie") ?? ""
  const match = cookie.match(/hb-pair=([^;]+)/)
  expect(match).not.toBeNull()
  return match![1]!
}

describe.skip("Pi-bridge org_id guard (P0-1) — requires Docker stack up", () => {
  let tabletCookie: string
  beforeAll(async () => {
    tabletCookie = await pairTablet()
  })

  it("rejects POST /orders/create with tampered org_id (403 org_mismatch)", async () => {
    const body = {
      idempotency_key: "01HMV0AB9F4XCJZK0Q7VAN6T0R",
      order_id: "00000000-0000-0000-0000-000000000abc",
      org_id: "99999999-9999-9999-9999-999999999999", // WRONG
      venue_id: REAL_VENUE,
      items: [
        {
          id: "01HMV0AB9F4XCJZK0Q7VAN6T0X",
          menu_item_id: "00000000-0000-0000-0000-000000000111",
          qty: 1,
          unit_price_cents: 950,
          btw_class: "food_9",
          modifiers: [],
        },
      ],
      totals: { excl_cents: 871, btw_cents: 79, incl_cents: 950 },
    }
    const res = await fetch(`${PI_URL}/orders/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `hb-pair=${tabletCookie}`,
      },
      body: JSON.stringify(body),
    })
    expect(res.status).toBe(403)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe("org_mismatch")
  })

  it("accepts POST /orders/create with correct org_id", async () => {
    const body = {
      idempotency_key: "01HMV0AB9F4XCJZK0Q7VAN6T0S",
      order_id: "00000000-0000-0000-0000-000000000abd",
      org_id: REAL_ORG,
      venue_id: REAL_VENUE,
      items: [
        {
          id: "01HMV0AB9F4XCJZK0Q7VAN6T0Y",
          menu_item_id: "00000000-0000-0000-0000-000000000111",
          qty: 1,
          unit_price_cents: 950,
          btw_class: "food_9",
          modifiers: [],
        },
      ],
      totals: { excl_cents: 871, btw_cents: 79, incl_cents: 950 },
    }
    const res = await fetch(`${PI_URL}/orders/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `hb-pair=${tabletCookie}`,
      },
      body: JSON.stringify(body),
    })
    expect(res.ok).toBe(true)
    const json = (await res.json()) as { ok: boolean; queued: boolean }
    expect(json.ok).toBe(true)
    expect(json.queued).toBe(true)
  })
})

// Silence unused-import warning
void SignJWT
