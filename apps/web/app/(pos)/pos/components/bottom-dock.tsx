"use client"

import {
  Archive,
  Banknote,
  CreditCard,
  Pause,
  Pencil,
  Percent,
  Split,
  Undo2,
  User,
} from "lucide-react"
import { FunctionButton } from "@/components/ui/function-button"
import { euroCents } from "@/lib/format"
import { cn } from "@/lib/cn"

export type UtilityAction = "lade" | "klant" | "notitie"

export function BottomDock({
  totalCents,
  empty,
  canResumeHold = false,
  discountPct,
  onKorting,
  onHold,
  onSplit,
  onRetour,
  onUtility,
  onPay,
  onAfrekenen,
}: {
  totalCents: number
  empty: boolean
  canResumeHold?: boolean
  discountPct: number
  onKorting: () => void
  onHold: () => void
  onSplit: () => void
  onRetour: () => void
  onUtility: (a: UtilityAction) => void
  onPay: (method: "pin" | "cash") => void
  onAfrekenen: () => void
}) {
  return (
    <div className="flex h-[232px] flex-none gap-3">
      {/* FunctionGrid 2×2 */}
      <div className="grid w-[380px] flex-none grid-cols-2 grid-rows-2 gap-2.5">
        <FunctionButton
          label="Korting"
          icon={<Percent size={24} />}
          variant={discountPct > 0 ? "amber" : "neutral"}
          onClick={onKorting}
          disabled={empty}
          className="h-full w-full"
        />
        <FunctionButton
          label="In de wacht"
          icon={<Pause size={24} />}
          onClick={onHold}
          disabled={empty && !canResumeHold}
          className="h-full w-full"
        />
        <FunctionButton
          label="Splitsen"
          icon={<Split size={24} />}
          onClick={onSplit}
          disabled={empty}
          className="h-full w-full"
        />
        <FunctionButton
          label="Retour"
          icon={<Undo2 size={24} />}
          variant="danger"
          onClick={onRetour}
          disabled={empty}
          className="h-full w-full"
        />
      </div>

      {/* Utility strip */}
      <div className="flex w-[92px] flex-none flex-col gap-2.5">
        <UtilityKey label="Lade" icon={<Archive size={22} />} onClick={() => onUtility("lade")} />
        <UtilityKey label="Klant" icon={<User size={22} />} onClick={() => onUtility("klant")} />
        <UtilityKey label="Notitie" icon={<Pencil size={22} />} onClick={() => onUtility("notitie")} />
      </div>

      {/* Payment column */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <button
          type="button"
          data-testid="cart-pay-button"
          onClick={onAfrekenen}
          disabled={empty}
          className={cn(
            "flex h-[76px] flex-none items-center justify-between rounded-md bg-charcoal-900 px-[18px]",
            "transition-transform duration-[var(--dur-fast)] active:scale-[0.99]",
            empty && "cursor-not-allowed opacity-45 active:scale-100"
          )}
        >
          <span className="text-[18px] font-bold leading-none text-charcoal-300">
            Totaal
          </span>
          <span className="hb-tabular text-[38px] font-extrabold leading-none text-offwhite">
            {euroCents(totalCents)}
          </span>
        </button>

        <div className="flex min-h-0 flex-1 gap-2.5">
          <PayKey
            label="PIN"
            icon={<CreditCard size={26} />}
            onClick={() => onPay("pin")}
            disabled={empty}
            className="border-hop-600 bg-hop-600 text-[var(--text-on-accent)] hover:bg-hop-700"
          />
          <PayKey
            label="Contant"
            icon={<Banknote size={26} />}
            onClick={() => onPay("cash")}
            disabled={empty}
            className="border-line-strong bg-paper-bright text-charcoal-900 hover:bg-offwhite"
          />
        </div>
      </div>
    </div>
  )
}

function UtilityKey({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center gap-[5px] rounded-md border border-line-strong bg-paper-bright text-[14px] font-bold leading-none text-charcoal-800 transition-[background] duration-[var(--dur-fast)] hover:bg-offwhite active:scale-[0.98]"
    >
      <span className="text-charcoal-600">{icon}</span> {label}
    </button>
  )
}

function PayKey({
  label,
  icon,
  onClick,
  disabled,
  className,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-1 items-center justify-center gap-2.5 rounded-md border text-[24px] font-extrabold leading-none",
        "transition-[background,transform] duration-[var(--dur-fast)] active:scale-[0.98]",
        disabled && "cursor-not-allowed opacity-45 active:scale-100",
        className
      )}
    >
      {icon} {label}
    </button>
  )
}
