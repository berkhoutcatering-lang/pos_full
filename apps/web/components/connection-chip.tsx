"use client"
import { useEffect } from "react"
import {
  startConnectionPolling,
  useConnectionStatus,
  type ConnectionState,
} from "@/lib/pos/connection-status"
import { cn } from "@/lib/cn"

const LABEL: Record<ConnectionState, string> = {
  live: "Live",
  connecting: "Verbinden…",
  pi_only: "Pi-only",
  outage: "Outage",
  offline: "Offline",
}

const DOT: Record<ConnectionState, string> = {
  live: "bg-hop-500",
  connecting: "bg-amber-600",
  pi_only: "bg-hop-300",
  outage: "bg-brick-600 animate-pulse motion-reduce:animate-none",
  offline: "bg-brick-600",
}

/** Chrome status chip. Designed for the charcoal top bars; `onLight`
 *  flips it for offwhite surfaces (admin topline). */
export function ConnectionChip({ onLight = false }: { onLight?: boolean }) {
  const state = useConnectionStatus((s) => s.state)
  const queued = useConnectionStatus((s) => s.queued_count)

  useEffect(() => {
    const stop = startConnectionPolling()
    return stop
  }, [])

  const label =
    state === "outage" || state === "offline"
      ? `${LABEL[state]} · ${queued} in wachtrij`
      : LABEL[state]

  return (
    <div
      role="status"
      aria-live="polite"
      title={`Verbindingsstatus: ${state}`}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[14px] font-bold leading-none",
        onLight
          ? "border-line-strong bg-paper-bright text-charcoal-800"
          : "border-charcoal-700 bg-transparent text-charcoal-300"
      )}
    >
      <span className={cn("h-[9px] w-[9px] rounded-full", DOT[state])} />
      {label}
    </div>
  )
}
