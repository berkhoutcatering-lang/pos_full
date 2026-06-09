"use client"
import { useState, useTransition } from "react"
import Link from "next/link"
import { Send } from "lucide-react"
import { adminChatAction, type ChatMessage } from "./actions"
import { cn } from "@/lib/cn"

const STARTER_CHIPS = [
  "Wat was de omzet gisteren?",
  "Welke 5 items deden het beste deze week?",
  "Lijst open orders",
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

  const asked = messages.filter((m) => m.role === "user").map((m) => m.content)
  const chips = STARTER_CHIPS.filter((c) => !asked.includes(c))

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
    <div className="flex h-[540px] max-w-[760px] flex-col overflow-hidden rounded-lg border border-line-strong bg-paper-bright">
      {/* Messages */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="flex justify-start">
            <div className="max-w-[78%] rounded-[14px] rounded-bl-[4px] border border-line bg-paper px-4 py-3 text-[15px] font-medium leading-[1.45] text-charcoal-800">
              Hoi 👋 Vraag me iets over je omzet, bestellingen of voorraad.
            </div>
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[78%] whitespace-pre-wrap rounded-[14px] px-4 py-3 text-[15px] font-medium leading-[1.45]",
                m.role === "user"
                  ? "rounded-br-[4px] bg-hop-600 text-white"
                  : "rounded-bl-[4px] border border-line bg-paper text-charcoal-800"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending ? (
          <div className="flex justify-start">
            <div className="rounded-[14px] rounded-bl-[4px] border border-line bg-paper px-4 py-3 text-[15px] font-medium text-charcoal-500">
              Aan het denken…
            </div>
          </div>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-md bg-brick-100 px-4 py-3 text-[14px] font-semibold text-brick-600"
          >
            {error}
          </p>
        ) : null}
      </div>

      {/* Suggestion chips — consumed when used */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-6 pb-3.5">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => send(c)}
              className="whitespace-nowrap rounded-full border border-hop-300 bg-hop-50 px-3.5 py-[9px] text-[13px] font-semibold leading-none text-hop-800 transition-[background] duration-[var(--dur-fast)] hover:bg-hop-100"
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}

      {/* Usage line */}
      <div className="hb-tabular flex items-center justify-between px-6 pb-2 text-[12px] font-medium leading-none text-charcoal-500">
        <span>
          Sessie · {sessionUsage.input.toLocaleString("nl-NL")} in /{" "}
          {sessionUsage.output.toLocaleString("nl-NL")} uit / €{" "}
          {sessionUsage.cost_eur.toFixed(4)}
        </span>
        <Link href="/admin/usage" className="underline underline-offset-2">
          AI-budget bekijken
        </Link>
      </div>

      {/* Input row */}
      <div className="flex items-center gap-3 border-t border-line px-5 py-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="Typ een vraag…"
          className="h-12 flex-1 rounded-md border border-line-strong bg-paper px-4 text-[15px] font-medium text-charcoal-900 outline-none placeholder:text-charcoal-400"
        />
        <button
          type="button"
          aria-label="Stuur"
          onClick={() => send(input)}
          disabled={pending || !input.trim()}
          className="flex h-12 w-12 flex-none items-center justify-center rounded-md border-none bg-hop-600 text-white transition-[background] duration-[var(--dur-fast)] hover:bg-hop-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  )
}
