"use client"
import { useState } from "react"
import { setManagerPinAction } from "./actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const ROLE_BADGE: Record<string, "accent" | "neutral" | "amber" | "dark"> = {
  owner: "dark",
  manager: "accent",
  cashier: "neutral",
  viewer: "amber",
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Eigenaar",
  manager: "Manager",
  cashier: "Kassier",
  viewer: "Keuken",
}

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
      <div className="overflow-hidden rounded-lg border border-line-strong bg-paper-bright">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 border-b border-line px-5 py-3 text-[12px] font-bold uppercase leading-none tracking-[0.06em] text-charcoal-500">
          <span>Naam</span>
          <span>Rol</span>
          <span>PIN</span>
          <span>Status</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div
            key={r.user_id}
            className={`grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-3 px-5 py-4 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-charcoal-800 text-[14px] font-bold uppercase leading-none text-white">
                {r.user_id.slice(0, 2)}
              </span>
              <span className="hb-tabular truncate text-[15px] font-bold leading-none text-charcoal-900">
                {r.user_id.slice(0, 8)}…
              </span>
            </div>
            <span>
              <Badge variant={ROLE_BADGE[r.role] ?? "neutral"} size="sm">
                {ROLE_LABEL[r.role] ?? r.role}
              </Badge>
            </span>
            <span className="text-[15px] font-semibold tracking-[0.2em] text-charcoal-500">
              {r.has_manager_pin ? "••••" : "—"}
            </span>
            <span className="inline-flex items-center gap-2 text-[14px] font-semibold leading-none text-hop-700">
              <span className="h-[9px] w-[9px] rounded-full bg-hop-500" /> Actief
            </span>
            <span>
              {r.role === "manager" || r.role === "owner" ? (
                <Button variant="secondary" size="sm" onClick={() => setEditFor(r.user_id)}>
                  PIN instellen
                </Button>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      {editFor ? (
        <div className="mt-4 max-w-[460px] rounded-lg border border-line-strong bg-paper-bright p-6">
          <h3 className="mb-3 text-[18px] font-extrabold leading-none text-charcoal-900">
            Manager-PIN voor <span className="hb-tabular">{editFor.slice(0, 8)}…</span>
          </h3>
          <input
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="4-8 cijfers"
            className="hb-tabular h-[60px] w-full rounded-md border border-line-strong bg-paper-bright px-[18px] text-[24px] font-bold tracking-[0.3em] text-charcoal-900 outline-none placeholder:text-[16px] placeholder:font-medium placeholder:tracking-normal placeholder:text-charcoal-400"
            autoComplete="new-password"
          />
          <div className="mt-4 flex gap-3">
            <Button variant="primary" onClick={handleSave} disabled={busy}>
              {busy ? "Bezig…" : "Opslaan"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditFor(null)
                setPin("")
              }}
            >
              Annuleer
            </Button>
          </div>
        </div>
      ) : null}
      {msg ? (
        <p className="mt-3 text-[14px] font-semibold text-charcoal-800">{msg}</p>
      ) : null}
    </>
  )
}
