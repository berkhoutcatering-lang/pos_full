"use client"
import { useState } from "react"
import { verifyChainAction } from "./actions"

interface Row {
  seq_id: number
  event_type: string
  actor: string
  hash_curr: string
  created_at: string
}

export function AuditView({ rows, orgId }: { rows: Row[]; orgId: string }) {
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const verify = async () => {
    setVerifying(true)
    setResult(null)
    const oldest = rows[rows.length - 1]?.seq_id
    const newest = rows[0]?.seq_id
    const res = await verifyChainAction({ from_seq: oldest, to_seq: newest })
    setVerifying(false)
    // The action can return a plain error shape ({ ok: false, error }) as
    // well as the chain-verify union — both have ok:false, so discriminate
    // on the presence of `error` first, then on `ok` for intact vs broken.
    if ("error" in res) {
      setResult(`Hash chain check faalde: ${res.error}`)
      return
    }
    if (res.ok) {
      setResult(`Hash chain intact (${res.verified} events geverifieerd).`)
    } else {
      setResult(
        `BREEK PUNT bij seq ${res.broken_at_seq}: verwacht ${res.expected.slice(0, 16)}…, gevonden ${res.actual.slice(0, 16)}…`,
      )
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={verify}
          disabled={verifying}
          className="rounded bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          {verifying ? "Verifieren…" : "Verifieer hash chain"}
        </button>
        {result ? <span className="text-sm">{result}</span> : null}
      </div>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left">
            <th className="py-2">seq</th>
            <th>wanneer</th>
            <th>type</th>
            <th>actor</th>
            <th>hash_curr</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.seq_id} className="border-b border-[var(--color-border)]">
              <td className="py-1">{e.seq_id}</td>
              <td>{new Date(e.created_at).toLocaleString("nl-NL")}</td>
              <td>{e.event_type}</td>
              <td>{e.actor}</td>
              <td>{e.hash_curr.slice(0, 24)}…</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
