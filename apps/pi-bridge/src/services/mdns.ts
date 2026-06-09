import { config } from "../config.js"
import { logger } from "../utils/logger.js"

// mDNS advertise so tablets find the Pi at https://hopbites.local.
// Bind to LAN interfaces only — never advertise on WAN. The `mdns` package
// is a native addon; if it fails to load (dev on macOS without bonjour-sdk),
// we soft-fail with a warning so dev environments still boot.

export async function startMdnsAdvertise() {
  if (config.DISABLE_MDNS) {
    logger.info("mdns disabled by config")
    return
  }
  try {
    const mdns = await import("mdns")
    // Round 3 P1-8 — when MDNS_INTERFACE is set (e.g. "eth0" or "wlan0")
    // bind the advertisement to that NIC only. An empty value falls back
    // to the library's default; production deployments MUST set this so
    // a USB-tether or guest WiFi doesn't expose hopbites.local on a WAN.
    const adOpts: {
      name: string
      txtRecord: { venue_id: string }
      networkInterface?: string
    } = {
      name: "hopbites",
      txtRecord: { venue_id: config.VENUE_ID },
    }
    if (config.MDNS_INTERFACE) {
      adOpts.networkInterface = config.MDNS_INTERFACE
    }
    const ad = mdns.createAdvertisement(mdns.tcp("https"), config.PORT, adOpts)
    ad.start()
    logger.info(
      {
        port: config.PORT,
        venue_id: config.VENUE_ID,
        interface: config.MDNS_INTERFACE || "all",
      },
      "mdns advertising hopbites.local",
    )
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "mdns unavailable — continuing without advertise")
  }
}
