"use client"
import { useEffect } from "react"
import {
  startConnectionPolling,
  useConnectionStatus,
  type ConnectionState,
} from "@/lib/pos/connection-status"

const LABEL: Record<ConnectionState, string> = {
  live: "● live",
  connecting: "○ verbinden…",
  pi_only: "⚡ Pi-only",
  outage: "⚠️ outage",
  offline: "⛔ offline",
}

const STYLE: Record<ConnectionState, string> = {
  live: "bg-emerald-50 text-emerald-800 border-emerald-300",
  connecting: "bg-amber-50 text-amber-800 border-amber-300",
  pi_only: "bg-blue-50 text-blue-800 border-blue-300",
  outage: "bg-red-50 text-red-800 border-red-300 animate-pulse motion-reduce:animate-none",
  offline: "bg-red-100 text-red-900 border-red-500",
}

export function ConnectionChip() {
  const state = useConnectionStatus((s) => s.state)
  const queued = useConnectionStatus((s) => s.queued_count)

  useEffect(() => {
    const stop = startConnectionPolling()
    return stop
  }, [])

  const label = state === "outage" || state === "offline"
    ? `${LABEL[state]} · ${queued} queued`
    : LABEL[state]

  return (
    <div
      role="status"
      aria-live="polite"
      title={`Verbindingsstatus: ${state}`}
      className={`inline-flex h-9 min-w-[88px] items-center justify-center rounded-full border px-3 text-xs font-medium ${STYLE[state]}`}
    >
      {label}
    </div>
  )
}
