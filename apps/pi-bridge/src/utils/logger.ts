import pino from "pino"

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "MYPOS_SESSION_SECRET",
      "MYPOS_PARTNER_ID",
      "MYPOS_APP_ID",
      "PI_BRIDGE_PAIRING_SECRET",
      "PI_BRIDGE_ADMIN_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "*.cardNumber",
      "*.cvv",
      "*.expiry",
      "headers.authorization",
      "headers.cookie",
      "headers['x-admin-token']",
      "req.headers['x-admin-token']",
    ],
    censor: "[REDACTED]",
  },
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }
      : undefined,
})
