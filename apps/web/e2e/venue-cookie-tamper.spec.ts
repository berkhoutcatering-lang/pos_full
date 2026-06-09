import { test, expect } from "@playwright/test"

// P0-5 validation — hb_venue cookie tampered to point at a venue in
// another org must be cleared by getClaims() and the user redirected to
// /select-venue.

test.describe("P0-5 venue cookie cross-org defence", () => {
  test("tampered hb_venue clears + redirects to /select-venue", async ({ page, context }) => {
    // Step 1: log in via the seeded owner. Test harness assumes a
    // dev account is provisioned by supabase seed.
    await page.goto("/login")
    await page.locator('input[name="email"]').fill(process.env.E2E_TEST_EMAIL ?? "test@example.com")
    await page.locator('input[name="password"]').fill(process.env.E2E_TEST_PASSWORD ?? "test-password-12345")
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/(select-venue|$)/)

    // Step 2: select the legit venue → cookie set.
    if (page.url().includes("/select-venue")) {
      await page.locator("button").first().click()
    }
    await expect(page).toHaveURL("/")

    // Step 3: tamper the cookie to a venue from a hypothetical other
    // org. The /select-venue redirect proves auth.ts:30-55 caught it.
    await context.addCookies([
      {
        name: "hb_venue",
        value: "11111111-1111-1111-1111-111111111111", // not in seed org
        url: process.env.E2E_APP_URL ?? "http://localhost:3000",
      },
    ])

    await page.goto("/pos")
    // requireVenue() redirects to /select-venue when venueId is null
    // (the cookie was cleared).
    await expect(page).toHaveURL(/\/select-venue/, { timeout: 5_000 })

    // The cookie should be absent after the round-trip.
    const cookies = await context.cookies()
    const hb = cookies.find((c) => c.name === "hb_venue")
    expect(hb).toBeUndefined()
  })
})
