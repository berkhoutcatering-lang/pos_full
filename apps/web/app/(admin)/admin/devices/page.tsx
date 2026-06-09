import { requireRole, requireVenue } from "@/lib/dal/auth"
import { DevicesView } from "./devices-view"

export const dynamic = "force-dynamic"

export default async function DevicesPage() {
  await requireRole("manager")
  await requireVenue()
  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">Apparaten</h2>
      <p className="mb-3 text-sm opacity-70">
        Genereer een pairing-code en voer die in op de tablet bij{" "}
        <code>https://hopbites.local</code>.
      </p>
      <DevicesView />
    </section>
  )
}
