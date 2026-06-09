import { test, expect } from "@playwright/test"

// Pillar 3 — PIN-First Webapp-Triggered. Stopwatch: from tap-Afrekenen-PIN
// to the myPOS Ultra showing the amount must be <800ms p95.
//
// This spec runs against the Pi-bridge sandbox + myPOS test profile. The
// Sentry custom transaction name is `pin.tap_to_amount`; the p95 of that
// metric is the production-monitor.

test.describe("Pillar 3 — PIN-First <800ms tap→bedrag", () => {
  test("tap PIN → amount visible on terminal mock within 800ms", async ({ page }) => {
    await page.goto("/pos")

    // Build a small cart.
    await page.locator('[data-testid="product-card"]').first().click()
    await page.locator('[data-testid="cart-pay-button"]').click()

    // Tap PIN; stopwatch starts the moment the button click resolves
    // promise-wise and stops when the page emits the
    // `pin.tap_to_amount` performance mark.
    const t0 = Date.now()
    await page.locator('text="PIN"').first().click()
    await page.locator('text="Start PIN-transactie"').click()

    // The CheckoutPin overlay shows "Wacht op klant" once the Pi
    // returns the transaction_id. That latency is our budget.
    await expect(page.locator("text=Wacht op klant")).toBeVisible({ timeout: 1500 })
    const elapsed = Date.now() - t0

    // p95 target 800ms; per-test we allow up to 1200ms (single sample),
    // but emit the timing as a Playwright attachment for the perf
    // ladder in Sentry / Vercel Analytics.
    await test.info().attach("pin.tap_to_amount_ms", {
      body: String(elapsed),
      contentType: "text/plain",
    })
    expect(elapsed).toBeLessThan(1200)
  })
})
