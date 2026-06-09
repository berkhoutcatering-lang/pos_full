import { ulid } from "ulid"
import type { CartItem, MenuItem, ModifierOption } from "./types"

export type CartState = {
  items: CartItem[]
  customer_name?: string
  customer_email?: string
  notes?: string
}

export type CartAction =
  | {
      type: "add"
      menu_item: MenuItem
      modifiers?: ModifierOption[]
      qty?: number
      note?: string
    }
  | { type: "update_qty"; cart_line_id: string; qty: number }
  | { type: "update_modifiers"; cart_line_id: string; modifiers: ModifierOption[] }
  | { type: "update_note"; cart_line_id: string; note: string }
  | { type: "remove"; cart_line_id: string }
  | { type: "set_customer"; name?: string; email?: string }
  | { type: "set_order_note"; note: string }
  | { type: "clear" }

export const initialCart: CartState = { items: [] }

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const existing = state.items.find(
        (i) =>
          i.menu_item.id === action.menu_item.id &&
          sameModifiers(i.selected_modifiers, action.modifiers ?? []) &&
          !i.note &&
          !action.note,
      )
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.cart_line_id === existing.cart_line_id
              ? { ...i, qty: i.qty + (action.qty ?? 1) }
              : i,
          ),
        }
      }
      return {
        ...state,
        items: [
          ...state.items,
          {
            cart_line_id: ulid(),
            menu_item: action.menu_item,
            qty: action.qty ?? 1,
            selected_modifiers: action.modifiers ?? [],
            note: action.note,
          },
        ],
      }
    }
    case "update_qty": {
      if (action.qty <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.cart_line_id !== action.cart_line_id),
        }
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.cart_line_id === action.cart_line_id ? { ...i, qty: action.qty } : i,
        ),
      }
    }
    case "update_modifiers":
      return {
        ...state,
        items: state.items.map((i) =>
          i.cart_line_id === action.cart_line_id
            ? { ...i, selected_modifiers: action.modifiers }
            : i,
        ),
      }
    case "update_note":
      return {
        ...state,
        items: state.items.map((i) =>
          i.cart_line_id === action.cart_line_id ? { ...i, note: action.note } : i,
        ),
      }
    case "remove":
      return {
        ...state,
        items: state.items.filter((i) => i.cart_line_id !== action.cart_line_id),
      }
    case "set_customer":
      return { ...state, customer_name: action.name, customer_email: action.email }
    case "set_order_note":
      return { ...state, notes: action.note }
    case "clear":
      return initialCart
    default:
      return state
  }
}

function sameModifiers(a: ModifierOption[], b: ModifierOption[]): boolean {
  if (a.length !== b.length) return false
  const aIds = [...a].map((m) => m.id).sort()
  const bIds = [...b].map((m) => m.id).sort()
  return aIds.every((id, i) => id === bIds[i])
}
