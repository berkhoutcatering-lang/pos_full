import { defineConfig } from "checkly"
import { ApiCheck, AssertionBuilder, Frequency } from "checkly/constructs"

// Pillar production-monitors. Each Pillar owns one Checkly check that
// fires alerts (Slack/email) when its acceptance metric crosses
// threshold. Deploy with `npx checkly deploy`.

export default defineConfig({
  projectName: "hopbites-pos",
  logicalId: "hopbites-pos",
  repoUrl: "https://github.com/sam/hopbites-pos",
  checks: {
    locations: ["eu-west-1", "eu-central-1"],
    tags: ["pillar-monitor"],
    runtimeId: "2024.09",
    frequency: Frequency.EVERY_5M,
  },
})

// Pillar 1 — Pi-Edge: outbox pending p95 < 50 (queue depth normal during rush)
new ApiCheck("pillar-1-outbox-pending", {
  name: "Pillar 1 · Pi outbox pending depth",
  frequency: Frequency.EVERY_5M,
  request: {
    method: "GET",
    url: "{{PI_BRIDGE_URL}}/_health",
    headers: [{ key: "x-admin-token", value: "{{PI_BRIDGE_ADMIN_TOKEN}}" }],
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody("$.outbox_pending").lessThan(50),
      AssertionBuilder.jsonBody("$.outbox_failed").equals(0),
    ],
  },
})

// Pillar 3 — PIN-First: tap-to-amount p95 — pulled from Sentry custom
// transaction. Checkly Sentry-source check (defined in dashboard, not
// code; this stub documents the contract).
new ApiCheck("pillar-3-pin-tap-p95", {
  name: "Pillar 3 · PIN tap_to_amount p95 < 800ms",
  frequency: Frequency.EVERY_5M,
  request: {
    method: "GET",
    url: "{{APP_URL}}/api/metrics/pin-tap-p95",
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody("$.p95_ms").lessThan(800),
    ],
  },
})

// Pillar 4 — Foodtruck-First: CrUX INP from field data — daily.
new ApiCheck("pillar-4-inp-p75", {
  name: "Pillar 4 · CrUX INP p75 < 100ms",
  frequency: Frequency.EVERY_24H,
  request: {
    method: "GET",
    url: "{{APP_URL}}/api/metrics/crux-inp",
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody("$.p75_ms").lessThan(100),
    ],
  },
})

// Pillar 2 — BTW-Right: dagelijkse hash chain verify (cron, separate).
// Pillar 5 — White-Label: per-tenant onboarding stopwatch (one-shot;
// Playwright spec covers this, no production monitor needed).
