"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound } from "lucide-react"

const PI_BASE = process.env.NEXT_PUBLIC_PI_BRIDGE_URL ?? "https://hopbites.local:3001"

export function PairView() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const handlePair = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${PI_BASE}/pair`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) {
        setError(
          res.status === 401
            ? "Code ongeldig of verlopen — genereer een nieuwe onder Admin → Apparaten."
            : `Pi-bridge gaf een fout (${res.status}).`,
        )
        return
      }
      const data = (await res.json()) as { terminal_id: string }
      setDone(data.terminal_id)
      setTimeout(() => router.push("/pos"), 1500)
    } catch {
      setError(
        "Pi-bridge niet bereikbaar. Zit deze tablet op het netwerk van de Pi en is het CA-certificaat (hopbites-ca.crt) geïnstalleerd?",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-8">
      <div className="w-[480px] max-w-full rounded-lg border border-line-strong bg-paper-bright p-8">
        <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-charcoal-800">
          <KeyRound size={24} className="text-white" />
        </span>
        <h1 className="mb-1.5 text-[28px] font-extrabold leading-[1.1] text-charcoal-900">
          Tablet koppelen
        </h1>
        <p className="mb-7 text-[15px] font-medium leading-[1.45] text-charcoal-500">
          Vul de 8-tekens pairing-code in die de manager genereerde onder
          Admin → Apparaten. Daarna praat deze tablet 30 dagen rechtstreeks
          met de Pi — ook zonder internet.
        </p>

        {done ? (
          <div className="rounded-md bg-hop-600/10 px-4 py-4 text-[16px] font-bold text-hop-700">
            Gekoppeld ✓ — terminal {done.slice(0, 8)}… Je gaat nu naar de kassa.
          </div>
        ) : (
          <>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="A1B2C3D4"
              className="hb-tabular mb-4 h-[64px] w-full rounded-md border border-line-strong bg-paper px-[18px] text-center text-[30px] font-extrabold tracking-[0.3em] text-charcoal-900 outline-none placeholder:text-charcoal-300"
            />
            {error ? (
              <p role="alert" className="mb-4 rounded-md bg-brick-100 px-4 py-3 text-[14px] font-semibold text-brick-600">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={handlePair}
              disabled={busy || code.trim().length !== 8}
              className="h-14 w-full rounded-md border border-hop-600 bg-hop-600 text-[18px] font-bold leading-none text-[var(--text-on-accent)] hover:bg-hop-700 disabled:opacity-50"
            >
              {busy ? "Bezig…" : "Koppel deze tablet"}
            </button>
          </>
        )}
      </div>
    </main>
  )
}
