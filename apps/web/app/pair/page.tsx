import { PairView } from "./pair-view"

export const dynamic = "force-dynamic"

// Tablet-pairing: koppelt DIT apparaat aan de Pi-bridge. Bewust ZONDER
// login bereikbaar — pairing gebeurt bij het inrichten van een verse
// tablet, vóór er iemand ingelogd is. De beveiliging zit in de 8-tekens
// pairing-code zelf (kort geldig, pi-bridge rate-limit 3/min + ban).

export default function PairPage() {
  return <PairView />
}
