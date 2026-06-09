export type BtwClass =
  | "food_9"
  | "alcohol_21"
  | "soda_21"
  | "nonalc_beer_9"
  | "deposit_0"
  | "service_0"

export interface MenuItem {
  id: string
  name: string
  category: string
  base_price_cents: number
  btw_class: BtwClass
  is_discountable: boolean
  available_modifier_group_ids: string[]
  image_url?: string | null
}

export interface ModifierOption {
  id: string
  name: string
  surcharge_cents: number
}

export interface ModifierGroup {
  id: string
  name: string
  min_select: number
  max_select: number
  options: ModifierOption[]
}

export interface ComboDef {
  id: string
  name: string
  trigger_item_ids: string[]
  trigger_min_qty: Record<string, number>
  discount_cents: number
  active_from?: string | null
  active_to?: string | null
}

export interface StaffelDef {
  id: string
  applies_to_item_ids: string[]
  qty_threshold: number
  discount_per_extra_cents: number
}

export interface CartItem {
  cart_line_id: string
  menu_item: MenuItem
  qty: number
  selected_modifiers: ModifierOption[]
  note?: string
  combo_id?: string
}

export interface AppliedCombo {
  combo_id: string
  discount_cents: number
  involved_line_ids: string[]
}

export interface AppliedStaffel {
  staffel_id: string
  discount_cents: number
  involved_line_ids: string[]
}

export interface PricedCartLine extends CartItem {
  unit_price_cents: number
  modifier_total_cents: number
  line_discount_cents: number
  line_excl_cents: number
  line_btw_cents: number
  line_incl_cents: number
}

export interface PricedCart {
  items: PricedCartLine[]
  subtotal_cents: number
  discount_cents: number
  total_excl_cents: number
  total_btw_cents: number
  total_incl_cents: number
  applied_combos: AppliedCombo[]
  applied_staffels: AppliedStaffel[]
  btw_breakdown: Record<BtwClass, { excl: number; btw: number; incl: number }>
}

export interface MenuSnapshot {
  items: MenuItem[]
  modifier_groups: ModifierGroup[]
  combos: ComboDef[]
  staffels: StaffelDef[]
}
