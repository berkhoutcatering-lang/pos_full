"use client"
import { useEffect, useRef, useState } from "react"
import { BellRing, Check, Flame, ShoppingBag } from "lucide-react"
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

  const clock = new Date(now).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  })
  const tag = (o: CfdOrder) => o.customer_name ?? o.ordered_label ?? "#"

  return (
    <div className="flex h-dvh flex-col bg-charcoal-900 text-offwhite" data-testid="cfd">
      {/* 110px header */}
      <header className="flex h-[110px] flex-none items-center justify-between border-b border-charcoal-700 px-14">
        <div className="whitespace-nowrap text-[34px] font-extrabold leading-[1.1] tracking-[-0.01em]">
          Hop <span className="text-hop-500">&amp;</span> Bites
        </div>
        <div className="hidden text-[16px] font-bold uppercase leading-none tracking-[0.22em] text-charcoal-400 md:block">
          Jouw bestelling · Live
        </div>
        <div className="hb-tabular text-[36px] font-extrabold leading-none">{clock}</div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        {/* In bereiding */}
        <section className="flex min-h-0 flex-col border-b border-charcoal-700 p-8 md:border-b-0 md:border-r md:p-12">
          <h2 className="mb-9 flex items-center gap-4 whitespace-nowrap text-[44px] font-extrabold leading-[1.1] tracking-[-0.01em]">
            <Flame size={40} className="text-amber-600" /> In bereiding
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 content-start gap-[18px] lg:grid-cols-3">
              {preparing.length === 0 ? (
                <p className="col-span-full text-[26px] font-semibold text-charcoal-400">
                  —
                </p>
              ) : (
                preparing.map((o) => (
                  <div
                    key={o.id}
                    className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-lg border border-charcoal-700 bg-charcoal-800 p-[18px]"
                  >
                    <span className="hb-tabular text-center text-[38px] font-extrabold leading-none">
                      {tag(o)}
                    </span>
                    <span
                      className={`text-[15px] font-semibold leading-none ${
                        o.status === "preparing" ? "text-amber-600" : "text-charcoal-400"
                      }`}
                    >
                      {o.status === "preparing" ? "Op de grill" : "In de wacht"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Klaar */}
        <section className="flex min-h-0 flex-col p-8 md:p-12">
          <h2 className="mb-9 flex items-center gap-4 whitespace-nowrap text-[44px] font-extrabold leading-[1.1] tracking-[-0.01em] text-hop-500">
            <BellRing size={40} /> Klaar — kom afhalen!
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 content-start gap-[18px] lg:grid-cols-2">
              {ready.length === 0 ? (
                <p className="col-span-full text-[26px] font-semibold text-charcoal-400">
                  —
                </p>
              ) : (
                ready.map((o) => (
                  <div
                    key={o.id}
                    className="hb-pulse flex min-h-[156px] flex-col items-center justify-center gap-2 rounded-xl bg-hop-600 p-[22px] text-white"
                  >
                    <span className="hb-tabular text-center text-[52px] font-black leading-none tracking-[-0.01em]">
                      {tag(o)}
                    </span>
                    <span className="inline-flex items-center gap-2 text-[18px] font-bold leading-none text-white/90">
                      <Check size={20} strokeWidth={3} /> Klaar
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="flex h-16 flex-none items-center justify-center gap-3 whitespace-nowrap border-t border-charcoal-700 text-[17px] font-semibold leading-none text-charcoal-300">
        <ShoppingBag size={18} className="text-charcoal-400" /> Bedankt &amp; eet
        smakelijk — Hop &amp; Bites BBQ
      </footer>
    </div>
  )
}
