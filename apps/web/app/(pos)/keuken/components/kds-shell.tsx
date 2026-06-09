"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChefHat,
  Flame,
  HandPlatter,
  Inbox,
  LayoutGrid,
  Play,
} from "lucide-react"
import { ulid } from "ulid"
import { subscribeToVenueOrders } from "@/lib/pos/realtime-subscribe"
import { updateOrderStateViaPi } from "@/lib/pi-bridge/client"
import { useConnectionStatus } from "@/lib/pos/connection-status"
import { bumpOrderAction } from "../actions"
import type { ActiveOrder } from "@/lib/dal/active-orders"
import { OrderCard } from "./order-card"
import { StationFilter } from "./station-filter"
import { ConnectionChip } from "@/components/connection-chip"

const STATIONS_DEFAULT = ["alle", "grill"] as const

export function KdsShell({
  initial,
  orgId,
  venueId,
}: {
  initial: ActiveOrder[]
  orgId: string
  venueId: string
}) {
  const [orders, setOrders] = useState<ActiveOrder[]>(initial)
  const [station, setStation] = useState<string>("alle")
  const [status, setStatus] = useState<string>("idle")
  const setRealtimeStatus = useConnectionStatus((s) => s.setRealtime)
  const itemsByOrder = useRef(new Map<string, ActiveOrder["items"]>())
  const [soundOn, setSoundOn] = useState(true)
  const seenOrderIds = useRef(new Set<string>(initial.map((o) => o.id)))

  // Persisted sound toggle. New-order chime fires when a card enters
  // the queue for the first time; toggling off keeps the visual flash
  // (per WCAG 2.2 — sound always has a visual equivalent).
  useEffect(() => {
    const stored = typeof window !== "undefined"
      ? window.localStorage.getItem("hb_kds_sound")
      : null
    if (stored === "0") setSoundOn(false)
  }, [])
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("hb_kds_sound", soundOn ? "1" : "0")
    }
  }, [soundOn])

  const ring = useCallback(() => {
    if (!soundOn) return
    if (typeof window === "undefined") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // Reduced-motion users still hear the chime; only the pulse is dropped.
    }
    try {
      const Ctx =
        (window as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const tones = [523.25, 659.25, 783.99] // C5 · E5 · G5
      tones.forEach((freq, i) => {
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = "square"
        o.frequency.value = freq
        o.connect(g)
        g.connect(ctx.destination)
        const start = ctx.currentTime + i * 0.08
        g.gain.setValueAtTime(0.0001, start)
        g.gain.exponentialRampToValueAtTime(0.35, start + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)
        o.start(start)
        o.stop(start + 0.2)
      })
    } catch {
      /* autoplay-policy may block — silent fallback */
    }
  }, [soundOn])

  // Tick once per second to refresh age coloring.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Initial items snapshot
  useEffect(() => {
    for (const o of initial) itemsByOrder.current.set(o.id, o.items)
  }, [initial])

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/keuken/orders?venueId=${encodeURIComponent(venueId)}`, {
      credentials: "include",
      cache: "no-store",
    }).catch(() => null)
    if (!res?.ok) return
    const data = (await res.json()) as { orders: ActiveOrder[] }
    setOrders(data.orders)
    for (const o of data.orders) itemsByOrder.current.set(o.id, o.items)
  }, [venueId])

  useEffect(() => {
    const channel = subscribeToVenueOrders(orgId, venueId, (e) => {
      if (e.kind === "status") {
        setStatus(e.status)
        setRealtimeStatus(e.status)
        if (e.status === "SUBSCRIBED") {
          // catch up missed events
          void refetch()
        } else if (e.status === "CHANNEL_ERROR" || e.status === "TIMED_OUT") {
          // realtime auto-retries; refetch on next SUBSCRIBED
        }
        return
      }
      if (e.kind === "order") {
        setOrders((prev) => {
          const row = e.row as unknown as ActiveOrder
          if (e.event === "DELETE") return prev.filter((o) => o.id !== row.id)
          if (!["placed", "preparing", "ready"].includes(row.status))
            return prev.filter((o) => o.id !== row.id)
          const idx = prev.findIndex((o) => o.id === row.id)
          if (idx === -1) {
            if (!seenOrderIds.current.has(row.id)) {
              seenOrderIds.current.add(row.id)
              ring()
            }
            return [
              ...prev,
              { ...row, items: itemsByOrder.current.get(row.id) ?? [] },
            ].sort((a, b) => (a.placed_at < b.placed_at ? -1 : 1))
          }
          const next = [...prev]
          next[idx] = {
            ...next[idx]!,
            ...row,
            items: next[idx]!.items,
          }
          return next
        })
        return
      }
      if (e.kind === "item") {
        const it = e.row as unknown as ActiveOrder["items"][number] & {
          order_id: string
        }
        const orderId = it.order_id as string
        const list = itemsByOrder.current.get(orderId) ?? []
        if (e.event === "DELETE") {
          itemsByOrder.current.set(
            orderId,
            list.filter((x) => x.id !== it.id),
          )
        } else {
          const existing = list.findIndex((x) => x.id === it.id)
          if (existing === -1) itemsByOrder.current.set(orderId, [...list, it])
          else {
            const next = [...list]
            next[existing] = it
            itemsByOrder.current.set(orderId, next)
          }
        }
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? { ...o, items: itemsByOrder.current.get(orderId) ?? [] }
              : o,
          ),
        )
      }
    })
    return () => {
      void channel.unsubscribe()
    }
  }, [orgId, venueId, refetch])

  // Belt + braces — REST refetch every 30s in case realtime silently drops.
  useEffect(() => {
    const t = setInterval(refetch, 30_000)
    return () => clearInterval(t)
  }, [refetch])

  // In-flight guard: a second tap on the SAME (order, transition) coalesces
  // into the original promise so we generate exactly one idempotency_key,
  // one Pi call, one SA call. Plus a per-transition idempotency key cache:
  // even AFTER the inflight clears, a re-tap on the same transition reuses
  // the same key, so a late Pi outbox flush dedups against the original.
  const inflight = useRef(new Map<string, Promise<void>>())
  const transitionKeys = useRef(new Map<string, string>())

  const handleBump = useCallback(
    async (orderId: string, toStatus: "preparing" | "ready" | "served") => {
      const key = `${orderId}:${toStatus}`
      const existing = inflight.current.get(key)
      if (existing) return existing

      let idempotency_key = transitionKeys.current.get(key)
      if (!idempotency_key) {
        idempotency_key = ulid()
        transitionKeys.current.set(key, idempotency_key)
        // Round 3 P1-3: clear the key after 10 minutes so a long-running
        // shift doesn't accumulate stale (order, transition) pairs.
        // Pi-bridge print_log + pos_idempotency both already dedup for
        // ≥24h, so by 10min any late retry is already a duplicate at the
        // upstream layer.
        setTimeout(() => {
          transitionKeys.current.delete(key)
        }, 10 * 60_000)
      }

      const p = (async () => {
        // Bumping to "served" takes the card off the KDS; the other
        // transitions just recolour it. Filtering also keeps the optimistic
        // update within ActiveOrder["status"] (which has no "served").
        setOrders((prev) =>
          toStatus === "served"
            ? prev.filter((o) => o.id !== orderId)
            : prev.map((o) => (o.id === orderId ? { ...o, status: toStatus } : o)),
        )
        const pi = await updateOrderStateViaPi({
          idempotency_key,
          order_id: orderId,
          state: toStatus,
        })
        // Always also call the SA so pos_idempotency records the key
        // upstream — if the Pi outbox fails to flush later, a retry on the
        // same key still dedups via Supabase.
        const res = await bumpOrderAction({
          order_id: orderId,
          to_status: toStatus,
          idempotency_key,
        })
        if (!pi.ok && !res.ok) {
          await refetch()
        }
      })().finally(() => {
        inflight.current.delete(key)
      })

      inflight.current.set(key, p)
      return p
    },
    [refetch],
  )

  const visible = useMemo(() => {
    if (station === "alle") return orders
    return orders
      .map((o) => ({
        ...o,
        items: o.items.filter((it) => it.station === station),
      }))
      .filter((o) => o.items.length > 0)
  }, [orders, station])

  const columns = useMemo(
    () => ({
      placed: visible.filter((o) => o.status === "placed"),
      preparing: visible.filter((o) => o.status === "preparing"),
      ready: visible.filter((o) => o.status === "ready"),
    }),
    [visible],
  )

  return (
    <div className="flex h-dvh flex-col bg-offwhite">
      {/* 84px charcoal header */}
      <div className="flex h-[84px] flex-none items-center gap-5 bg-charcoal-900 px-6 text-offwhite">
        <Link
          href="/"
          title="Naar start"
          className="flex h-12 w-12 flex-none items-center justify-center rounded-[12px] bg-white/8 text-offwhite"
        >
          <LayoutGrid size={22} />
        </Link>
        <div className="flex items-center gap-3">
          <ChefHat size={28} className="text-hop-500" />
          <h1 className="text-[26px] font-extrabold leading-none">Keuken</h1>
        </div>
        <div className="ml-3">
          <StationFilter
            stations={[...STATIONS_DEFAULT]}
            active={station}
            onChange={setStation}
          />
        </div>
        <div className="ml-auto flex items-center gap-3.5">
          <span className="hb-tabular text-[15px] font-bold leading-none text-charcoal-300">
            {visible.length} open bonnen
          </span>
          <button
            onClick={() => setSoundOn((v) => !v)}
            className={`inline-flex h-11 items-center gap-2 rounded-md border border-charcoal-700 bg-transparent px-4 text-[14px] font-bold leading-none ${
              soundOn ? "text-hop-500" : "text-charcoal-400"
            }`}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Geluid uitzetten" : "Geluid aanzetten"}
          >
            {soundOn ? <Bell size={18} /> : <BellOff size={18} />}
            {soundOn ? "Geluid aan" : "Geluid uit"}
          </button>
          <ConnectionChip />
        </div>
        <span hidden aria-hidden>
          {status}
        </span>
      </div>

      {/* Three status columns */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 md:grid-cols-3">
        <Column
          title="Geplaatst"
          icon={<Inbox size={20} className="text-charcoal-700" />}
          accent="var(--color-charcoal-500)"
          orders={columns.placed}
          onBump={handleBump}
          nextStatus="preparing"
          nextLabel="Start bereiding"
          nextIcon={<Play size={22} />}
        />
        <Column
          title="In bereiding"
          icon={<Flame size={20} className="text-charcoal-700" />}
          accent="var(--color-amber-600)"
          orders={columns.preparing}
          onBump={handleBump}
          nextStatus="ready"
          nextLabel="Klaar"
          nextIcon={<Check size={22} />}
        />
        <Column
          title="Klaar"
          icon={<HandPlatter size={20} className="text-charcoal-700" />}
          accent="var(--color-hop-600)"
          orders={columns.ready}
          onBump={handleBump}
          nextStatus="served"
          nextLabel="Uitgegeven"
          nextIcon={<HandPlatter size={22} />}
        />
      </div>
    </div>
  )
}

function Column({
  title,
  icon,
  accent,
  orders,
  onBump,
  nextStatus,
  nextLabel,
  nextIcon,
}: {
  title: string
  icon: React.ReactNode
  accent: string
  orders: ActiveOrder[]
  onBump: (id: string, to: "preparing" | "ready" | "served") => void
  nextStatus: "preparing" | "ready" | "served"
  nextLabel: string
  nextIcon: React.ReactNode
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-paper">
      <h2 className="flex flex-none items-center gap-2.5 border-b border-line px-[18px] py-3.5 text-[18px] font-extrabold leading-[1.1] tracking-[0.02em] text-charcoal-900">
        <span
          className="h-3 w-3 flex-none rounded-[3px]"
          style={{ background: accent }}
        />
        {icon}
        <span className="whitespace-nowrap">{title}</span>
        <span className="hb-tabular ml-auto text-[16px] font-extrabold leading-none text-charcoal-500">
          {orders.length}
        </span>
      </h2>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3.5">
        {orders.length === 0 ? (
          <div className="m-auto flex flex-col items-center gap-2 text-charcoal-300">
            <CheckCheck size={40} />
            <span className="text-[15px] font-semibold leading-none">Niets hier</span>
          </div>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              accent={accent}
              onBump={() => onBump(o.id, nextStatus)}
              nextLabel={nextLabel}
              nextIcon={nextIcon}
            />
          ))
        )}
      </div>
    </section>
  )
}
