import { config } from "../config.js"
import { logger } from "../utils/logger.js"
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
import {
  IPP_STATUS_TEXT,
  formatAmount,
  runIppMethod,
  type IppFields,
  type IppSession,
} from "./mypos-ipp.js"

// PIN over the LAN: the Pi drives the myPOS Ultra directly over TCP with IPP,
// and the terminal authorises the card over its own SIM. Nothing in this path
// touches the internet, which is the whole point — the foodtruck kassa has no
// uplink of its own.
//
// Shape of the flow versus the cloud transport: IPP holds one TCP session open
// from "amount armed" until the customer is done, which can take a minute. The
// kassa's contract is start-then-poll, so the session runs in the background
// here and writes its outcome into the intent row that /mypos/status reads.

/** Sessions still live on the terminal, keyed by idempotency key. */
const live = new Map<string, IppSession>()

function terminal() {
  return { host: config.MYPOS_TERMINAL_HOST!, port: config.MYPOS_TERMINAL_PORT }
}

/** When we last saw the terminal answer, so we know the link is warm. */
let lastContactAt = 0

/** How long a confirmed link stays warm before we hand-shake again. */
const LINK_WARM_MS = 60_000

/**
 * Say hello before arming a payment.
 *
 * The first connection after a quiet period is spent on the terminal's own
 * handshake — it shows "All set! Now you can use it" and swallows whatever we
 * sent in that session, so the customer never sees the amount. A PING is the
 * cheapest way to get that out of the way: it is read-only, it completes in a
 * fraction of a second, and it doubles as proof the terminal is reachable
 * before we tell the kassa a payment is running.
 */
async function ensureLink(): Promise<void> {
  if (Date.now() - lastContactAt < LINK_WARM_MS) return

  const ping = runIppMethod({ ...terminal(), method: "PING" })
  await ping.done
  lastContactAt = Date.now()
}

/**
 * Map an IPP status onto our vocabulary. The distinction that matters is
 * "nothing happened" versus "we do not know" — a terminal that lost the host
 * mid-authorisation may well have charged the card, so that is `unresolved`
 * and the operator gets sent to the terminal instead of to a retry.
 */
function classify(
  status: number,
  txStatus?: string,
): { normalized: NormalizedStatus; message?: string } {
  if (status === 0 || status === 100) {
    // STATUS covers the protocol exchange; TX_STATUS covers the money.
    if (txStatus !== undefined && txStatus !== "0") {
      return {
        normalized: "declined",
        message: "De betaling is niet gelukt — probeer opnieuw of reken contant af.",
      }
    }
    return { normalized: "approved" }
  }

  switch (status) {
    case 5: // NO CARD FOUND
    case 6: // UNSUPPORTED CARD
    case 9: // INVALID PIN
    case 10: // MAX PIN COUNT EXCEEDED
      return {
        normalized: "declined",
        message: "De kaart is geweigerd — probeer een andere kaart of reken contant af.",
      }
    case 13: // USER CANCEL
      return { normalized: "declined", message: "Betaling geannuleerd op de terminal." }
    case 1: // TERMINAL BUSY
      return {
        normalized: "failed",
        message: "De terminal is nog bezig met een andere betaling — wacht even en sla opnieuw aan.",
      }
    case 20: // NOT COMPLETED LAST TX
      return {
        normalized: "failed",
        message: "De vorige betaling staat nog open op de terminal — rond die eerst af.",
      }
    case 19: // INVALID AMOUNT
      return { normalized: "failed", message: "De terminal accepteert dit bedrag niet." }
    case 25: // ACTIVATION REQUIRED
      return {
        normalized: "failed",
        message: "De terminal is niet geactiveerd voor kassabediening — neem contact op met myPOS.",
      }
    case 26: // MANDATORY UPDATE REQUIRED
      return {
        normalized: "failed",
        message: "De terminal moet eerst een verplichte update draaien.",
      }
    // The card may or may not have been charged in these three.
    case 12: // HOST RECEIVE ERROR
    case 15: // COMMUNICATION ERROR
    case 16: // SSL ERROR
      return {
        normalized: "unresolved",
        message:
          "De terminal verloor de verbinding met de bank — controleer de terminal voor je opnieuw aanslaat.",
      }
    default:
      return {
        normalized: "failed",
        message: `De terminal weigerde de betaling (${status}: ${IPP_STATUS_TEXT[status] ?? "onbekend"}).`,
      }
  }
}

/** The fields off the final frame that a receipt and the audit trail need. */
export function receiptFields(f: IppFields) {
  return {
    auth_code: f.AUTH_CODE ?? null,
    approval: f.APPROVAL ?? null,
    rrn: f.RRN ?? null,
    stan: f.STAN ?? null,
    pan_masked: f.PAN_MASKED ?? null,
    entry_mode: f.ENTRY_MODE ?? null,
    aid: f.AID ?? null,
    card_scheme: f.AID_NAME ?? null,
    signature_required: f.SIGNATURE_NOT_REQ !== "1",
    tx_date: f.TX_DATE_LOCAL ?? null,
    tx_time: f.TX_TIME_LOCAL ?? null,
    terminal_id: f.TERMINAL_ID ?? null,
  }
}

async function settleFinalFrame(key: string, final: IppFields) {
  const status = Number(final.STATUS)
  const { normalized, message } = classify(status, final.TX_STATUS)
  const receipt = receiptFields(final)
  lastContactAt = Date.now()

  updateIntent(key, {
    status: normalized,
    status_code: String(status),
    last_error: normalized === "approved" ? null : (message ?? null),
    // No separate payment id exists over IPP. The RRN is what the bank and the
    // customer's statement show, so that is the handle worth keeping.
    transaction_id: receipt.rrn ?? key,
  })

  logger.info(
    { key, status, normalized, rrn: receipt.rrn, auth_code: receipt.auth_code },
    "myPOS LAN payment settled",
  )

  if (normalized === "approved") await captureOnce(key)
}

export async function startLanTransaction(
  args: MyPosStartArgs,
): Promise<MyPosStartResult> {
  const existing = findIntent(args.idempotency_key)
  if (existing) {
    const settled = settleExistingLan(existing)
    if (settled) return settled
    dropIntent(existing.idempotency_key)
  }

  insertIntent(args)

  let session: IppSession
  try {
    await ensureLink()
    session = runIppMethod({
      ...terminal(),
      method: "PURCHASE",
      fields: [
        ["AMOUNT", formatAmount(args.amount_cents)],
        ["CURRENCY", "978"],
        ["FIXED_PINPAD", "1"],
        ["LANG", config.MYPOS_TERMINAL_LANG],
        ["OPERATOR_CODE", config.MYPOS_OPERATOR_CODE],
        // Echoed back on the final frame, so an order stays traceable from the
        // terminal's own journal without our database.
        ["REFERENCE", args.idempotency_key],
      ],
    })
  } catch (err) {
    updateIntent(args.idempotency_key, {
      status: "failed",
      last_error: (err as Error).message,
    })
    return {
      transaction_id: args.idempotency_key,
      status: "failed",
      message: "De terminal is niet bereikbaar — controleer of hij op het kassanetwerk zit.",
    }
  }

  live.set(args.idempotency_key, session)

  // Deliberately not awaited: the kassa polls. Every exit path writes the
  // intent row, so a failure here can never leave the caller without an answer.
  void session.done
    .then((final) => settleFinalFrame(args.idempotency_key, final))
    .catch((err) => {
      const reason = (err as Error).message
      // A dropped socket mid-transaction is the ambiguous case: the terminal
      // may be finishing the authorisation without us watching.
      logger.error(
        { err: reason, key: args.idempotency_key },
        "myPOS LAN session failed",
      )
      updateIntent(args.idempotency_key, { status: "unresolved", last_error: reason })
    })
    .finally(() => live.delete(args.idempotency_key))

  return { transaction_id: args.idempotency_key, status: "pending" }
}

/**
 * What to hand back for a key we have seen before, or `null` if the previous
 * attempt provably never armed the terminal and the key may be reused.
 *
 * Unlike the cloud route there is no reconciliation call: IPP has no "what
 * became of session X". So an unresolved payment stays unresolved until a human
 * looks at the terminal — the safe direction to be wrong in.
 */
function settleExistingLan(row: IntentRow): MyPosStartResult | null {
  const handle = row.transaction_id ?? row.idempotency_key

  // Refused before anything reached the terminal: retrying is safe, and it is
  // what the operator is asking for by tapping again.
  if (row.status === "failed" && !row.transaction_id) return null

  // Pending with no session behind it means the bridge restarted while the
  // customer was paying, and we cannot ask the terminal what became of it.
  if (
    row.status === "pending" &&
    !live.has(row.idempotency_key) &&
    Date.now() - row.created_at > STALE_PENDING_MS
  ) {
    updateIntent(row.idempotency_key, { status: "unresolved", last_error: "session_lost" })
    return {
      transaction_id: handle,
      status: "unresolved",
      reused: true,
      message:
        "Onbekend of deze betaling is gelukt — controleer de terminal voor je opnieuw aanslaat.",
    }
  }

  return {
    transaction_id: handle,
    status: row.status as NormalizedStatus,
    reused: true,
  }
}

export interface LanPollResult {
  status: NormalizedStatus
  code: string | null
  raw: unknown
  stale?: boolean
  message?: string
}

export function pollLanStatus(handle: string): LanPollResult {
  const row = findIntent(handle)
  if (!row) throw new Error("mypos_unknown_transaction")

  if (row.status === "pending") {
    const running = live.has(row.idempotency_key)
    if (!running || Date.now() - row.created_at > STALE_PENDING_MS) {
      updateIntent(row.idempotency_key, { status: "unresolved", last_error: "no_final_stage" })
      return {
        status: "unresolved",
        code: null,
        raw: null,
        stale: true,
        message: "Geen eindantwoord van de terminal — controleer hem voor je opnieuw aanslaat.",
      }
    }
  }

  return {
    status: row.status as NormalizedStatus,
    code: row.status_code,
    raw: null,
    message: row.last_error ?? undefined,
  }
}

/**
 * Stop waiting for a PIN. IPP documents no cancel method we have verified on
 * this terminal, so we drop our side and let the terminal's own TIMEOUT clear
 * the amount — firing an unverified frame at a live payment is the one thing
 * worse than waiting.
 */
export function cancelLanTransaction(handle: string) {
  const row = findIntent(handle)
  if (!row) throw new Error("mypos_unknown_transaction")

  const session = live.get(row.idempotency_key)
  if (session) {
    session.abort()
    live.delete(row.idempotency_key)
  }

  updateIntent(row.idempotency_key, {
    status: "unresolved",
    last_error: "cancelled_by_operator",
  })

  return {
    status: "unresolved" as NormalizedStatus,
    message:
      "De kassa wacht niet meer. Rond de betaling op de terminal zelf af of laat hem verlopen.",
  }
}
