"use server"
import { z } from "zod"
import { requireRole, requireVenue } from "@/lib/dal/auth"
import { verifyHashChain } from "@/lib/dal/audit-chain"

const Schema = z.object({
  from_seq: z.number().int().nonnegative().optional(),
  to_seq: z.number().int().nonnegative().optional(),
})

export async function verifyChainAction(raw: unknown) {
  await requireRole("owner")
  const claims = await requireVenue()
  const parsed = Schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "validation" } as const
  try {
    const res = await verifyHashChain({
      orgId: claims.orgId,
      fromSeq: parsed.data.from_seq,
      toSeq: parsed.data.to_seq,
    })
    return res
  } catch (err) {
    return { ok: false, error: (err as Error).message } as const
  }
}
