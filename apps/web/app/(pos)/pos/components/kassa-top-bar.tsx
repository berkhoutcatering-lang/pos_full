"use client"

import Link from "next/link"
import { LayoutGrid, ShoppingBag } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { ConnectionChip } from "@/components/connection-chip"

export function KassaTopBar() {
  return (
    <header className="flex h-[var(--topbar-h)] flex-none items-center justify-between gap-6 bg-charcoal-900 px-5">
      <div className="flex items-center gap-3.5">
        <Link
          href="/"
          title="Naar start"
          className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-white/8 text-offwhite"
        >
          <LayoutGrid size={22} />
        </Link>
        <Logo size={48} eyebrow="BBQ · CATERING" />
      </div>

      <span className="hidden h-11 items-center gap-2 rounded-md border border-charcoal-700 px-4 text-[16px] font-bold leading-none text-charcoal-300 md:inline-flex">
        <ShoppingBag size={18} /> Afhalen &amp; catering
      </span>

      <div className="flex items-center gap-4">
        <ConnectionChip />
        <div className="text-right">
          <div className="hb-tabular text-[16px] font-bold leading-none text-offwhite">
            Kassa
          </div>
          <div className="mt-1 text-[13px] font-medium leading-none text-charcoal-400">
            Hop &amp; Bites
          </div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-hop-600 text-[16px] font-bold leading-none text-offwhite">
          K
        </div>
      </div>
    </header>
  )
}
