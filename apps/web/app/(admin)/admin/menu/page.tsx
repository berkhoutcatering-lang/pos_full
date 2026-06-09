import { requireRole, requireVenue } from "@/lib/dal/auth"
import { readMenu } from "@/lib/dal/pos-menu"
import { BTW_CLASS_LABEL } from "@/lib/pos/btw"
import { accentForCategory, labelForCategory } from "@/lib/pos/menu-groups"
import { PageHead } from "@/components/admin/page-head"
import { Badge } from "@/components/ui/badge"
import { euroCents } from "@/lib/format"

export const dynamic = "force-dynamic"

export default async function AdminMenuPage() {
  await requireRole("manager")
  const claims = await requireVenue()
  const menu = await readMenu(claims.orgId, claims.venueId)

  const categories = Array.from(new Set(menu.items.map((i) => i.category)))

  return (
    <section>
      <PageHead
        eyebrow="Beheer"
        title="Menu"
        sub="Volledige menukaart met BTW-klasse per item. Snel aan/uit en voorraad doe je onder Operationeel."
      />
      <div className="flex flex-col gap-7">
        {categories.map((cat, ci) => (
          <div key={cat}>
            <div className="mb-3 flex items-center gap-2.5">
              <span
                className="h-3 w-3 rounded-[3px]"
                style={{ background: accentForCategory(cat, ci) }}
              />
              <span className="text-[17px] font-extrabold leading-none text-charcoal-900">
                {labelForCategory(cat)}
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-line-strong bg-paper-bright">
              {menu.items
                .filter((i) => i.category === cat)
                .map((it, i) => (
                  <div
                    key={it.id}
                    className={`flex items-center gap-4 px-5 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-bold leading-none text-charcoal-900">
                        {it.name}
                      </div>
                      <div className="mt-1 text-[13px] font-medium leading-none text-charcoal-500">
                        {BTW_CLASS_LABEL[it.btw_class]}
                        {!it.is_discountable ? " · niet kortbaar" : ""}
                      </div>
                    </div>
                    {it.available_modifier_group_ids.length > 0 ? (
                      <Badge variant="neutral" size="sm">
                        + opties
                      </Badge>
                    ) : null}
                    <span className="hb-tabular min-w-[78px] text-right text-[16px] font-bold leading-none text-charcoal-900">
                      {euroCents(it.base_price_cents)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
