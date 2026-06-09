"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Small dialog for the Klant / Notitie utility keys — keeps the existing
 *  customer-name + order-note cart state, in the H&B dialog anatomy. */
export function NoteOverlay({
  title,
  label,
  placeholder,
  initialValue,
  maxLength = 200,
  onSave,
  onClose,
}: {
  title: string
  label: string
  placeholder: string
  initialValue: string
  maxLength?: number
  onSave: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initialValue)

  const save = () => {
    onSave(value.trim())
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(27,32,29,0.55)] p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-full overflow-hidden rounded-xl border border-line-strong bg-paper"
      >
        <div className="flex items-center justify-between border-b border-line px-7 py-6">
          <span className="text-[24px] font-extrabold leading-none text-charcoal-900">
            {title}
          </span>
          <button
            type="button"
            aria-label="Sluiten"
            onClick={onClose}
            className="inline-flex h-12 w-12 items-center justify-center text-charcoal-600"
          >
            <X size={26} />
          </button>
        </div>
        <form
          className="p-7"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label className="mb-6 block">
            <span className="mb-2 block text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
              {label}
            </span>
            <input
              autoFocus
              value={value}
              maxLength={maxLength}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="h-[60px] w-full rounded-md border border-line-strong bg-paper-bright px-[18px] text-[19px] font-semibold text-charcoal-900 outline-none placeholder:text-charcoal-400"
            />
          </label>
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" onClick={onClose} className="flex-none">
              Annuleer
            </Button>
            <Button variant="primary" size="lg" fullWidth type="submit">
              Opslaan
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
