"use client"

import { cn } from "@/lib/cn"
import type { HTMLAttributes } from "react"

export interface QtyStepperProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: number
  min?: number
  max?: number
  size?: "sm" | "md"
  onChange?: (next: number) => void
}

export function QtyStepper({
  value = 1,
  min = 0,
  max = 99,
  size = "md",
  onChange,
  className,
  ...rest
}: QtyStepperProps) {
  const dim = size === "sm" ? 40 : 52
  const set = (next: number) => {
    const clamped = Math.max(min, Math.min(max, next))
    if (clamped !== value && onChange) onChange(clamped)
  }

  const btn = (label: string, fn: () => void, disabled: boolean) => (
    <button
      type="button"
      disabled={disabled}
      onClick={fn}
      className={cn(
        "inline-flex flex-none items-center justify-center border-none bg-paper-bright text-[30px] font-bold leading-none",
        disabled ? "cursor-not-allowed text-charcoal-300" : "text-charcoal-900"
      )}
      style={{ width: dim, height: dim }}
    >
      {label}
    </button>
  )

  return (
    <div
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border border-line-strong",
        className
      )}
      {...rest}
    >
      {btn("−", () => set(value - 1), value <= min)}
      <span
        className="hb-tabular inline-flex items-center justify-center border-x border-line bg-offwhite text-[24px] font-bold leading-none text-charcoal-900"
        style={{ minWidth: dim, height: dim }}
      >
        {value}
      </span>
      {btn("+", () => set(value + 1), value >= max)}
    </div>
  )
}
