import { z } from "zod"

// Provisioning used to write the literal "unset" for blank myPOS keys just to
// satisfy a required-string schema. Treat that (and empty strings) as absent so
// "not configured" is a real state instead of garbage credentials.
const optionalSecret = z.preprocess(
  (v) =>
    typeof v === "string" && (v.trim() === "" || v.trim() === "unset")
      ? undefined
      : v,
  z.string().min(1).optional(),
)

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

  // myPOS — PIN payments via the ePOS API on the myPOS API Gateway.
  //   off    PIN disabled. Default, and the only safe state until credentials
  //          are filled in: the bridge must still boot so the rest of the POS
  //          works.
  //   cloud  myPOS pushes the amount to the terminal, which authorises over its
  //          own SIM. The Pi needs an uplink for the API call itself.
  //
  // Driving the terminal directly over the LAN was investigated and does not
  // work: the terminal ignores unauthorised counterparts on every transport.
  // See raspberry-pos-os/README.md and the probes in raspberry-pos-os/smoke/.
  MYPOS_TRANSPORT: z.enum(["off", "cloud"]).default("off"),

  // demo-api-gateway.mypos.com while testing, api-gateway.mypos.com for real
  // money. The SDK exports both as DEMO_GATEWAY_URL / PRODUCTION_GATEWAY_URL.
  MYPOS_GATEWAY_URL: z.string().url().default("https://api-gateway.mypos.com"),

  // Partner Portal -> Integrations -> your Smart POS integration.
  MYPOS_PARTNER_ID: optionalSecret, // mps-p-XXXXXXXX
  MYPOS_APPLICATION_ID: optionalSecret, // mps-app-XXXXXXXX
  MYPOS_INTEGRATION_CLIENT_ID: optionalSecret, // client_...
  MYPOS_INTEGRATION_CLIENT_SECRET: optionalSecret, // secret_...

  // Partner Portal -> Merchants, after the merchant approves the integration.
  MYPOS_MERCHANT_CLIENT_ID: optionalSecret, // cli_...
  MYPOS_MERCHANT_CLIENT_SECRET: optionalSecret, // sec_...

  // Which terminal to push payments to.
  MYPOS_TID: optionalSecret,
  MYPOS_OPERATOR_CODE: z.string().max(4).default("1"),

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

  // Sentry error/perf reporting — empty disables it (SDK no-op).
  SENTRY_DSN: z.string().optional(),
})
  // Each transport needs its own credentials. Validate per mode rather than
  // demanding all of them, so a Pi on the LAN route never has to carry cloud
  // keys it will never use (and vice versa).
  .superRefine((c, ctx) => {
    const missing = (field: string) =>
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is required when MYPOS_TRANSPORT=${c.MYPOS_TRANSPORT}`,
      })

    if (c.MYPOS_TRANSPORT !== "cloud") return

    if (!c.MYPOS_PARTNER_ID) missing("MYPOS_PARTNER_ID")
    if (!c.MYPOS_APPLICATION_ID) missing("MYPOS_APPLICATION_ID")
    if (!c.MYPOS_INTEGRATION_CLIENT_ID) missing("MYPOS_INTEGRATION_CLIENT_ID")
    if (!c.MYPOS_INTEGRATION_CLIENT_SECRET) missing("MYPOS_INTEGRATION_CLIENT_SECRET")
    if (!c.MYPOS_MERCHANT_CLIENT_ID) missing("MYPOS_MERCHANT_CLIENT_ID")
    if (!c.MYPOS_MERCHANT_CLIENT_SECRET) missing("MYPOS_MERCHANT_CLIENT_SECRET")
    if (!c.MYPOS_TID) missing("MYPOS_TID")
  })

export const config = ConfigSchema.parse(process.env)
export type Config = z.infer<typeof ConfigSchema>

export const myposEnabled = config.MYPOS_TRANSPORT !== "off"
