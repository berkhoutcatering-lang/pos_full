import { ChevronRight, Tent, Truck, Warehouse } from "lucide-react"
import { requireAuth } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { selectVenueAction } from "./actions"
import { AutoSelectVenue } from "./auto-select"

type SearchParams = Promise<{ error?: string }>

// Accent + icon cycle per venue row (brick / amber / hop, per the design).
const VENUE_STYLES = [
  { accent: "var(--color-brick-600)", Icon: Truck },
  { accent: "var(--color-amber-600)", Icon: Tent },
  { accent: "var(--color-hop-600)", Icon: Warehouse },
]

export default async function SelectVenuePage({ searchParams }: { searchParams: SearchParams }) {
  const claims = await requireAuth()
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: venues } = await supabase
    .from("venues")
    .select("id, name, slug")
    .eq("org_id", claims.orgId)
    .eq("active", true)
    .order("name")

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-offwhite p-8 lg:p-20">
      <div className="w-[720px] max-w-full">
        <div className="mb-3.5 text-[13px] font-bold uppercase leading-none tracking-[0.18em] text-hop-700">
          Hop &amp; Bites
        </div>
        <h1 className="mb-2 text-[44px] font-extrabold leading-[1.05] tracking-[-0.02em] text-charcoal-900">
          Kies je locatie
        </h1>
        <p className="mb-10 text-[18px] font-medium leading-[1.4] text-charcoal-500">
          Ingelogd als <strong className="text-charcoal-800">{claims.role}</strong>
        </p>

        {error ? (
          <p
            role="alert"
            className="mb-6 rounded-md bg-brick-100 px-4 py-3 text-[15px] font-semibold text-brick-600"
          >
            {error === "invalid" ? "Geen toegang tot deze locatie." : error}
          </p>
        ) : null}

        {/* Eén locatie en geen foutmelding: direct doorkiezen. */}
        {!error && venues?.length === 1 ? (
          <AutoSelectVenue venueId={venues[0]!.id} />
        ) : null}

        <div className="flex flex-col gap-3.5">
          {venues && venues.length > 0 ? (
            venues.map((v, i) => {
              const style = VENUE_STYLES[i % VENUE_STYLES.length]!
              const Icon = style.Icon
              return (
                <form key={v.id} action={selectVenueAction}>
                  <input type="hidden" name="venueId" value={v.id} />
                  <button
                    type="submit"
                    style={{ "--venue-accent": style.accent } as React.CSSProperties}
                    className="flex w-full items-center gap-[22px] rounded-lg border border-line-strong bg-paper-bright p-6 text-left transition-[border-color,background] duration-[var(--dur-fast)] hover:border-[var(--venue-accent)] hover:bg-paper"
                  >
                    <span
                      className="flex h-16 w-16 flex-none items-center justify-center rounded-md"
                      style={{ background: style.accent }}
                    >
                      <Icon size={32} className="text-white" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[23px] font-extrabold leading-[1.1] text-charcoal-900">
                        {v.name}
                      </span>
                      <span className="mt-1.5 block text-[15px] font-medium leading-none text-charcoal-500">
                        {v.slug ?? "Locatie"}
                      </span>
                    </span>
                    <ChevronRight size={28} className="text-charcoal-400" />
                  </button>
                </form>
              )
            })
          ) : (
            <p className="text-[15px] font-medium text-charcoal-500">
              Geen actieve locaties. Vraag een manager om een venue aan te maken.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
