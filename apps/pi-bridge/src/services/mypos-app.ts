import { logger } from "../utils/logger.js"
import { piDb } from "../db/outbox.js"
import {
  captureOnce,
  dropIntent,
  findIntent,
  insertIntent,
  updateIntent,
  STALE_PENDING_MS,
  type IntentRow,
  type MyPosStartArgs,
  type MyPosStartResult,
  type NormalizedStatus,
} from "./mypos-intents.js"

// PIN via onze eigen app op de terminal ("Hop Terminal").
//
// Anders dan de IPP-route duwt de Pi hier niets: de app op de Ultra haalt de
// betaalopdracht op en meldt de afloop terug. De Pi blijft de bron van
// waarheid — dezelfde intents-tabel, dezelfde idempotency-key, dezelfde
// payment.captured — alleen het transport verschilt.
//
// Zie docs/hop-terminal-plan.html voor het ontwerp.

/** Opdracht die klaarstaat voor de terminal. Er is er hoogstens één. */
interface QueuedIntent {
  idempotency_key: string
  amount_cents: number
  order_id: string
  order_label: string | null
  queued_at: number
}

let queued: QueuedIntent | null = null

/** Long-pollers die op een opdracht wachten. */
type Waiter = (intent: QueuedIntent | null) => void
const waiters = new Set<Waiter>()

/** Laatste levensteken van de app, voor /_health en /admin. */
export interface TerminalStatus {
  seen_at: number
  battery_percent: number | null
  printer_ok: boolean | null
  app_version: string | null
  terminal_id: string | null
}
let lastStatus: TerminalStatus | null = null

export function getTerminalStatus(): TerminalStatus | null {
  return lastStatus
}

export function reportTerminalStatus(
  patch: Omit<Partial<TerminalStatus>, "seen_at">,
): TerminalStatus {
  lastStatus = {
    seen_at: Date.now(),
    battery_percent: patch.battery_percent ?? lastStatus?.battery_percent ?? null,
    printer_ok: patch.printer_ok ?? lastStatus?.printer_ok ?? null,
    app_version: patch.app_version ?? lastStatus?.app_version ?? null,
    terminal_id: patch.terminal_id ?? lastStatus?.terminal_id ?? null,
  }
  return lastStatus
}

/** De app leeft als hij binnen twee minuten iets van zich heeft laten horen. */
const TERMINAL_ONLINE_MS = 2 * 60_000

export function terminalOnline(now = Date.now()): boolean {
  return lastStatus !== null && now - lastStatus.seen_at < TERMINAL_ONLINE_MS
}

function publish(intent: QueuedIntent) {
  queued = intent
  for (const waiter of waiters) waiter(intent)
  waiters.clear()
}

/**
 * Wat de app ophaalt. Blijft hangen tot er een opdracht is of tot de
 * long-poll afloopt — een leeg antwoord is normaal en betekent "niets te doen".
 */
export function takeNextIntent(timeoutMs: number): Promise<QueuedIntent | null> {
  if (queued) return Promise.resolve(queued)

  return new Promise((resolve) => {
    const waiter: Waiter = (intent) => {
      clearTimeout(timer)
      resolve(intent)
    }
    const timer = setTimeout(() => {
      waiters.delete(waiter)
      resolve(null)
    }, timeoutMs)
    // Node mag niet blijven draaien voor een wachtende kassa-poll.
    timer.unref?.()
    waiters.add(waiter)
  })
}

export function clearQueuedIntent(idempotency_key: string) {
  if (queued?.idempotency_key === idempotency_key) queued = null
}

/** Alleen voor tests: alles terug naar de begintoestand. */
export function _resetAppTransport() {
  queued = null
  waiters.clear()
  lastStatus = null
}

export async function startAppTransaction(
  args: MyPosStartArgs & { order_label?: string | null },
): Promise<MyPosStartResult> {
  const existing = findIntent(args.idempotency_key)
  if (existing) {
    const settled = settleExistingApp(existing)
    if (settled) return settled
    dropIntent(existing.idempotency_key)
  }

  // Eén betaling tegelijk op de terminal. Een tweede kassa die aanslaat
  // terwijl er een bedrag klaarstaat, hoort dat te weten in plaats van de
  // eerste te overschrijven.
  if (queued) {
    return {
      transaction_id: queued.idempotency_key,
      status: "failed",
      message: "Er staat al een betaling klaar op de terminal — rond die eerst af.",
    }
  }

  if (!terminalOnline()) {
    return {
      transaction_id: args.idempotency_key,
      status: "failed",
      message: "De terminal is niet verbonden — reken contant af of controleer het scherm.",
    }
  }

  insertIntent(args)
  publish({
    idempotency_key: args.idempotency_key,
    amount_cents: args.amount_cents,
    order_id: args.order_id,
    order_label: args.order_label ?? null,
    queued_at: Date.now(),
  })

  logger.info(
    { key: args.idempotency_key, amount_cents: args.amount_cents },
    "payment queued for terminal app",
  )

  return { transaction_id: args.idempotency_key, status: "pending" }
}

export interface AppResultReport {
  idempotency_key: string
  approved: boolean
  /** Statuscode van de SDK, ongewijzigd doorgegeven voor de audit. */
  status_code?: string | null
  /** Onbekende afloop: de app weet zelf niet of de kaart belast is. */
  unresolved?: boolean
  message?: string | null
  receipt?: Record<string, unknown> | null
}

/**
 * De app meldt de afloop. Mag herhaald worden: de app biedt hem opnieuw aan
 * tot wij bevestigen, want een belaste kaart zonder bon is het ergste wat er
 * kan gebeuren.
 */
export async function reportAppResult(
  report: AppResultReport,
): Promise<{ status: NormalizedStatus; already_settled: boolean }> {
  const row = findIntent(report.idempotency_key)
  if (!row) throw new Error("mypos_unknown_transaction")

  clearQueuedIntent(report.idempotency_key)

  // Al afgehandeld: hetzelfde antwoord teruggeven en niets opnieuw schrijven.
  if (row.status !== "pending" && row.status !== "unresolved") {
    return { status: row.status as NormalizedStatus, already_settled: true }
  }

  const status: NormalizedStatus = report.unresolved
    ? "unresolved"
    : report.approved
      ? "approved"
      : "declined"

  const receipt = report.receipt ?? null
  updateIntent(report.idempotency_key, {
    status,
    status_code: report.status_code ?? null,
    last_error: status === "approved" ? null : (report.message ?? null),
    // Het RRN is wat de bank en het bankafschrift van de klant tonen.
    transaction_id: (receipt?.rrn as string | undefined) ?? row.transaction_id ?? report.idempotency_key,
  })

  if (receipt) {
    piDb
      .prepare("UPDATE mypos_intents SET receipt_json = ? WHERE idempotency_key = ?")
      .run(JSON.stringify(receipt), report.idempotency_key)
  }

  logger.info(
    { key: report.idempotency_key, status, rrn: receipt?.rrn },
    "terminal app reported payment result",
  )

  if (status === "approved") await captureOnce(report.idempotency_key)

  return { status, already_settled: false }
}

/**
 * Wat we teruggeven voor een key die we al kennen, of `null` als de vorige
 * poging aantoonbaar niets heeft klaargezet en de key opnieuw gebruikt mag
 * worden.
 */
function settleExistingApp(row: IntentRow): MyPosStartResult | null {
  const handle = row.transaction_id ?? row.idempotency_key

  // Geweigerd voordat er iets bij de terminal lag: opnieuw proberen is veilig.
  if (row.status === "failed" && !row.transaction_id) return null

  if (
    row.status === "pending" &&
    queued?.idempotency_key !== row.idempotency_key &&
    Date.now() - row.created_at > STALE_PENDING_MS
  ) {
    // Niets in de wachtrij en te oud: de app heeft hem opgepakt en is
    // vervolgens stilgevallen. Wij weten niet of de kaart belast is.
    updateIntent(row.idempotency_key, { status: "unresolved", last_error: "app_silent" })
    return {
      transaction_id: handle,
      status: "unresolved",
      reused: true,
      message: "Onbekend of deze betaling is gelukt — controleer de terminal voor je opnieuw aanslaat.",
    }
  }

  return { transaction_id: handle, status: row.status as NormalizedStatus, reused: true }
}

export interface AppPollResult {
  status: NormalizedStatus
  code: string | null
  raw: unknown
  stale?: boolean
  message?: string
}

export function pollAppStatus(handle: string): AppPollResult {
  const row = findIntent(handle)
  if (!row) throw new Error("mypos_unknown_transaction")

  if (row.status === "pending" && Date.now() - row.created_at > STALE_PENDING_MS) {
    updateIntent(row.idempotency_key, { status: "unresolved", last_error: "no_result_from_app" })
    return {
      status: "unresolved",
      code: null,
      raw: null,
      stale: true,
      message: "Geen antwoord van de terminal — controleer hem voor je opnieuw aanslaat.",
    }
  }

  return {
    status: row.status as NormalizedStatus,
    code: row.status_code,
    raw: row.receipt_json ? JSON.parse(row.receipt_json) : null,
    message: row.last_error ?? undefined,
  }
}

/**
 * De kassa geeft het op. De opdracht gaat uit de wachtrij zodat de app hem
 * niet alsnog oppakt; heeft de app hem al, dan is de afloop onbekend tot hij
 * zich meldt.
 */
export function cancelAppTransaction(handle: string) {
  const row = findIntent(handle)
  if (!row) throw new Error("mypos_unknown_transaction")

  const wasQueued = queued?.idempotency_key === row.idempotency_key
  clearQueuedIntent(row.idempotency_key)

  if (wasQueued) {
    // Nog niet opgehaald: er is niets gebeurd op de terminal.
    updateIntent(row.idempotency_key, { status: "failed", last_error: "cancelled_before_pickup" })
    return { status: "failed" as NormalizedStatus, message: "Betaling ingetrokken." }
  }

  updateIntent(row.idempotency_key, { status: "unresolved", last_error: "cancelled_by_operator" })
  return {
    status: "unresolved" as NormalizedStatus,
    message: "De terminal was al begonnen — kijk daar wat er van de betaling geworden is.",
  }
}
