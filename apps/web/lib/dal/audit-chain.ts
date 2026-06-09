import "server-only"
import { createHash } from "node:crypto"
import { createClient } from "@/lib/supabase/server"

export interface AuditRow {
  seq_id: number
  org_id: string
  event_type: string
  payload: unknown
  payload_canonical: string
  hash_prev: string
  hash_curr: string
  created_at: string
}

export type ChainVerifyResult =
  | { ok: true; verified: number }
  | {
      ok: false
      broken_at_seq: number
      reason: "payload_tamper" | "hash_prev_splice" | "anchor_mismatch"
      expected: string
      actual: string
    }

/**
 * Recompute the SBA Fase 4 hash chain over a slice and report the FIRST
 * breakpoint. Three failure modes are detected:
 *
 * 1. payload_tamper — `hash_curr` does not match
 *    sha256(seq_id|payload_canonical|hash_prev). Someone edited payload
 *    or hash_prev without recomputing hash_curr.
 *
 * 2. hash_prev_splice — `hash_prev` does not match the previous row's
 *    `hash_curr`. Someone deleted a row (or several) and rewrote the
 *    next row's hash_prev. Per-row integrity passes but the chain has
 *    a hole.
 *
 * 3. anchor_mismatch — when starting at seq_id 1 of an org, hash_prev
 *    must be the empty string. If it isn't, the chain was forged
 *    (someone planted a fake "first" row).
 *
 * Pillar #2 BTW-Right Audit-Ready.
 */
export async function verifyHashChain(args: {
  orgId: string
  fromSeq?: number
  toSeq?: number
  limit?: number
}): Promise<ChainVerifyResult> {
  const supabase = await createClient()
  let q = supabase
    .from("pos_audit_log")
    .select("seq_id, payload_canonical, hash_prev, hash_curr")
    .eq("org_id", args.orgId)
    .order("seq_id", { ascending: true })
    .limit(args.limit ?? 1000)
  if (args.fromSeq !== undefined) q = q.gte("seq_id", args.fromSeq)
  if (args.toSeq !== undefined) q = q.lte("seq_id", args.toSeq)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as Array<{
    seq_id: number
    payload_canonical: string
    hash_prev: string
    hash_curr: string
  }>

  // Anchor check — if we're starting at the very beginning of this org's
  // chain, hash_prev MUST be the empty string. Otherwise an attacker
  // planted a forged "first" row pointing at an external hash.
  if (rows.length > 0 && (args.fromSeq === undefined || args.fromSeq <= 1)) {
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

  let prevHashCurr: string | null = null
  for (const row of rows) {
    // 1. Splice check — row's hash_prev MUST equal the previous row's
    //    hash_curr (within this slice). On the first row of the slice
    //    we trust the DB; the anchor check above covers seq_id=1.
    if (prevHashCurr !== null && row.hash_prev !== prevHashCurr) {
      return {
        ok: false,
        broken_at_seq: row.seq_id,
        reason: "hash_prev_splice",
        expected: prevHashCurr,
        actual: row.hash_prev,
      }
    }

    // 2. Per-row integrity — recompute hash_curr from inputs.
    const expected = createHash("sha256")
      .update(`${row.seq_id}|${row.payload_canonical}|${row.hash_prev ?? ""}`)
      .digest("hex")
    if (expected !== row.hash_curr) {
      return {
        ok: false,
        broken_at_seq: row.seq_id,
        reason: "payload_tamper",
        expected,
        actual: row.hash_curr,
      }
    }

    prevHashCurr = row.hash_curr
  }

  return { ok: true, verified: rows.length }
}
