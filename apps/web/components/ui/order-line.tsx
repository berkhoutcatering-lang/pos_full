"use client"

import { cn } from "@/lib/cn"
import { euro } from "@/lib/format"
import type { HTMLAttributes } from "react"

export interface OrderLineProps extends HTMLAttributes<HTMLDivElement> {
  qty?: number
  name: string
  /** Optional per-unit price hint (euros). */
  unitPrice?: number | null
  /** Line total (euros). */
  lineTotal: number
  /** Optional modifier line, e.g. "+ extra kaas". */
  note?: string | null
  selected?: boolean
}

export function OrderLine({
  qty = 1,
  name,
  unitPrice = null,
  lineTotal,
  note = null,
  selected = false,
  onClick,
  className,
  ...rest
}: OrderLineProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-sm border-l-[3px] px-3.5 py-3",
        "transition-[background] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        selected ? "border-l-hop-600 bg-hop-100" : "border-l-transparent bg-transparent",
        onClick ? "cursor-pointer" : "cursor-default",
        className
      )}
      {...rest}
    >
      <span className="hb-tabular inline-flex h-[34px] min-w-10 flex-none items-center justify-center rounded-sm border border-line-strong bg-offwhite px-2 text-[18px] font-bold leading-none text-charcoal-900">
        {qty}
      </span>

      <span className="min-w-0 flex-1 pt-px">
        <span className="block text-[18px] font-semibold leading-[1.25] text-charcoal-900">
          {name}
        </span>
        {note ? (
          <span className="mt-0.5 block text-[14px] font-medium leading-[1.3] text-charcoal-500">
            {note}
          </span>
        ) : null}
        {unitPrice != null ? (
          <span className="hb-tabular mt-[3px] block text-[14px] font-normal leading-none text-charcoal-500">
            {"à " + euro(unitPrice)}
          </span>
        ) : null}
      </span>

      <span className="hb-tabular flex-none text-[18px] font-bold leading-[1.4] text-charcoal-900">
        {euro(lineTotal)}
      </span>
    </div>
  )
}
