import "server-only"
import { z } from "zod"

// Round 2 P0-3 — Zod refinement that mirrors the SQL CHECK
// canonical_json_safe(payload). Use on every audit-event submission
// before it hits the DB to fail fast with a clear error rather than a
// constraint violation.

function hasOnlyIntegerNumbers(value: unknown): boolean {
  if (value === null) return true
  if (typeof value === "number")
    return Number.isFinite(value) && Number.isInteger(value)
  if (Array.isArray(value)) return value.every(hasOnlyIntegerNumbers)
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(
      hasOnlyIntegerNumbers,
    )
  }
  return true
}

export const auditPayloadSchema = z
  .record(z.string(), z.unknown())
  .refine(hasOnlyIntegerNumbers, {
    message:
      "audit payload contains non-integer numbers; cents-only contract is violated",
  })
  .refine((p) => "canonical_json_version" in p, {
    message: "audit payload missing canonical_json_version pin",
  })

export type AuditPayload = z.infer<typeof auditPayloadSchema>
