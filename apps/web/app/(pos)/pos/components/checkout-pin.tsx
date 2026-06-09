"use client"
import { useState } from "react"
import type { PricedCart } from "@/lib/pos/types"
import { pollMyPosViaPi, startMyPosViaPi } from "@/lib/pi-bridge/client"

type PinPhase = "idle" | "starting" | "polling" | "approved" | "declined" | "error"

export function CheckoutPin({
  priced: _priced,
  busy,
  onPay,
  onBack,
  venueAmount,
  orderId,
  pinIdempotencyKey,
}: {
  priced: PricedCart
  busy: boolean
  onPay: () => void
  onBack: () => void
  venueAmount: number
  orderId: string
  pinIdempotencyKey: string
}) {
  const [phase, setPhase] = useState<PinPhase>("idle")
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startPin = async () => {
    setPhase("starting")
    setError(null)
    // Stable across retries — the Pi's myPOS proxy returns the existing
    // transaction if this key was seen before, no double charge.
    const res = await startMyPosViaPi({
      idempotency_key: pinIdempotencyKey,
      amount_cents: venueAmount,
      order_id: orderId,
    })
    if (!res.ok) {
      setPhase("error")
      setError(res.error)
      return
    }
    setTransactionId(res.data.transaction_id)
    setPhase("polling")
    void pollLoop(res.data.transaction_id)
  }

  const pollLoop = async (txId: string) => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      const status = await pollMyPosViaPi(txId)
      if (!status.ok) continue
      const s = status.data.status.toLowerCase()
      if (s === "approved" || s === "captured" || s === "completed") {
        setPhase("approved")
        await onPay()
        return
      }
      if (s === "declined" || s === "failed" || s === "canceled") {
        setPhase("declined")
        return
      }
    }
    setPhase("error")
    setError("PIN timeout")
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">PIN — myPOS</h2>
        <button onClick={onBack} className="text-sm opacity-70 underline">
          Terug
        </button>
      </div>
      <p className="mb-3 text-sm">
        Te betalen: <strong>€{(venueAmount / 100).toFixed(2)}</strong>
      </p>
      {phase === "idle" ? (
        <button
          disabled={busy}
          onClick={startPin}
          className="min-h-[72px] w-full rounded-xl bg-[var(--color-brand)] p-3 text-lg font-semibold text-white"
        >
          Start PIN-transactie
        </button>
      ) : null}
      {phase === "starting" ? (
        <p className="opacity-70">Verbinden met myPOS terminal…</p>
      ) : null}
      {phase === "polling" ? (
        <p>Wacht op klant — biep voor pinpas… ({transactionId?.slice(0, 8)}…)</p>
      ) : null}
      {phase === "approved" ? (
        <p className="text-emerald-700">Goedgekeurd — bestelling wordt geplaatst…</p>
      ) : null}
      {phase === "declined" ? (
        <button
          onClick={() => setPhase("idle")}
          className="min-h-[72px] w-full rounded-xl bg-[var(--color-brand)] p-3 text-lg font-semibold text-white"
        >
          Geweigerd — opnieuw proberen
        </button>
      ) : null}
      {phase === "error" ? (
        <>
          <p className="mb-3 text-sm text-red-700" role="alert">
            {error}
          </p>
          <button
            onClick={() => setPhase("idle")}
            className="min-h-[64px] w-full rounded-xl border border-[var(--color-border)] p-3"
          >
            Opnieuw
          </button>
        </>
      ) : null}
    </>
  )
}
