"use client"
import { useEffect, useMemo, useReducer, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { cartReducer, initialCart } from "@/lib/pos/cart-reducer"
import { priceCart } from "@/lib/pos/pricing"
import type { MenuItem, MenuSnapshot, ModifierGroup } from "@/lib/pos/types"
import { ProductGrid } from "./product-grid"
import { CategoryTabs } from "./category-tabs"
import { CartDrawer } from "./cart-drawer"
import { ModifierPicker } from "./modifier-picker"
import { ProductSearch } from "./product-search"
import { ConnectionChip } from "@/components/connection-chip"

export interface PosShellProps {
  initialMenu: MenuSnapshot
  claims: { orgId: string; venueId: string; role: string }
}

export function PosShell({ initialMenu, claims }: PosShellProps) {
  const [cart, dispatch] = useReducer(cartReducer, initialCart)
  const [menu, setMenu] = useState<MenuSnapshot>(initialMenu)

  // Realtime: manager flips availability / stock / price-override op
  // /admin/operational/* → kassa updates direct (≤500ms).
  useEffect(() => {
    const ch = supabase
      .channel(`org:${claims.orgId}:venue:${claims.venueId}:menu`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pos_menu_items",
          filter: `venue_id=eq.${claims.venueId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            stock_qty: number | null
            is_available_override: boolean | null
            price_override_cents: number | null
            price_override_expires_at: string | null
            base_price_cents: number
            is_active: boolean
          }
          const now = Date.now()
          const stockOut = row.stock_qty !== null && row.stock_qty <= 0
          const offByMgr = row.is_available_override === false
          const inactive = row.is_active === false
          const isAvailable = !inactive && !stockOut && !offByMgr
          const overrideActive =
            row.price_override_cents !== null &&
            (!row.price_override_expires_at ||
              new Date(row.price_override_expires_at).getTime() > now)
          const effective = overrideActive
            ? row.price_override_cents!
            : row.base_price_cents

          setMenu((cur) => {
            const exists = cur.items.find((i) => i.id === row.id)
            // Item became unavailable → remove from menu.
            if (!isAvailable) {
              return { ...cur, items: cur.items.filter((i) => i.id !== row.id) }
            }
            // Item updated → patch price.
            if (exists) {
              return {
                ...cur,
                items: cur.items.map((i) =>
                  i.id === row.id ? { ...i, base_price_cents: effective } : i,
                ),
              }
            }
            // Item became available again — we don't have full row data
            // (name/category etc.) from the realtime event; trigger a
            // soft refresh by reloading the page on next nav tick. For
            // v1 the manager flips "weer aan" between rushes which is
            // OK to require an explicit refresh.
            return cur
          })
        },
      )
      .subscribe()
    return () => {
      void ch.unsubscribe()
    }
  }, [claims.orgId, claims.venueId])

  const categories = useMemo(
    () => Array.from(new Set(menu.items.map((i) => i.category))),
    [menu.items],
  )
  const [category, setCategory] = useState<string>(categories[0] ?? "")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pickerFor, setPickerFor] = useState<MenuItem | null>(null)

  const priced = useMemo(
    () => priceCart(cart.items, menu.combos, menu.staffels),
    [cart.items, menu.combos, menu.staffels],
  )

  const modsForItem = (item: MenuItem): ModifierGroup[] =>
    menu.modifier_groups.filter((g) =>
      item.available_modifier_group_ids.includes(g.id),
    )

  const handleAdd = (item: MenuItem) => {
    const groups = modsForItem(item)
    const needsPicker = groups.some((g) => g.min_select > 0) || groups.length > 0
    if (needsPicker) {
      setPickerFor(item)
      return
    }
    dispatch({ type: "add", menu_item: item })
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <h1 className="text-sm font-semibold opacity-80">Kassa</h1>
        <ConnectionChip />
      </header>
      <CategoryTabs
        categories={categories}
        active={category}
        onChange={setCategory}
      />
      <div className="flex-1 overflow-auto p-3">
        <ProductGrid
          items={menu.items.filter((i) => i.category === category)}
          onAdd={handleAdd}
        />
      </div>
      <button
        onClick={() => setDrawerOpen(true)}
        className="m-3 min-h-[88px] rounded-xl bg-[var(--color-brand)] p-4 text-xl font-semibold text-white shadow-lg active:scale-[0.98]"
      >
        Bekijk bestelling — {cart.items.length}{" "}
        {cart.items.length === 1 ? "item" : "items"} — €
        {(priced.total_incl_cents / 100).toFixed(2)}
      </button>

      <CartDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cart={cart}
        priced={priced}
        dispatch={dispatch}
        claims={claims}
      />

      <ProductSearch items={menu.items} onPick={handleAdd} />

      {pickerFor ? (
        <ModifierPicker
          item={pickerFor}
          groups={modsForItem(pickerFor)}
          onConfirm={(modifiers, qty, note) => {
            dispatch({
              type: "add",
              menu_item: pickerFor,
              modifiers,
              qty,
              note,
            })
            setPickerFor(null)
          }}
          onCancel={() => setPickerFor(null)}
        />
      ) : null}
    </div>
  )
}
