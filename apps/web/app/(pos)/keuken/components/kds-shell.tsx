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
  History,
  Inbox,
  LayoutGrid,
  Play,
  Settings2,
} from "lucide-react"
import { ulid } from "ulid"
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { subscribeToVenueOrders } from "@/lib/pos/realtime-subscribe"
import { updateOrderStateViaPi } from "@/lib/pi-bridge/client"
import { useConnectionStatus } from "@/lib/pos/connection-status"
import { bumpOrderAction } from "../actions"
import type { ActiveOrder } from "@/lib/dal/active-orders"
import { OrderCard } from "./order-card"
import { StationFilter } from "./station-filter"
import { ConnectionChip } from "@/components/connection-chip"
import { HistoryPanel } from "./history-panel"

// NL-labels per station (menu-editor kent grill/fryer/cold/bar); het
// filter toont alleen stations die nu echt in de open bonnen voorkomen.
const STATION_LABELS: Record<string, string> = {
  alle: "Alle",
  grill: "Grill",
  fryer: "Frituur",
  cold: "Koud",
  bar: "Bar",
}
const STATION_ORDER = ["grill", "fryer", "cold", "bar"]

type LaneStatus = "placed" | "preparing" | "ready"
type BumpTarget = LaneStatus | "served"

// ---- KDS-voorkeuren (lokaal per scherm) --------------------------------

interface KdsPrefs {
  cols: Record<LaneStatus, 1 | 2>
  scale: "s" | "m" | "l"
}

const DEFAULT_PREFS: KdsPrefs = {
  cols: { placed: 1, preparing: 1, ready: 1 },
  scale: "m",
}

// Kaarten gebruiken vaste Tailwind-groottes; zoom schaalt de hele kaart
// proportioneel (Chrome/Safari — de kiosk en tablets draaien Chromium).
const SCALE_ZOOM: Record<KdsPrefs["scale"], number> = { s: 0.85, m: 1, l: 1.18 }

function loadPrefs(): KdsPrefs {
  try {
    const raw = window.localStorage.getItem("hb_kds_prefs")
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<KdsPrefs>
    return {
      cols: { ...DEFAULT_PREFS.cols, ...(parsed.cols ?? {}) },
      scale: parsed.scale ?? "m",
    }
  } catch {
    return DEFAULT_PREFS
  }
}

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
  const [prefs, setPrefs] = useState<KdsPrefs>(DEFAULT_PREFS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    setPrefs(loadPrefs())
  }, [])
  const updatePrefs = useCallback((next: KdsPrefs) => {
    setPrefs(next)
    try {
      window.localStorage.setItem("hb_kds_prefs", JSON.stringify(next))
    } catch {
      /* private mode */
    }
  }, [])

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
    for (const o of data.orders) {
      itemsByOrder.current.set(o.id, o.items)
      if (!seenOrderIds.current.has(o.id)) {
        seenOrderIds.current.add(o.id)
        ring()
      }
    }
  }, [venueId, ring])

  useEffect(() => {
    const channel = subscribeToVenueOrders(orgId, venueId, (e) => {
      if (e.kind === "status") {
        setStatus(e.status)
        setRealtimeStatus(e.status)
        if (e.status === "SUBSCRIBED") {
          // catch up missed events
          void refetch()
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
  }, [orgId, venueId, refetch, ring, setRealtimeStatus])

  // LAN-polling elke 4s — realtime is de snelle route mét internet, maar
  // zonder internet is dit dé route (de Pi serveert /api/keuken/orders
  // lokaal incl. de offline outbox-overlay).
  useEffect(() => {
    const t = setInterval(refetch, 4000)
    return () => clearInterval(t)
  }, [refetch])

  // In-flight guard: a second tap on the SAME (order, transition) coalesces
  // into the original promise. The per-transition key cache is SHORT (5s):
  // lang genoeg om dubbeltikken te collapsen, kort genoeg om heen-en-terug
  // slepen (placed → preparing → placed → preparing) als losse mutaties te
  // behandelen i.p.v. ze upstream te dedupen.
  const inflight = useRef(new Map<string, Promise<void>>())
  const transitionKeys = useRef(new Map<string, string>())

  const handleBump = useCallback(
    async (orderId: string, toStatus: BumpTarget) => {
      const key = `${orderId}:${toStatus}`
      const existing = inflight.current.get(key)
      if (existing) return existing

      let idempotency_key = transitionKeys.current.get(key)
      if (!idempotency_key) {
        idempotency_key = ulid()
        transitionKeys.current.set(key, idempotency_key)
        setTimeout(() => {
          transitionKeys.current.delete(key)
        }, 5_000)
      }

      const p = (async () => {
        // Bumping to "served" takes the card off the KDS; the other
        // transitions just move it between lanes.
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

  // Geschiedenis → terug naar Klaar (per ongeluk uitgegeven bon).
  const handleRestore = useCallback(
    async (orderId: string) => {
      setRestoring(true)
      try {
        await handleBump(orderId, "ready")
        await refetch()
      } finally {
        setRestoring(false)
      }
    },
    [handleBump, refetch],
  )

  // Slepen tussen kolommen — beide richtingen. Lang-indrukken (150ms)
  // start het slepen zodat scrollen en de bump-knop gewoon blijven werken.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
  )
  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const orderId = String(e.active.id)
      const target = e.over?.id as LaneStatus | undefined
      if (!target) return
      const current = orders.find((o) => o.id === orderId)?.status
      if (!current || current === target) return
      void handleBump(orderId, target)
    },
    [orders, handleBump],
  )

  // Stations afleiden uit de werkelijke bonnen i.p.v. een hardcoded lijst.
  const stationOptions = useMemo(() => {
    const present = new Set<string>()
    for (const o of orders) for (const it of o.items) if (it.station) present.add(it.station)
    const sorted = [...present].sort((a, b) => {
      const ia = STATION_ORDER.indexOf(a)
      const ib = STATION_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
    })
    if (sorted.length <= 1) return []
    return ["alle", ...sorted].map((v) => ({ value: v, label: STATION_LABELS[v] ?? v }))
  }, [orders])

  // Actief station verdwenen (laatste bon weggebumpt)? Terug naar Alle.
  useEffect(() => {
    if (station !== "alle" && !stationOptions.some((o) => o.value === station)) {
      setStation("alle")
    }
  }, [stationOptions, station])

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
            options={stationOptions}
            active={station}
            onChange={setStation}
          />
        </div>
        <div className="ml-auto flex items-center gap-3.5">
          <span className="hb-tabular text-[15px] font-bold leading-none text-charcoal-300">
            {visible.length} open bonnen
          </span>
          <button
            onClick={() => setHistoryOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-md border border-charcoal-700 bg-transparent px-4 text-[14px] font-bold leading-none text-charcoal-300"
          >
            <History size={18} /> Geschiedenis
          </button>
          <button
            onClick={() => setSoundOn((v) => !v)}
            className={`inline-flex h-11 items-center gap-2 rounded-md border border-charcoal-700 bg-transparent px-4 text-[14px] font-bold leading-none ${
              soundOn ? "text-hop-500" : "text-charcoal-400"
            }`}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Geluid uitzetten" : "Geluid aanzetten"}
          >
            {soundOn ? <Bell size={18} /> : <BellOff size={18} />}
          </button>
          <div className="relative">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label="Weergave-instellingen"
              aria-expanded={settingsOpen}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-md border border-charcoal-700 ${
                settingsOpen ? "text-hop-500" : "text-charcoal-300"
              }`}
            >
              <Settings2 size={18} />
            </button>
            {settingsOpen ? (
              <SettingsPopover prefs={prefs} onChange={updatePrefs} />
            ) : null}
          </div>
          <ConnectionChip />
        </div>
        <span hidden aria-hidden>
          {status}
        </span>
      </div>

      {/* Three status lanes — kaarten zijn sleepbaar tussen de lanes */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 md:grid-cols-3">
          <Column
            id="placed"
            title="Geplaatst"
            icon={<Inbox size={20} className="text-charcoal-700" />}
            accent="var(--color-charcoal-500)"
            orders={columns.placed}
            onBump={handleBump}
            nextStatus="preparing"
            nextLabel="Start bereiding"
            nextIcon={<Play size={22} />}
            cols={prefs.cols.placed}
            zoom={SCALE_ZOOM[prefs.scale]}
          />
          <Column
            id="preparing"
            title="In bereiding"
            icon={<Flame size={20} className="text-charcoal-700" />}
            accent="var(--color-amber-600)"
            orders={columns.preparing}
            onBump={handleBump}
            nextStatus="ready"
            nextLabel="Klaar"
            nextIcon={<Check size={22} />}
            cols={prefs.cols.preparing}
            zoom={SCALE_ZOOM[prefs.scale]}
          />
          <Column
            id="ready"
            title="Klaar"
            icon={<HandPlatter size={20} className="text-charcoal-700" />}
            accent="var(--color-hop-600)"
            orders={columns.ready}
            onBump={handleBump}
            nextStatus="served"
            nextLabel="Uitgegeven"
            nextIcon={<HandPlatter size={22} />}
            cols={prefs.cols.ready}
            zoom={SCALE_ZOOM[prefs.scale]}
          />
        </div>
      </DndContext>

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={handleRestore}
        restoring={restoring}
      />
    </div>
  )
}

// ---- weergave-instellingen ---------------------------------------------

function SettingsPopover({
  prefs,
  onChange,
}: {
  prefs: KdsPrefs
  onChange: (p: KdsPrefs) => void
}) {
  const laneLabel: Record<LaneStatus, string> = {
    placed: "Geplaatst",
    preparing: "In bereiding",
    ready: "Klaar",
  }
  return (
    <div className="absolute right-0 top-[52px] z-50 w-[290px] rounded-lg border border-line-strong bg-paper-bright p-4 text-charcoal-900 shadow-xl">
      <div className="mb-3 text-[14px] font-extrabold leading-none">Weergave</div>

      <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
        Kaarten per kolom
      </div>
      {(Object.keys(laneLabel) as LaneStatus[]).map((lane) => (
        <div key={lane} className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[14px] font-semibold">{laneLabel[lane]}</span>
          <div className="flex gap-1">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ ...prefs, cols: { ...prefs.cols, [lane]: n } })}
                className={`h-9 w-12 rounded-md border text-[13px] font-bold ${
                  prefs.cols[lane] === n
                    ? "border-hop-600 bg-hop-600 text-white"
                    : "border-line-strong bg-paper text-charcoal-700"
                }`}
              >
                {n}×
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="mb-1.5 mt-3 text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
        Lettergrootte
      </div>
      <div className="flex gap-1">
        {(["s", "m", "l"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange({ ...prefs, scale: s })}
            className={`h-9 flex-1 rounded-md border text-[13px] font-bold uppercase ${
              prefs.scale === s
                ? "border-hop-600 bg-hop-600 text-white"
                : "border-line-strong bg-paper text-charcoal-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] font-medium leading-[1.4] text-charcoal-500">
        Tip: houd een kaart even vast om hem naar een andere kolom te slepen —
        ook terug.
      </p>
    </div>
  )
}

// ---- lanes + draggable cards --------------------------------------------

function Column({
  id,
  title,
  icon,
  accent,
  orders,
  onBump,
  nextStatus,
  nextLabel,
  nextIcon,
  cols,
  zoom,
}: {
  id: LaneStatus
  title: string
  icon: React.ReactNode
  accent: string
  orders: ActiveOrder[]
  onBump: (id: string, to: BumpTarget) => void
  nextStatus: BumpTarget
  nextLabel: string
  nextIcon: React.ReactNode
  cols: 1 | 2
  zoom: number
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-0 flex-col overflow-hidden rounded-lg border bg-paper transition-colors ${
        isOver ? "border-hop-600 bg-hop-600/5" : "border-line"
      }`}
    >
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
      <div
        className={`grid min-h-0 flex-1 content-start gap-3.5 overflow-y-auto p-3.5 ${
          cols === 2 ? "grid-cols-2" : "grid-cols-1"
        }`}
        style={{ zoom }}
      >
        {orders.length === 0 ? (
          <div className="col-span-full m-auto flex flex-col items-center gap-2 py-10 text-charcoal-300">
            <CheckCheck size={40} />
            <span className="text-[15px] font-semibold leading-none">Niets hier</span>
          </div>
        ) : (
          orders.map((o) => (
            <DraggableCard key={o.id} id={o.id}>
              <OrderCard
                order={o}
                accent={accent}
                onBump={() => onBump(o.id, nextStatus)}
                nextLabel={nextLabel}
                nextIcon={nextIcon}
              />
            </DraggableCard>
          ))
        )}
      </div>
    </section>
  )
}

function DraggableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? "relative z-40 cursor-grabbing opacity-90" : "touch-manipulation"}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
          : undefined
      }
    >
      {children}
    </div>
  )
}
