"use client"
import { useState } from "react"
import { pollMyPosViaPi, startMyPosViaPi } from "@/lib/pi-bridge/client"
import { Button } from "@/components/ui/button"
import { euroCents } from "@/lib/format"

type PinPhase = "idle" | "starting" | "polling" | "approved" | "declined" | "error"

export function CheckoutPin({
  busy,
  error: payError,
  onPay,
  onBack,
  venueAmount,
  orderId,
  pinIdempotencyKey,
}: {
  busy: boolean
  error: string | null
  onPay: () => Promise<void> | void
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
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <span className="text-[20px] font-semibold leading-none text-charcoal-500">
          Te betalen
        </span>
        <span className="hb-tabular text-[40px] font-extrabold leading-none text-charcoal-900">
          {euroCents(venueAmount)}
        </span>
      </div>

      {phase === "idle" ? (
        <div className="flex gap-3">
          <Button variant="secondary" size="lg" onClick={onBack} className="flex-none">
            Terug
          </Button>
          <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={startPin}>
            Start PIN-transactie
          </Button>
        </div>
      ) : null}

      {phase === "starting" ? (
        <Status text="Verbinden met myPOS terminal…" />
      ) : null}
      {phase === "polling" ? (
        <Status
          text={`Wacht op klant — houd de kaart bij de terminal… (${transactionId?.slice(0, 8)}…)`}
          pulse
        />
      ) : null}
      {phase === "approved" ? (
        <Status text="Goedgekeurd — bestelling wordt geplaatst…" accent />
      ) : null}

      {phase === "declined" ? (
        <Button variant="primary" size="lg" fullWidth onClick={() => setPhase("idle")}>
          Geweigerd — opnieuw proberen
        </Button>
      ) : null}

      {phase === "error" || payError ? (
        <div className="mt-4">
          {error || payError ? (
            <p role="alert" className="mb-4 rounded-md bg-brick-100 px-4 py-3 text-[15px] font-semibold text-brick-600">
              {error ?? payError}
            </p>
          ) : null}
          {phase === "error" ? (
            <Button variant="secondary" size="lg" fullWidth onClick={() => setPhase("idle")}>
              Opnieuw
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Status({
  text,
  accent = false,
  pulse = false,
}: {
  text: string
  accent?: boolean
  pulse?: boolean
}) {
  return (
    <p
      className={`flex min-h-16 items-center justify-center rounded-md border border-line px-5 text-center text-[17px] font-semibold ${
        accent ? "text-hop-700" : "text-charcoal-800"
      } ${pulse ? "animate-pulse motion-reduce:animate-none" : ""}`}
    >
      {text}
    </p>
  )
}
