export type OrderStatus = "placed" | "preparing" | "ready"
export type OrderStatusContrast = "normal" | "sun"

export interface OrderStatusVisual {
  accent: string
  soft: string
  foreground: string
  border: string
}

export const ORDER_STATUS_VISUALS: Record<
  OrderStatusContrast,
  Record<OrderStatus, OrderStatusVisual>
> = {
  normal: {
    placed: {
      accent: "#4C544E",
      soft: "#EEF0EC",
      foreground: "#FFFFFF",
      border: "#697069",
    },
    preparing: {
      accent: "#D97706",
      soft: "#FFF1DA",
      foreground: "#1B201D",
      border: "#B45309",
    },
    ready: {
      accent: "#15803D",
      soft: "#E4F4EA",
      foreground: "#FFFFFF",
      border: "#166534",
    },
  },
  sun: {
    placed: {
      accent: "#272D29",
      soft: "#E3E7E0",
      foreground: "#FFFFFF",
      border: "#1B201D",
    },
    preparing: {
      accent: "#F59E0B",
      soft: "#FFE4B5",
      foreground: "#1B201D",
      border: "#92400E",
    },
    ready: {
      accent: "#047857",
      soft: "#CCFBDF",
      foreground: "#FFFFFF",
      border: "#064E3B",
    },
  },
}

export function getOrderStatusVisual(
  status: OrderStatus,
  contrast: OrderStatusContrast = "normal",
) {
  return ORDER_STATUS_VISUALS[contrast][status]
}
