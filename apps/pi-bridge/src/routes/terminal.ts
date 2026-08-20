import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { authenticateTablet } from "../middleware/auth-tablet.js"
import {
  clearQueuedIntent,
  reportAppResult,
  reportTerminalStatus,
  takeNextIntent,
} from "../services/mypos-app.js"
import { ULID_RE } from "../utils/ulid.js"
import { logger } from "../utils/logger.js"

// Endpoints voor onze eigen app op de myPOS Ultra. De app haalt hier zijn werk
// op en meldt de afloop terug; de Pi blijft de bron van waarheid.
//
// Waarom de terminal ophaalt en de Pi niet duwt: de Ultra hangt als client aan
// het access point van de Pi. Zo hoeft er nooit iets naar hem toe, overleeft
// een herstart van de app zichzelf, en is er geen open poort op het toestel.

/** Iets korter dan de meeste proxy-timeouts, zodat een poll netjes afloopt. */
const POLL_MS = 25_000

const ResultSchema = z.object({
  idempotency_key: z.string().regex(ULID_RE),
  approved: z.boolean(),
  // De app weet zelf niet of de kaart belast is — bijvoorbeeld als de SDK
  // halverwege afbrak. Dan is "onbekend" het enige eerlijke antwoord.
  unresolved: z.boolean().optional(),
  status_code: z.string().max(64).nullish(),
  message: z.string().max(500).nullish(),
  receipt: z
    .object({
      auth_code: z.string().max(32).nullish(),
      approval: z.string().max(8).nullish(),
      rrn: z.string().max(64).nullish(),
      stan: z.string().max(16).nullish(),
      pan_masked: z.string().max(32).nullish(),
      entry_mode: z.string().max(8).nullish(),
      card_scheme: z.string().max(32).nullish(),
      signature_required: z.boolean().nullish(),
      tx_at: z.string().max(40).nullish(),
    })
    .nullish(),
})

const StatusSchema = z.object({
  battery_percent: z.number().int().min(0).max(100).nullish(),
  printer_ok: z.boolean().nullish(),
  app_version: z.string().max(32).nullish(),
  terminal_id: z.string().max(32).nullish(),
})

export async function terminalRoutes(app: FastifyInstance) {
  // Long-poll: blijft hangen tot er een bedrag klaarstaat of tot de tijd om
  // is. 204 betekent "niets te doen", niet "er ging iets mis".
  app.get(
    "/terminal/next",
    { preHandler: authenticateTablet },
    async (_req, reply) => {
      const intent = await takeNextIntent(POLL_MS)
      if (!intent) return reply.code(204).send()
      return reply.send({
        idempotency_key: intent.idempotency_key,
        amount_cents: intent.amount_cents,
        currency: "EUR",
        order_id: intent.order_id,
        order_label: intent.order_label,
      })
    },
  )

  // De afloop. Mag herhaald worden met dezelfde key: de app biedt hem opnieuw
  // aan tot wij bevestigen, want een belaste kaart zonder bon is het ergste
  // wat er kan gebeuren.
  app.post(
    "/terminal/result",
    {
      preHandler: authenticateTablet,
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const parsed = ResultSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues })
      }

      try {
        const result = await reportAppResult({
          ...parsed.data,
          status_code: parsed.data.status_code ?? null,
          message: parsed.data.message ?? null,
          receipt: parsed.data.receipt ?? null,
        })
        return reply.send({ ok: true, ...result })
      } catch (err) {
        if ((err as Error).message === "mypos_unknown_transaction") {
          // De Pi kent deze betaling niet (opnieuw geflasht, of een sleutel
          // van een vorige installatie). De app moet hem uit zijn wachtrij
          // gooien in plaats van eeuwig te blijven proberen.
          logger.warn({ key: parsed.data.idempotency_key }, "terminal reported an unknown payment")
          return reply.code(404).send({ error: "mypos_unknown_transaction", drop: true })
        }
        throw err
      }
    },
  )

  // Levensteken plus wat de kassa moet weten: accu en printerpapier.
  app.post(
    "/terminal/status",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = StatusSchema.safeParse(req.body ?? {})
      if (!parsed.success) return reply.code(400).send({ error: "validation" })

      const status = reportTerminalStatus({
        battery_percent: parsed.data.battery_percent ?? null,
        printer_ok: parsed.data.printer_ok ?? null,
        app_version: parsed.data.app_version ?? null,
        terminal_id: parsed.data.terminal_id ?? null,
      })
      return reply.send({ ok: true, seen_at: status.seen_at })
    },
  )

  // De app laat weten dat hij een opdracht heeft opgepakt, zodat een tweede
  // instantie hem niet ook nog krijgt.
  app.post(
    "/terminal/claim",
    { preHandler: authenticateTablet },
    async (req, reply) => {
      const parsed = z
        .object({ idempotency_key: z.string().regex(ULID_RE) })
        .safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: "validation" })
      clearQueuedIntent(parsed.data.idempotency_key)
      return reply.send({ ok: true })
    },
  )
}
