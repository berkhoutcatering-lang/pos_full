import fs from "node:fs"
import { ThermalPrinter, PrinterTypes, CharacterSet } from "node-thermal-printer"
import { config } from "../config.js"
import { logger } from "../utils/logger.js"
import { getReceiptSettings } from "./receipt-settings.js"

// ESC/POS printing on Star or Epson over LAN TCP. CP858 character set so
// EUR + accented Dutch chars (é è ï) render correctly. Every print is
// fire-and-forget at the route level — failures don't block the order.

export interface KitchenBonInput {
  order_id: string
  order_label: string
  items: Array<{ name: string; qty: number; modifiers: string[]; note?: string }>
}

export interface CustomerBonItem {
  name: string
  qty: number
  /** Unit price including BTW. */
  price_cents: number
  btw_rate: number
  // The kassa knows the exact per-line split from the pricing engine. When it
  // sends them we group with those numbers instead of re-deriving, so the BTW
  // block on the bon adds up to the total to the cent.
  line_excl_cents?: number
  line_btw_cents?: number
  line_incl_cents?: number
}

export interface CustomerBonInput {
  order_id: string
  order_label: string
  items: CustomerBonItem[]
  total_excl_cents: number
  total_btw_cents: number
  total_incl_cents: number
  /** Absent on a Z-rapport — that is not a payment. */
  paid_method?: "cash" | "pin" | "ideal"
  /** Overrides the default "Bon <label>" line, e.g. for the Z-rapport. */
  title?: string
}

/** 48 columns at font A on both 58mm and 80mm rolls in our layout. */
const COLS = 48

const PAID_METHOD_LABEL: Record<string, string> = {
  cash: "Contant",
  pin: "PIN / contactloos",
  ideal: "iDEAL",
}

function newPrinter(): ThermalPrinter {
  return new ThermalPrinter({
    type: config.PRINTER_TYPE === "star" ? PrinterTypes.STAR : PrinterTypes.EPSON,
    interface: `tcp://${config.PRINTER_NETWORK_ADDR}`,
    characterSet: CharacterSet.PC858_EURO,
    options: { timeout: 3000 },
  })
}

const euro = (cents: number) => `EUR ${(cents / 100).toFixed(2)}`

/** Label left, amount right — the shape people expect on a bon. */
function row(label: string, amount: string): string {
  const room = COLS - amount.length - 1
  const left = label.length > room ? `${label.slice(0, room - 1)}…` : label
  const gap = Math.max(1, COLS - left.length - amount.length)
  return `${left}${" ".repeat(gap)}${amount}`
}

/**
 * BTW per tarief, zoals een Nederlandse kassabon het hoort te tonen. Stond
 * eerder per regel, waardoor 9% en 21% door elkaar liepen en er nergens een
 * subtotaal per tarief stond.
 */
export function groupBtw(
  items: CustomerBonItem[],
): Array<{ rate: number; excl_cents: number; btw_cents: number; incl_cents: number }> {
  const byRate = new Map<number, { excl_cents: number; btw_cents: number; incl_cents: number }>()

  for (const it of items) {
    const incl = it.line_incl_cents ?? it.price_cents * it.qty
    // Only reached for callers that do not send the exact split; wherever the
    // pricing engine has already rounded, its numbers win.
    const btw = it.line_btw_cents ?? Math.round(incl - incl / (1 + it.btw_rate / 100))
    const excl = it.line_excl_cents ?? incl - btw

    const acc = byRate.get(it.btw_rate) ?? { excl_cents: 0, btw_cents: 0, incl_cents: 0 }
    acc.excl_cents += excl
    acc.btw_cents += btw
    acc.incl_cents += incl
    byRate.set(it.btw_rate, acc)
  }

  return [...byRate.entries()]
    .map(([rate, sums]) => ({ rate, ...sums }))
    .sort((a, b) => a.rate - b.rate)
}

/**
 * Reads the width straight out of the PNG header (IHDR is always the first
 * chunk). A logo wider than the print head gets silently clipped, which looks
 * like a broken logo rather than a sizing mistake — so we say so in the log.
 */
function pngWidth(path: string): number | null {
  try {
    const fd = fs.openSync(path, "r")
    const head = Buffer.alloc(24)
    fs.readSync(fd, head, 0, 24, 0)
    fs.closeSync(fd)
    if (head.subarray(1, 4).toString("ascii") !== "PNG") return null
    return head.readUInt32BE(16)
  } catch {
    return null
  }
}

/**
 * Prints the logo if there is one. Never fatal: a bon without a logo is a
 * valid bon, a customer without a bon is a problem.
 */
async function tryPrintLogo(p: ThermalPrinter): Promise<void> {
  const path = config.RECEIPT_LOGO_PATH
  if (!fs.existsSync(path)) return

  const width = pngWidth(path)
  if (width !== null && width > config.PRINTER_DOT_WIDTH) {
    logger.warn(
      { width, max: config.PRINTER_DOT_WIDTH, path },
      "receipt logo is wider than the print head and will be clipped",
    )
  }

  try {
    p.alignCenter()
    await p.printImage(path)
  } catch (err) {
    logger.warn({ err: (err as Error).message, path }, "receipt logo could not be printed")
  }
}

// ESC/POS drawer-kick via de bonprinter (pulse op de RJ11-poort). Wordt
// gebruikt door de Lade-knop op de kassa en automatisch bij contant
// afrekenen.
export async function openCashDrawer(): Promise<void> {
  const p = newPrinter()
  p.openCashDrawer()
  await p.execute()
}

export async function printKitchenBon(input: KitchenBonInput): Promise<void> {
  const p = newPrinter()
  p.alignCenter()
  p.bold(true)
  p.setTextSize(1, 1)
  p.println("KEUKEN")
  p.bold(false)
  p.setTextNormal()
  p.println(input.order_label)
  p.drawLine()
  p.alignLeft()
  for (const item of input.items) {
    p.bold(true)
    p.println(`${item.qty}x ${item.name}`)
    p.bold(false)
    for (const m of item.modifiers) p.println(`  + ${m}`)
    if (item.note) p.println(`  ! ${item.note}`)
  }
  p.drawLine()
  p.alignCenter()
  p.println(new Date().toLocaleTimeString("nl-NL"))
  p.cut()

  if (!(await p.isPrinterConnected())) {
    logger.error({ order_id: input.order_id }, "printer not connected")
    throw new Error("printer_offline")
  }
  await p.execute()
  logger.info({ order_id: input.order_id }, "kitchen bon printed")
}

export async function printCustomerBon(input: CustomerBonInput): Promise<void> {
  // The Pi knows which business it belongs to; the kassa no longer sends it.
  // That also means an unconfigured Pi prints a bon without a KvK line rather
  // than one carrying a made-up KvK number.
  const s = getReceiptSettings()
  const p = newPrinter()

  if (s.print_logo) await tryPrintLogo(p)

  p.alignCenter()
  if (s.legal_name) {
    p.bold(true)
    p.println(s.legal_name)
    p.bold(false)
  }
  if (s.address_line) p.println(s.address_line)
  if (s.postal_code || s.city) p.println([s.postal_code, s.city].filter(Boolean).join(" "))
  if (s.phone) p.println(s.phone)
  if (s.kvk) p.println(`KvK ${s.kvk}`)
  if (s.btw_id) p.println(`BTW ${s.btw_id}`)

  p.drawLine()
  p.alignLeft()
  p.println(input.title ?? `Bon ${input.order_label}`)
  p.println(new Date().toLocaleString("nl-NL"))
  p.drawLine()

  for (const it of input.items) {
    const incl = it.line_incl_cents ?? it.price_cents * it.qty
    p.println(row(`${it.qty}x ${it.name}`, euro(incl)))
  }

  p.drawLine()
  p.println(row("Subtotaal excl. BTW", euro(input.total_excl_cents)))
  for (const g of groupBtw(input.items)) {
    p.println(row(`BTW ${g.rate}% over ${euro(g.excl_cents)}`, euro(g.btw_cents)))
  }
  p.bold(true)
  p.println(row("TOTAAL", euro(input.total_incl_cents)))
  p.bold(false)

  if (input.paid_method) {
    p.drawLine()
    p.alignCenter()
    p.println(`Betaald · ${PAID_METHOD_LABEL[input.paid_method] ?? input.paid_method}`)
  }

  const footerLines = (s.footer_text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)

  if (footerLines.length || s.website) {
    p.alignCenter()
    p.println("")
    for (const line of footerLines) p.println(line)
    if (s.website) p.println(s.website)
  }

  p.cut()

  if (!(await p.isPrinterConnected())) throw new Error("printer_offline")
  await p.execute()
  logger.info({ order_id: input.order_id }, "customer bon printed")
}
