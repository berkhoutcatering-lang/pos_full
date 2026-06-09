export default function Loading() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-[var(--color-surface)]"
      role="status"
      aria-label="Laden"
    >
      <span className="size-8 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-brand)]" />
    </div>
  )
}
