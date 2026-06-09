"use client"

import { cn } from "@/lib/cn"
import type { ButtonHTMLAttributes, ReactNode } from "react"

type Variant = "neutral" | "primary" | "danger" | "amber"

const variantClasses: Record<Variant, string> = {
  neutral:
    "bg-paper-bright text-charcoal-800 border border-line-strong hover:bg-offwhite [&_[data-fn-icon]]:text-charcoal-600",
  primary:
    "bg-hop-600 text-[var(--text-on-accent)] border border-hop-600 hover:bg-hop-700 [&_[data-fn-icon]]:text-[var(--text-on-accent)]",
  danger:
    "bg-paper-bright text-brick-600 border border-brick-600 hover:bg-brick-100 [&_[data-fn-icon]]:text-brick-600",
  amber:
    "bg-paper-bright text-amber-600 border border-amber-600 hover:bg-amber-100 [&_[data-fn-icon]]:text-amber-600",
}

export interface FunctionButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon?: ReactNode
  variant?: Variant
  layout?: "stack" | "inline"
  /** Optional trailing amount, e.g. "€ 37,50" (primary payment key). */
  amount?: string | null
}

export function FunctionButton({
  label,
  icon = null,
  variant = "neutral",
  layout = "stack",
  amount = null,
  disabled = false,
  className,
  ...rest
}: FunctionButtonProps) {
  const isStack = layout === "stack"

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex min-h-[var(--touch-fn)] items-center justify-center rounded-md",
        "transition-[background,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] active:scale-[0.98]",
        isStack ? "flex-col gap-1.5 px-3 py-2.5" : "flex-row gap-2.5 px-[18px]",
        variantClasses[variant],
        disabled && "cursor-not-allowed opacity-45 active:scale-100",
        className
      )}
      {...rest}
    >
      {icon ? (
        <span data-fn-icon className="inline-flex flex-none">
          {icon}
        </span>
      ) : null}
      <span
        className={cn(
          "inline-flex flex-col",
          isStack ? "items-center" : "items-start",
          !isStack && amount ? "flex-1" : "flex-none"
        )}
      >
        <span
          className={cn(
            "whitespace-nowrap font-bold leading-none",
            isStack ? "text-[16px]" : "text-[24px]"
          )}
        >
          {label}
        </span>
      </span>
      {amount ? (
        <span className="hb-tabular text-[30px] font-extrabold leading-none">
          {amount}
        </span>
      ) : null}
    </button>
  )
}
