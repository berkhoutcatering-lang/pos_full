"use client"
import { cn } from "@/lib/cn"

/** Station chips for the charcoal KDS header. */
export function StationFilter({
  stations,
  active,
  onChange,
}: {
  stations: string[]
  active: string
  onChange: (s: string) => void
}) {
  if (stations.length <= 1) return null
  return (
    <div className="flex gap-2">
      {stations.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cn(
            "h-11 rounded-md border px-5 text-[15px] font-bold capitalize leading-none transition-[background,color,border-color] duration-[var(--dur-fast)]",
            s === active
              ? "border-hop-500 bg-hop-600 text-white"
              : "border-charcoal-700 bg-transparent text-charcoal-300 hover:text-offwhite"
          )}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
