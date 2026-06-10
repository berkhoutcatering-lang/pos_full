"use client"
import { useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
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

  return (
    <div className="flex h-dvh flex-col bg-charcoal-900 text-offwhite">
      <header className="flex h-[88px] flex-none items-center justify-between border-b border-charcoal-700 px-10">
        <div className="text-[28px] font-extrabold leading-none">
          Hop <span className="text-hop-500">&amp;</span> Bites
        </div>
        <div className="text-[14px] font-bold uppercase leading-none tracking-[0.22em] text-charcoal-400">
          Jouw bestelling
        </div>
      </header>

      {state.kind === "idle" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <div className="text-[64px] font-black leading-[1.05] tracking-[-0.02em]">
            Welkom!
          </div>
          <div className="text-[24px] font-semibold text-charcoal-400">
            Bestel bij de kassa — je ziet je bon hier meelopen.
          </div>
        </div>
      ) : null}

      {state.kind === "cart" ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-10 py-7">
            {state.customer_name ? (
              <div className="mb-4 text-[20px] font-bold leading-none text-charcoal-400">
                Voor {state.customer_name}
              </div>
            ) : null}
            <div className="flex flex-col gap-3.5">
              {state.lines.map((l, i) => (
                <div key={i} className="flex items-baseline gap-4">
                  <span className="hb-tabular min-w-[52px] text-[30px] font-extrabold leading-none text-hop-500">
                    {l.qty}×
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[30px] font-bold leading-[1.15]">
                    {l.name}
                  </span>
                  <span className="hb-tabular text-[30px] font-extrabold leading-none">
                    {euroCents(l.total_cents)}
                  </span>
                </div>
              ))}
              {state.discount_cents > 0 ? (
                <div className="flex items-baseline justify-between text-amber-500">
                  <span className="text-[24px] font-bold">Korting</span>
                  <span className="hb-tabular text-[24px] font-extrabold">
                    − {euroCents(state.discount_cents)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <footer className="flex h-[120px] flex-none items-center justify-between border-t border-charcoal-700 bg-charcoal-800 px-10">
            <span className="text-[26px] font-bold leading-none text-charcoal-300">
              Totaal
            </span>
            <span className="hb-tabular text-[56px] font-black leading-none">
              {euroCents(state.total_cents)}
            </span>
          </footer>
        </>
      ) : null}

      {state.kind === "paid" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-hop-600">
            <Check size={52} strokeWidth={3} className="text-offwhite" />
          </div>
          <div className="text-[34px] font-bold leading-none text-charcoal-300">
            Betaald · {euroCents(state.total_cents)}
          </div>
          {state.queue_label ? (
            <>
              <div className="text-[18px] font-bold uppercase tracking-[0.22em] text-charcoal-400">
                Jouw afroepnummer
              </div>
              <div className="hb-tabular text-[140px] font-black leading-none text-hop-500">
                {state.queue_label}
              </div>
            </>
          ) : null}
          <div className="text-[24px] font-semibold text-charcoal-400">
            Bedankt — we roepen je zo om!
          </div>
        </div>
      ) : null}
    </div>
  )
}
