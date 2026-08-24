import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { authenticateTablet } from "../middleware/auth-tablet.js"
import {
  attachBrowser,
  detachBrowser,
  linkStatus,
  nextCommand,
  pushError,
  pushFromBrowser,
} from "../services/mypos-web-link.js"
import { logger } from "../utils/logger.js"

// De kassapagina houdt de USB-kabel naar de terminal vast en geeft de bytes
// door. Zij belt hierheen, want een browser is niet te bellen.
//
// Deze endpoints begrijpen niets van betalen: ze verplaatsen bytes. Alles wat
// met stages, bedragen en bonnen te maken heeft blijft in de bridge, zodat een
// herladen pagina nooit een betaling kan kwijtraken.

/** Iets korter dan de meeste proxy-timeouts, zodat een poll netjes afloopt. */
const POLL_MS = 25_000

const IdSchema = z.object({ link_id: z.string().uuid() })

const DataSchema = z.object({
  link_id: z.string().uuid(),
  session: z.string().uuid(),
  /** Base64 — IPP is binair en overleeft geen JSON-string. */
  data: z.string().max(65_536),
})

const ErrorSchema = z.object({
  link_id: z.string().uuid(),
  session: z.string().uuid(),
  message: z.string().max(300),
})

export async function terminalLinkRoutes(app: FastifyInstance) {
  // "Ik heb de kabel." Levert een id op waarmee de rest van de gesprekken loopt.
  app.post(
    "/terminal/link/attach",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const link_id = attachBrowser()
      logger.info({ link_id, terminal: req.tabletClaims?.terminal_id }, "kassascherm holds the terminal")
      return reply.send({ link_id })
    },
  )

  app.post(
    "/terminal/link/detach",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = IdSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      detachBrowser(parsed.data.link_id)
      return reply.send({ ok: true })
    },
  )

  // Long-poll: blijft hangen tot er werk is of tot de tijd om is. 204 betekent
  // "niets te doen", niet "er ging iets mis" — dit is de normale gang van zaken
  // als er de hele middag niet gepind wordt.
  app.get(
    "/terminal/link/next",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = IdSchema.safeParse(req.query)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })

      const cmd = await nextCommand(parsed.data.link_id, POLL_MS)
      if (!cmd) return reply.code(204).send()
      return reply.send(cmd)
    },
  )

  // Wat er uit de kabel kwam.
  app.post(
    "/terminal/link/data",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = DataSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      pushFromBrowser(parsed.data.session, Buffer.from(parsed.data.data, "base64"))
      return reply.send({ ok: true })
    },
  )

  // De kabel deed het niet: poort bezet, toestel losgetrokken, tabblad gesloten.
  app.post(
    "/terminal/link/error",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = ErrorSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      logger.warn({ session: parsed.data.session, msg: parsed.data.message }, "kassascherm reports a cable problem")
      pushError(parsed.data.session, parsed.data.message)
      return reply.send({ ok: true })
    },
  )

  // Voor de kassa zelf: mag ik pinnen aanbieden?
  app.get(
    "/terminal/link/status",
    { preHandler: authenticateTablet },
    async (_req, reply) => reply.send(linkStatus()),
  )
}
