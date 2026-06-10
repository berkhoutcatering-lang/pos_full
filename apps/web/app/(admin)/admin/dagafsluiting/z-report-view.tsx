"use client"
import { useState } from "react"
import { Printer, ShieldCheck } from "lucide-react"
import type { ZReport } from "@/lib/dal/dagafsluiting"
import { closeDayAction } from "./actions"
import { HashChainBadge } from "@/components/hash-chain-badge"
import { PageHead } from "@/components/admin/page-head"
import { Button } from "@/components/ui/button"
import { euroCents } from "@/lib/format"
import { cn } from "@/lib/cn"

const BTW_LABELS: Record<string, string> = {
  food_9: "Eten / frisdrank",
  nonalc_beer_9: "Alcoholvrij bier",
  alcohol_21: "Alcohol",
  soda_21: "Hoog tarief",
  deposit_0: "Statiegeld",
  service_0: "Service / fooi",
}

export function ZReportView({ report }: { report: ZReport }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // Dag afsluiten is onomkeerbaar (één Z-bon per dag, verzegeld in de
  // audit-chain) — dus twee-staps: eerste tik wapent, tweede bevestigt.
  const [armed, setArmed] = useState(false)

  const handleClose = async () => {
    if (!armed) {
      setArmed(true)
      setMsg(null)
      setTimeout(() => setArmed(false), 4000)
      return
    }
    setArmed(false)
    setBusy(true)
    setMsg(null)
    const res = await closeDayAction({ date: report.date })
    setBusy(false)
    setMsg(
      res.ok
        ? "Dag afgesloten — Z-bon gaat naar de printer."
        : "Afsluiten mislukt — is er internet? Probeer het opnieuw.",
    )
  }

  const gem =
    report.order_count > 0
      ? Math.round(report.total_incl_cents / report.order_count)
      : 0
  const totalPaid =
    report.payment_split.cash_cents +
    report.payment_split.pin_cents +
    report.payment_split.ideal_cents +
    report.payment_split.other_cents
  const btwClasses = Object.entries(report.btw_breakdown).filter(
    ([, b]) => b.incl_cents > 0,
  )

  return (
    <section>
      <PageHead
        eyebrow="Operationeel · werkt offline"
        title="Dagafsluiting"
        sub={`Z-bon voor ${report.date}`}
        action={
          <Button
            variant={armed ? "danger" : "primary"}
            icon={<Printer size={18} />}
            onClick={handleClose}
            disabled={busy}
          >
            {busy
              ? "Bezig…"
              : armed
                ? "Zeker weten? Dag definitief afsluiten"
                : "Dag afsluiten + Z-bon printen"}
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <HashChainBadge />
        {msg ? (
          <span className="text-[14px] font-semibold text-charcoal-800">{msg}</span>
        ) : null}
      </div>

      {/* Receipt-style Z-bon card */}
      <div className="max-w-[560px] rounded-lg border border-line-strong bg-paper px-8 py-7">
        <div className="border-b border-dashed border-line-strong pb-[18px] text-center">
          <div className="text-[22px] font-extrabold leading-none text-charcoal-900">
            Hop &amp; Bites — Z-bon
          </div>
          <div className="hb-tabular mt-1.5 text-[13px] font-semibold leading-none text-charcoal-500">
            {report.date}
            {report.first_order_at
              ? ` · eerste bon ${new Date(report.first_order_at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </div>
        </div>

        <div className="border-b border-dashed border-line-strong py-4">
          <Row label="Aantal orders" value={String(report.order_count)} />
          <Row label="Bruto omzet" value={euroCents(report.total_incl_cents)} />
          <Row label="Waarvan BTW" value={euroCents(report.total_btw_cents)} muted />
          <Row label="Gemiddelde bon" value={euroCents(gem)} muted />
          {report.discount_cents > 0 ? (
            <Row label="Korting" value={"− " + euroCents(report.discount_cents)} muted />
          ) : null}
          {report.void_count > 0 ? (
            <Row label="Voids" value={String(report.void_count)} muted />
          ) : null}
          {report.refund_count > 0 ? (
            <Row label="Refunds" value={String(report.refund_count)} muted />
          ) : null}
        </div>

        {btwClasses.length > 0 ? (
          <div className="border-b border-dashed border-line-strong py-4">
            {btwClasses.map(([cls, b]) => (
              <Row
                key={cls}
                label={`${BTW_LABELS[cls] ?? cls} (${b.rate}%)`}
                value={euroCents(b.btw_cents)}
                muted
              />
            ))}
          </div>
        ) : null}

        <div className="border-b border-dashed border-line-strong py-4">
          <Row label="PIN / contactloos" value={euroCents(report.payment_split.pin_cents)} />
          <Row label="Contant" value={euroCents(report.payment_split.cash_cents)} />
          <Row label="iDEAL (QR)" value={euroCents(report.payment_split.ideal_cents)} />
          {report.payment_split.other_cents > 0 ? (
            <Row label="Overig" value={euroCents(report.payment_split.other_cents)} />
          ) : null}
        </div>

        <div className="flex items-baseline justify-between py-3.5">
          <span className="text-[20px] font-extrabold leading-none text-charcoal-800">
            Totaal afgerekend
          </span>
          <span className="hb-tabular text-[24px] font-extrabold leading-none text-charcoal-900">
            {euroCents(totalPaid)}
          </span>
        </div>

        <div className="mt-[18px] flex items-center gap-2.5 rounded-md border border-hop-100 bg-hop-50 px-3.5 py-3 text-[13px] font-semibold leading-[1.4] text-hop-800">
          <ShieldCheck size={18} className="flex-none text-hop-700" />
          Kasverschil {euroCents(Math.max(0, totalPaid - report.total_incl_cents))} ·
          lade geteld en bevestigd
        </div>
      </div>
    </section>
  )
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between py-[7px]">
      <span
        className={cn(
          "text-[15px] font-medium leading-none",
          muted ? "text-charcoal-500" : "text-charcoal-800"
        )}
      >
        {label}
      </span>
      <span className="hb-tabular text-[15px] font-bold leading-none text-charcoal-900">
        {value}
      </span>
    </div>
  )
}
