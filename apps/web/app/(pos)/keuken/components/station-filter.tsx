"use client"

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
          className={`min-h-[44px] rounded-full px-4 text-sm font-medium capitalize ${
            s === active
              ? "bg-[var(--color-brand)] text-white"
              : "bg-[color-mix(in_oklch,var(--color-accent)_15%,transparent)]"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
