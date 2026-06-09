"use client"

import { cn } from "@/lib/cn"
import type { ButtonHTMLAttributes, ReactNode } from "react"

export interface CategoryTabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  count?: number | null
  /** FILL colour when active — any CSS color (token var). */
  accent?: string
  icon?: ReactNode
  active?: boolean
  orientation?: "horizontal" | "vertical"
}

/** Two states only: white + grey outline, OR fully colour-filled. */
export function CategoryTab({
  label,
  count = null,
  accent = "var(--color-hop-600)",
  icon = null,
  active = false,
  orientation = "horizontal",
  className,
  style,
  ...rest
}: CategoryTabProps) {
  const vertical = orientation === "vertical"

  return (
    <button
      type="button"
      className={cn(
        "flex items-center justify-center rounded-md text-center font-bold",
        "transition-[background,color,border-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        vertical
          ? "h-full w-full min-h-[var(--rail-item-h)] flex-col gap-1.5 px-1.5 py-2 text-[16px] leading-[1.05]"
          : "h-[var(--cattab-h)] flex-row gap-2.5 whitespace-nowrap px-[22px] text-[20px] leading-[1.05]",
        !active && "border border-line-strong bg-paper-bright text-charcoal-800"
      , className)}
      style={
        active
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
      {icon ? <span className="inline-flex text-current">{icon}</span> : null}
      <span>{label}</span>
      {count != null ? (
        <span className="hb-tabular text-[14px] font-bold leading-none opacity-70">
          {count}
        </span>
      ) : null}
    </button>
  )
}
