"use client"
import { useEffect, useState } from "react"
import { Command } from "cmdk"
import type { MenuItem } from "@/lib/pos/types"
import { euroCents } from "@/lib/format"

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(27,32,29,0.55)] p-4 pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      <Command
        loop
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line-strong bg-paper shadow-[var(--shadow-raised)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Zoek product…"
          className="w-full border-b border-line bg-transparent px-4 py-3.5 text-[18px] font-semibold text-charcoal-900 outline-none placeholder:text-charcoal-400"
        />
        <Command.List className="max-h-[50vh] overflow-auto p-2">
          <Command.Empty className="p-4 text-[15px] font-medium text-charcoal-500">
            Niets gevonden.
          </Command.Empty>
          {items.map((i) => (
            <Command.Item
              key={i.id}
              value={`${i.name} ${i.category}`}
              onSelect={() => {
                onPick(i)
                setOpen(false)
                setQuery("")
              }}
              className="flex cursor-pointer items-center justify-between rounded-sm px-3.5 py-3 aria-selected:bg-hop-100"
            >
              <span>
                <span className="text-[17px] font-semibold text-charcoal-900">
                  {i.name}
                </span>
                <span className="ml-2 text-[13px] font-medium capitalize text-charcoal-500">
                  {i.category}
                </span>
              </span>
              <span className="hb-tabular text-[16px] font-bold text-charcoal-900">
                {euroCents(i.base_price_cents)}
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
