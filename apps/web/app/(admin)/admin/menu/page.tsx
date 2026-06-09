import { requireRole, requireVenue } from "@/lib/dal/auth"
import { readMenu } from "@/lib/dal/pos-menu"
import { BTW_CLASS_LABEL } from "@/lib/pos/btw"

export const dynamic = "force-dynamic"

export default async function AdminMenuPage() {
  await requireRole("manager")
  const claims = await requireVenue()
  const menu = await readMenu(claims.orgId, claims.venueId)

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">Menu</h2>
      <p className="mb-3 text-sm opacity-70">
        Read-only weergave in deze fase. CRUD-editor in een volgende iteratie —
        items beheer je voor nu via Supabase Studio of een seed-migratie.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left">
            <th className="py-2">Naam</th>
            <th>Categorie</th>
            <th>Prijs</th>
            <th>BTW-klasse</th>
            <th>Kortbaar</th>
          </tr>
        </thead>
        <tbody>
          {menu.items.map((it) => (
            <tr key={it.id} className="border-b border-[var(--color-border)]">
              <td className="py-2 font-medium">{it.name}</td>
              <td className="opacity-80">{it.category}</td>
              <td>€{(it.base_price_cents / 100).toFixed(2)}</td>
              <td>{BTW_CLASS_LABEL[it.btw_class]}</td>
              <td>{it.is_discountable ? "ja" : "nee"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
