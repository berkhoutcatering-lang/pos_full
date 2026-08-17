import { describe, it, expect, beforeEach, vi } from "vitest"

// The uplink probe decides whether the operator gets told "reken contant af".
// Its whole job is telling four look-alike situations apart, so that is what
// these tests pin down.

const GATEWAY = "https://api-gateway.mypos.com"

vi.mock("../src/config.js", () => ({
  config: { MYPOS_GATEWAY_URL: GATEWAY },
}))

/** Fake /proc and /sys. Everything the service reads is a plain file. */
const files = new Map<string, string>()
const realpaths = new Map<string, string>()

vi.mock("node:fs", () => ({
  default: {
    readFileSync: (p: string) => {
      const v = files.get(p)
      if (v === undefined) throw new Error(`ENOENT: ${p}`)
      return v
    },
    existsSync: (p: string) => files.has(p),
    realpathSync: (p: string) => {
      const v = realpaths.get(p)
      if (v === undefined) throw new Error(`ENOENT: ${p}`)
      return v
    },
  },
}))

const { getUplinkStatus } = await import("../src/services/uplink.js")

const ROUTE_HEADER =
  "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT"

/** /proc/net/route as the kernel writes it: hex, little-endian, tab-separated. */
function routeTable(defaultIface: string | null): string {
  const lines = [ROUTE_HEADER, `wlan0\t00002A0A\t00000000\t0001\t0\t0\t600\t00FFFFFF\t0\t0\t0`]
  if (defaultIface) {
    lines.push(`${defaultIface}\t00000000\tFE2AA8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0`)
  }
  return lines.join("\n")
}

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

/** myPOS answers, portal probe returns the bare 204 — the healthy case. */
function healthyNetwork() {
  fetchMock.mockImplementation(async (url: string) =>
    url === GATEWAY
      ? ({ status: 200 } as Response)
      : ({ status: 204 } as Response),
  )
}

beforeEach(() => {
  files.clear()
  realpaths.clear()
  fetchMock.mockReset()
  files.set("/run/systemd/timesync/synchronized", "")
})

describe("uplink probe", () => {
  it("reports down when there is no default route at all", async () => {
    files.set("/proc/net/route", routeTable(null))

    const status = await getUplinkStatus(true)

    expect(status.state).toBe("down")
    expect(status.mypos_reachable).toBe(false)
    expect(status.message).toMatch(/USB-tethering/i)
    // Nothing to probe, so we should not have gone near the network.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("recognises a tethered phone by its place on the USB bus, not its name", async () => {
    // Android hands out enx<mac> here, which by name is indistinguishable
    // from a wired NIC.
    files.set("/proc/net/route", routeTable("enxb27a3f110022"))
    realpaths.set(
      "/sys/class/net/enxb27a3f110022",
      "/sys/devices/platform/axi/1000120000.pcie/usb3/3-2/3-2:1.0/net/enxb27a3f110022",
    )
    healthyNetwork()

    const status = await getUplinkStatus(true)

    expect(status.kind).toBe("usb")
    expect(status.state).toBe("online")
    expect(status.message).toMatch(/telefoon via USB/i)
  })

  it("calls a wired NIC ethernet even though it is also an enx name", async () => {
    files.set("/proc/net/route", routeTable("eth0"))
    realpaths.set("/sys/class/net/eth0", "/sys/devices/platform/1f00100000.ethernet/net/eth0")
    healthyNetwork()

    const status = await getUplinkStatus(true)
    expect(status.kind).toBe("ethernet")
  })

  it("calls out a captive portal instead of blaming the phone", async () => {
    files.set("/proc/net/route", routeTable("wlan0"))
    fetchMock.mockImplementation(async (url: string) => {
      if (url === GATEWAY) throw new Error("fetch failed")
      // A portal answers the 204 probe with its own login page.
      return { status: 302 } as Response
    })

    const status = await getUplinkStatus(true)

    expect(status.state).toBe("portal")
    expect(status.kind).toBe("wifi")
    expect(status.message).toMatch(/inlogpagina/i)
  })

  it("separates 'no internet at all' from a portal", async () => {
    files.set("/proc/net/route", routeTable("wlan0"))
    fetchMock.mockRejectedValue(new Error("fetch failed"))

    const status = await getUplinkStatus(true)

    expect(status.state).toBe("no_internet")
    expect(status.message).not.toMatch(/inlogpagina/i)
  })

  it("warns about the clock, because TLS to myPOS fails while it is off", async () => {
    files.delete("/run/systemd/timesync/synchronized")
    files.set("/proc/net/route", routeTable("eth0"))
    realpaths.set("/sys/class/net/eth0", "/sys/devices/platform/1f00100000.ethernet/net/eth0")
    healthyNetwork()

    const status = await getUplinkStatus(true)

    expect(status.state).toBe("online")
    expect(status.clock_synced).toBe(false)
    expect(status.message).toMatch(/klok/i)
  })

  it("collapses a screenful of polling tablets into one probe", async () => {
    files.set("/proc/net/route", routeTable("eth0"))
    realpaths.set("/sys/class/net/eth0", "/sys/devices/platform/1f00100000.ethernet/net/eth0")
    healthyNetwork()

    const all = await Promise.all([
      getUplinkStatus(true),
      getUplinkStatus(false),
      getUplinkStatus(false),
      getUplinkStatus(false),
    ])

    expect(all.every((s) => s.state === "online")).toBe(true)
    // One gateway probe + one portal probe, shared by all four callers.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
