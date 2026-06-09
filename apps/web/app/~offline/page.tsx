// next-pwa document fallback. Served by the service worker when the
// device is offline and the requested route was never cached. It renders
// no per-request data of its own; the root layout opts the tree into
// dynamic rendering (cookies), so we don't force-static here.
export default function Offline() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--color-surface)] p-6 text-[var(--color-surface-fg)]">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-bold text-[var(--color-brand)]">
          Geen verbinding
        </h1>
        <p className="mt-2 text-sm opacity-75">
          Je bent offline en deze pagina is niet lokaal opgeslagen. De kassa
          (<code>/pos</code>) blijft werken in cash-modus; bestellingen worden
          lokaal in de wachtrij gezet en gesynct zodra er weer netwerk is.
        </p>
      </div>
    </main>
  )
}
