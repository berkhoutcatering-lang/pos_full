"use client"

import { cn } from "@/lib/cn"
import { euro } from "@/lib/format"
import type { ButtonHTMLAttributes } from "react"

export interface ProductButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: string
  /** Price in euros. */
  price: number
  /** Optional, e.g. "+ topping". */
  sublabel?: string | null
  /** FILL colour when filled/selected — any CSS color (token var). */
  accent?: string
  /** Tapped/active → fully colour-filled. */
  selected?: boolean
  /** Force the colour-filled style. */
  filled?: boolean
}

/** Two states only: white + grey outline, OR fully colour-filled. */
export function ProductButton({
  name,
  price,
  sublabel = null,
  accent = "var(--color-hop-600)",
  selected = false,
  filled = false,
  disabled = false,
  className,
  style,
  ...rest
}: ProductButtonProps) {
  const isFilled = filled || selected

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "relative flex min-h-[var(--tile-min-h)] flex-col items-start justify-between overflow-hidden rounded-md px-4 py-3.5 text-left",
        "transition-[background,border-color,color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        "active:shadow-[var(--shadow-pressed)]",
        !isFilled && "border border-line-strong bg-paper-bright text-charcoal-900",
        disabled && "cursor-not-allowed opacity-40 active:shadow-none",
        className
      )}
      style={
        isFilled
          ? {
              background: accent,
              color: "var(--text-on-accent)",
              border: `1px solid ${accent}`,
              ...style,
            }
          : style
      }
      {...rest}
    >
      <span className="text-[20px] font-bold leading-[1.15] text-inherit [text-wrap:balance]">
        {name}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="hb-tabular text-[24px] font-bold leading-none text-inherit">
          {euro(price)}
        </span>
        {sublabel ? (
          <span
            className={cn(
              "text-[14px] font-medium leading-none",
              isFilled ? "text-inherit opacity-85" : "text-charcoal-500"
            )}
          >
            {sublabel}
          </span>
        ) : null}
      </span>
    </button>
  )
}
