import type {
  AppliedCombo,
  AppliedStaffel,
  BtwClass,
  CartItem,
  ComboDef,
  PricedCart,
  PricedCartLine,
  StaffelDef,
} from "./types"
import { btwRateFor } from "./btw"

// Pure, deterministic — runs client-side on every cart change. No AI. No
// network. INP-safe (<1ms on a 30-item cart).

interface LineBase extends CartItem {
  unit_price_cents: number
  modifier_total_cents: number
  line_incl_pre_disc: number
}

export function priceCart(
  items: CartItem[],
  combos: ComboDef[],
  staffels: StaffelDef[],
): PricedCart {
  const linesBase: LineBase[] = items.map((it) => {
    const modSumPerUnit = it.selected_modifiers.reduce(
      (s, m) => s + m.surcharge_cents,
      0,
    )
    const unit = it.menu_item.base_price_cents
    const lineIncl = (unit + modSumPerUnit) * it.qty
    return {
      ...it,
      unit_price_cents: unit,
      modifier_total_cents: modSumPerUnit * it.qty,
      line_incl_pre_disc: lineIncl,
    }
  })

  const appliedCombos = detectCombos(linesBase, combos)
  const appliedStaffels = detectStaffels(linesBase, staffels, appliedCombos)

  // Distribute discounts to lines proportionally so the BTW class accounting
  // stays correct (combo across mixed-rate items splits the discount
  // proportionally before BTW is computed).
  const lineDiscounts = new Map<string, number>()

  for (const c of appliedCombos) {
    const involved = linesBase.filter((l) => c.involved_line_ids.includes(l.cart_line_id))
    const totalInvolved = involved.reduce((s, l) => s + l.line_incl_pre_disc, 0)
    let remaining = c.discount_cents
    involved.forEach((l, idx) => {
      const isLast = idx === involved.length - 1
      const share = isLast
        ? remaining
        : totalInvolved > 0
          ? Math.round((l.line_incl_pre_disc / totalInvolved) * c.discount_cents)
          : 0
      remaining -= share
      lineDiscounts.set(
        l.cart_line_id,
        (lineDiscounts.get(l.cart_line_id) ?? 0) + share,
      )
    })
  }

  for (const s of appliedStaffels) {
    const ids = s.involved_line_ids
    if (ids.length === 0) continue
    let remaining = s.discount_cents
    ids.forEach((lid, idx) => {
      const isLast = idx === ids.length - 1
      const share = isLast ? remaining : Math.round(s.discount_cents / ids.length)
      remaining -= share
      lineDiscounts.set(lid, (lineDiscounts.get(lid) ?? 0) + share)
    })
  }

  const pricedLines: PricedCartLine[] = linesBase.map((l) => {
    const lineDisc = lineDiscounts.get(l.cart_line_id) ?? 0
    const lineIncl = Math.max(0, l.line_incl_pre_disc - lineDisc)
    const rate = btwRateFor(l.menu_item.btw_class)
    const lineExcl =
      rate === 0 ? lineIncl : Math.round(lineIncl / (1 + rate / 100))
    const lineBtw = lineIncl - lineExcl
    return {
      cart_line_id: l.cart_line_id,
      menu_item: l.menu_item,
      qty: l.qty,
      selected_modifiers: l.selected_modifiers,
      note: l.note,
      combo_id: l.combo_id,
      unit_price_cents: l.unit_price_cents,
      modifier_total_cents: l.modifier_total_cents,
      line_discount_cents: lineDisc,
      line_excl_cents: lineExcl,
      line_btw_cents: lineBtw,
      line_incl_cents: lineIncl,
    }
  })

  const subtotal_cents = linesBase.reduce((s, l) => s + l.line_incl_pre_disc, 0)
  const discount_cents = Array.from(lineDiscounts.values()).reduce(
    (s, v) => s + v,
    0,
  )
  const total_incl_cents = pricedLines.reduce((s, l) => s + l.line_incl_cents, 0)
  const total_btw_cents = pricedLines.reduce((s, l) => s + l.line_btw_cents, 0)
  const total_excl_cents = total_incl_cents - total_btw_cents

  const btw_breakdown: PricedCart["btw_breakdown"] = {
    food_9: { excl: 0, btw: 0, incl: 0 },
    alcohol_21: { excl: 0, btw: 0, incl: 0 },
    soda_21: { excl: 0, btw: 0, incl: 0 },
    nonalc_beer_9: { excl: 0, btw: 0, incl: 0 },
    deposit_0: { excl: 0, btw: 0, incl: 0 },
    service_0: { excl: 0, btw: 0, incl: 0 },
  }
  for (const l of pricedLines) {
    const cls: BtwClass = l.menu_item.btw_class
    btw_breakdown[cls].excl += l.line_excl_cents
    btw_breakdown[cls].btw += l.line_btw_cents
    btw_breakdown[cls].incl += l.line_incl_cents
  }

  return {
    items: pricedLines,
    subtotal_cents,
    discount_cents,
    total_excl_cents,
    total_btw_cents,
    total_incl_cents,
    applied_combos: appliedCombos,
    applied_staffels: appliedStaffels,
    btw_breakdown,
  }
}

function detectCombos(lines: LineBase[], combos: ComboDef[]): AppliedCombo[] {
  const out: AppliedCombo[] = []
  const now = new Date()
  for (const c of combos) {
    if (c.active_from && new Date(c.active_from) > now) continue
    if (c.active_to && new Date(c.active_to) < now) continue

    const ok = c.trigger_item_ids.every((id) => {
      const tot = lines
        .filter((l) => l.menu_item.id === id && l.menu_item.is_discountable)
        .reduce((s, l) => s + l.qty, 0)
      const min = c.trigger_min_qty[id] ?? 1
      return tot >= min
    })
    if (!ok) continue

    const involved_line_ids = lines
      .filter(
        (l) =>
          c.trigger_item_ids.includes(l.menu_item.id) && l.menu_item.is_discountable,
      )
      .map((l) => l.cart_line_id)
    if (involved_line_ids.length === 0) continue

    out.push({
      combo_id: c.id,
      discount_cents: c.discount_cents,
      involved_line_ids,
    })
  }
  return out
}

function detectStaffels(
  lines: LineBase[],
  staffels: StaffelDef[],
  appliedCombos: AppliedCombo[],
): AppliedStaffel[] {
  const inCombo = new Set(appliedCombos.flatMap((c) => c.involved_line_ids))
  const out: AppliedStaffel[] = []
  for (const s of staffels) {
    const eligible = lines.filter(
      (l) =>
        l.menu_item.is_discountable &&
        !inCombo.has(l.cart_line_id) &&
        (s.applies_to_item_ids.includes("*") ||
          s.applies_to_item_ids.includes(l.menu_item.id)),
    )
    const totalQty = eligible.reduce((sum, l) => sum + l.qty, 0)
    if (totalQty < s.qty_threshold) continue
    const extras = totalQty - s.qty_threshold + 1
    const discount = extras * s.discount_per_extra_cents
    if (discount <= 0) continue
    out.push({
      staffel_id: s.id,
      discount_cents: discount,
      involved_line_ids: eligible.map((l) => l.cart_line_id),
    })
  }
  return out
}
