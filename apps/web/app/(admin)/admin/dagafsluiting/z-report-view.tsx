"use client"
import { useState } from "react"
import type { ZReport } from "@/lib/dal/dagafsluiting"
import { closeDayAction } from "./actions"
import { HashChainBadge } from "@/components/hash-chain-badge"

export function ZReportView({ report }: { report: ZReport }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const handleClose = async () => {
    setBusy(true)
    setMsg(null)
    const res = await closeDayAction({ date: report.date })
    setBusy(false)
    setMsg(res.ok ? "Dag afgesloten + audit_log geschreven." : `Fout: ${res.error}`)
  }

  const eur = (c: number) => `€${(c / 100).toFixed(2)}`

  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Z-rapport — {report.date}</h2>
          <HashChainBadge />
        </div>
        <button
          onClick={handleClose}
          disabled={busy}
          className="rounded bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Bezig…" : "Sluit dag af + print"}
        </button>
      </header>
      {msg ? <p className="mb-3 text-sm">{msg}</p> : null}

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Orders" value={report.order_count.toString()} />
        <Stat label="Voids" value={report.void_count.toString()} />
        <Stat label="Refunds" value={report.refund_count.toString()} />
        <Stat label="Subtotaal excl." value={eur(report.total_excl_cents)} />
        <Stat label="BTW totaal" value={eur(report.total_btw_cents)} />
        <Stat label="Totaal incl." value={eur(report.total_incl_cents)} bold />
      </div>

      <h3 className="mb-2 text-lg font-semibold">BTW-splits</h3>
      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left">
            <th className="py-2">Klasse</th>
            <th>Tarief</th>
            <th>Excl.</th>
            <th>BTW</th>
            <th>Incl.</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(report.btw_breakdown).map(([cls, b]) => (
            <tr key={cls} className="border-b border-[var(--color-border)]">
              <td className="py-2">{cls}</td>
              <td>{b.rate}%</td>
              <td>{eur(b.excl_cents)}</td>
              <td>{eur(b.btw_cents)}</td>
              <td>{eur(b.incl_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-2 text-lg font-semibold">Betaalmethoden</h3>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Cash" value={eur(report.payment_split.cash_cents)} />
        <Stat label="PIN" value={eur(report.payment_split.pin_cents)} />
        <Stat label="iDEAL" value={eur(report.payment_split.ideal_cents)} />
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-3">
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className={`mt-1 text-xl ${bold ? "font-bold" : "font-medium"}`}>
        {value}
      </div>
    </div>
  )
}
