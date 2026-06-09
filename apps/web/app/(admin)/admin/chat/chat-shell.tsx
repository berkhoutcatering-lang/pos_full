"use client"
import { useState, useTransition } from "react"
import { adminChatAction, type ChatMessage } from "./actions"

const STARTER_CHIPS = [
  "wat was de omzet gisteren?",
  "welke 5 items deden het beste deze week?",
  "lijst open orders",
  "Z-rapport van vandaag",
]

interface SessionUsage {
  input: number
  output: number
  cost_eur: number
}

export function ChatShell() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sessionUsage, setSessionUsage] = useState<SessionUsage>({
    input: 0,
    output: 0,
    cost_eur: 0,
  })
  const [pending, startTransition] = useTransition()

  const send = (text: string) => {
    if (!text.trim() || pending) return
    const next: ChatMessage[] = [...messages, { role: "user", content: text.trim() }]
    setMessages(next)
    setInput("")
    setError(null)
    startTransition(async () => {
      const res = await adminChatAction(next)
      if (!res.ok) {
        setError(res.message ?? res.error)
        return
      }
      setMessages([...next, { role: "assistant", content: res.text }])
      setSessionUsage((prev) => ({
        input: prev.input + res.usage.input,
        output: prev.output + res.usage.output,
        cost_eur: prev.cost_eur + res.usage.cost_eur,
      }))
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--color-border)] p-3">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm opacity-60">Stel een vraag of tap een suggestie.</p>
            <div className="flex flex-wrap gap-2">
              {STARTER_CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => send(c)}
                  className="rounded-full border border-[var(--color-border)] bg-[color-mix(in_oklch,var(--color-accent)_10%,transparent)] px-3 py-1.5 text-sm hover:bg-[color-mix(in_oklch,var(--color-accent)_20%,transparent)]"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="mb-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">
                {m.role === "user" ? "Jij" : "Hop"}
              </div>
              <div className="whitespace-pre-wrap text-sm">{m.content}</div>
            </div>
          ))
        )}
        {pending ? <p className="text-sm opacity-60">Aan het denken…</p> : null}
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-xs opacity-60">
        <span>
          Sessie · {sessionUsage.input.toLocaleString()} in /{" "}
          {sessionUsage.output.toLocaleString()} out / €
          {sessionUsage.cost_eur.toFixed(4)}
        </span>
        <a href="/admin/usage" className="underline">
          AI-budget bekijken
        </a>
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="Vraag iets…"
          className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        />
        <button
          onClick={() => send(input)}
          disabled={pending || !input.trim()}
          className="rounded bg-[var(--color-brand)] px-5 font-semibold text-white disabled:opacity-40"
        >
          Stuur
        </button>
      </div>
    </div>
  )
}
