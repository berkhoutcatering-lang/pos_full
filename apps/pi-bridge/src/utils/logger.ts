import pino from "pino"

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "MYPOS_INTEGRATION_CLIENT_SECRET",
      "MYPOS_MERCHANT_CLIENT_SECRET",
      "MYPOS_INTEGRATION_CLIENT_ID",
      "MYPOS_MERCHANT_CLIENT_ID",
      "*.clientSecret",
      "*.client_secret",
      "*.access_token",
      "*.session",
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
