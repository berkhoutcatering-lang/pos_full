import withPWAInit from "@ducanh2912/next-pwa"
import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  // Document fallback served by the SW when offline and the route was
  // never cached. The page is precached at build (app/~offline/page.tsx).
  fallbacks: { document: "/~offline" },
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: /^http:\/\/hopbites\.local:3001\/cache\//,
        handler: "NetworkFirst",
        options: { cacheName: "pi-cache", networkTimeoutSeconds: 1 },
      },
      {
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/pos"),
        handler: "StaleWhileRevalidate",
      },
    ],
  },
})

// Content-Security-Policy. The PWA loads scripts from itself, connects to
// Supabase (REST + Realtime websocket), the Pi-bridge over LAN, and Sentry
// ingest for error/perf reporting.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://hopbites.local:3001 https://*.sentry.io",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ")

const nextConfig: NextConfig = {
  // NOTE: cacheComponents is intentionally OFF. The app renders every
  // route dynamically (force-dynamic everywhere) because it reads
  // per-request, per-tenant data under RLS — enabling Cache Components
  // here both breaks the build (incompatible with route-segment configs)
  // and risks caching one tenant's data for another. Revisit only with a
  // deliberate, per-tenant-keyed caching design.
  typedRoutes: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "content-security-policy", value: CSP_DIRECTIVES },
          { key: "x-frame-options", value: "SAMEORIGIN" },
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
          { key: "permissions-policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "strict-transport-security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ]
  },
}

// next-pwa (webpack) wraps innermost; Sentry wraps the result and uploads
// source maps only when SENTRY_AUTH_TOKEN + org/project are present (CI /
// prod build). Silent locally so dev builds stay quiet.
export default withSentryConfig(withPWA(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
})
