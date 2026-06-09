"use client"
import { useState } from "react"
import { issuePairCodeAction } from "./actions"

export function DevicesView() {
  const [code, setCode] = useState<{ code: string; expires_at: number } | null>(null)
  const [role, setRole] = useState<"cashier" | "manager">("cashier")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setBusy(true)
    setError(null)
    const res = await issuePairCodeAction({ role })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setCode(res)
  }

  return (
    <div>
      <div className="flex items-end gap-3">
        <label className="text-sm">
          Rol
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "cashier" | "manager")}
            className="mt-1 block rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
          >
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <button
          onClick={handleGenerate}
          disabled={busy}
          className="rounded bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Bezig…" : "Genereer pairing-code"}
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {code ? (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] p-4">
          <div className="font-mono text-4xl tracking-widest">{code.code}</div>
          <div className="mt-2 text-sm opacity-70">
            Geldig tot {new Date(code.expires_at).toLocaleTimeString("nl-NL")}
          </div>
        </div>
      ) : null}
    </div>
  )
}
