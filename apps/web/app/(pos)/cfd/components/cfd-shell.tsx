"use client"
import { useEffect, useRef, useState } from "react"
import { BellRing, Check, Flame } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { subscribeToVenueOrders } from "@/lib/pos/realtime-subscribe"
import { getOrderStatusVisual } from "@/lib/pos/order-status-visuals"

interface CfdOrder {
  id: string
  ordered_label: string | null
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

  // LAN-polling elke 4s: realtime loopt via Supabase en valt dus weg
  // zonder internet — de Pi serveert /api/cfd/orders lokaal, zodat een
  // keuken-bump binnen seconden op het klantenscherm staat.
  useEffect(() => {
    let stopped = false
    const poll = async () => {
      const res = await fetch("/api/cfd/orders", {
        credentials: "include",
        cache: "no-store",
      }).catch(() => null)
      if (stopped || !res?.ok) return
      const data = (await res.json()) as { orders: CfdOrder[] }
      setOrders(data.orders)
      for (const o of data.orders) {
        if (o.status === "ready" && !seenReady.current.has(o.id)) {
          seenReady.current.add(o.id)
          ringBell()
        }
      }
    }
    const t = setInterval(poll, 4000)
    return () => {
      stopped = true
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  // Privacy op het muurscherm: altijd het bestelnummer, nooit de klantnaam.
  const tag = (o: CfdOrder) => o.ordered_label ?? "#"
  const preparingVisual = getOrderStatusVisual("preparing", "sun")
  const readyVisual = getOrderStatusVisual("ready", "sun")

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden bg-charcoal-900 text-offwhite"
      data-testid="cfd"
    >
      {/* Logo-watermerk, gecentreerd achter alle content */}
      <Logo
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5"
        style={{ height: "min(680px, 75vh)" }}
      />

      {/* 110px header: eyebrow gecentreerd, klok rechts — verder niets */}
      <header className="relative flex h-[110px] flex-none items-center justify-center border-b border-charcoal-700 px-14">
        <div className="whitespace-nowrap text-[16px] font-bold uppercase leading-none tracking-[0.22em] text-charcoal-400">
          Jouw bestelling · Live
        </div>
        <div className="hb-tabular absolute right-14 text-[36px] font-extrabold leading-none">
          {clock}
        </div>
      </header>

      <div className="relative grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
        {/* In bereiding */}
        <section className="flex min-h-0 flex-col border-b border-charcoal-700 p-8 md:border-b-0 md:border-r md:p-12">
          <div
            className="mb-8 flex min-h-[86px] items-center justify-center gap-4 rounded-lg border px-6"
            style={{
              borderColor: preparingVisual.border,
              background: preparingVisual.accent,
              color: preparingVisual.foreground,
            }}
          >
            <Flame size={40} strokeWidth={3} />
            <h2 className="whitespace-nowrap text-[36px] font-extrabold leading-none md:text-[44px]">
              In bereiding
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-wrap content-start justify-center gap-[18px]">
              {preparing.length === 0 ? (
                <p className="w-full text-center text-[26px] font-semibold text-charcoal-400">
                  —
                </p>
              ) : (
                preparing.map((o) => (
                  <div
                    key={o.id}
                    className="flex min-h-[132px] w-[270px] max-w-full flex-col items-center justify-center gap-2 rounded-lg border border-charcoal-700 bg-charcoal-800 p-[18px]"
                  >
                    <span className="hb-tabular text-center text-[38px] font-extrabold leading-none">
                      {tag(o)}
                    </span>
                    <span
                      className="text-[15px] font-semibold leading-none"
                      style={{
                        color:
                          o.status === "preparing"
                            ? preparingVisual.accent
                            : "var(--color-charcoal-400)",
                      }}
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
          <div
            className="mb-8 flex min-h-[86px] items-center justify-center gap-4 rounded-lg border bg-paper-bright px-6 text-charcoal-900"
            style={{ borderColor: readyVisual.border }}
          >
            <BellRing size={42} style={{ color: readyVisual.accent }} strokeWidth={3} />
            <span
              className="rounded-md px-4 py-2 text-[26px] font-black leading-none text-white md:text-[30px]"
              style={{ background: readyVisual.accent, color: readyVisual.foreground }}
            >
              Klaar
            </span>
            <h2 className="whitespace-nowrap text-[32px] font-extrabold leading-none md:text-[40px]">
              Kom afhalen
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-wrap content-start justify-center gap-[18px]">
              {ready.length === 0 ? (
                <p className="w-full text-center text-[26px] font-semibold text-charcoal-400">
                  —
                </p>
              ) : (
                ready.map((o) => (
                  <div
                    key={o.id}
                    className="hb-pulse flex min-h-[168px] w-[440px] max-w-full flex-col items-center justify-center gap-2 rounded-xl p-[22px]"
                    style={{ background: readyVisual.accent, color: readyVisual.foreground }}
                  >
                    <span className="hb-tabular text-center text-[60px] font-black leading-none">
                      {tag(o)}
                    </span>
                    <span className="inline-flex items-center gap-2 text-[20px] font-bold leading-none text-white/90">
                      <Check size={20} strokeWidth={3} /> Klaar
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
