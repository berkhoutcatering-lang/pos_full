import { describe, it, expect, vi } from "vitest"

// De BTW-regels op de bon moeten optellen naar het totaal dat de klant betaalt.
// Zodra je per regel afrondt en daarna optelt, kan dat een cent schelen — en op
// een kassabon is dat geen afrondingsdetail maar een fout.

vi.mock("node-thermal-printer", () => ({
  ThermalPrinter: class {},
  PrinterTypes: { STAR: "star", EPSON: "epson" },
  CharacterSet: { PC858_EURO: "PC858_EURO" },
}))

vi.mock("../src/config.js", () => ({
  config: {
    PRINTER_TYPE: "star",
    PRINTER_NETWORK_ADDR: "192.168.1.50",
    RECEIPT_LOGO_PATH: "/etc/pi-bridge/receipt-logo.png",
    PRINTER_DOT_WIDTH: 576,
  },
}))

vi.mock("../src/services/receipt-settings.js", () => ({
  getReceiptSettings: () => ({ print_logo: false }),
}))

const { groupBtw } = await import("../src/services/printer.js")

describe("BTW per tarief op de kassabon", () => {
  it("telt regels met hetzelfde tarief bij elkaar op", () => {
    const groups = groupBtw([
      { name: "Broodje", qty: 2, price_cents: 950, btw_rate: 9 },
      { name: "Friet", qty: 1, price_cents: 400, btw_rate: 9 },
      { name: "Speciaalbier", qty: 1, price_cents: 550, btw_rate: 21 },
    ])

    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.rate)).toEqual([9, 21])
    expect(groups[0]!.incl_cents).toBe(2300)
    expect(groups[1]!.incl_cents).toBe(550)
  })

  it("gebruikt de bedragen van de pricing-engine als die er zijn", () => {
    // Bewust andere waarden dan een naïeve herberekening zou geven: als de
    // engine al heeft afgerond, is dát wat er in de order staat en dus wat er
    // op de bon hoort.
    const groups = groupBtw([
      {
        name: "Broodje",
        qty: 2,
        price_cents: 950,
        btw_rate: 9,
        line_excl_cents: 1743,
        line_btw_cents: 157,
        line_incl_cents: 1900,
      },
    ])

    expect(groups[0]).toEqual({
      rate: 9,
      excl_cents: 1743,
      btw_cents: 157,
      incl_cents: 1900,
    })
  })

  it("rekent zelf terug wanneer de regelsplitsing ontbreekt", () => {
    const groups = groupBtw([
      { name: "Broodje", qty: 1, price_cents: 1000, btw_rate: 21 },
    ])

    // 1000 incl. bij 21% => 826,45 excl. en 173,55 BTW; afgerond 826 + 174.
    expect(groups[0]!.btw_cents).toBe(174)
    expect(groups[0]!.excl_cents).toBe(826)
    expect(groups[0]!.excl_cents + groups[0]!.btw_cents).toBe(1000)
  })

  it("laat de BTW-regels optellen naar het ordertotaal", () => {
    const items = [
      {
        name: "Pulled pork",
        qty: 2,
        price_cents: 950,
        btw_rate: 9,
        line_excl_cents: 1743,
        line_btw_cents: 157,
        line_incl_cents: 1900,
      },
      {
        name: "Speciaalbier",
        qty: 1,
        price_cents: 550,
        btw_rate: 21,
        line_excl_cents: 455,
        line_btw_cents: 95,
        line_incl_cents: 550,
      },
    ]
    const groups = groupBtw(items)

    const excl = groups.reduce((n, g) => n + g.excl_cents, 0)
    const btw = groups.reduce((n, g) => n + g.btw_cents, 0)
    const incl = groups.reduce((n, g) => n + g.incl_cents, 0)

    expect(excl).toBe(2198)
    expect(btw).toBe(252)
    expect(excl + btw).toBe(incl)
    expect(incl).toBe(2450)
  })

  it("houdt 0%-regels apart in plaats van ze te laten verdwijnen", () => {
    // Statiegeld is 0% en hoort zichtbaar op de bon te staan.
    const groups = groupBtw([
      { name: "Speciaalbier", qty: 1, price_cents: 550, btw_rate: 21 },
      { name: "Statiegeld", qty: 1, price_cents: 15, btw_rate: 0 },
    ])

    expect(groups.map((g) => g.rate)).toEqual([0, 21])
    expect(groups[0]!.btw_cents).toBe(0)
    expect(groups[0]!.excl_cents).toBe(15)
  })
})
