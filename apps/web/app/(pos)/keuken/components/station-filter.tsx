"use client"
import { cn } from "@/lib/cn"

/** Station chips for the charcoal KDS header. */
export function StationFilter({
  options,
  active,
  onChange,
}: {
  options: Array<{ value: string; label: string }>
  active: string
  onChange: (s: string) => void
}) {
  if (options.length <= 1) return null
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-11 rounded-md border px-5 text-[15px] font-bold leading-none transition-[background,color,border-color] duration-[var(--dur-fast)]",
            o.value === active
              ? "border-hop-500 bg-hop-600 text-white"
              : "border-charcoal-700 bg-transparent text-charcoal-300 hover:text-offwhite"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
