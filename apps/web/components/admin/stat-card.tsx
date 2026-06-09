import type { ReactNode } from "react"

/** 34px icon block + caps label + 32px tabular value. */
export function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string | number
  icon: ReactNode
  /** CSS color for the icon block. */
  accent: string
}) {
  return (
    <div className="flex-1 rounded-lg border border-line-strong bg-paper-bright p-5">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span
          className="flex h-[34px] w-[34px] items-center justify-center rounded-md text-white"
          style={{ background: accent }}
        >
          {icon}
        </span>
        <span className="whitespace-nowrap text-[12px] font-bold uppercase leading-none tracking-[0.06em] text-charcoal-500">
          {label}
        </span>
      </div>
      <div className="hb-tabular text-[32px] font-extrabold leading-none text-charcoal-900">
        {value}
      </div>
    </div>
  )
}
