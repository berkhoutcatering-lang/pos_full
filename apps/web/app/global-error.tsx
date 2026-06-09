"use client"
// Catches errors thrown in the root layout itself. It REPLACES the root
// layout, so globals.css / theme tokens are not available here — styles
// must be inline. Reports to Sentry before showing a minimal recovery UI.
import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="nl">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fff7f2",
          color: "#1a1a1a",
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#ff6b35" }}>
            Er ging iets mis
          </h1>
          <p style={{ opacity: 0.75, lineHeight: 1.5 }}>
            De kassa kon dit scherm niet laden. Probeer opnieuw — lopende
            bestellingen blijven via de Pi-bridge bewaard.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              minHeight: 56,
              padding: "0 24px",
              borderRadius: 12,
              border: "none",
              background: "#ff6b35",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Opnieuw proberen
          </button>
        </main>
      </body>
    </html>
  )
}
