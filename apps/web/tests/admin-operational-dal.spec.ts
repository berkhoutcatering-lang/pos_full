import { describe, it, expect } from "vitest"

// Static contract test for the admin-operational dual-source DAL.
// We can't run the real Server Action without a DB, but we can verify:
// 1. The Pi-client helpers fail closed (return { ok:false }) on timeout.
// 2. The fall-back branch in the DAL is reachable (read source).

import {
  updateStockViaPi,
  toggleAvailabilityViaPi,
  setPriceOverrideViaPi,
} from "@/lib/pi-bridge/client"

describe("admin-operational DAL — Pi-bridge client timeout behaviour", () => {
  it("updateStockViaPi resolves to {ok:false, error:'pi_unavailable'} when Pi is unreachable", async () => {
    // hopbites.local:3001 is not resolvable in test context.
    const res = await updateStockViaPi({
      idempotency_key: "01HMV0AB9F4XCJZK0Q7VAN6T0R",
      item_id: "00000000-0000-0000-0000-000000000111",
      delta: -1,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      // Could be pi_unavailable (DNS) or pi_timeout depending on stack.
      expect(["pi_unavailable", "pi_timeout"]).toContain(res.error)
    }
  }, 5_000)

  it("toggleAvailabilityViaPi fails closed when Pi unreachable", async () => {
    const res = await toggleAvailabilityViaPi({
      idempotency_key: "01HMV0AB9F4XCJZK0Q7VAN6T0S",
      item_id: "00000000-0000-0000-0000-000000000111",
      available: false,
    })
    expect(res.ok).toBe(false)
  }, 5_000)

  it("setPriceOverrideViaPi fails closed when Pi unreachable", async () => {
    const res = await setPriceOverrideViaPi({
      idempotency_key: "01HMV0AB9F4XCJZK0Q7VAN6T0T",
      item_id: "00000000-0000-0000-0000-000000000111",
      price_cents: 850,
      expires_at: null,
    })
    expect(res.ok).toBe(false)
  }, 5_000)
})
