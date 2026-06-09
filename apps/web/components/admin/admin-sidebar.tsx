"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname } from "next/navigation"
import {
  BookOpen,
  Boxes,
  Cpu,
  LayoutDashboard,
  LayoutGrid,
  MessageCircle,
  Palette,
  ReceiptText,
  ScrollText,
  Sparkles,
  Tag,
  ToggleRight,
  Users,
} from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { cn } from "@/lib/cn"

type NavItem =
  | { type: "head"; label: string }
  | {
      type: "link"
      href: Route
      label: string
      Icon: typeof LayoutDashboard
      offline?: boolean
    }

const NAV: NavItem[] = [
  { type: "link", href: "/admin", label: "Dashboard", Icon: LayoutDashboard },
  { type: "head", label: "Operationeel" },
  { type: "link", href: "/admin/operational/voorraad", label: "Voorraad", Icon: Boxes, offline: true },
  { type: "link", href: "/admin/operational/availability", label: "Beschikbaarheid", Icon: ToggleRight, offline: true },
  { type: "link", href: "/admin/operational/prijs", label: "Prijs (tijdelijk)", Icon: Tag, offline: true },
  { type: "link", href: "/admin/operational/devices", label: "Apparaten", Icon: Cpu, offline: true },
  { type: "link", href: "/admin/operational/dagafsluiting", label: "Dagafsluiting", Icon: ReceiptText, offline: true },
  { type: "head", label: "Beheer" },
  { type: "link", href: "/admin/menu", label: "Menu", Icon: BookOpen },
  { type: "link", href: "/admin/staff", label: "Personeel", Icon: Users },
  { type: "link", href: "/admin/theme", label: "Thema", Icon: Palette },
  { type: "link", href: "/admin/usage", label: "AI-gebruik", Icon: Sparkles },
  { type: "link", href: "/admin/audit", label: "Audit log", Icon: ScrollText },
  { type: "link", href: "/admin/chat", label: "AI-chat", Icon: MessageCircle },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col overflow-y-auto bg-charcoal-900 px-3.5 py-5 text-offwhite">
      <div className="px-2 pb-[18px]">
        <Logo size={44} eyebrow="BEHEER" />
      </div>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((n, i) =>
          n.type === "head" ? (
            <div
              key={`h-${i}`}
              className="px-3 pb-1.5 pt-4 text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-charcoal-500"
            >
              {n.label}
            </div>
          ) : (
            <SidebarLink
              key={n.href}
              item={n}
              active={
                n.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(n.href)
              }
            />
          )
        )}
      </nav>

      <Link
        href="/"
        className="mt-auto flex items-center gap-2.5 whitespace-nowrap rounded-md border border-charcoal-700 p-3 text-[14px] font-bold leading-none text-charcoal-300 transition-[color] duration-[var(--dur-fast)] hover:text-offwhite"
      >
        <LayoutGrid size={17} /> Naar start
      </Link>
    </aside>
  )
}

function SidebarLink({
  item,
  active,
}: {
  item: Extract<NavItem, { type: "link" }>
  active: boolean
}) {
  const Icon = item.Icon
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-[11px] rounded-md px-3 py-[11px] text-left text-[15px] font-bold leading-none",
        "transition-[background,color] duration-[var(--dur-fast)]",
        active
          ? "bg-hop-600 text-white"
          : "text-charcoal-300 hover:bg-white/5 hover:text-offwhite"
      )}
    >
      <Icon size={18} className={active ? "text-white" : "text-charcoal-400"} />
      <span className="flex-1">{item.label}</span>
      {item.offline ? (
        <span
          className="h-2 w-2 rounded-full bg-hop-500"
          aria-label="Werkt offline via Pi-bridge"
          title="Werkt offline via Pi-bridge"
        />
      ) : null}
    </Link>
  )
}
