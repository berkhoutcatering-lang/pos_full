import { requireAuth } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { selectVenueAction } from "./actions"

type SearchParams = Promise<{ error?: string }>

export default async function SelectVenuePage({ searchParams }: { searchParams: SearchParams }) {
  const claims = await requireAuth()
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: venues } = await supabase
    .from("venues")
    .select("id, name")
    .eq("org_id", claims.orgId)
    .eq("active", true)
    .order("name")

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-bold">Kies je locatie</h1>
      {error ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error === "invalid" ? "Geen toegang tot deze locatie." : error}
        </p>
      ) : null}
      <div className="space-y-3">
        {venues && venues.length > 0 ? (
          venues.map((v) => (
            <form key={v.id} action={selectVenueAction}>
              <input type="hidden" name="venueId" value={v.id} />
              <button
                type="submit"
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left text-base font-medium hover:bg-[color-mix(in_oklch,var(--color-accent)_10%,transparent)]"
              >
                {v.name}
              </button>
            </form>
          ))
        ) : (
          <p className="text-sm opacity-70">
            Geen actieve locaties. Vraag een manager om een venue aan te maken.
          </p>
        )}
      </div>
    </main>
  )
}
