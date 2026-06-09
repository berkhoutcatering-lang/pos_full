"use client"

import { Hash } from "lucide-react"
import { NumPad } from "@/components/ui/numpad"
import { cn } from "@/lib/cn"

/** Quantity-first entry: typed number buffers; the next product tap adds
 *  that many. */
export function NumpadCell({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const active = !!value && parseInt(value, 10) > 1
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-lg border border-line-strong bg-paper p-3">
      <div
        className={cn(
          "flex flex-none items-center gap-2 text-[14px] font-bold leading-[1.3]",
          active ? "text-hop-700" : "text-charcoal-500"
        )}
      >
        <Hash size={16} />
        {active
          ? `${parseInt(value, 10)}× — tik nu een product`
          : "Aantal vooraf, dan een product"}
      </div>
      <div className="min-h-0 flex-1">
        <NumPad value={value} onChange={onChange} keyHeight={54} />
      </div>
    </div>
  )
}
