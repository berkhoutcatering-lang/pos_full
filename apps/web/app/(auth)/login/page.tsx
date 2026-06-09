import { loginAction } from "./actions"

type SearchParams = Promise<{ error?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-8">
      <h1 className="mb-6 text-2xl font-bold text-[var(--color-brand)]">Hop &amp; Bites POS</h1>
      <form action={loginAction} className="space-y-4">
        <label className="block">
          <span className="text-sm">E-mail</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
          />
        </label>
        <label className="block">
          <span className="text-sm">Wachtwoord</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded bg-[var(--color-brand)] p-3 font-semibold text-white"
        >
          Inloggen
        </button>
      </form>
    </main>
  )
}
