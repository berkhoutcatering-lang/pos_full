"use client"
import { supabase } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

// Channel naming: ALWAYS org + venue. Server-side Realtime filter pins the
// venue; RLS still enforces org. Defense in depth.
export type OrderEventType = "INSERT" | "UPDATE" | "DELETE"
export type OrderEvent =
  | { kind: "order"; event: OrderEventType; row: Record<string, unknown> }
  | { kind: "item"; event: OrderEventType; row: Record<string, unknown> }
  | { kind: "status"; status: string }

export function subscribeToVenueOrders(
  orgId: string,
  venueId: string,
  onEvent: (e: OrderEvent) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`org:${orgId}:venue:${venueId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pos_orders",
        filter: `venue_id=eq.${venueId}`,
      },
      (payload) => {
        onEvent({
          kind: "order",
          event: payload.eventType as OrderEventType,
          row: (payload.new ?? payload.old ?? {}) as Record<string, unknown>,
        })
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pos_order_items",
        filter: `venue_id=eq.${venueId}`,
      },
      (payload) => {
        onEvent({
          kind: "item",
          event: payload.eventType as OrderEventType,
          row: (payload.new ?? payload.old ?? {}) as Record<string, unknown>,
        })
      },
    )
    .subscribe((status) => {
      onEvent({ kind: "status", status })
    })

  return channel
}
