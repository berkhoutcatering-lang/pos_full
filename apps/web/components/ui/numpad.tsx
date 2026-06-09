"use client"

import { cn } from "@/lib/cn"
import type { HTMLAttributes } from "react"

export interface NumPadProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Current entry string. */
  value?: string
  onChange?: (next: string) => void
  onClear?: () => void
  keyHeight?: number
}

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "clear", "0", "back"] as const

export function NumPad({
  value = "",
  onChange,
  onClear,
  keyHeight = 64,
  className,
  ...rest
}: NumPadProps) {
  const press = (k: string) => {
    if (!onChange) return
    if (k === "back") return onChange(value.slice(0, -1))
    if (k === "clear") {
      if (onClear) onClear()
      return onChange("")
    }
    const next = (value === "0" ? "" : value) + k
    onChange(next.slice(0, 4))
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} {...rest}>
      <div
        className={cn(
          "hb-tabular flex h-14 items-center justify-end rounded-md border border-line-strong bg-paper-bright px-3.5 text-[40px] font-extrabold leading-none",
          value ? "text-charcoal-900" : "text-charcoal-300"
        )}
      >
        {value || "0"}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => {
          const isAction = k === "clear" || k === "back"
          return (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className={cn(
                "inline-flex items-center justify-center rounded-md border border-line-strong text-[30px] font-bold leading-none",
                "transition-[background] duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-[0.98]",
                isAction ? "bg-offwhite" : "bg-paper-bright",
                k === "clear" ? "text-brick-600" : "text-charcoal-900"
              )}
              style={{ height: keyHeight }}
            >
              {k === "back" ? "⌫" : k === "clear" ? "C" : k}
            </button>
          )
        })}
      </div>
    </div>
  )
}
