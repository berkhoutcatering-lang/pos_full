"use client"

export function CategoryTabs({
  categories,
  active,
  onChange,
}: {
  categories: string[]
  active: string
  onChange: (c: string) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      {categories.map((c) => {
        const isActive = c === active
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`min-h-[56px] whitespace-nowrap rounded-full px-5 text-base font-medium capitalize transition-colors ${
              isActive
                ? "bg-[var(--color-brand)] text-white"
                : "bg-[color-mix(in_oklch,var(--color-accent)_15%,transparent)] text-[var(--color-surface-fg)]"
            }`}
          >
            {c}
          </button>
        )
      })}
    </div>
  )
}
