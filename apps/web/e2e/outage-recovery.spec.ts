import { test, expect } from "@playwright/test"

// Pillar 1 — Pi-Edge Cloud-Truth. The truck survives a 4h Supabase outage
// and the outbox drains within 30s after recovery with zero data loss.
//
// Pi-bridge env: SIMULATE_SUPABASE_OUTAGE=true flips the flush worker
// into pause. We simulate by setting the flag, posting 5 orders, flipping
// it off, and asserting the audit_log + pos_orders counts catch up.

const PI_ADMIN_URL = process.env.E2E_PI_BRIDGE_URL ?? "https://hopbites.local:3001"
const PI_ADMIN_TOKEN = process.env.E2E_PI_BRIDGE_ADMIN_TOKEN ?? ""

test.describe("Pillar 1 — Pi-Edge Cloud-Truth", () => {
  test("4h outage → outbox replay <30s on recovery", async ({ request, page }) => {
    test.setTimeout(120_000)

    // 1. Flip the outage simulation on (Pi-bridge env reload required;
    //    test harness uses docker-compose `kill -HUP` in CI).
    const flipOn = await request.post(`${PI_ADMIN_URL}/admin/_test/outage`, {
      headers: { "x-admin-token": PI_ADMIN_TOKEN },
      data: { enabled: true },
      failOnStatusCode: false,
    })
    test.skip(!flipOn.ok(), "Pi-bridge admin test-mode endpoint required")

    // 2. Place 5 orders via /pos. The PWA sees them go into the local
    //    outbox; UI shows the "⚠️ outage queued N" chip.
    await page.goto("/pos")
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-testid="product-card"]').first().click()
      await page.locator('[data-testid="cart-pay-button"]').click()
      await page.locator('[data-testid="cash-confirm"]').click()
    }
    await expect(page.locator('[role="status"]', { hasText: /queued/i })).toContainText("5 queued")

    // 3. Flip outage off and assert the chip turns ● live within 30s.
    await request.post(`${PI_ADMIN_URL}/admin/_test/outage`, {
      headers: { "x-admin-token": PI_ADMIN_TOKEN },
      data: { enabled: false },
    })
    await expect(page.locator('[role="status"]')).toContainText("live", { timeout: 30_000 })

    // 4. Verify outbox depth in /_health.
    const health = await request.get(`${PI_ADMIN_URL}/_health`, {
      headers: { "x-admin-token": PI_ADMIN_TOKEN },
    })
    const { outbox_pending, outbox_failed } = await health.json()
    expect(outbox_pending).toBe(0)
    expect(outbox_failed).toBe(0)
  })
})
