"use client"
import { useState } from "react"
import { setManagerPinAction } from "./actions"

export function StaffView({
  rows,
}: {
  rows: Array<{
    user_id: string
    role: string
    created_at: string
    has_manager_pin: boolean
  }>
}) {
  const [editFor, setEditFor] = useState<string | null>(null)
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const handleSave = async () => {
    if (!editFor) return
    if (pin.length < 4 || pin.length > 8) {
      setMsg("PIN moet 4-8 cijfers zijn.")
      return
    }
    setBusy(true)
    const res = await setManagerPinAction({
      target_user_id: editFor,
      pin,
    })
    setBusy(false)
    if (!res.ok) {
      setMsg(res.error)
      return
    }
    setMsg("PIN opgeslagen.")
    setPin("")
    setEditFor(null)
  }

  return (
    <>
      <table className="mb-4 w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left">
            <th className="py-2">User ID</th>
            <th>Rol</th>
            <th>Aangemeld</th>
            <th>Manager-PIN</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-b border-[var(--color-border)]">
              <td className="py-2 font-mono text-xs">{r.user_id.slice(0, 8)}…</td>
              <td>{r.role}</td>
              <td className="opacity-70">
                {new Date(r.created_at).toLocaleDateString("nl-NL")}
              </td>
              <td>{r.has_manager_pin ? "ingesteld" : "—"}</td>
              <td>
                {r.role === "manager" || r.role === "owner" ? (
                  <button
                    onClick={() => setEditFor(r.user_id)}
                    className="text-sm underline"
                  >
                    PIN instellen
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editFor ? (
        <div className="rounded-xl border border-[var(--color-border)] p-4">
          <h3 className="mb-2 font-semibold">
            PIN voor {editFor.slice(0, 8)}…
          </h3>
          <input
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="4-8 cijfers"
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-lg tracking-widest"
            autoComplete="new-password"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              disabled={busy}
              className="rounded bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:opacity-40"
            >
              Opslaan
            </button>
            <button
              onClick={() => {
                setEditFor(null)
                setPin("")
              }}
              className="px-4 py-2 text-sm underline"
            >
              Annuleer
            </button>
          </div>
        </div>
      ) : null}
      {msg ? <p className="mt-3 text-sm">{msg}</p> : null}
    </>
  )
}
