"use client"
// Route-segment error boundary. Renders inside the root layout, so theme
// tokens from globals.css are available. Reports to Sentry, then offers a
// retry that re-renders the segment without a full reload.
import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

export default function Error({
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
    <main className="flex min-h-dvh items-center justify-center bg-[var(--color-surface)] p-6 text-[var(--color-surface-fg)]">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-bold text-[var(--color-brand)]">
          Er ging iets mis
        </h1>
        <p className="mt-2 text-sm opacity-75">
          Dit scherm kon niet geladen worden. Probeer opnieuw — de kassa en
          lopende bestellingen blijven beschikbaar.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs opacity-40">ref: {error.digest}</p>
        ) : null}
        <button
          onClick={reset}
          className="mt-4 min-h-[56px] rounded-xl bg-[var(--color-brand)] px-6 font-semibold text-white active:scale-[0.98]"
        >
          Opnieuw proberen
        </button>
      </div>
    </main>
  )
}
