import "./instrument.js" // MUST be first — sets up Sentry instrumentation
import * as Sentry from "@sentry/node"
import Fastify from "fastify"
import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import fs from "node:fs"
import { config } from "./config.js"
import { logger } from "./utils/logger.js"
import { healthRoute } from "./routes/_health.js"
import { pairRoutes } from "./routes/pair.js"
import { myposRoutes } from "./routes/mypos.js"
import { orderRoutes } from "./routes/orders.js"
import { printRoutes } from "./routes/print.js"
import { cacheRoutes } from "./routes/cache.js"
import { adminOperationalRoutes } from "./routes/admin-operational.js"
import { outboxPendingRoutes } from "./routes/outbox-pending.js"
import { menuAdminRoutes } from "./routes/menu-admin.js"
import { displayRoutes } from "./routes/display.js"
import { startOutboxFlushWorker } from "./workers/outbox-flush.js"
import { startPgliteWarmer } from "./workers/pglite-warmer.js"
import { startJwtRotationWatcher } from "./workers/jwt-rotation-watcher.js"
import { startMdnsAdvertise } from "./services/mdns.js"

const httpsOpts =
  config.TLS_CERT_PATH && config.TLS_KEY_PATH && fs.existsSync(config.TLS_CERT_PATH)
    ? {
        https: {
          cert: fs.readFileSync(config.TLS_CERT_PATH),
          key: fs.readFileSync(config.TLS_KEY_PATH),
        },
      }
    : {}

if (!("https" in httpsOpts) && config.NODE_ENV === "production") {
  logger.error("TLS cert/key not present in production — refusing to start over HTTP")
  process.exit(1)
}

const app = Fastify({
  loggerInstance: logger,
  trustProxy: false,
  bodyLimit: 1_000_000,
  ...httpsOpts,
})

await app.register(cookie)
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // SSR / curl
    const allowed = config.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    const ok = allowed.some((rule) => {
      if (rule.startsWith("https://*.")) {
        const suffix = rule.slice("https://*.".length)
        return origin.startsWith("https://") && origin.endsWith(`.${suffix}`)
      }
      return (
        origin === rule ||
        (config.NODE_ENV !== "production" && origin.startsWith("http://localhost"))
      )
    })
    cb(ok ? null : new Error("CORS blocked"), ok)
  },
  credentials: true,
})
await app.register(helmet, { contentSecurityPolicy: false })
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" })

await app.register(healthRoute)
await app.register(pairRoutes)
await app.register(myposRoutes)
await app.register(orderRoutes)
await app.register(printRoutes)
await app.register(cacheRoutes)
await app.register(adminOperationalRoutes)
await app.register(outboxPendingRoutes)
await app.register(menuAdminRoutes)
await app.register(displayRoutes)

// Capture unhandled route errors to Sentry (no-op without DSN).
Sentry.setupFastifyErrorHandler(app)

startOutboxFlushWorker()
startPgliteWarmer()
startJwtRotationWatcher()
await startMdnsAdvertise()

await app.listen({ port: config.PORT, host: config.HOST })
logger.info({ port: config.PORT }, "pi-bridge listening")

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down")
  await app.close()
  process.exit(0)
}
process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))
