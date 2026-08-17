"use client"
import { useRef, useState } from "react"
import {
  cancelMyPosViaPi,
  pollMyPosViaPi,
  startMyPosViaPi,
} from "@/lib/pi-bridge/client"
import { Button } from "@/components/ui/button"
import { euroCents } from "@/lib/format"

// `attention` is the phase where we stop deciding. Either the Pi could not
// establish whether myPOS ever received the payment, or the terminal has been
// sitting on the amount for minutes. Both mean the card may or may not be
// charged, and only the person looking at the terminal can tell.
type PinPhase =
  | "idle"
  | "starting"
  | "polling"
  | "approved"
  | "declined"
  | "attention"
  | "error"

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
  // Bumped on every give-up so a poll loop from a previous attempt cannot
  // finish and drag the screen back to its own outcome. A ref, not state:
  // the running loop has to read the current value, not the one it closed over.
  const attemptRef = useRef(0)

  const startPin = async () => {
    const attempt = attemptRef.current
    setPhase("starting")
    setError(null)
    // Stable across retries — the Pi's myPOS proxy returns the existing
    // transaction if this key was seen before, no double charge.
    const res = await startMyPosViaPi({
      idempotency_key: pinIdempotencyKey,
      amount_cents: venueAmount,
      order_id: orderId,
    })
    if (attempt !== attemptRef.current) return
    if (!res.ok) {
      setPhase("error")
      setError(
        res.status === 503
          ? "PIN staat uit op deze Pi — reken contant af."
          : res.error,
      )
      return
    }
    setTransactionId(res.data.transaction_id)
    if (res.data.message) setError(res.data.message)

    // The cloud transport can settle immediately; a pending one is the normal
    // case and gets polled.
    if (res.data.status === "approved") {
      setPhase("approved")
      await onPay()
      return
    }
    if (res.data.status === "unresolved") {
      setPhase("attention")
      return
    }
    if (res.data.status === "declined" || res.data.status === "failed") {
      setPhase("declined")
      return
    }

    setPhase("polling")
    void pollLoop(res.data.transaction_id, attempt)
  }

  // Poll a little past the Pi's own transaction timeout (120s by default) so
  // the terminal giving up surfaces as a real status rather than as our timeout.
  const pollLoop = async (txId: string, attempt: number) => {
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      if (attempt !== attemptRef.current) return
      const status = await pollMyPosViaPi(txId)
      if (!status.ok) {
        // The Pi forgot this transaction — polling on will never resolve.
        if (status.status === 404) {
          setPhase("declined")
          setError("De betaling is niet doorgekomen — probeer opnieuw.")
          return
        }
        continue
      }
      if (status.data.message) setError(status.data.message)
      if (status.data.status === "approved") {
        setPhase("approved")
        await onPay()
        return
      }
      if (status.data.status === "unresolved" || status.data.stale) {
        setPhase("attention")
        return
      }
      if (status.data.status === "declined" || status.data.status === "failed") {
        setPhase("declined")
        return
      }
    }
    setPhase("attention")
    setError("Geen eindstatus van de terminal — kijk op de terminal wat er staat.")
  }

  /** Take the amount off the terminal so a late tap cannot still charge it. */
  const giveUp = async () => {
    attemptRef.current += 1
    const txId = transactionId
    setTransactionId(null)
    setPhase("idle")
    setError(null)
    if (txId) await cancelMyPosViaPi(txId)
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
        <div className="flex flex-col gap-3">
          <Status
            text={`Wacht op klant — houd de kaart bij de terminal… (${transactionId?.slice(0, 8)}…)`}
            pulse
          />
          <Button variant="secondary" size="lg" fullWidth onClick={giveUp}>
            Annuleren
          </Button>
        </div>
      ) : null}
      {phase === "approved" ? (
        <Status text="Goedgekeurd — bestelling wordt geplaatst…" accent />
      ) : null}

      {phase === "declined" ? (
        <div className="flex flex-col gap-3">
          {error ? (
            <p
              role="alert"
              className="rounded-md bg-brick-100 px-4 py-3 text-[15px] font-semibold text-brick-600"
            >
              {error}
            </p>
          ) : null}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              setError(null)
              setPhase("idle")
            }}
          >
            Geweigerd — opnieuw proberen
          </Button>
        </div>
      ) : null}

      {/* Deliberately no automatic choice here: booking a charged card as
          unpaid, or a failed payment as paid, are both worse than asking. */}
      {phase === "attention" ? (
        <div className="flex flex-col gap-3">
          <p
            role="alert"
            className="rounded-md bg-brick-100 px-4 py-3 text-[15px] font-semibold text-brick-600"
          >
            {error ??
              "Onbekend of de kaart belast is — kijk op de terminal voor je verder gaat."}
          </p>
          <Button variant="primary" size="lg" fullWidth disabled={busy} onClick={onPay}>
            Terminal zegt geslaagd — bon plaatsen
          </Button>
          <Button variant="secondary" size="lg" fullWidth onClick={giveUp}>
            Terminal zegt niet betaald — opnieuw
          </Button>
        </div>
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
