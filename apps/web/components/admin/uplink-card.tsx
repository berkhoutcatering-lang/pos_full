"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Cable,
  Check,
  Loader2,
  RefreshCw,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react"
import { uplinkViaPi, type UplinkStatus } from "@/lib/pi-bridge/client"
import { Button } from "@/components/ui/button"

// "Waarom doet PIN het niet?" in één blik. The kassa can be perfectly healthy
// while the Pi has no route to myPOS — that distinction is invisible from the
// tablet, so it has to be asked of the Pi itself.

const POLL_MS = 20_000

const TONE = {
  ok: {
    border: "border-hop-600",
    bg: "bg-hop-50",
    fg: "text-hop-700",
    chip: "bg-hop-600",
  },
  warn: {
    border: "border-amber-600",
    bg: "bg-amber-100",
    fg: "text-amber-600",
    chip: "bg-amber-600",
  },
  bad: {
    border: "border-brick-600",
    bg: "bg-brick-100",
    fg: "text-brick-600",
    chip: "bg-brick-600",
  },
} as const

function toneFor(status: UplinkStatus): keyof typeof TONE {
  if (status.state === "online") return status.clock_synced ? "ok" : "warn"
  if (status.state === "portal") return "warn"
  return "bad"
}

function headlineFor(status: UplinkStatus): string {
  switch (status.state) {
    case "online":
      return status.clock_synced ? "Internet werkt" : "Internet werkt, klok loopt achter"
    case "portal":
      return "Inlogpagina in de weg"
    case "no_internet":
      return "Verbonden, maar geen internet"
    case "down":
      return "Geen internet"
  }
}

function KindIcon({ status }: { status: UplinkStatus }) {
  const props = { size: 22, className: "text-white" }
  if (status.state === "down") return <WifiOff {...props} />
  switch (status.kind) {
    case "usb":
      return <Smartphone {...props} />
    case "ethernet":
      return <Cable {...props} />
    case "wifi":
      return <Wifi {...props} />
    default:
      return <AlertTriangle {...props} />
  }
}

export function UplinkCard() {
  const [status, setStatus] = useState<UplinkStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const check = useCallback(async (force: boolean) => {
    setChecking(true)
    const res = await uplinkViaPi(force)
    setChecking(false)
    if (!res.ok) {
      // The bridge itself is unreachable — say that, rather than blaming the
      // uplink for something we could not measure.
      setError(
        res.status === 401 || res.status === 403
          ? "Deze tablet is niet gekoppeld aan de Pi — koppel opnieuw via /pair."
          : "Pi-bridge niet bereikbaar, dus de internetstatus is onbekend.",
      )
      return
    }
    setError(null)
    setStatus(res.data)
  }, [])

  useEffect(() => {
    void check(false)
    const id = setInterval(() => void check(false), POLL_MS)
    return () => clearInterval(id)
  }, [check])

  if (error) {
    return (
      <div className="rounded-lg border border-line-strong bg-paper-bright p-5">
        <p role="alert" className="text-[15px] font-semibold text-brick-600">
          {error}
        </p>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line-strong bg-paper-bright p-5 text-[15px] font-semibold text-charcoal-500">
        <Loader2 size={18} className="animate-spin motion-reduce:animate-none" />
        Internetverbinding controleren…
      </div>
    )
  }

  const tone = TONE[toneFor(status)]

  return (
    <div className={`rounded-lg border ${tone.border} ${tone.bg} p-5`}>
      <div className="flex items-start gap-3.5">
        <span
          className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-md ${tone.chip}`}
        >
          <KindIcon status={status} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-[12px] font-bold uppercase leading-none tracking-[0.06em] text-charcoal-500">
              Internet op de Pi
            </span>
            {status.interface ? (
              <span className="hb-tabular truncate text-[12px] font-semibold leading-none text-charcoal-400">
                {status.interface}
              </span>
            ) : null}
          </div>

          <div className={`text-[20px] font-extrabold leading-tight ${tone.fg}`}>
            {headlineFor(status)}
          </div>

          <p className="mt-1.5 text-[15px] font-medium leading-[1.35] text-charcoal-600">
            {status.message}
          </p>

          <div className="mt-3 flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void check(true)}
              disabled={checking}
              icon={
                <RefreshCw
                  size={15}
                  className={checking ? "animate-spin motion-reduce:animate-none" : ""}
                />
              }
            >
              Opnieuw controleren
            </Button>
            {status.mypos_reachable ? (
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-hop-700">
                <Check size={15} strokeWidth={3} />
                PIN kan betalingen versturen
              </span>
            ) : (
              <span className="text-[13px] font-semibold text-charcoal-500">
                PIN werkt niet — reken contant af.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
