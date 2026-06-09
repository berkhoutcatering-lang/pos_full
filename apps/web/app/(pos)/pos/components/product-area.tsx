"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Beef, CupSoda, Plus } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { MenuItem } from "@/lib/pos/types"
import {
  accentForCategory,
  buildMenuGroups,
  labelForCategory,
  type GroupId,
} from "@/lib/pos/menu-groups"
import { CategoryTab } from "@/components/ui/category-tab"
import { ProductButton } from "@/components/ui/product-button"

const GROUP_ICONS: Record<GroupId, React.ReactNode> = {
  eten: <Beef size={26} />,
  drinken: <CupSoda size={26} />,
  extra: <Plus size={26} />,
}

// TanStack Virtual kicks in when the category has >40 items so a busy
// festival menu stays smooth on a €250 iPad.
const VIRTUAL_THRESHOLD = 40
const ROW_HEIGHT = 134 // 124 tile + 10 gap
const COLS = 4

export function ProductArea({
  items,
  onAdd,
}: {
  items: MenuItem[]
  onAdd: (m: MenuItem) => void
}) {
  const groups = useMemo(() => buildMenuGroups(items), [items])
  const allCategories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))),
    [items]
  )
  const [groupId, setGroupId] = useState<GroupId>(groups[0]?.id ?? "eten")
  const group = groups.find((g) => g.id === groupId) ?? groups[0]
  const cats = group?.categories ?? []
  const [cat, setCat] = useState<string>(cats[0] ?? "")

  useEffect(() => {
    if (!cats.includes(cat)) setCat(cats[0] ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, items])

  const activeCat = cats.includes(cat) ? cat : (cats[0] ?? "")
  const accent = accentForCategory(activeCat, allCategories.indexOf(activeCat))
  const products = items.filter((i) => i.category === activeCat)

  if (groups.length === 0) {
    return (
      <p className="p-4 text-[16px] font-semibold text-charcoal-500">
        Geen menu-items beschikbaar.
      </p>
    )
  }

  return (
    <section className="flex h-full min-h-0 gap-2.5">
      {/* Vertical group rail */}
      <nav className="flex w-[var(--rail-w)] flex-none flex-col gap-2.5">
        {groups.map((g) => (
          <CategoryTab
            key={g.id}
            orientation="vertical"
            label={g.label}
            icon={GROUP_ICONS[g.id]}
            accent={accentForCategory(
              g.categories[0] ?? "",
              allCategories.indexOf(g.categories[0] ?? "")
            )}
            active={groupId === g.id}
            onClick={() => setGroupId(g.id)}
            className="flex-1"
          />
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {/* Horizontal category bar */}
        <div className="flex flex-none gap-2.5 overflow-x-auto">
          {cats.map((cid) => (
            <CategoryTab
              key={cid}
              label={labelForCategory(cid)}
              count={items.filter((i) => i.category === cid).length}
              accent={accentForCategory(cid, allCategories.indexOf(cid))}
              active={activeCat === cid}
              onClick={() => setCat(cid)}
            />
          ))}
        </div>

        {/* Product tile grid */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {products.length > VIRTUAL_THRESHOLD ? (
            <VirtualGrid products={products} accent={accent} onAdd={onAdd} />
          ) : (
            <div className="grid grid-cols-4 gap-2.5 [grid-auto-rows:minmax(124px,auto)]">
              {products.map((p) => (
                <Tile key={p.id} item={p} accent={accent} onAdd={onAdd} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function Tile({
  item,
  accent,
  onAdd,
}: {
  item: MenuItem
  accent: string
  onAdd: (m: MenuItem) => void
}) {
  return (
    <ProductButton
      name={item.name}
      price={item.base_price_cents / 100}
      accent={accent}
      onClick={() => onAdd(item)}
      data-testid="product-card"
    />
  )
}

function VirtualGrid({
  products,
  accent,
  onAdd,
}: {
  products: MenuItem[]
  accent: string
  onAdd: (m: MenuItem) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const rows = Math.ceil(products.length / COLS)
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  })

  return (
    <div ref={parentRef} className="h-full overflow-auto" data-testid="virtual-grid">
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const start = row.index * COLS
          const slice = products.slice(start, start + COLS)
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
              }}
              className="grid grid-cols-4 gap-2.5 pb-2.5"
            >
              {slice.map((p) => (
                <Tile key={p.id} item={p} accent={accent} onAdd={onAdd} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
