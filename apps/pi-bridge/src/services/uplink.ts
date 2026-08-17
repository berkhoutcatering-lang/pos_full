import fs from "node:fs"
import { config } from "../config.js"
import { logger } from "../utils/logger.js"

// Does this Pi have internet, measured from the Pi itself?
//
// The tablets already track whether they can reach the bridge and the cloud,
// but that says nothing about the machine that actually calls myPOS. In the
// truck the uplink is a phone on the USB port, and a phone gets unplugged,
// locked, or has its tethering switched off by accident. "PIN doet het niet"
// then needs a one-glance answer.
//
// Everything here is read-only and unprivileged on purpose: the bridge runs as
// `posbridge` with NoNewPrivileges, so no `ip`, no `nmcli`, no shelling out.
// The kernel already publishes what we need in /proc and /sys.

export type UplinkKind = "usb" | "ethernet" | "wifi" | "unknown"

/**
 * `portal` is the one that trips people up: associated, DHCP lease, looks
 * connected in every UI, and no traffic leaves until someone accepts terms on
 * a login page. It has to read differently from `down` or it will be
 * misdiagnosed as a broken phone every single time.
 */
export type UplinkState = "online" | "portal" | "no_internet" | "down"

export interface UplinkStatus {
  state: UplinkState
  /** Interface carrying the default route, e.g. "usb0" / "enxb2…" / "eth0". */
  interface: string | null
  kind: UplinkKind
  /** Whether the myPOS gateway itself answered — the only check PIN cares about. */
  mypos_reachable: boolean
  /** NTP has set the clock; TLS fails against myPOS while this is false. */
  clock_synced: boolean
  message: string
  checked_at: number
}

/** Generic captive-portal probe. Anything but a bare 204 means interference. */
const PORTAL_PROBE_URL = "http://connectivity-check.gstatic.com/generate_204"
const PROBE_TIMEOUT_MS = 4000
/** Long enough that polling costs nothing, short enough to notice a pulled cable. */
const CACHE_TTL_MS = 10_000

let cached: UplinkStatus | null = null
let inflight: Promise<UplinkStatus> | null = null

/**
 * The interface carrying the default route, straight from the kernel's routing
 * table. Fields are tab-separated; a default route is destination 00000000.
 */
function defaultRouteInterface(): string | null {
  let raw: string
  try {
    raw = fs.readFileSync("/proc/net/route", "utf8")
  } catch {
    // Not Linux (a dev laptop) — we simply do not know.
    return null
  }
  for (const line of raw.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 3) continue
    const [iface, destination] = cols
    if (destination === "00000000") return iface ?? null
  }
  return null
}

/**
 * Classify by where the device hangs on the bus rather than by name. A phone
 * tethering over USB shows up as `usb0` on some Android versions and as
 * `enx<mac>` on others, which is indistinguishable from a wired NIC by name
 * alone — but not by its path under /sys.
 */
function classify(iface: string | null): UplinkKind {
  if (!iface) return "unknown"
  if (iface.startsWith("wlan") || iface.startsWith("wlp")) return "wifi"
  try {
    if (fs.realpathSync(`/sys/class/net/${iface}`).includes("/usb")) return "usb"
  } catch {
    // Interface vanished between reading the route and looking it up.
  }
  return "ethernet"
}

/** systemd-timesyncd drops this marker once it has stepped the clock. */
function clockSynced(): boolean {
  return fs.existsSync("/run/systemd/timesync/synchronized")
}

async function probe(url: string, method: "GET" | "HEAD"): Promise<Response | null> {
  try {
    return await fetch(url, {
      method,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
  } catch {
    return null
  }
}

function describe(status: Omit<UplinkStatus, "message">): string {
  const via =
    status.kind === "usb"
      ? "telefoon via USB"
      : status.kind === "ethernet"
        ? "netwerkkabel"
        : status.kind === "wifi"
          ? "WiFi"
          : "onbekende verbinding"

  switch (status.state) {
    case "online":
      return status.clock_synced
        ? `Internet via ${via} — myPOS bereikbaar.`
        : `Internet via ${via}, maar de klok loopt nog niet gelijk. Even wachten; PIN kan tot die tijd falen.`
    case "portal":
      return `Verbonden via ${via}, maar er zit een inlogpagina tussen. Log op een telefoon in op dit netwerk, of schakel over op USB-tethering.`
    case "no_internet":
      return `Verbonden via ${via}, maar myPOS is niet bereikbaar. Controleer of de telefoon nog data heeft.`
    case "down":
      return "Geen internetverbinding. Sluit een telefoon met USB-tethering aan, of een netwerkkabel."
  }
}

async function measure(): Promise<UplinkStatus> {
  const iface = defaultRouteInterface()
  const kind = classify(iface)
  const checked_at = Date.now()

  if (!iface) {
    const base = {
      state: "down" as const,
      interface: null,
      kind: "unknown" as const,
      mypos_reachable: false,
      clock_synced: clockSynced(),
      checked_at,
    }
    return { ...base, message: describe(base) }
  }

  // Ask the gateway we actually depend on. A reply of any kind proves DNS,
  // routing, TLS and therefore a plausible clock — far stronger evidence than
  // a generic ping, and it is the exact path a payment takes.
  const [gateway, portalCheck] = await Promise.all([
    probe(config.MYPOS_GATEWAY_URL, "HEAD"),
    probe(PORTAL_PROBE_URL, "GET"),
  ])

  const mypos_reachable = gateway !== null
  // A portal announces itself by refusing to return the empty 204: it either
  // redirects to its login page or serves that page outright.
  const portal = portalCheck !== null && portalCheck.status !== 204

  const state: UplinkState = mypos_reachable
    ? "online"
    : portal
      ? "portal"
      : "no_internet"

  const base = {
    state,
    interface: iface,
    kind,
    mypos_reachable,
    clock_synced: clockSynced(),
    checked_at,
  }
  return { ...base, message: describe(base) }
}

/**
 * Cached so a room full of polling tablets still produces one probe every ten
 * seconds, and concurrent callers share a single in-flight measurement.
 */
export async function getUplinkStatus(force = false): Promise<UplinkStatus> {
  if (!force && cached && Date.now() - cached.checked_at < CACHE_TTL_MS) {
    return cached
  }
  if (inflight) return inflight

  inflight = measure()
    .then((status) => {
      cached = status
      return status
    })
    .catch((err) => {
      logger.warn({ err: (err as Error).message }, "uplink probe failed")
      const fallback: UplinkStatus = {
        state: "down",
        interface: null,
        kind: "unknown",
        mypos_reachable: false,
        clock_synced: clockSynced(),
        message: "Kon de internetverbinding niet vaststellen.",
        checked_at: Date.now(),
      }
      cached = fallback
      return fallback
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}
