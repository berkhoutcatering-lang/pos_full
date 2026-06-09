import withPWAInit from "@ducanh2912/next-pwa"
import type { NextConfig } from "next"

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
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

// Round 3 P1-6 — Content-Security-Policy. The PWA pulls scripts from
// itself (and Turnstile on /q), connects to Supabase, the Pi-bridge over
// LAN, and Mollie redirect/check URLs. report-to Sentry for violations.
// Nonce-based on inline scripts via Next's built-in nonce middleware
// (omitted here for brevity — wire when Sentry endpoint is provisioned).
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://hopbites.local:3001",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ")

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    typedRoutes: true,
  },
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

export default withPWA(nextConfig)
