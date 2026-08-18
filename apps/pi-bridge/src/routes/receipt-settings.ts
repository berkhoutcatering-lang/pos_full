import type { FastifyInstance } from "fastify"
import { authenticateTablet, requireRole } from "../middleware/auth-tablet.js"
import fs from "node:fs"
import { config } from "../config.js"
import {
  getReceiptSettings,
  refreshReceiptSettingsNow,
} from "../services/receipt-settings.js"

export async function receiptSettingsRoutes(app: FastifyInstance) {
  // What the Pi will actually put on the next bon — which is not the same as
  // what is in Supabase, because the Pi prints from its local copy. The admin
  // screen shows this so "ik heb het toch ingevuld?" has an answer.
  app.get(
    "/receipt-settings",
    { preHandler: [authenticateTablet, requireRole("manager")] },
    async (_req, reply) => {
      return reply.send({
        settings: getReceiptSettings(),
        logo_present: fs.existsSync(config.RECEIPT_LOGO_PATH),
        logo_path: config.RECEIPT_LOGO_PATH,
      })
    },
  )

  // Called right after a save so the change lands on the next bon instead of
  // whenever the five-minute refresh happens to come around.
  app.post(
    "/receipt-settings/refresh",
    { preHandler: [authenticateTablet, requireRole("manager")] },
    async (_req, reply) => {
      await refreshReceiptSettingsNow()
      return reply.send({ ok: true, settings: getReceiptSettings() })
    },
  )
}
