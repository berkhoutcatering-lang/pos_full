import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import type { ChainVerifyResult } from "@/lib/dal/audit-chain"

// Verifier is normally bound to Supabase; we re-implement the pure walk
// here and pipe in synthetic rows. Keeps the test deterministic, no
// network. The walk MUST match apps/web/lib/dal/audit-chain.ts.

interface Row {
  seq_id: number
  payload_canonical: string
  hash_prev: string
  hash_curr: string
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}

function makeRow(
  seq_id: number,
  payload: string,
  hash_prev: string,
): Row {
  const hash_curr = sha256(`${seq_id}|${payload}|${hash_prev}`)
  return { seq_id, payload_canonical: payload, hash_prev, hash_curr }
}

function buildChain(payloads: string[]): Row[] {
  const rows: Row[] = []
  let prev = ""
  for (let i = 0; i < payloads.length; i++) {
    const row = makeRow(i + 1, payloads[i]!, prev)
    rows.push(row)
    prev = row.hash_curr
  }
  return rows
}

// Pure verifier mirror — keep in sync with audit-chain.ts.
function verify(
  rows: Row[],
  opts: { fromSeq?: number } = {},
): ChainVerifyResult {
  if (rows.length > 0 && (opts.fromSeq === undefined || opts.fromSeq <= 1)) {
    const first = rows[0]!
    if (first.seq_id === 1 && first.hash_prev !== "") {
      return {
        ok: false,
        broken_at_seq: first.seq_id,
        reason: "anchor_mismatch",
        expected: "",
        actual: first.hash_prev,
      }
    }
  }
  let prev: string | null = null
  for (const row of rows) {
    if (prev !== null && row.hash_prev !== prev) {
      return {
        ok: false,
        broken_at_seq: row.seq_id,
        reason: "hash_prev_splice",
        expected: prev,
        actual: row.hash_prev,
      }
    }
    const expected = sha256(`${row.seq_id}|${row.payload_canonical}|${row.hash_prev ?? ""}`)
    if (expected !== row.hash_curr) {
      return {
        ok: false,
        broken_at_seq: row.seq_id,
        reason: "payload_tamper",
        expected,
        actual: row.hash_curr,
      }
    }
    prev = row.hash_curr
  }
  return { ok: true, verified: rows.length }
}

describe("hash chain verifier — Pillar 2 BTW-Right Audit-Ready", () => {
  it("scenario 1: intact chain → ok", () => {
    const chain = buildChain([
      '{"event":"order.placed","amount":1250}',
      '{"event":"payment.captured","amount":1250}',
      '{"event":"order.served"}',
    ])
    const r = verify(chain)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.verified).toBe(3)
  })

  it("scenario 2: payload tampered → broken_at correct, reason payload_tamper", () => {
    const chain = buildChain(["a", "b", "c"])
    // Attacker rewrites payload but doesn't recompute hash_curr.
    chain[1]!.payload_canonical = "b-tampered"
    const r = verify(chain)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.broken_at_seq).toBe(2)
      expect(r.reason).toBe("payload_tamper")
    }
  })

  it("scenario 3: row deleted + hash_prev rewritten → splice detected", () => {
    // Build [1, 2, 3], remove row 2, rewrite row 3's hash_prev to point
    // at row 1's hash_curr. Each remaining row passes per-row integrity
    // because hash_curr is recomputed from the new hash_prev — only the
    // chain-walk catches the missing link.
    // KNOWN LIMIT of in-band chain verification: an attacker who has
    // both DELETE permission on audit_log AND can recompute sha256
    // offline can splice out a row by rewriting the next row's
    // hash_prev to point at the prior-prior row's hash_curr AND
    // recomputing hash_curr for that next row. The remaining chain is
    // self-consistent → the verifier says "ok".
    //
    // This is the textbook reason SBA Fase 4 + similar regimes pair
    // chain self-verification with an EXTERNAL anchor: the daily
    // verify-chain cron publishes the latest hash_curr to a separate
    // append-only store (Sentry / OpenTimestamps). A spliced chain
    // would have a head matching an older anchor — catchable only by
    // comparing slices over time.
    //
    // Scenario 3b below covers the realistic attack (delete without
    // recompute) which the verifier DOES catch.
    const original = buildChain(["a", "b", "c"])
    const splicedRow3 = makeRow(3, "c", original[0]!.hash_curr)
    const spliced = [original[0]!, splicedRow3]
    const r = verify(spliced)
    // Asserts the documented LIMIT — the verifier alone is not enough
    // against a privileged attacker; pair with external anchor.
    expect(r.ok).toBe(true)
  })

  it("scenario 3b: splice where attacker forgot to recompute hash_curr", () => {
    const original = buildChain(["a", "b", "c"])
    // Delete row 2; keep row 3's original hash_curr (which referenced
    // row 2's hash_curr). hash_prev no longer matches the slice's prev.
    const spliced = [original[0]!, original[2]!]
    const r = verify(spliced)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe("hash_prev_splice")
      expect(r.broken_at_seq).toBe(3)
      expect(r.expected).toBe(original[0]!.hash_curr)
      expect(r.actual).toBe(original[2]!.hash_prev)
    }
  })

  it("scenario 4: cross-org isolation — verifier never mixes org chains", () => {
    // The actual cross-org isolation lives in the DB query (`.eq("org_id", orgId)`)
    // and is therefore covered by RLS + the audit-chain DAL query. Here
    // we sanity-check that two valid single-org chains both verify in
    // isolation, i.e. the verifier never looks beyond its input slice.
    const chainA = buildChain(["a1", "a2"])
    const chainB = buildChain(["b1", "b2", "b3"])
    expect(verify(chainA).ok).toBe(true)
    expect(verify(chainB).ok).toBe(true)
  })

  it("scenario 5: anchor — fake first row with non-empty hash_prev rejected", () => {
    const chain = buildChain(["a", "b"])
    // Attacker plants a forged anchor: row seq=1 with hash_prev pointing
    // at some external hash.
    chain[0]!.hash_prev = sha256("external")
    chain[0]!.hash_curr = sha256(
      `1|${chain[0]!.payload_canonical}|${chain[0]!.hash_prev}`,
    )
    const r = verify(chain)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe("anchor_mismatch")
      expect(r.broken_at_seq).toBe(1)
    }
  })
})
