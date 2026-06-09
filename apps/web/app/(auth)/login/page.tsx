import { Logo } from "@/components/ui/logo"
import { loginAction } from "./actions"

type SearchParams = Promise<{ error?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams
  return (
    <main className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden flex-col justify-between bg-charcoal-900 p-[88px] text-offwhite lg:flex">
        <Logo size={64} eyebrow="BBQ · CATERING" />
        <div>
          <div className="max-w-[540px] text-[56px] font-extrabold leading-[1.05] tracking-[-0.02em]">
            Strak afrekenen,
            <br />
            de hele service door.
          </div>
          <div className="mt-6 max-w-[460px] text-[19px] font-medium leading-[1.5] text-charcoal-300">
            Het kassasysteem voor de foodtruck en de cateringlijn. Snel,
            functioneel, hoog contrast.
          </div>
        </div>
        <div className="flex gap-2.5 text-[14px] font-semibold leading-none text-charcoal-400">
          <span className="inline-flex items-center gap-2">
            <span className="h-[9px] w-[9px] rounded-full bg-hop-500" /> Pi-bridge
            verbonden
          </span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-offwhite p-8 lg:p-[88px]">
        <form action={loginAction} className="w-[460px] max-w-full">
          <div className="mb-8 inline-flex rounded-2xl bg-charcoal-900 p-3 lg:hidden">
            <Logo size={48} eyebrow="BBQ · CATERING" />
          </div>
          <h1 className="mb-1.5 text-[34px] font-extrabold leading-[1.1] text-charcoal-900">
            Inloggen
          </h1>
          <p className="mb-9 text-[17px] font-medium leading-[1.4] text-charcoal-500">
            Meld je aan om de kassa te starten.
          </p>

          <label className="mb-[18px] block">
            <span className="mb-2 block text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
              E-mail
            </span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-[60px] w-full rounded-md border border-line-strong bg-paper-bright px-[18px] text-[19px] font-semibold text-charcoal-900 outline-none"
            />
          </label>
          <label className="mb-[18px] block">
            <span className="mb-2 block text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
              Wachtwoord
            </span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-[60px] w-full rounded-md border border-line-strong bg-paper-bright px-[18px] text-[19px] font-semibold text-charcoal-900 outline-none"
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-md bg-brick-100 px-4 py-3 text-[15px] font-semibold text-brick-600"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-2.5 h-16 w-full rounded-md border border-hop-600 bg-hop-600 text-[20px] font-bold leading-none text-[var(--text-on-accent)] transition-[background] duration-[var(--dur-fast)] hover:bg-hop-700 active:scale-[0.99]"
          >
            Inloggen
          </button>
          <p className="mt-[22px] text-center text-[15px] font-semibold leading-none text-charcoal-500">
            Wachtwoord vergeten? Vraag je manager.
          </p>
        </form>
      </div>
    </main>
  )
}
