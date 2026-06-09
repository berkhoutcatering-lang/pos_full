import * as Sentry from "@sentry/nextjs"

// Server runtime (Node) Sentry init. No-op until a DSN is provisioned, so
// this is safe to ship before Sentry is set up. Imported by
// instrumentation.ts when NEXT_RUNTIME === "nodejs".
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
})
