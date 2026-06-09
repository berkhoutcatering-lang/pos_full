// Node-side mirror of the Postgres `canonical_json` function.
// Round 2 P0-3 — must produce byte-for-byte identical output to the
// SQL implementation in 0002_helpers.sql.
//
// Pillar #2 BTW-Right Audit-Ready.
//
// Algorithm v2026-05-18-a:
//   - object → "{" + sorted("key":value)... + "}"
//   - array  → "[" + value,value,...] + "]"
//   - string → JSON.stringify (double-quoted, escape sequences)
//   - integer → toString() (no leading zeros, no trailing .0)
//   - boolean → "true" / "false"
//   - null   → "null"
//   - non-integer numbers → throw (rejected upstream by Zod + SQL CHECK)
//
// Bump CANONICAL_JSON_VERSION whenever this body changes.

export const CANONICAL_JSON_VERSION = "2026-05-18-a"

export class NonCanonicalValueError extends Error {
  constructor(public readonly path: string, public readonly value: unknown) {
    super(
      `canonical_json: value at ${path} is not canonicalizable: ${JSON.stringify(value)}`,
    )
  }
}

function canonicalize(value: unknown, path: string): string {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new NonCanonicalValueError(path, value)
    }
    if (!Number.isInteger(value)) {
      throw new NonCanonicalValueError(path, value)
    }
    return value.toString()
  }
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return (
      "[" +
      value
        .map((v, i) => canonicalize(v, `${path}[${i}]`))
        .join(",") +
      "]"
    )
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return (
      "{" +
      keys
        .map((k) => {
          const encodedKey = JSON.stringify(k)
          return (
            encodedKey +
            ":" +
            canonicalize((value as Record<string, unknown>)[k], `${path}.${k}`)
          )
        })
        .join(",") +
      "}"
    )
  }
  throw new NonCanonicalValueError(path, value)
}

/**
 * Canonical JSON serializer that matches the SQL `canonical_json`
 * function byte-for-byte. Throws if the payload contains non-integer
 * numbers (the SQL CHECK `canonical_json_safe` enforces the same
 * contract on the DB side).
 */
export function canonicalJson(payload: unknown): string {
  return canonicalize(payload, "$")
}

/**
 * Build a payload object with the version pin attached. Use this on
 * every Pi-bridge audit event so future migrations can branch on
 * `canonical_json_version` if the algorithm changes.
 */
export function withCanonicalVersion<T extends Record<string, unknown>>(
  payload: T,
): T & { canonical_json_version: string } {
  return { ...payload, canonical_json_version: CANONICAL_JSON_VERSION }
}
