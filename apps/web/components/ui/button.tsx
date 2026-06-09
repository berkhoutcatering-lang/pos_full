"use client"

import { cn } from "@/lib/cn"
import type { ButtonHTMLAttributes, ReactNode } from "react"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-hop-600 text-[var(--text-on-accent)] border border-hop-600 hover:bg-hop-700 hover:border-hop-700",
  secondary:
    "bg-paper-bright text-charcoal-900 border border-line-strong hover:bg-offwhite",
  ghost: "bg-transparent text-charcoal-800 border border-transparent hover:bg-hop-50",
  danger:
    "bg-paper-bright text-brick-600 border border-brick-600 hover:bg-brick-100",
}

const sizeClasses: Record<Size, string> = {
  sm: "h-10 px-3.5 text-[16px] gap-2 rounded-sm",
  md: "h-[52px] px-5 text-[18px] gap-2.5 rounded-md",
  lg: "h-16 px-7 text-[24px] gap-3 rounded-md",
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  icon = null,
  iconRight = null,
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex select-none items-center justify-center font-bold leading-none",
        "transition-[background,transform,border-color] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
        "active:scale-[0.97]",
        sizeClasses[size],
        variantClasses[variant],
        fullWidth && "w-full",
        disabled && "cursor-not-allowed opacity-45 active:scale-100",
        className
      )}
      {...rest}
    >
      {icon ? <span className="inline-flex">{icon}</span> : null}
      {children != null ? <span>{children}</span> : null}
      {iconRight ? <span className="inline-flex">{iconRight}</span> : null}
    </button>
  )
}
