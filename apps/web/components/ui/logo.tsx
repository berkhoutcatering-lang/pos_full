import { cn } from "@/lib/cn"

export interface LogoProps {
  /** Monogram block size in px. */
  size?: number
  withWordmark?: boolean
  /** Eyebrow line under the wordmark, e.g. "BBQ · CATERING" or the venue. */
  eyebrow?: string | null
  className?: string
}

/** Typographic "H&B" monogram block + "Hop & Bites" wordmark.
 *  Designed for dark (charcoal) chrome; the `&` is always hop-500. */
export function Logo({
  size = 52,
  withWordmark = true,
  eyebrow = null,
  className,
}: LogoProps) {
  const wordmarkSize = Math.round(size * 0.46)
  return (
    <span className={cn("inline-flex items-center gap-4 text-offwhite", className)}>
      <span
        className="flex flex-none items-center justify-center bg-charcoal-800 font-extrabold leading-none"
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size / 4),
          fontSize: Math.round(size * 0.48),
        }}
      >
        H<span className="text-hop-500">&</span>B
      </span>
      {withWordmark ? (
        <span className="flex flex-col">
          <span
            className="font-extrabold leading-none tracking-[-0.01em]"
            style={{ fontSize: wordmarkSize }}
          >
            Hop <span className="px-px text-hop-500">&</span> Bites
          </span>
          {eyebrow ? (
            <span className="mt-[5px] text-[12px] font-semibold uppercase leading-none tracking-[0.16em] text-charcoal-400">
              {eyebrow}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  )
}
