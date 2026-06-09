"use client"
import { useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { MenuItem } from "@/lib/pos/types"

// TanStack Virtual kicks in when the category has >40 items so a busy
// festival menu stays smooth on a €250 iPad. Below that we render the
// straight grid (Doherty <100ms either way).

const VIRTUAL_THRESHOLD = 40
const ROW_HEIGHT = 112 // 88pt button + 16pt gap + 8pt padding
const COLS = 4

export function ProductGrid({
  items,
  onAdd,
}: {
  items: MenuItem[]
  onAdd: (m: MenuItem) => void
}) {
  if (items.length === 0) {
    return (
      <p className="p-4 text-sm opacity-70">
        Geen items in deze categorie.
      </p>
    )
  }

  if (items.length <= VIRTUAL_THRESHOLD) {
    return <PlainGrid items={items} onAdd={onAdd} />
  }
  return <VirtualGrid items={items} onAdd={onAdd} />
}

function PlainGrid({ items, onAdd }: { items: MenuItem[]; onAdd: (m: MenuItem) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((i) => (
        <ProductButton key={i.id} item={i} onAdd={onAdd} />
      ))}
    </div>
  )
}

function VirtualGrid({ items, onAdd }: { items: MenuItem[]; onAdd: (m: MenuItem) => void }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const rows = Math.ceil(items.length / COLS)
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  })

  return (
    <div ref={parentRef} className="h-full overflow-auto" data-testid="virtual-grid">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const start = row.index * COLS
          const slice = items.slice(start, start + COLS)
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
              className="grid grid-cols-4 gap-3 pb-3"
            >
              {slice.map((i) => (
                <ProductButton key={i.id} item={i} onAdd={onAdd} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProductButton({ item, onAdd }: { item: MenuItem; onAdd: (m: MenuItem) => void }) {
  return (
    <button
      onClick={() => onAdd(item)}
      className="flex min-h-[88px] flex-col justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left text-base shadow-sm active:scale-[0.98] active:bg-[color-mix(in_oklch,var(--color-accent)_20%,transparent)]"
      data-testid="product-card"
    >
      <span className="line-clamp-2 font-medium leading-tight">{item.name}</span>
      <span className="text-sm font-semibold">
        €{(item.base_price_cents / 100).toFixed(2)}
      </span>
    </button>
  )
}
