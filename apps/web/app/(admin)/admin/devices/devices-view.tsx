"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Cpu, KeyRound, TabletSmartphone } from "lucide-react"
import { issuePairCodeAction, revokeTabletAction, type PairedTablet } from "./actions"
import { Button } from "@/components/ui/button"

export function DevicesView({ tablets }: { tablets: PairedTablet[] | null }) {
  const router = useRouter()
  const [revoking, startRevoke] = useTransition()
  const [code, setCode] = useState<{ code: string; expires_at: number } | null>(null)
  const [role, setRole] = useState<"cashier" | "manager">("cashier")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRevoke = (jti: string, terminal: string) => {
    if (!window.confirm(`Tablet ${terminal.slice(0, 8)}… intrekken? Die moet daarna opnieuw gekoppeld worden.`)) return
    setError(null)
    startRevoke(async () => {
      const res = await revokeTabletAction({ jti })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

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
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Pi-bridge hub card (highlighted) */}
      <div className="rounded-lg border border-hop-300 bg-hop-50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-hop-600">
            <Cpu size={22} className="text-white" />
          </span>
          <span className="inline-flex items-center gap-[7px] text-[13px] font-bold leading-none text-hop-600">
            <span className="h-[9px] w-[9px] rounded-full bg-hop-500" /> Online
          </span>
        </div>
        <div className="text-[18px] font-extrabold leading-none text-charcoal-900">
          Pi-bridge
        </div>
        <div className="mb-2.5 mt-1.5 text-[13px] font-semibold leading-none text-charcoal-500">
          Edge-hub · LAN
        </div>
        <div className="text-[13px] font-medium leading-[1.3] text-charcoal-500">
          Spil van de service — bereikbaar op{" "}
          <code className="font-semibold text-charcoal-800">hopbites.local</code>
        </div>
      </div>

      {/* Pairing card */}
      <div className="rounded-lg border border-line-strong bg-paper-bright p-5 xl:col-span-2">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-charcoal-800">
            <KeyRound size={22} className="text-white" />
          </span>
          <div>
            <div className="text-[18px] font-extrabold leading-none text-charcoal-900">
              Tablet koppelen
            </div>
            <div className="mt-1.5 text-[13px] font-medium leading-none text-charcoal-500">
              Genereer een pairing-code en voer die in op de tablet bij{" "}
              <code className="font-semibold text-charcoal-800">https://hopbites.local/pair</code>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
              Rol
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "cashier" | "manager")}
              className="h-12 rounded-md border border-line-strong bg-paper-bright px-3 text-[15px] font-semibold text-charcoal-900 outline-none"
            >
              <option value="cashier">Kassier</option>
              <option value="manager">Manager</option>
            </select>
          </label>
          <Button variant="primary" onClick={handleGenerate} disabled={busy}>
            {busy ? "Bezig…" : "Genereer pairing-code"}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-md bg-brick-100 px-4 py-3 text-[14px] font-semibold text-brick-600">
            {error}
          </p>
        ) : null}

        {code ? (
          <div className="mt-4 rounded-md border border-line-strong bg-paper p-5">
            <div className="hb-tabular text-[40px] font-extrabold tracking-[0.3em] text-charcoal-900">
              {code.code}
            </div>
            <div className="hb-tabular mt-2 text-[14px] font-medium leading-none text-charcoal-500">
              Geldig tot {new Date(code.expires_at).toLocaleTimeString("nl-NL")}
            </div>
          </div>
        ) : null}
      </div>

      {/* Paired tablets */}
      <div className="rounded-lg border border-line-strong bg-paper-bright p-5 xl:col-span-3">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-charcoal-800">
            <TabletSmartphone size={22} className="text-white" />
          </span>
          <div>
            <div className="text-[18px] font-extrabold leading-none text-charcoal-900">
              Gekoppelde tablets
            </div>
            <div className="mt-1.5 text-[13px] font-medium leading-none text-charcoal-500">
              Intrekken blokkeert de tablet direct op de Pi-bridge (ook offline).
            </div>
          </div>
        </div>

        {tablets === null ? (
          <p className="text-[14px] font-medium text-charcoal-500">
            Kon de lijst niet ophalen — is de Pi-bridge bereikbaar?
          </p>
        ) : tablets.length === 0 ? (
          <p className="text-[14px] font-medium text-charcoal-500">
            Nog geen tablets gekoppeld — genereer hierboven een pairing-code.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-line">
            {tablets.map((t, i) => (
              <div
                key={t.jti}
                className={`flex items-center gap-4 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold leading-none text-charcoal-900">
                    {t.terminal_id.slice(0, 8)}…{" "}
                    <span className="font-semibold text-charcoal-500">
                      · {t.role === "manager" ? "Manager" : "Kassier"}
                    </span>
                  </div>
                  <div className="hb-tabular mt-1 text-[13px] font-medium leading-none text-charcoal-500">
                    Gekoppeld {new Date(t.paired_at).toLocaleString("nl-NL")}
                    {t.last_seen_at
                      ? ` · laatst gezien ${new Date(t.last_seen_at).toLocaleString("nl-NL")}`
                      : ""}
                  </div>
                </div>
                {t.revoked ? (
                  <span className="rounded-md bg-brick-100 px-2.5 py-1.5 text-[12px] font-bold leading-none text-brick-600">
                    Ingetrokken
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={revoking}
                    onClick={() => handleRevoke(t.jti, t.terminal_id)}
                    className="h-9 rounded-md border border-brick-600/30 bg-brick-100 px-3.5 text-[13px] font-bold text-brick-600 disabled:opacity-50"
                  >
                    Intrekken
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
