import { describe, expect, it } from "vitest"
import { canonicalJson, NonCanonicalValueError, CANONICAL_JSON_VERSION } from "@/lib/audit/canonical-json"

// Property-based regression suite for the canonical_json algorithm.
// Pillar #2 BTW-Right Audit-Ready.
//
// The DB-side function lives in 0002_helpers.sql + the CHECK from 0041.
// This file pins the Node-side behaviour. A separate integration test
// (not in this file) round-trips the SAME fixtures through Postgres via
// `select canonical_json($1::jsonb)` and asserts byte-equality.

describe("canonical_json — version pinned", () => {
  it(`exposes version ${CANONICAL_JSON_VERSION}`, () => {
    expect(CANONICAL_JSON_VERSION).toBe("2026-05-18-a")
  })
})

describe("canonical_json — deterministic output", () => {
  it("sorts object keys recursively", () => {
    const a = canonicalJson({ b: 1, a: 2, nested: { z: 1, a: 2 } })
    const b = canonicalJson({ a: 2, b: 1, nested: { a: 2, z: 1 } })
    expect(a).toBe(b)
    expect(a).toBe('{"a":2,"b":1,"nested":{"a":2,"z":1}}')
  })

  it("preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]")
    expect(canonicalJson([3, 1, 2])).not.toBe(canonicalJson([1, 2, 3]))
  })

  it("encodes strings via JSON.stringify (escapes quotes, backslashes)", () => {
    expect(canonicalJson('hello "world"')).toBe('"hello \\"world\\""')
    expect(canonicalJson("a\\b")).toBe('"a\\\\b"')
  })

  it("renders booleans + null without quotes", () => {
    expect(canonicalJson({ a: true, b: false, c: null })).toBe(
      '{"a":true,"b":false,"c":null}',
    )
  })

  it("renders integers without trailing .0", () => {
    expect(canonicalJson(1)).toBe("1")
    expect(canonicalJson(0)).toBe("0")
    expect(canonicalJson(-1250)).toBe("-1250")
  })

  it("renders BigInt as decimal string", () => {
    expect(canonicalJson(123456789012345n)).toBe("123456789012345")
  })
})

describe("canonical_json — rejects non-canonical input (matches SQL CHECK)", () => {
  it("rejects float", () => {
    expect(() => canonicalJson(1.5)).toThrow(NonCanonicalValueError)
  })

  it("rejects Infinity", () => {
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(
      NonCanonicalValueError,
    )
  })

  it("rejects NaN", () => {
    expect(() => canonicalJson(NaN)).toThrow(NonCanonicalValueError)
  })

  it("rejects nested float", () => {
    expect(() => canonicalJson({ amount: 12.5 })).toThrow(
      NonCanonicalValueError,
    )
  })

  it("rejects float inside array", () => {
    expect(() => canonicalJson([1, 2, 3.0001])).toThrow(NonCanonicalValueError)
  })

  it("accepts integer-valued whole-number floats? (NO — Number.isInteger(1.0) is true)", () => {
    // 1.0 in JS is indistinguishable from 1; this is intentional. The SQL
    // side never sees "1.0" because jsonb normalizes it, and the Node
    // side accepts integer-valued numbers.
    expect(canonicalJson(1.0)).toBe("1")
  })
})

describe("canonical_json — fixed fixtures (lock the bytes)", () => {
  const fixtures: Array<[string, unknown, string]> = [
    ["empty object", {}, "{}"],
    ["empty array", [], "[]"],
    ["nested empty", { a: {}, b: [] }, '{"a":{},"b":[]}'],
    [
      "order event",
      {
        canonical_json_version: "2026-05-18-a",
        event: "order.placed",
        order_id: "01HG…",
        total_incl_cents: 1750,
        items: [
          { name: "Broodje Pulled Pork", qty: 1, line_incl_cents: 950 },
          { name: "Coca-Cola", qty: 2, line_incl_cents: 600 },
        ],
      },
      // Keys sorted at every level; items[].name+qty+line_incl_cents
      // sorted alphabetically too.
      '{"canonical_json_version":"2026-05-18-a","event":"order.placed","items":[{"line_incl_cents":950,"name":"Broodje Pulled Pork","qty":1},{"line_incl_cents":600,"name":"Coca-Cola","qty":2}],"order_id":"01HG…","total_incl_cents":1750}',
    ],
  ]

  for (const [label, input, expected] of fixtures) {
    it(`fixture: ${label}`, () => {
      expect(canonicalJson(input)).toBe(expected)
    })
  }
})
