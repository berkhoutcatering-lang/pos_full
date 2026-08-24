import crypto from "node:crypto"
import { logger } from "../utils/logger.js"

/**
 * De terminal aan de USB van het kassascherm, aangestuurd door de browser.
 *
 * Chrome op een desktop mag een seriële poort openen (WebSerial). De kassapagina
 * staat er toch al de hele dag open, dus die kan de kabel vasthouden — en dan is
 * er geen los programma meer nodig dat een poort op het netwerk openzet, geen
 * firewallregel, en geen vast IP voor het kassascherm.
 *
 * De richting is omgekeerd ten opzichte van de andere transporten: een browser
 * is niet te bellen, dus híj meldt zich hier en haalt zijn werk op. Dat is
 * dezelfde vorm als de app op de terminal (`mypos-app.ts`), en om dezelfde
 * reden: alles wat naar buiten belt werkt niet op een apparaat dat achter een
 * firewall of achter NAT zit.
 *
 * Er wordt hier niets van IPP begrepen. De bridge levert bytes aan en krijgt
 * bytes terug; de browser schrijft ze naar de kabel en leest ze eruit.
 */

/** Wat de browser moet doen. Volgorde is belangrijk: open, schrijven, sluiten. */
export type LinkCommand =
  | { op: "open"; session: string; baud: number }
  | { op: "write"; session: string; data: string }
  | { op: "close"; session: string }

interface Attached {
  id: string
  lastSeenAt: number
}

/** Zolang de browser binnen dit venster iets van zich liet horen, telt hij mee. */
const ATTACH_TTL_MS = 40_000

let attached: Attached | null = null
const queue: LinkCommand[] = []
type Waiter = (cmd: LinkCommand | null) => void
const waiters = new Set<Waiter>()

/** Wie er nu de kabel gebruikt, en waar zijn bytes heen moeten. */
interface Session {
  id: string
  onData: (chunk: Buffer) => void
  onError: (err: Error) => void
}
let session: Session | null = null

function push(cmd: LinkCommand) {
  // Een wachtende poll krijgt hem meteen; anders blijft hij liggen tot de
  // volgende. Zo kost een betaling geen extra ronde wachten.
  const waiter = waiters.values().next().value
  if (waiter) {
    waiters.delete(waiter)
    waiter(cmd)
    return
  }
  queue.push(cmd)
}

export function attachBrowser(): string {
  const id = crypto.randomUUID()
  // De nieuwste wint. Een herladen pagina hoort de kabel terug te krijgen, niet
  // te moeten wachten tot de vorige sessie verlopen is.
  if (attached) logger.info({ old: attached.id, new: id }, "terminal link taken over")
  attached = { id, lastSeenAt: Date.now() }
  queue.length = 0
  return id
}

export function detachBrowser(id: string) {
  if (attached?.id !== id) return
  attached = null
  queue.length = 0
  failSession(new Error("kassascherm liet de terminal los"))
}

export function browserAttached(): boolean {
  return attached !== null && Date.now() - attached.lastSeenAt < ATTACH_TTL_MS
}

export function linkStatus() {
  return {
    attached: browserAttached(),
    last_seen_ms: attached ? Date.now() - attached.lastSeenAt : null,
    busy: session !== null,
  }
}

/** Long-poll. `null` betekent "niets te doen", niet "er ging iets mis". */
export function nextCommand(id: string, timeoutMs: number): Promise<LinkCommand | null> {
  if (attached?.id === id) attached.lastSeenAt = Date.now()

  const queued = queue.shift()
  if (queued) return Promise.resolve(queued)

  return new Promise((resolve) => {
    const waiter: Waiter = (cmd) => {
      clearTimeout(timer)
      resolve(cmd)
    }
    const timer = setTimeout(() => {
      waiters.delete(waiter)
      resolve(null)
    }, timeoutMs)
    timer.unref()
    waiters.add(waiter)
  })
}

export function pushFromBrowser(sessionId: string, data: Buffer) {
  if (!session || session.id !== sessionId) return
  session.onData(data)
}

export function pushError(sessionId: string, message: string) {
  if (!session || session.id !== sessionId) return
  session.onError(new Error(message))
}

function failSession(err: Error) {
  const current = session
  session = null
  current?.onError(err)
}

/**
 * Een sessie beginnen. Levert de sessie-id op, of `null` als er geen browser is
 * die de kabel vasthoudt — dan hoort de kassa te zeggen dat de terminal niet
 * gekoppeld is, en niet te wachten op iets dat nooit komt.
 */
export function openSession(handlers: {
  onData: (chunk: Buffer) => void
  onError: (err: Error) => void
}): string | null {
  if (!browserAttached()) return null
  const id = crypto.randomUUID()
  session = { id, ...handlers }
  return id
}

export function writeToSession(sessionId: string, data: Buffer) {
  if (!session || session.id !== sessionId) return
  push({ op: "write", session: sessionId, data: data.toString("base64") })
}

export function beginSession(sessionId: string, baud: number) {
  push({ op: "open", session: sessionId, baud })
}

export function closeSession(sessionId: string) {
  if (session?.id === sessionId) session = null
  push({ op: "close", session: sessionId })
}

/** Alleen voor tests. */
export function _resetWebLink() {
  attached = null
  session = null
  queue.length = 0
  waiters.clear()
}
