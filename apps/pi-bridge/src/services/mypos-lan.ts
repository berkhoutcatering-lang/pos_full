import { config } from "../config.js"
import { logger } from "../utils/logger.js"
import {
  captureOnce,
  dropIntent,
  findIntent,
  insertIntent,
  recentTerminalSids,
  updateIntent,
  STALE_PENDING_MS,
  type IntentRow,
  type MyPosStartArgs,
  type MyPosStartResult,
  type NormalizedStatus,
} from "./mypos-intents.js"
import { getReceiptSettings } from "./receipt-settings.js"
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

/** When we last saw the terminal answer. Alleen voor logging en /_health. */
let lastContactAt = 0

/**
 * Adempauze tussen de handshake en het bedrag.
 *
 * Met de hand getest werkte het omdat er seconden tussen de twee commando's
 * zaten. De bridge deed ze binnen milliseconden achter elkaar, en dan slikt de
 * terminal de PURCHASE alsnog in — hij is dan nog met zijn welkomstscherm bezig.
 */
const HANDSHAKE_SETTLE_MS = 400

/**
 * Zeg hallo, en pas daarna het bedrag.
 *
 * De eerste verbinding gaat op aan de handshake van de terminal: hij toont
 * "All set! Now you can use it" en beantwoordt niet wat er in diezelfde sessie
 * is verstuurd. Een PING vangt dat op — read-only, klaar in een fractie van een
 * seconde, en meteen het bewijs dat de terminal bereikbaar is voordat we de
 * kassa vertellen dat er een betaling loopt.
 *
 * Dit gebeurt vóór ELKE betaling, niet alleen na een stille periode. De eerdere
 * aanname dat een link daarna een minuut warm blijft, hield geen stand: de
 * terminal lijkt die begroeting per verbinding te willen, en een klant die naar
 * een leeg scherm kijkt is duurder dan 400 milliseconden.
 */
async function ensureLink(): Promise<void> {
  const started = Date.now()
  const ping = runIppMethod({ ...terminal(), method: "PING" })
  const final = await ping.done
  lastContactAt = Date.now()

  logger.info(
    { ms: lastContactAt - started, status: final.STATUS, stage: final.STAGE },
    "terminal handshake ok",
  )

  await new Promise((resolve) => setTimeout(resolve, HANDSHAKE_SETTLE_MS))
}

/**
 * Between payments the terminal sits on POSLink Manager's own screen, which
 * shows the cash register's IP address and port. That is fine on a workbench
 * and wrong at a counter, so we tried to put the venue's own name there.
 *
 * On a myPOS Ultra that does not work: DISPLAY_TEXT is answered with STATUS=0
 * on both stages and nothing appears. It is not in myPOS' documented method
 * list either — it comes from their .NET SDK for the classic terminals with a
 * simple display. Left in behind a flag that is off by default, so it costs
 * nothing until myPOS tells us it is supported.
 */
const IDLE_REFRESH_MS = 4 * 60_000

function idleRows(): string[] {
  const settings = getReceiptSettings()
  const rows = [settings.legal_name?.trim(), settings.footer_text?.trim()]
  return rows.filter((r): r is string => Boolean(r)).slice(0, 5)
}

export async function showIdleScreen(): Promise<void> {
  if (config.MYPOS_TRANSPORT !== "lan" || !config.MYPOS_TERMINAL_HOST) return
  if (!config.MYPOS_TERMINAL_IDLE_SCREEN) return
  // Never paint over a payment in progress.
  if (live.size > 0) return

  const rows = idleRows()
  if (rows.length === 0) return

  try {
    const session = runIppMethod({
      ...terminal(),
      method: "DISPLAY_TEXT",
      fields: rows.map((text, i) => [`DISPLAY_TEXT_ROW${i + 1}`, text] as [string, string]),
    })
    await session.done
    lastContactAt = Date.now()
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "terminal idle screen not updated")
  }
}

/**
 * Heartbeat towards the terminal.
 *
 * A PING every few minutes keeps the link warm, so the first payment after a
 * quiet hour does not have to spend its connection on the terminal's
 * handshake — which is what left a customer staring at a screen without an
 * amount on it. PING is in the documented method list and answers in a
 * fraction of a second, so this is cheap.
 */
export function startTerminalHeartbeat() {
  if (config.MYPOS_TRANSPORT !== "lan" || !config.MYPOS_TERMINAL_HOST) return

  const tick = () => {
    if (live.size > 0) return // a payment is already keeping the link warm
    void ensureLink().catch((err) =>
      logger.warn({ err: (err as Error).message }, "terminal heartbeat failed"),
    )
    void showIdleScreen()
  }

  setTimeout(tick, 5_000).unref()
  setInterval(tick, IDLE_REFRESH_MS).unref()
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
  stage?: string,
  approval?: string,
): { normalized: NormalizedStatus; message?: string } {
  // Wat de bank ervan vond, als hij dat zei. "58" betekent niets aan de balie,
  // maar het is het eerste wat myPOS vraagt als je belt, en zonder die code is
  // een weigering niet te onderscheiden van een storing.
  const bank = approval && approval !== "00" ? ` (bankcode ${approval})` : ""

  if (status === 0 || status === 100) {
    // STATUS covers the protocol exchange; TX_STATUS covers the money.
    if (txStatus !== undefined && txStatus !== "0") {
      return {
        normalized: "declined",
        message: `De bank weigerde de betaling${bank} — probeer een andere kaart of reken contant af.`,
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
        message: `De kaart is geweigerd${bank} — probeer een andere kaart of reken contant af.`,
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
    case 14: // INTERNAL ERROR
      // Dubbelzinnig, en dat hangt aan de stap. Bij STAGE=1 heeft de terminal
      // de betaling niet eens aangenomen. Kwam hij verder, dan is de kaart
      // mogelijk al langs de bank geweest en mag de kassa niet zeggen dat er
      // niets is gebeurd.
      if (stage === "1") {
        return {
          normalized: "failed",
          message:
            "De terminal kon de betaling niet starten (interne fout) — herstart hem en sla opnieuw aan.",
        }
      }
      return {
        normalized: "unresolved",
        message:
          "De terminal liep vast tijdens de betaling — kijk op de terminal of de kaart belast is voor je opnieuw aanslaat.",
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

/**
 * Bevestig aan de terminal dat we het resultaat hebben.
 *
 * Zonder dit blijft de transactie bij hem openstaan en weigert hij de volgende
 * met STATUS=20 ("vorige transactie niet afgerond"). Dat is precies wat er aan
 * de balie gebeurde: de eerste betaling lukte, de tweede kwam er niet meer in.
 *
 * Fail-soft: lukt de bevestiging niet, dan is de betaling nog steeds gelukt en
 * heeft de klant zijn bon.
 */
async function confirmToTerminal(sid: string, key: string): Promise<boolean> {
  try {
    const session = runIppMethod({
      ...terminal(),
      method: "COMPLETE_TX",
      fields: [["SID_ORIGINAL", sid]],
    })
    const final = await session.done
    const ok = final.STATUS === "0" || final.STATUS === "100"
    logger.info(
      { key, sid, status: final.STATUS, stage: final.STAGE, ok },
      "terminal transaction closed",
    )
    return ok
  } catch (err) {
    logger.warn(
      { key, sid, err: (err as Error).message },
      "terminal transaction not confirmed — next payment may be refused with status 20",
    )
    return false
  }
}

/**
 * Heeft de terminal deze betaling daadwerkelijk aangenomen?
 *
 * Zo ja, dan staat er bij hem een transactie open die wij moeten afsluiten —
 * ook als de klant hem afbrak of de kaart werd geweigerd. Dat was de fout die
 * de balie stillegde: er werd alleen bevestigd na STAGE=5, dus één annulering
 * op het pinpad was genoeg om elke volgende betaling met STATUS=20 te laten
 * stranden. Kwam de weigering al bij de eerste stap, dan is er niets aangenomen
 * en valt er ook niets af te sluiten.
 */
function armedTerminal(frames: IppFields[]): boolean {
  return frames.some((f) => f.STAGE === "1" && (f.STATUS === "0" || f.STATUS === "100"))
}

/**
 * Vragen wat de terminal van zichzelf vindt.
 *
 * GET_STATUS leest alleen en antwoordt in een fractie van een seconde met zijn
 * hele staat: serienummer, software, en — als er een transactie is blijven
 * openstaan — STATUS=20 mét het SID_ORIGINAL, de bedragen en de RRN van die
 * transactie. Hij vertelt dus zelf welke betaling hem tegenhoudt.
 */
async function askTerminalStatus(): Promise<IppFields> {
  const session = runIppMethod({ ...terminal(), method: "GET_STATUS" })
  const final = await session.done
  lastContactAt = Date.now()
  return final
}

/**
 * Een blijven hangende transactie op de terminal opruimen.
 *
 * Eerst hem zelf vragen welke het is; dat is exact en kost één leesopdracht.
 * Weet hij het niet te noemen, dan vallen we terug op de sessie-ids van onze
 * laatste betalingen. Een id dat de terminal niet kent levert STATUS=17 op en
 * verandert niets, dus dat aflopen kost hooguit een paar seconden en raakt geen
 * geld.
 */
export async function clearStuckTransaction(opts: {
  key?: string
  sid?: string
} = {}): Promise<{ cleared: boolean; sid: string | null; tried: number }> {
  const candidates: string[] = []

  if (opts.sid) {
    candidates.push(opts.sid)
  } else {
    try {
      const state = await askTerminalStatus()
      if (state.STATUS === "20" && state.SID_ORIGINAL) {
        // De hele regel meelogboeken: bij een betaling die is blijven hangen
        // staat hier of de kaart wél belast is (TX_STATUS en RRN), en dat is
        // wat je aan de balie moet weten voor je iemand laat doorlopen.
        logger.warn(
          {
            sid: state.SID_ORIGINAL,
            tx_status: state.TX_STATUS,
            rrn: state.RRN,
            amount: state.AMOUNT,
            at: `${state.TX_DATE_LOCAL ?? ""} ${state.TX_TIME_LOCAL ?? ""}`.trim(),
          },
          "terminal names the transaction that is holding it up",
        )
        candidates.push(state.SID_ORIGINAL)
      } else if (state.STATUS === "0" || state.STATUS === "100") {
        logger.info({ key: opts.key }, "terminal says nothing is open after all")
        return { cleared: true, sid: null, tried: 0 }
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "terminal did not answer GET_STATUS")
    }

    for (const sid of recentTerminalSids(8, opts.key)) {
      if (!candidates.includes(sid)) candidates.push(sid)
    }
  }

  if (candidates.length === 0) {
    logger.warn(
      { key: opts.key },
      "terminal reports an open transaction but we have no session id to close it with",
    )
    return { cleared: false, sid: null, tried: 0 }
  }

  for (const [i, sid] of candidates.entries()) {
    if (await confirmToTerminal(sid, opts.key ?? "recovery")) {
      logger.info({ key: opts.key, sid }, "stuck terminal transaction cleared")
      return { cleared: true, sid, tried: i + 1 }
    }
  }

  logger.warn({ key: opts.key, tried: candidates.length }, "could not clear the terminal")
  return { cleared: false, sid: null, tried: candidates.length }
}

async function settleFinalFrame(key: string, final: IppFields) {
  const status = Number(final.STATUS)
  const { normalized, message } = classify(status, final.TX_STATUS, final.STAGE, final.APPROVAL)
  const receipt = receiptFields(final)
  lastContactAt = Date.now()

  updateIntent(key, {
    status: normalized,
    status_code: String(status),
    last_error: normalized === "approved" ? null : (message ?? null),
    // No separate payment id exists over IPP. The RRN is what the bank and the
    // customer's statement show, so that is the handle worth keeping.
    //
    // Blijft leeg als de terminal er geen gaf. Eerder stond de betaalsleutel
    // hier als vervanging, en dat las als "er is iets bij de bank gebeurd" —
    // waarna een tweede poging met dezelfde sleutel het oude antwoord terugkreeg
    // in plaats van de terminal opnieuw aan te slaan.
    transaction_id: receipt.rrn ?? null,
  })

  logger.info(
    {
      key,
      status,
      normalized,
      rrn: receipt.rrn,
      auth_code: receipt.auth_code,
      // Het antwoord van de bank. 00 is goedgekeurd; alles daarbuiten is de
      // reden waarom niet, en die staat nergens anders.
      approval: receipt.approval,
      card: receipt.card_scheme,
      pan: receipt.pan_masked,
    },
    "myPOS LAN payment settled",
  )

  if (normalized === "approved") await captureOnce(key)

  // Give the customer a moment with the result before we take the screen back.
  setTimeout(() => void showIdleScreen(), 8_000).unref()
}

/** Het bedrag klaarzetten op de terminal. Eén TCP-sessie, één betaling. */
function armPurchase(args: MyPosStartArgs): IppSession {
  return runIppMethod({
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
}

/**
 * De sessie uitzitten en het resultaat wegschrijven. Draait op de achtergrond;
 * de kassa pollt ondertussen op de intent-rij.
 *
 * `mayRecover` is er voor precies één ronde: weigert de terminal omdat er nog
 * een transactie van hem openstaat, dan ruimen we die op en zetten we het bedrag
 * opnieuw klaar. De klant staat er nog, en die hoort daar niets van te merken.
 */
async function watchSession(
  args: MyPosStartArgs,
  session: IppSession,
  mayRecover: boolean,
): Promise<void> {
  try {
    const final = await session.done

    if (final.STATUS === "20" && mayRecover) {
      logger.warn({ key: args.idempotency_key }, "terminal refused: previous transaction still open")
      const { cleared } = await clearStuckTransaction({ key: args.idempotency_key })
      if (cleared) {
        await ensureLink()
        const retry = armPurchase(args)
        live.set(args.idempotency_key, retry)
        updateIntent(args.idempotency_key, { terminal_sid: retry.sid })
        void watchSession(args, retry, false)
        return
      }
    }

    await settleFinalFrame(args.idempotency_key, final)
    // Alles wat de terminal heeft aangenomen moet ook weer bij hem dicht —
    // goedgekeurd, geweigerd of afgebroken.
    if (armedTerminal(session.frames)) {
      await confirmToTerminal(session.sid, args.idempotency_key)
    }
  } catch (err) {
    const reason = (err as Error).message
    // A dropped socket mid-transaction is the ambiguous case: the terminal
    // may be finishing the authorisation without us watching. De stages die
    // we wél zagen staan erbij: zonder die context is "ipp_timeout" in de
    // kassa niet te herleiden tot wat de terminal deed.
    logger.error(
      {
        err: reason,
        key: args.idempotency_key,
        sid: session.sid,
        frames: session.frames.map((f) => `stage=${f.STAGE} status=${f.STATUS}`),
      },
      "myPOS LAN session failed",
    )
    updateIntent(args.idempotency_key, { status: "unresolved", last_error: reason })
  } finally {
    // Niet wissen als er inmiddels een nieuwe sessie voor deze sleutel loopt.
    if (live.get(args.idempotency_key) === session) live.delete(args.idempotency_key)
  }
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
    session = armPurchase(args)
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
  // Meteen vastleggen, vóór het eerste antwoord: gaat de bridge onderuit
  // terwijl de klant pint, dan is dit het enige waarmee de transactie later
  // nog bij de terminal is af te sluiten.
  updateIntent(args.idempotency_key, { terminal_sid: session.sid })

  // Deliberately not awaited: the kassa polls. Every exit path writes the
  // intent row, so a failure here can never leave the caller without an answer.
  void watchSession(args, session, true)

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

  // Niets belast: opnieuw aanslaan mag, en dat is precies wat de operator
  // vraagt door nogmaals te tikken. Een weigering — kaart afgekeurd, klant
  // brak af, terminal wilde niet — is per definitie een betaling die niet
  // doorging. Alleen `approved` en `unresolved` mogen nooit opnieuw: daar kan
  // wél geld tegenover staan.
  if (row.status === "failed" || row.status === "declined") return null

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
