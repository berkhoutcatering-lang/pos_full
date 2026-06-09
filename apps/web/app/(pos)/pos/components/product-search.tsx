"use client"
import { useEffect, useState } from "react"
import { Command } from "cmdk"
import type { MenuItem } from "@/lib/pos/types"

// cmdk power-search overlay. Press `/` or `Cmd+K` to open. Filters by
// name + category fuzzy-match. Selects an item → adds to cart via the
// onPick callback (which kicks the same modifier-picker flow as a tap).

export function ProductSearch({
  items,
  onPick,
}: {
  items: MenuItem[]
  onPick: (item: MenuItem) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isInputFocused())) {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      <Command
        loop
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Zoek product…"
          className="w-full border-b border-[var(--color-border)] bg-transparent p-3 text-base outline-none"
        />
        <Command.List className="max-h-[50vh] overflow-auto p-2">
          <Command.Empty className="p-4 text-sm opacity-60">Niets gevonden.</Command.Empty>
          {items.map((i) => (
            <Command.Item
              key={i.id}
              value={`${i.name} ${i.category}`}
              onSelect={() => {
                onPick(i)
                setOpen(false)
                setQuery("")
              }}
              className="flex cursor-pointer items-center justify-between rounded p-3 aria-selected:bg-[color-mix(in_oklch,var(--color-accent)_15%,transparent)]"
            >
              <span>
                <span className="font-medium">{i.name}</span>
                <span className="ml-2 text-xs opacity-60">{i.category}</span>
              </span>
              <span className="text-sm font-semibold">
                €{(i.base_price_cents / 100).toFixed(2)}
              </span>
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  )
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable
}
