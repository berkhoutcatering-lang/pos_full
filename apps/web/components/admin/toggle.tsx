"use client"

/** 56×32 switch: hop-600 on / charcoal-300 off, animated knob. */
export function Toggle({
  on,
  onChange,
  accent = "var(--color-hop-600)",
  label,
  disabled = false,
}: {
  on: boolean
  onChange: () => void
  /** Fill color when on (Prijs page uses amber). */
  accent?: string
  label?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="relative h-8 w-14 flex-none rounded-full border-none transition-[background] duration-[var(--dur-base)] ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-45"
      style={{ background: on ? accent : "var(--color-charcoal-300)" }}
    >
      <span
        className="absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white transition-[left] duration-[var(--dur-base)] ease-[var(--ease-out)]"
        style={{ left: on ? 27 : 3 }}
      />
    </button>
  )
}
