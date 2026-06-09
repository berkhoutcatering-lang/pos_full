"use client"
import { create } from "zustand"
import { toast } from "sonner"

// Single source of truth for connection state across all operator
// surfaces (kassa, KDS, CFD, admin). Drives the ConnectionChip + the
// cash-only fallback affordance on /pos.
//
// Pillar #1 Pi-Edge Cloud-Truth — when Pi is up but cloud is down the
// kassa stays operational; when both are down we fall back to cash-only
// with a local IndexedDB outbox.

export type ConnectionState =
  | "live"          // Pi + cloud both reachable, Realtime SUBSCRIBED
  | "connecting"    // Realtime reconnecting (CHANNEL_ERROR/TIMED_OUT)
  | "pi_only"       // Cloud unreachable, Pi-bridge taking writes
  | "outage"        // Pi unreachable, writes queued in local outbox
  | "offline"       // Both unreachable — cash-only mode

interface ConnectionStatusStore {
  state: ConnectionState
  pi_ok: boolean
  cloud_ok: boolean
  realtime_status: string
  queued_count: number
  last_pi_check_ms: number
  last_transition_ms: number

  // Setters used by the polling hook below.
  setPi: (ok: boolean) => void
  setCloud: (ok: boolean) => void
  setRealtime: (status: string) => void
  setQueued: (n: number) => void
}

function deriveState(pi_ok: boolean, cloud_ok: boolean, realtime_status: string): ConnectionState {
  if (!pi_ok && !cloud_ok) return "offline"
  if (!pi_ok) return "outage"
  if (!cloud_ok) return "pi_only"
  if (realtime_status === "SUBSCRIBED") return "live"
  return "connecting"
}

const TOAST_FOR_TRANSITION: Partial<Record<ConnectionState, { type: "success" | "warning" | "error"; msg: string }>> = {
  live: { type: "success", msg: "Verbinding hersteld" },
  pi_only: { type: "warning", msg: "Cloud bereikbaar, Pi neemt over" },
  outage: { type: "warning", msg: "Geen netwerk · cash-modus actief" },
  offline: { type: "error", msg: "Geen verbinding · cash-modus actief, orders lokaal in wachtrij" },
}

// Round 3 P1-2 — debounce so rapid pi+cloud transitions in the same
// microtask coalesce to a single toast for the FINAL state.
let toastDebounceTimer: ReturnType<typeof setTimeout> | null = null
let toastPendingState: ConnectionState | null = null
const TOAST_DEBOUNCE_MS = 300

function scheduleToast(next: ConnectionState) {
  toastPendingState = next
  if (toastDebounceTimer) clearTimeout(toastDebounceTimer)
  toastDebounceTimer = setTimeout(() => {
    const state = toastPendingState
    toastDebounceTimer = null
    toastPendingState = null
    if (!state) return
    const t = TOAST_FOR_TRANSITION[state]
    if (t) toast[t.type](t.msg)
  }, TOAST_DEBOUNCE_MS)
}

export const useConnectionStatus = create<ConnectionStatusStore>((set, get) => ({
  state: "connecting",
  pi_ok: false,
  cloud_ok: false,
  realtime_status: "INIT",
  queued_count: 0,
  last_pi_check_ms: 0,
  last_transition_ms: Date.now(),

  setPi: (ok) => {
    const prev = get().state
    const next = deriveState(ok, get().cloud_ok, get().realtime_status)
    set({ pi_ok: ok, last_pi_check_ms: Date.now() })
    if (next !== prev) {
      set({ state: next, last_transition_ms: Date.now() })
      scheduleToast(next)
    }
  },
  setCloud: (ok) => {
    const prev = get().state
    const next = deriveState(get().pi_ok, ok, get().realtime_status)
    set({ cloud_ok: ok })
    if (next !== prev) {
      set({ state: next, last_transition_ms: Date.now() })
      scheduleToast(next)
    }
  },
  setRealtime: (status) => {
    const prev = get().state
    const next = deriveState(get().pi_ok, get().cloud_ok, status)
    set({ realtime_status: status })
    if (next !== prev) {
      set({ state: next, last_transition_ms: Date.now() })
      scheduleToast(next)
    }
  },
  setQueued: (n) => set({ queued_count: n }),
}))

const PI_HEALTH_URL = process.env.NEXT_PUBLIC_PI_BRIDGE_URL ?? "https://hopbites.local:3001"

/**
 * Kick off the background pollers. Call from a root client component
 * exactly once per session (the ConnectionChip mounts in the operator
 * layout shells).
 */
export function startConnectionPolling() {
  const pi = useConnectionStatus.getState()

  // Pi-bridge liveness ping every 10s with a tight 2s timeout so a dead
  // bridge fails fast.
  const tickPi = async () => {
    try {
      const res = await fetch(`${PI_HEALTH_URL}/_health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
        cache: "no-store",
        credentials: "include",
      })
      pi.setPi(res.ok)
    } catch {
      pi.setPi(false)
    }
  }

  // Cloud check uses navigator.onLine as a coarse signal + a tiny GET to
  // the same-origin /api/_ping. Browsers always set navigator.onLine to
  // true on captive-portal networks, so we trust the round-trip.
  const tickCloud = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      pi.setCloud(false)
      return
    }
    try {
      const res = await fetch(`/api/_ping`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      })
      pi.setCloud(res.ok)
    } catch {
      pi.setCloud(false)
    }
  }

  void tickPi()
  void tickCloud()
  const piInt = setInterval(tickPi, 10_000)
  const cloudInt = setInterval(tickCloud, 15_000)

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void tickCloud())
    window.addEventListener("offline", () => pi.setCloud(false))
  }

  return () => {
    clearInterval(piInt)
    clearInterval(cloudInt)
  }
}
