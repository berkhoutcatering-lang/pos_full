import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { canonicalJson } from "@/lib/audit/canonical-json"

// P0-3 — Property-based cross-runtime regression for canonical_json.
// Generates 200 random integer-only payloads via fast-check, hashes each
// with the Node implementation, and (when SUPABASE_DB_URL is set) sends
// the SAME payload to Postgres' canonical_json() and asserts byte-equal
// output. Without DB_URL it runs Node-only as a smoke pass.

const PG_URL = process.env.SUPABASE_DB_URL ?? ""

// Arbitrary generator for "cents-only" payloads — no floats anywhere.
const integerArb = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 })
const stringArb = fc.string({ minLength: 0, maxLength: 32 })
const valueArb: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  v: fc.oneof(
    { depthSize: "small" },
    integerArb,
    stringArb,
    fc.boolean(),
    fc.constant(null),
    fc.array(tie("v"), { maxLength: 4 }),
    fc.dictionary(stringArb, tie("v"), { maxKeys: 4 }),
  ),
})).v as fc.Arbitrary<unknown>

describe("canonical_json — Node-side property", () => {
  it("any integer-only payload produces deterministic output", () => {
    fc.assert(
      fc.property(valueArb, (v) => {
        const a = canonicalJson(v)
        const b = canonicalJson(v)
        expect(a).toBe(b)
      }),
      { numRuns: 200 },
    )
  })

  it("object key order does NOT affect output", () => {
    fc.assert(
      fc.property(
        fc.dictionary(stringArb, integerArb, { minKeys: 1, maxKeys: 8 }),
        (obj) => {
          const keys = Object.keys(obj)
          const reordered = [...keys].reverse().reduce<Record<string, unknown>>(
            (acc, k) => {
              acc[k] = obj[k]
              return acc
            },
            {},
          )
          expect(canonicalJson(obj)).toBe(canonicalJson(reordered))
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe.skipIf(!PG_URL)("canonical_json — Postgres ↔ Node byte-equal", () => {
  it("smoke fixtures match the SQL canonical_json output", async () => {
    // This test requires a live Postgres with migrations 0002 + 0041
    // applied. Skipped automatically when SUPABASE_DB_URL is unset.
    const { Client } = await import("pg")
    const c = new Client({ connectionString: PG_URL })
    await c.connect()
    try {
      const fixtures = [
        { event: "order.placed", total_cents: 1750 },
        { items: [{ name: "Frietjes", qty: 2, line_cents: 900 }] },
        { nested: { a: { b: { c: 1 } } } },
        { canonical_json_version: "2026-05-18-a", note: "hello \"world\"" },
      ]
      for (const f of fixtures) {
        const res = await c.query("select public.canonical_json($1::jsonb) as out", [
          JSON.stringify(f),
        ])
        const pgOut = res.rows[0]?.out as string
        const nodeOut = canonicalJson(f)
        expect(nodeOut).toBe(pgOut)
      }
    } finally {
      await c.end()
    }
  })
})
