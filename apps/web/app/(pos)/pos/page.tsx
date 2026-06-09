import { requireRole, requireVenue } from "@/lib/dal/auth"
import { readMenu } from "@/lib/dal/pos-menu"
import { PosShell } from "./components/pos-shell"

export default async function PosPage() {
  await requireRole("cashier")
  const claims = await requireVenue()
  const menu = await readMenu(claims.orgId, claims.venueId)

  return (
    <PosShell
      initialMenu={menu}
      claims={{ orgId: claims.orgId, venueId: claims.venueId, role: claims.role }}
    />
  )
}
