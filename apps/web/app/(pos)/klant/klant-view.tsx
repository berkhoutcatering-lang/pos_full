"use client"
import { useEffect, useRef, useState } from "react"
import { Check, CreditCard } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import {
  subscribeDisplayState,
  type CustomerDisplayState,
} from "@/lib/pos/customer-display"
import { euroCents } from "@/lib/format"

const PAID_LINGER_MS = 8000

export function KlantView() {
  const [state, setState] = useState<CustomerDisplayState>({ kind: "idle" })
  const paidTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeDisplayState((s) => {
      setState(s)
      if (paidTimer.current) clearTimeout(paidTimer.current)
      if (s.kind === "paid") {
        // Na het bedankt-scherm vanzelf terug naar Welkom.
        paidTimer.current = setTimeout(() => setState({ kind: "idle" }), PAID_LINGER_MS)
      }
    })
    // Scherm wakker houden op het klantdisplay.
    const w = navigator as Navigator & {
      wakeLock?: { request: (t: string) => Promise<unknown> }
    }
    if (w.wakeLock) void w.wakeLock.request("screen").catch(() => {})
    return unsubscribe
  }, [])

  const count =
    state.kind === "cart" ? state.lines.reduce((s, l) => s + l.qty, 0) : 0

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-charcoal-900 text-offwhite">
      {/* Logo-watermerk, gecentreerd achter alle content */}
      <Logo
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5"
        style={{ height: "min(680px, 75vh)" }}
      />

      {state.kind === "idle" ? (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[22px] p-[60px] text-center">
          <div className="text-[52px] font-extrabold leading-[1.1] tracking-[-0.02em]">
            Welkom!
          </div>
          <div className="text-[24px] font-medium leading-[1.4] text-charcoal-300">
            Je bestelling verschijnt hier zodra we aanslaan.
          </div>
        </div>
      ) : null}

      {state.kind === "cart" ? (
        <div className="relative grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_minmax(360px,560px)]">
          {/* Bonregels */}
          <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto px-12 py-11">
            <div className="mb-[18px] flex items-baseline justify-between gap-4">
              <span className="whitespace-nowrap text-[15px] font-bold uppercase leading-none tracking-[0.18em] text-charcoal-400">
                Jouw bestelling · {count} {count === 1 ? "item" : "items"}
              </span>
              {state.order_no ? (
                <span className="hb-tabular whitespace-nowrap text-[20px] font-extrabold leading-none">
                  Bon {state.order_no}
                </span>
              ) : null}
            </div>
            {state.lines.map((l, i) => (
              <div
                key={i}
                className="flex items-start gap-[18px] border-b border-charcoal-800 py-4"
              >
                <span className="hb-tabular min-w-[56px] flex-none text-[28px] font-extrabold leading-[1.25] text-hop-500">
                  {l.qty} ×
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[28px] font-bold leading-[1.25]">{l.name}</div>
                  {l.sublabel ? (
                    <div className="mt-1 text-[18px] font-semibold leading-[1.3] text-charcoal-400">
                      + {l.sublabel}
                    </div>
                  ) : null}
                </div>
                <span className="hb-tabular flex-none text-[28px] font-bold leading-[1.25]">
                  {euroCents(l.total_cents)}
                </span>
              </div>
            ))}
          </div>

          {/* Totaal-paneel */}
          <aside className="flex min-h-0 flex-col border-l border-charcoal-700 bg-charcoal-800 px-10 py-11">
            <div className="mb-6 text-[15px] font-bold uppercase leading-none tracking-[0.18em] text-charcoal-400">
              Totaal
            </div>
            <div className="flex flex-col gap-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[22px] font-semibold leading-none text-charcoal-300">
                  Subtotaal
                </span>
                <span className="hb-tabular text-[24px] font-bold leading-none">
                  {euroCents(state.subtotal_cents)}
                </span>
              </div>
              {state.discount_cents > 0 ? (
                <div className="flex items-baseline justify-between text-amber-600">
                  <span className="text-[22px] font-semibold leading-none">
                    Korting{state.discount_pct > 0 ? ` (${state.discount_pct}%)` : ""}
                  </span>
                  <span className="hb-tabular text-[24px] font-bold leading-none">
                    − {euroCents(state.discount_cents)}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="my-6 h-px bg-charcoal-700" />
            <div className="flex flex-col gap-2.5">
              <span className="whitespace-nowrap text-[28px] font-extrabold leading-none">
                Te betalen
              </span>
              <span className="hb-tabular text-[64px] font-extrabold leading-none text-hop-500">
                {euroCents(state.total_cents)}
              </span>
            </div>
            <div className="mt-2.5 text-[17px] font-medium leading-none text-charcoal-400">
              incl. {euroCents(state.btw_cents)} btw
            </div>
            <div className="mt-auto flex items-center gap-3 rounded-lg border border-charcoal-700 px-5 py-[18px] text-[19px] font-semibold leading-[1.3] text-charcoal-300">
              <CreditCard size={26} className="flex-none text-hop-500" /> Betalen kan
              met PIN, contactloos of contant.
            </div>
          </aside>
        </div>
      ) : null}

      {state.kind === "paid" ? (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[26px] p-[60px] text-center">
          <div className="flex h-[140px] w-[140px] items-center justify-center rounded-full bg-hop-600">
            <Check size={76} strokeWidth={3} className="text-white" />
          </div>
          <div className="text-[64px] font-extrabold leading-[1.1] tracking-[-0.02em]">
            Betaald — bedankt!
          </div>
          <div className="hb-tabular text-[44px] font-extrabold leading-none text-hop-500">
            {euroCents(state.total_cents)}
          </div>
          <div className="text-[24px] font-medium leading-[1.4] text-charcoal-300">
            Volg je bestelnummer op het scherm bij de afhaalbalie.
          </div>
          {state.queue_label ? (
            <div className="hb-tabular mt-1.5 rounded-lg border border-charcoal-700 bg-charcoal-800 px-[38px] py-[18px] text-[56px] font-black leading-none">
              {state.queue_label}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
