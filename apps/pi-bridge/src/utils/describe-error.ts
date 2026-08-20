/**
 * Een fout leesbaar maken, ook als het geen Error is.
 *
 * Supabase geeft een plat object terug ({ message, code, details, hint }), en
 * `String(err)` maakt daar "[object Object]" van. Daardoor stond er in het log
 * van de outbox twaalf keer een mislukte aflevering zonder één woord over de
 * reden — precies wanneer je die reden het hardst nodig hebt.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === "object") {
    const e = err as { message?: string; code?: string; details?: string; hint?: string }
    const parts = [
      e.code ? `[${e.code}]` : null,
      e.message ?? null,
      e.details ?? null,
      e.hint ? `hint: ${e.hint}` : null,
    ].filter(Boolean)
    if (parts.length > 0) return parts.join(" ")
    try {
      return JSON.stringify(err)
    } catch {
      return "onbekende fout"
    }
  }
  return String(err)
}
