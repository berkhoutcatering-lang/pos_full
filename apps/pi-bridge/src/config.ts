import { z } from "zod"

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Multi-tenant scope — this Pi is paired to ONE venue
  ORG_ID: z.string().uuid(),
  VENUE_ID: z.string().uuid(),

  // Supabase service role for backend writes
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Pairing JWT signing (HS256). MUST be >= 32 chars.
  PI_BRIDGE_PAIRING_SECRET: z.string().min(32),
  PI_BRIDGE_ADMIN_TOKEN: z.string().min(32),

  // myPOS ePOS
  MYPOS_BASE: z.string().url().default("https://eposapi.mypos.com"),
  MYPOS_SESSION_SECRET: z.string().min(1),
  MYPOS_PARTNER_ID: z.string().min(1),
  MYPOS_APP_ID: z.string().min(1),

  // Thermal printer
  PRINTER_NETWORK_ADDR: z.string().default("192.168.1.50"),
  PRINTER_TYPE: z.enum(["star", "epson"]).default("star"),

  // SQLite
  SQLITE_PATH: z.string().default("/data/pi-bridge.sqlite"),

  // TLS
  TLS_CERT_PATH: z.string().optional(),
  TLS_KEY_PATH: z.string().optional(),

  // Feature flags
  DISABLE_MDNS: z.coerce.boolean().default(false),
  // Round 3 P1-8 — explicit LAN interface for mDNS so the responder
  // never advertises on a tethered/public WAN interface. Empty = all.
  MDNS_INTERFACE: z.string().default(""),
  SIMULATE_SUPABASE_OUTAGE: z.coerce.boolean().default(false),

  // Allowed PWA origins for CORS (comma-separated)
  ALLOWED_ORIGINS: z.string().default("https://hopbites.app,https://*.hopbites.app"),
})

export const config = ConfigSchema.parse(process.env)
export type Config = z.infer<typeof ConfigSchema>
