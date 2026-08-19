import net from "node:net"
import crypto from "node:crypto"
import { logger } from "../utils/logger.js"

/**
 * myPOS Integrated Payments Protocol (IPP) over TCP — the LAN route.
 *
 * Wire format (developers.mypos.com/apis/payment-api): a 2-byte big-endian
 * length prefix that counts itself, followed by `NAME=VALUE\r\n` lines in
 * ASCII. `PROTOCOL=IPP` must be the first line and names are upper case.
 *
 * One request per TCP session. The terminal answers with a series of frames
 * carrying STAGE and STATUS; the caller only listens. The transaction runs
 * from `STAGE=1, STATUS=0` until `STAGE=5`. Stages are not sequential — a real
 * purchase on a myPOS Ultra walks 1 → 11 → 2 → 5 — so never treat a rising
 * number as progress, only STAGE=5 as the end.
 */

/** The terminal reports CURRENT_VERSION=202; 200 is the old Windows demo tool. */
export const IPP_VERSION = "202"

/** Official status table. Anything absent here is an unknown refusal. */
export const IPP_STATUS_TEXT: Record<number, string> = {
  0: "OK",
  1: "TERMINAL BUSY",
  2: "SYNTAX ERROR",
  3: "UNSUPPORTED PARAM",
  4: "UNSUPPORTED METHOD",
  5: "NO CARD FOUND",
  6: "UNSUPPORTED CARD",
  7: "CARD CHIP ERROR",
  8: "FALLBACK TO MAGSTRIPE",
  9: "INVALID PIN",
  10: "MAX PIN COUNT EXCEEDED",
  11: "PIN CHECK ONLINE",
  12: "HOST RECEIVE ERROR",
  13: "USER CANCEL",
  14: "INTERNAL ERROR",
  15: "COMMUNICATION ERROR",
  16: "SSL ERROR",
  17: "TRANSACTION NOT FOUND",
  18: "REVERSAL NOT FOUND",
  19: "INVALID AMOUNT",
  20: "NOT COMPLETED LAST TX",
  21: "NO PRINTER AVAILABLE",
  22: "NO PAPER",
  23: "INCORRECT PRINT_DATA",
  24: "INCORRECT LOGO INDEX",
  25: "ACTIVATION REQUIRED",
  26: "MANDATORY UPDATE REQUIRED",
  100: "SUCCESS WITH INFO",
}

export type IppFields = Record<string, string>

export function encodeFrame(fields: Array<[string, string]>): Buffer {
  const body = Buffer.from(
    fields.map(([k, v]) => `${k}=${v}`).join("\r\n") + "\r\n",
    "ascii",
  )
  const out = Buffer.alloc(2 + body.length)
  out.writeUInt16BE(out.length, 0)
  body.copy(out, 2)
  return out
}

/** Pull every complete frame out of a stream buffer; hand back the remainder. */
export function takeFrames(buf: Buffer): { frames: IppFields[]; rest: Buffer } {
  const frames: IppFields[] = []
  let rest: Buffer = buf
  while (rest.length >= 2) {
    const len = rest.readUInt16BE(0)
    // A length below the prefix itself means we are out of sync with the
    // stream; dropping the buffer is safer than looping on garbage.
    if (len < 3) return { frames, rest: Buffer.alloc(0) }
    if (rest.length < len) break
    frames.push(parseFields(rest.subarray(2, len)))
    rest = rest.subarray(len)
  }
  return { frames, rest }
}

export function parseFields(payload: Buffer): IppFields {
  const fields: IppFields = {}
  for (const line of payload.toString("ascii").split(/\r?\n/)) {
    if (!line) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    fields[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return fields
}

export interface IppSession {
  /** Resolves on STAGE=5, rejects on socket failure or timeout. */
  done: Promise<IppFields>
  /** Every frame received, newest last — useful for the audit trail. */
  frames: IppFields[]
  /** Drop the socket. The terminal clears itself after its own TIMEOUT. */
  abort(): void
  sid: string
}

export interface IppRequest {
  host: string
  port: number
  method: string
  fields?: Array<[string, string]>
  sid?: string
  /** myPOS recommends waiting up to 5s for the STAGE=1 answer. */
  firstStageTimeoutMs?: number
}

/** Slack on top of the terminal's own TIMEOUT before we give up on a stage. */
const STAGE_GRACE_MS = 10_000
const MAX_STAGE_WAIT_MS = 180_000

/**
 * Run one IPP method and follow the stages until the terminal closes the
 * transaction. Each response names the timeout for the next stage, so we take
 * the deadline from the terminal instead of guessing.
 */
export function runIppMethod(req: IppRequest): IppSession {
  const sid = req.sid ?? crypto.randomUUID()
  const frames: IppFields[] = []

  const socket = net.createConnection({ host: req.host, port: req.port })
  let buf: Buffer = Buffer.alloc(0)
  let settled = false

  const done = new Promise<IppFields>((resolve, reject) => {
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      socket.destroy()
      fn()
    }

    socket.setTimeout(req.firstStageTimeoutMs ?? 5_000)

    socket.on("connect", () => {
      socket.write(
        encodeFrame([
          ["PROTOCOL", "IPP"],
          ["VERSION", IPP_VERSION],
          ["METHOD", req.method],
          ["SID", sid],
          ...(req.fields ?? []),
        ]),
      )
    })

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const taken = takeFrames(buf)
      buf = taken.rest
      for (const f of taken.frames) {
        frames.push(f)
        logger.debug({ sid, stage: f.STAGE, status: f.STATUS, method: f.METHOD }, "ipp frame")
        if (f.STAGE === "5") {
          finish(() => resolve(f))
          return
        }
        // The terminal tells us how long the next stage may take; a card in a
        // customer's hand is worth waiting for, a silent socket is not.
        const secs = Number(f.TIMEOUT)
        const next = Number.isFinite(secs) && secs > 0 ? secs * 1000 + STAGE_GRACE_MS : STAGE_GRACE_MS
        socket.setTimeout(Math.min(next, MAX_STAGE_WAIT_MS))
      }
    })

    socket.on("timeout", () => finish(() => reject(new Error("ipp_timeout"))))
    socket.on("error", (err) => finish(() => reject(new Error(`ipp_socket: ${err.message}`))))
    socket.on("close", () => finish(() => reject(new Error("ipp_closed"))))
  })

  return {
    done,
    frames,
    sid,
    abort: () => {
      settled = true
      socket.destroy()
    },
  }
}

/** Amount on the wire is euros with two decimals: `AMOUNT=0.01`. */
export function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}
