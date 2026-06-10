"use client"

// Sync tussen kassa en het klantdisplay (bv. het tweede scherm van een
// Sunmi T3). Twee transports tegelijk:
//  1. BroadcastChannel — instant, voor twee vensters in dezelfde browser
//     (de T3 draait beide schermen op één Android).
//  2. Pi-bridge relay — voor een los scherm op het AP, en als waarheid
//     wanneer het kassavenster herstart. Polling 1s, volledig offline.

const PI_BASE = process.env.NEXT_PUBLIC_PI_BRIDGE_URL ?? "https://hopbites.local:3001"
const CHANNEL = "hb-klantdisplay"

export type CustomerDisplayState =
  | { kind: "idle" }
  | {
      kind: "cart"
      lines: Array<{ name: string; qty: number; total_cents: number }>
      discount_cents: number
      total_cents: number
      customer_name: string | null
    }
  | { kind: "paid"; queue_label: string | null; total_cents: number }

export function publishDisplayState(state: CustomerDisplayState): void {
  try {
    new BroadcastChannel(CHANNEL).postMessage(state)
  } catch {
    /* oudere browser zonder BroadcastChannel — Pi-relay vangt het op */
  }
  void fetch(`${PI_BASE}/display/state`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
    signal: AbortSignal.timeout(1500),
  }).catch(() => {})
}

export function subscribeDisplayState(
  onState: (s: CustomerDisplayState) => void,
): () => void {
  let bc: BroadcastChannel | null = null
  try {
    bc = new BroadcastChannel(CHANNEL)
    bc.onmessage = (e) => onState(e.data as CustomerDisplayState)
  } catch {
    /* polling hieronder is de fallback */
  }

  let lastAt = 0
  const poll = async () => {
    try {
      const res = await fetch(`${PI_BASE}/display/state`, {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      })
      if (!res.ok) return
      const data = (await res.json()) as { state: CustomerDisplayState | null; at: number | null }
      if (data.state && data.at && data.at > lastAt) {
        lastAt = data.at
        onState(data.state)
      }
    } catch {
      /* Pi even onbereikbaar — BroadcastChannel blijft werken */
    }
  }
  void poll()
  const t = setInterval(poll, 1000)

  return () => {
    clearInterval(t)
    bc?.close()
  }
}
