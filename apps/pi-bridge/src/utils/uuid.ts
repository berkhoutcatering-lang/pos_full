/** Postgres accepteert alleen deze vorm als uuid. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Alleen doorgeven wat een uuid-kolom aankan.
 *
 * Tablets die vóór 20 augustus 2026 gekoppeld zijn dragen een ULID als
 * terminal_id, en dat veld belandt in kolommen die uuid zijn
 * (pos_audit_log.actor_terminal_id, pos_orders.created_by_terminal_id,
 * pos_order_state_changes.actor_terminal_id). Postgres weigert dat met
 * "invalid input syntax for type uuid" — en dan valt niet één veld weg maar de
 * hele rij: geen bestelling, geen audit-regel, niets in de boeken.
 *
 * Liever de herkomst kwijt dan de gebeurtenis. Wie het apparaat wil weten,
 * koppelt de tablet opnieuw.
 */
export function asUuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null
}
