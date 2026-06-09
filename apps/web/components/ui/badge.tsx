import { cn } from "@/lib/cn"
import type { HTMLAttributes } from "react"

type Variant = "neutral" | "accent" | "danger" | "amber" | "dark"
type Size = "sm" | "md"

const variantClasses: Record<Variant, string> = {
  neutral: "bg-offwhite text-charcoal-500 border border-line-strong",
  accent: "bg-hop-100 text-hop-700 border border-hop-300",
  danger: "bg-brick-100 text-brick-700 border border-transparent",
  amber: "bg-amber-100 text-amber-600 border border-transparent",
  dark: "bg-charcoal-900 text-offwhite border border-transparent",
}

const sizeClasses: Record<Size, string> = {
  sm: "min-h-5 px-2 py-0.5 text-[12px]",
  md: "min-h-[26px] px-2.5 py-1 text-[14px]",
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
  size?: Size
}

export function Badge({
  children,
  variant = "neutral",
  size = "md",
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm font-bold uppercase leading-none tracking-[0.04em]",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
