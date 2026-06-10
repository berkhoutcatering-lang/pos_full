import { requireAuth } from "@/lib/dal/auth"
import { KlantView } from "./klant-view"

export const dynamic = "force-dynamic"

// Klantdisplay van de kassa (tweede scherm van bv. een Sunmi T3): kijkt
// live mee met de bon — producten, aantallen, prijs — en toont na het
// afrekenen groot het afroepnummer. Open dit op het klantgerichte scherm.

export default async function KlantPage() {
  await requireAuth()
  return <KlantView />
}
