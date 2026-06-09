import type { ReactNode } from "react"

/** Every admin page starts with this: eyebrow / 34px title / muted
 *  subtitle / optional action button right. */
export function PageHead({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow?: string
  title: string
  sub?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <div className="mb-2 text-[12px] font-bold uppercase leading-none tracking-[0.16em] text-hop-700">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.02em] text-charcoal-900">
          {title}
        </h2>
        {sub ? (
          <p className="mt-2 text-[16px] font-medium leading-[1.4] text-charcoal-500">
            {sub}
          </p>
        ) : null}
      </div>
      {action ?? null}
    </div>
  )
}
