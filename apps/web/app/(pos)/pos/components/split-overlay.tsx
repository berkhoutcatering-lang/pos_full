"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { euroCents } from "@/lib/format"
import { cn } from "@/lib/cn"

export function SplitOverlay({
  totalCents,
  onClose,
}: {
  totalCents: number
  onClose: () => void
}) {
  const [n, setN] = useState(2)
  const per = Math.round(totalCents / n)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Splitsen"
      className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(27,32,29,0.55)] p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-full overflow-hidden rounded-xl border border-line-strong bg-paper"
      >
        <div className="flex items-center justify-between border-b border-line px-7 py-6">
          <span className="text-[24px] font-extrabold leading-none text-charcoal-900">
            Splitsen
          </span>
          <button
            type="button"
            aria-label="Sluiten"
            onClick={onClose}
            className="inline-flex h-12 w-12 items-center justify-center text-charcoal-600"
          >
            <X size={26} />
          </button>
        </div>
        <div className="p-7">
          <div className="mb-3.5 text-[17px] font-semibold leading-none text-charcoal-500">
            Gelijk verdelen over
          </div>
          <div className="mb-6 flex gap-2.5">
            {[2, 3, 4, 5].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setN(k)}
                className={cn(
                  "hb-tabular h-[72px] flex-1 rounded-md border text-[24px] font-extrabold leading-none transition-[background,color] duration-[var(--dur-fast)]",
                  n === k
                    ? "border-charcoal-900 bg-charcoal-900 text-offwhite"
                    : "border-line-strong bg-paper-bright text-charcoal-900 hover:bg-offwhite"
                )}
              >
                {k}×
              </button>
            ))}
          </div>
          <div className="flex items-baseline justify-between border-t border-line py-4">
            <span className="text-[20px] font-bold leading-none text-charcoal-900">
              Per persoon
            </span>
            <span className="hb-tabular text-[40px] font-extrabold leading-none text-hop-700">
              {euroCents(per)}
            </span>
          </div>
          <Button variant="primary" size="lg" fullWidth onClick={onClose} className="mt-3">
            Bevestig splitsing
          </Button>
        </div>
      </div>
    </div>
  )
}
