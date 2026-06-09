"use client"
import { useEffect, useRef, useState } from "react"
import { subscribeToVenueOrders } from "@/lib/pos/realtime-subscribe"

interface CfdOrder {
  id: string
  ordered_label: string | null
  customer_name: string | null
  status: "placed" | "preparing" | "ready"
  placed_at: string
  prepared_at: string | null
}

const READY_WINDOW_MS = 5 * 60_000

export function CfdShell({
  initial,
  orgId,
  venueId,
}: {
  initial: CfdOrder[]
  orgId: string
  venueId: string
}) {
  const [orders, setOrders] = useState<CfdOrder[]>(initial)
  const [tick, setTick] = useState(0)
  const seenReady = useRef(new Set<string>(initial.filter((o) => o.status === "ready").map((o) => o.id)))

  // Wake-Lock so the iPad doesn't sleep while showing the queue.
  useEffect(() => {
    const w = navigator as Navigator & {
      wakeLock?: { request: (t: string) => Promise<unknown> }
    }
    if (w.wakeLock) {
      void w.wakeLock.request("screen").catch(() => {})
    }
  }, [])

  // Tick once per second to refresh the 5-min ready window.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Bell on new 'ready' — Web Audio API square wave so no asset needed.
  const ringBell = () => {
    try {
      const Ctx =
        (window as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = "sine"
      o.frequency.value = 880
      o.connect(g)
      g.connect(ctx.destination)
      g.gain.setValueAtTime(0.001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.05)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9)
      o.start()
      o.stop(ctx.currentTime + 0.95)
    } catch {
      // ignore — autoplay policy may block until first user interaction
    }
  }

  useEffect(() => {
    const channel = subscribeToVenueOrders(orgId, venueId, (e) => {
      if (e.kind !== "order") return
      const row = e.row as unknown as CfdOrder
      setOrders((prev) => {
        if (e.event === "DELETE") return prev.filter((o) => o.id !== row.id)
        if (!["placed", "preparing", "ready"].includes(row.status))
          return prev.filter((o) => o.id !== row.id)
        const idx = prev.findIndex((o) => o.id === row.id)
        const stripped: CfdOrder = {
          id: row.id,
          ordered_label: row.ordered_label,
          customer_name: row.customer_name,
          status: row.status,
          placed_at: row.placed_at,
          prepared_at: row.prepared_at,
        }
        if (idx === -1) return [...prev, stripped]
        const next = [...prev]
        next[idx] = stripped
        return next
      })
      if (row.status === "ready" && !seenReady.current.has(row.id)) {
        seenReady.current.add(row.id)
        ringBell()
      }
    })
    return () => {
      void channel.unsubscribe()
    }
  }, [orgId, venueId])

  const now = Date.now() + tick * 0 // tick is the rerender driver
  const preparing = orders.filter(
    (o) => o.status === "placed" || o.status === "preparing",
  )
  const ready = orders.filter(
    (o) =>
      o.status === "ready" &&
      now - new Date(o.prepared_at ?? o.placed_at).getTime() < READY_WINDOW_MS,
  )

  return (
    <div
      className="grid h-dvh grid-cols-1 bg-[var(--color-surface)] p-8 text-[var(--color-surface-fg)] md:grid-cols-2"
      data-testid="cfd"
    >
      <section className="border-b-2 border-[var(--color-border)] pb-6 md:border-b-0 md:border-r-2 md:pb-0 md:pr-6">
        <h2 className="mb-6 text-5xl font-bold tracking-tight">In bereiding</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {preparing.length === 0 ? (
            <p className="col-span-full text-2xl opacity-60">—</p>
          ) : (
            preparing.map((o) => (
              <div
                key={o.id}
                className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center text-3xl font-bold"
              >
                {o.customer_name ?? o.ordered_label ?? "#"}
              </div>
            ))
          )}
        </div>
      </section>
      <section className="pt-6 md:pl-6 md:pt-0">
        <h2 className="mb-6 text-5xl font-bold tracking-tight text-emerald-700">
          Klaar!
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {ready.length === 0 ? (
            <p className="col-span-full text-2xl opacity-60">—</p>
          ) : (
            ready.map((o) => (
              <div
                key={o.id}
                className="animate-pulse rounded-2xl bg-emerald-500 p-6 text-center text-4xl font-extrabold text-white shadow-lg"
              >
                {o.customer_name
                  ? `Klant ${o.customer_name} — Klaar!`
                  : `${o.ordered_label ?? "#"} — Klaar!`}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
