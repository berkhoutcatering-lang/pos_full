import { ThermalPrinter, PrinterTypes, CharacterSet } from "node-thermal-printer"
import { config } from "../config.js"
import { logger } from "../utils/logger.js"

// ESC/POS printing on Star or Epson over LAN TCP. CP858 character set so
// EUR + accented Dutch chars (é è ï) render correctly. Every print is
// fire-and-forget at the route level — failures don't block the order.

export interface KitchenBonInput {
  order_id: string
  order_label: string
  items: Array<{ name: string; qty: number; modifiers: string[]; note?: string }>
}

export interface CustomerBonInput {
  order_id: string
  order_label: string
  items: Array<{ name: string; qty: number; price_cents: number; btw_rate: number }>
  total_excl_cents: number
  total_btw_cents: number
  total_incl_cents: number
  paid_method: "cash" | "pin" | "ideal"
  org_name: string
  org_kvk: string
  org_btw: string
}

function newPrinter(): ThermalPrinter {
  return new ThermalPrinter({
    type: config.PRINTER_TYPE === "star" ? PrinterTypes.STAR : PrinterTypes.EPSON,
    interface: `tcp://${config.PRINTER_NETWORK_ADDR}`,
    characterSet: CharacterSet.PC858_EURO,
    options: { timeout: 3000 },
  })
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
  const p = newPrinter()
  p.alignCenter()
  p.bold(true)
  p.println(input.org_name)
  p.bold(false)
  p.println(`KvK ${input.org_kvk}`)
  p.println(`BTW ${input.org_btw}`)
  p.drawLine()
  p.alignLeft()
  p.println(`Bon ${input.order_label}`)
  p.println(new Date().toLocaleString("nl-NL"))
  p.drawLine()
  for (const it of input.items) {
    p.println(`${it.qty}x ${it.name}`)
    p.alignRight()
    p.println(`EUR ${((it.price_cents * it.qty) / 100).toFixed(2)} (${it.btw_rate}%)`)
    p.alignLeft()
  }
  p.drawLine()
  p.alignRight()
  p.println(`Excl: EUR ${(input.total_excl_cents / 100).toFixed(2)}`)
  p.println(`BTW:  EUR ${(input.total_btw_cents / 100).toFixed(2)}`)
  p.bold(true)
  p.println(`TOTAAL: EUR ${(input.total_incl_cents / 100).toFixed(2)}`)
  p.bold(false)
  p.alignCenter()
  p.println(`Betaald via ${input.paid_method.toUpperCase()}`)
  p.cut()

  if (!(await p.isPrinterConnected())) throw new Error("printer_offline")
  await p.execute()
  logger.info({ order_id: input.order_id }, "customer bon printed")
}
