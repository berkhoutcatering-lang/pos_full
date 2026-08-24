"use client"

import { useEffect, useRef, useState } from "react"
import { CreditCard } from "lucide-react"
import { cn } from "@/lib/cn"
import {
  createTerminalLink,
  webSerialSupported,
  type TerminalLinkState,
} from "@/lib/pi-bridge/terminal-link"

/**
 * De koppeling met de betaalterminal aan de USB van dit scherm.
 *
 * Eén keer klikken en Chrome onthoudt de poort; daarna pakt hij hem bij elke
 * volgende keer vanzelf op. Staat er niets gekoppeld, dan zegt de chip dat —
 * beter dan een kassa die pas bij het afrekenen laat weten dat pinnen niet kan.
 */

const LABEL: Record<TerminalLinkState, string> = {
  unsupported: "PIN via kabel n.v.t.",
  idle: "Terminal koppelen",
  connecting: "Koppelen…",
  linked: "Terminal",
  error: "Terminal — fout",
}

const DOT: Record<TerminalLinkState, string> = {
  unsupported: "bg-charcoal-500",
  idle: "bg-amber-600",
  connecting: "bg-amber-600 animate-pulse motion-reduce:animate-none",
  linked: "bg-hop-500",
  error: "bg-brick-600",
}

export function TerminalChip({ onLight = false }: { onLight?: boolean }) {
  const [state, setState] = useState<TerminalLinkState>("idle")
  const [detail, setDetail] = useState<string | null>(null)
  const linkRef = useRef<ReturnType<typeof createTerminalLink> | null>(null)

  useEffect(() => {
    if (!webSerialSupported()) {
      setState("unsupported")
      return
    }
    const link = createTerminalLink((s, d) => {
      setState(s)
      setDetail(d ?? null)
    })
    linkRef.current = link
    // Al eerder toegestaan? Dan zonder klik oppakken, zodat een herstart van
    // het kassascherm geen handeling vraagt van wie er achter staat.
    void link.resume()
    return () => {
      void link.stop()
      linkRef.current = null
    }
  }, [])

  // Chrome geeft alleen een poort na een echte klik. Daarom is dit een knop en
  // geen automatische koppeling.
  const clickable = state === "idle" || state === "error"

  const chip = (
    <>
      <span className={cn("h-[9px] w-[9px] rounded-full", DOT[state])} />
      <CreditCard size={16} />
      {LABEL[state]}
    </>
  )

  const shell = cn(
    "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[14px] font-bold leading-none",
    onLight
      ? "border-line-strong bg-paper-bright text-charcoal-800"
      : "border-charcoal-700 bg-transparent text-charcoal-300",
  )

  if (!clickable) {
    return (
      <div
        role="status"
        aria-live="polite"
        title={detail ?? "Betaalterminal aan deze kassa"}
        className={shell}
      >
        {chip}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void linkRef.current?.choose()}
      title={detail ?? "Kies de poort waar de betaalterminal aan hangt"}
      className={cn(shell, "transition-[background] duration-[var(--dur-fast)] hover:bg-white/8")}
    >
      {chip}
    </button>
  )
}
