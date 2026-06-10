import { requireAuth } from "@/lib/dal/auth"
import { PairView } from "./pair-view"

export const dynamic = "force-dynamic"

// Tablet-pairing: koppelt DIT apparaat aan de Pi-bridge. De manager
// genereert een code onder /admin → Apparaten; hier voer je hem in. De
// bridge zet een HttpOnly hb-pair cookie (30 dagen) waarmee de kassa
// rechtstreeks over LAN met de Pi praat.

export default async function PairPage() {
  await requireAuth()
  return <PairView />
}
