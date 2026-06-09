import Link from "next/link"
import type { Route } from "next"
import {
  ArrowRight,
  ChefHat,
  LogOut,
  Monitor,
  Settings,
  ShoppingCart,
} from "lucide-react"
import { requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { Logo } from "@/components/ui/logo"
import { logoutAction } from "./actions"

const TILES: Array<{
  href: Route
  label: string
  sub: string
  role: string
  accent: string
  Icon: typeof ShoppingCart
}> = [
  {
    href: "/pos",
    label: "Kassa",
    sub: "Bestellingen aanslaan & afrekenen",
    role: "Kassier",
    accent: "var(--color-hop-600)",
    Icon: ShoppingCart,
  },
  {
    href: "/keuken",
    label: "Keuken",
    sub: "Bonnen in bereiding volgen",
    role: "Keuken",
    accent: "var(--color-brick-600)",
    Icon: ChefHat,
  },
  {
    href: "/cfd",
    label: "Klantscherm",
    sub: "Wachtrij & 'klaar'-bord",
    role: "Display",
    accent: "var(--color-charcoal-700)",
    Icon: Monitor,
  },
  {
    href: "/admin",
    label: "Beheer",
    sub: "Omzet, menu, personeel",
    role: "Manager",
    accent: "var(--color-amber-600)",
    Icon: Settings,
  },
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return "Goedenacht"
  if (h < 12) return "Goedemorgen"
  if (h < 18) return "Goedemiddag"
  return "Goedenavond"
}

export default async function HomePage() {
  const claims = await requireVenue()
  const supabase = await createClient()
  const { data: venue } = await supabase
    .from("venues")
    .select("name")
    .eq("id", claims.venueId)
    .maybeSingle()

  return (
    <main className="flex min-h-dvh flex-col bg-offwhite">
      <header className="flex h-24 flex-none items-center justify-between bg-charcoal-900 px-12">
        <Logo size={52} eyebrow={(venue?.name ?? "Hop & Bites").toUpperCase()} />
        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex h-12 items-center gap-2 rounded-md border border-charcoal-700 bg-transparent px-[18px] text-[15px] font-bold leading-none text-charcoal-300 transition-[color] duration-[var(--dur-fast)] hover:text-offwhite"
          >
            <LogOut size={18} /> Uitloggen
          </button>
        </form>
      </header>

      <div className="flex flex-1 flex-col justify-center px-8 py-10 lg:px-20">
        <h1 className="mb-1.5 text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] text-charcoal-900">
          {greeting()}
        </h1>
        <p className="mb-11 text-[19px] font-medium leading-[1.4] text-charcoal-500">
          Kies een scherm om te starten.
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {TILES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              style={{ "--tile-accent": t.accent } as React.CSSProperties}
              className="flex min-h-[280px] flex-col items-start rounded-lg border border-line-strong bg-paper-bright p-8 text-left transition-[border-color] duration-[var(--dur-fast)] hover:border-[var(--tile-accent)]"
            >
              <span
                className="mb-7 flex h-[76px] w-[76px] items-center justify-center rounded-md"
                style={{ background: t.accent }}
              >
                <t.Icon size={40} className="text-white" />
              </span>
              <span className="mb-2.5 text-[12px] font-bold uppercase leading-none tracking-[0.14em] text-charcoal-500">
                {t.role}
              </span>
              <span className="mb-2.5 text-[28px] font-extrabold leading-none text-charcoal-900">
                {t.label}
              </span>
              <span className="flex-1 text-[15px] font-medium leading-[1.35] text-charcoal-500">
                {t.sub}
              </span>
              <span
                className="inline-flex items-center gap-2 text-[15px] font-bold leading-none"
                style={{ color: t.accent }}
              >
                Openen <ArrowRight size={18} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
