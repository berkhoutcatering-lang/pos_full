import { config } from "../config.js"
import { enqueueOutbox } from "../db/outbox.js"
import { logger } from "../utils/logger.js"
import { newId } from "../utils/ulid.js"

/**
 * Een betaling in de boeken zetten.
 *
 * Tot 20 augustus 2026 gebeurde dit nergens: pos_payments bestond, de
 * dagafsluiting en de AVG-export lazen eruit, maar niets vulde hem. Een bon
 * werd geprint en de bestelling afgerond, en het bedrag stond daarna alleen in
 * de audit-log als payment.captured — niet als bedrag dat je kunt optellen,
 * splitsen naar contant en pin, of terugvinden op een bankafschrift.
 *
 * Gaat via dezelfde outbox als de bestellingen: eerst lokaal, dan naar Supabase
 * zodra dat kan. Een truck zonder internet moet gewoon door kunnen draaien.
 */
export interface RecordedPayment {
  /** Eigen sleutel voor déze betaalregel — niet die van de bestelling. */
  idempotency_key?: string
  order_id: string
  venue_id?: string
  method: "cash" | "pin" | "ideal" | "gift_card" | "other"
  status?: "pending" | "authorized" | "captured" | "failed" | "refunded" | "voided"
  amount_cents: number
  mypos_transaction_id?: string | null
  mollie_payment_id?: string | null
  cash_given_cents?: number | null
  cash_change_cents?: number | null
  captured_at?: string | null
  failed_at?: string | null
  failure_reason?: string | null
}

export function recordPayment(p: RecordedPayment): { enqueued: boolean; reason?: string } {
  const venue_id = p.venue_id ?? config.VENUE_ID
  const idempotency_key = p.idempotency_key ?? newId()

  const enqueued = enqueueOutbox({
    idempotency_key,
    operation: "insert",
    table_name: "pos_payments",
    payload: {
      idempotency_key,
      order_id: p.order_id,
      org_id: config.ORG_ID,
      venue_id,
      method: p.method,
      status: p.status ?? "captured",
      amount_cents: p.amount_cents,
      mypos_transaction_id: p.mypos_transaction_id ?? null,
      mollie_payment_id: p.mollie_payment_id ?? null,
      cash_given_cents: p.cash_given_cents ?? null,
      cash_change_cents: p.cash_change_cents ?? null,
      captured_at: p.captured_at ?? new Date().toISOString(),
      failed_at: p.failed_at ?? null,
      failure_reason: p.failure_reason ?? null,
    },
    venue_id,
  })

  if (!enqueued.enqueued) {
    // Hier stopt de administratie, niet de verkoop: de klant heeft betaald en
    // zijn bon. Luid loggen, want dit moet iemand zien.
    logger.error(
      { order_id: p.order_id, method: p.method, reason: enqueued.reason },
      "payment could not be queued for the books",
    )
  }

  return enqueued
}
