import { ulid, monotonicFactory } from "ulid"

/**
 * Generate a fresh ULID — used as `idempotency_key` on every mutation table.
 * 26 chars, lexicographically sortable, includes ms timestamp prefix.
 */
export function newId(): string {
  return ulid()
}

const monotonic = monotonicFactory()

/**
 * Monotonic ULID — guaranteed strictly increasing even within the same ms.
 * Use for outbox sequencing on the Pi-bridge where ordering matters.
 */
export function newMonotonicId(): string {
  return monotonic()
}

/** ULID regex (Crockford base32, 26 chars). */
export const ULID_RE = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/

export function isUlid(value: unknown): value is string {
  return typeof value === "string" && ULID_RE.test(value)
}
