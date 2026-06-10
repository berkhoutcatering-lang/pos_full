"use client"
import { useCallback, useEffect, useState } from "react"
import { Euro, History, Printer, RotateCcw, X } from "lucide-react"
import { ulid } from "ulid"
import type { HistoryOrder } from "@/lib/dal/active-orders"
import { printKitchenViaPi } from "@/lib/pi-bridge/client"
import { refundOrderAction } from "../actions"
import { euroCents } from "@/lib/format"

// Geschiedenis-lade op de KDS: vandaag uitgegeven/geannuleerde bonnen.
// "Terugzetten" bumpt een uitgegeven bon terug naar Klaar (bijv. verkeerd
// weggedrukt) — de kaart verschijnt dan weer op KDS én CFD.

export function HistoryPanel({
  open,
  onClose,
  onRestore,
  restoring,
}: {
  open: boolean
  onClose: () => void
  onRestore: (orderId: string) => void
  restoring: boolean
}) {
  const [orders, setOrders] = useState<HistoryOrder[] | null>(null)
  const [error, setError] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Herprint keukenbon: rechtstreeks tablet → Pi (werkt dus ook offline);
  // nieuwe idempotency-key zodat de print_log-dedup een bewuste herprint
  // niet blokkeert.
  const reprint = async (o: HistoryOrder) => {
    setNotice(null)
    const res = await printKitchenViaPi({
      idempotency_key: ulid(),
      order_id: o.id,
      order_label: o.ordered_label ?? o.customer_name ?? "#",
      items: o.items.map((it) => ({
        name: it.name,
        qty: it.qty,
        modifiers: Array.isArray(it.modifiers_json)
          ? (it.modifiers_json as Array<{ name: string }>).map((m) => m.name)
          : [],
        note: it.notes ?? undefined,
      })),
    })
    setNotice(
      res.ok && res.data.ok
        ? `Keukenbon ${o.ordered_label ?? ""} opnieuw geprint.`
        : "Printen mislukt — is de printer bereikbaar?",
    )
  }

  const refund = async (o: HistoryOrder) => {
    const reason = window.prompt(
      `Reden voor terugbetaling van ${o.ordered_label ?? "deze bon"} (${euroCents(o.total_incl_cents)})?`,
    )
    if (!reason || reason.trim().length < 3) return
    setNotice(null)
    const res = await refundOrderAction({ order_id: o.id, reason: reason.trim() })
    if (!res.ok) {
      setNotice(
        res.error === "offline"
          ? "Terugbetalen registreren vereist internet — geld kan wel alvast handmatig terug."
          : res.error === "not_refundable"
            ? "Deze bon is al terugbetaald of nog actief."
            : "Terugbetalen mislukt — alleen managers mogen dit.",
      )
      return
    }
    setNotice(`${o.ordered_label ?? "Bon"} gemarkeerd als terugbetaald — geld handmatig retour (lade of myPOS-app).`)
    void load()
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/keuken/history", {
      credentials: "include",
      cache: "no-store",
    }).catch(() => null)
    if (!res?.ok) {
      setError(true)
      return
    }
    setError(false)
    const data = (await res.json()) as { orders: HistoryOrder[] }
    setOrders(data.orders)
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [open, load])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-charcoal-900/40" onClick={onClose}>
      <aside
        className="flex h-full w-[440px] max-w-[92vw] flex-col bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-[72px] flex-none items-center gap-3 border-b border-line bg-paper-bright px-5">
          <History size={22} className="text-charcoal-700" />
          <span className="text-[19px] font-extrabold leading-none text-charcoal-900">
            Geschiedenis vandaag
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-md border border-line-strong text-charcoal-700"
          >
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {notice ? (
            <p className="mb-3 rounded-md bg-charcoal-900 px-4 py-3 text-[13px] font-semibold text-offwhite">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="text-[14px] font-semibold text-brick-600">
              Kon de geschiedenis niet laden.
            </p>
          ) : orders === null ? (
            <p className="text-[14px] font-medium text-charcoal-500">Laden…</p>
          ) : orders.length === 0 ? (
            <p className="text-[14px] font-medium text-charcoal-500">
              Nog niets uitgegeven vandaag.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {orders.map((o) => (
                <article
                  key={o.id}
                  className="rounded-lg border border-line-strong bg-paper-bright px-4 py-3"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="hb-tabular text-[18px] font-extrabold leading-none text-charcoal-900">
                      {o.ordered_label ?? "#"}
                    </span>
                    {o.customer_name ? (
                      <span className="text-[14px] font-semibold leading-none text-charcoal-500">
                        {o.customer_name}
                      </span>
                    ) : null}
                    <span
                      className={`ml-auto rounded px-2 py-1 text-[12px] font-bold leading-none ${
                        o.status === "voided"
                          ? "bg-brick-100 text-brick-600"
                          : o.status === "refunded"
                            ? "bg-amber-600/15 text-amber-700"
                            : "bg-hop-600/10 text-hop-700"
                      }`}
                    >
                      {o.status === "voided"
                        ? "Geannuleerd"
                        : o.status === "refunded"
                          ? "Terugbetaald"
                          : "Uitgegeven"}
                    </span>
                  </div>
                  <div className="hb-tabular mt-1.5 text-[13px] font-medium leading-none text-charcoal-500">
                    {new Date(o.served_at ?? o.placed_at).toLocaleTimeString("nl-NL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {euroCents(o.total_incl_cents)}
                  </div>
                  <div className="mt-2 text-[14px] font-semibold leading-[1.4] text-charcoal-700">
                    {o.items.map((it) => `${it.qty}× ${it.name}`).join(" · ")}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void reprint(o)}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-paper px-3.5 text-[13px] font-bold text-charcoal-700"
                    >
                      <Printer size={15} /> Print keukenbon
                    </button>
                    {o.status === "served" ? (
                      <>
                        <button
                          type="button"
                          disabled={restoring}
                          onClick={() => onRestore(o.id)}
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-paper px-3.5 text-[13px] font-bold text-charcoal-700 disabled:opacity-50"
                        >
                          <RotateCcw size={15} /> Terugzetten naar Klaar
                        </button>
                        <button
                          type="button"
                          onClick={() => void refund(o)}
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-600/30 bg-amber-600/10 px-3.5 text-[13px] font-bold text-amber-700"
                        >
                          <Euro size={15} /> Terugbetalen
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
