import Link from "next/link"

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--color-surface)] p-6 text-[var(--color-surface-fg)]">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-bold text-[var(--color-brand)]">
          Pagina niet gevonden
        </h1>
        <p className="mt-2 text-sm opacity-75">
          Deze pagina bestaat niet (meer).
        </p>
        <Link
          href="/"
          className="mt-4 inline-block min-h-[56px] rounded-md bg-hop-600 px-6 py-4 font-bold text-white transition-[background] duration-[var(--dur-fast)] hover:bg-hop-700"
        >
          Naar start
        </Link>
      </div>
    </main>
  )
}
