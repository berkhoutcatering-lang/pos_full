import * as Sentry from "@sentry/nextjs"

// Browser Sentry init. No-op until NEXT_PUBLIC_SENTRY_DSN is set. Session
// Replay is intentionally disabled — the kassa runs on tablets where the
// extra bundle + capture overhead isn't worth it.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
})

// Instruments App Router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
