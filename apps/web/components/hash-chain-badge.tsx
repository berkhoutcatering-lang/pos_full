"use client"
import { useEffect, useState } from "react"

// Pillar 2 surface — shows the live hash-chain status on /admin
// surfaces. Pings /api/admin/chain-status which returns ok/broken plus
// total verified rows. Cached for 60s on the server.

type State = "loading" | "intact" | "broken" | "error"

interface ChainStatus {
  ok: boolean
  verified?: number
  broken_at_seq?: number
  reason?: string
}

export function HashChainBadge() {
  const [state, setState] = useState<State>("loading")
  const [data, setData] = useState<ChainStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const res = await fetch("/api/admin/chain-status", { cache: "no-store" })
        if (!res.ok) {
          if (!cancelled) setState("error")
          return
        }
        const body = (await res.json()) as ChainStatus
        if (cancelled) return
        setData(body)
        setState(body.ok ? "intact" : "broken")
      } catch {
        if (!cancelled) setState("error")
      }
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [])

  const label =
    state === "loading"
      ? "🔒 chain check…"
      : state === "intact"
        ? `🔒 chain intact (${data?.verified ?? 0})`
        : state === "broken"
          ? `⚠️ chain breekt bij seq ${data?.broken_at_seq}`
          : "🔒 chain check faalde"

  const cls =
    state === "intact"
      ? "border-hop-300 bg-hop-50 text-hop-800"
      : state === "broken"
        ? "border-brick-600 bg-brick-100 text-brick-700"
        : "border-line-strong bg-paper-bright text-charcoal-500"

  return (
    <span
      role="status"
      className={`hb-tabular inline-flex min-h-[26px] items-center rounded-sm border px-2.5 py-1 text-[13px] font-bold leading-none ${cls}`}
      title={data?.reason ?? state}
    >
      {label}
    </span>
  )
}
