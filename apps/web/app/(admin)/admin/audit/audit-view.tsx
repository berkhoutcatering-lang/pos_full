"use client"
import { useState } from "react"
import {
  Play,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  Tag,
  ToggleLeft,
  Undo2,
  Wifi,
} from "lucide-react"
import { verifyChainAction } from "./actions"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"

interface Row {
  seq_id: number
  event_type: string
  actor: string
  hash_curr: string
  created_at: string
}

// Icon + accent per event-type family.
function eventMeta(type: string): { Icon: typeof Tag; color: string } {
  if (/price/i.test(type)) return { Icon: Tag, color: "var(--color-amber-600)" }
  if (/refund|void|retour/i.test(type))
    return { Icon: Undo2, color: "var(--color-brick-600)" }
  if (/avail|toggle|stock/i.test(type))
    return { Icon: ToggleLeft, color: "var(--color-charcoal-600)" }
  if (/bridge|device|pair/i.test(type))
    return { Icon: Wifi, color: "var(--color-hop-600)" }
  if (/close|z_report|day/i.test(type))
    return { Icon: ReceiptText, color: "var(--color-hop-600)" }
  if (/order|pay/i.test(type)) return { Icon: Play, color: "var(--color-hop-600)" }
  return { Icon: ScrollText, color: "var(--color-charcoal-600)" }
}

export function AuditView({ rows, orgId: _orgId }: { rows: Row[]; orgId: string }) {
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const verify = async () => {
    setVerifying(true)
    setResult(null)
    const oldest = rows[rows.length - 1]?.seq_id
    const newest = rows[0]?.seq_id
    const res = await verifyChainAction({ from_seq: oldest, to_seq: newest })
    setVerifying(false)
    // The action can return a plain error shape ({ ok: false, error }) as
    // well as the chain-verify union — both have ok:false, so discriminate
    // on the presence of `error` first, then on `ok` for intact vs broken.
    if ("error" in res) {
      setResult({ ok: false, text: `Hash chain check faalde: ${res.error}` })
      return
    }
    if (res.ok) {
      setResult({ ok: true, text: `Hash chain intact (${res.verified} events geverifieerd).` })
    } else {
      setResult({
        ok: false,
        text: `BREEKPUNT bij seq ${res.broken_at_seq}: verwacht ${res.expected.slice(0, 16)}…, gevonden ${res.actual.slice(0, 16)}…`,
      })
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          icon={<ShieldCheck size={18} />}
          onClick={verify}
          disabled={verifying}
        >
          {verifying ? "Verifiëren…" : "Verifieer hash chain"}
        </Button>
        {result ? (
          <span
            className={cn(
              "rounded-md px-3.5 py-2.5 text-[14px] font-semibold leading-none",
              result.ok ? "bg-hop-50 text-hop-800" : "bg-brick-100 text-brick-700"
            )}
          >
            {result.text}
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-line-strong bg-paper-bright">
        {rows.length === 0 ? (
          <p className="p-5 text-[14px] font-medium text-charcoal-500">
            Nog geen audit-events.
          </p>
        ) : (
          rows.map((e, i) => {
            const { Icon, color } = eventMeta(e.event_type)
            return (
              <div
                key={e.seq_id}
                className={cn(
                  "flex items-center gap-4 px-5 py-4",
                  i > 0 && "border-t border-line"
                )}
              >
                <span className="hb-tabular min-w-12 text-[14px] font-bold leading-none text-charcoal-500">
                  {new Date(e.created_at).toLocaleTimeString("nl-NL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md border border-line bg-paper">
                  <Icon size={18} style={{ color }} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold leading-none text-charcoal-900">
                    {e.event_type}
                  </div>
                  <div className="hb-tabular mt-1 truncate text-[13px] font-medium leading-[1.3] text-charcoal-500">
                    seq {e.seq_id} · {e.hash_curr.slice(0, 24)}…
                  </div>
                </div>
                <span className="hb-tabular text-[14px] font-semibold leading-none text-charcoal-500">
                  {e.actor}
                </span>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
