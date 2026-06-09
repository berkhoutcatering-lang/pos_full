import * as Sentry from "@sentry/node"

// MUST be imported before any other module in index.ts so Sentry's
// auto-instrumentation can hook the runtime. No-op until SENTRY_DSN is
// set, so it's safe on a Pi without a DSN. Reads process.env directly
// (config.ts is parsed later) to stay import-order independent.
const dsn = process.env.SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
})
