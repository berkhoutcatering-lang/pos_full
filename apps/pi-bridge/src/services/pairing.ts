import { SignJWT, jwtVerify } from "jose"
import { newId } from "../utils/ulid.js"
import { config } from "../config.js"
import { piDb } from "../db/outbox.js"
import { logger } from "../utils/logger.js"

const secret = new TextEncoder().encode(config.PI_BRIDGE_PAIRING_SECRET)

const PAIR_CODE_TTL_MS = 5 * 60_000
const JWT_EXP = "30d"

// Crockford-ish alphabet, no I/O/0/1 to keep human-typeable
const PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

function generatePairCode(): string {
  // 8 chars, crypto-random
  const buf = new Uint8Array(8)
  crypto.getRandomValues(buf)
  let code = ""
  for (let i = 0; i < 8; i++) {
    code += PAIR_ALPHABET[buf[i]! % PAIR_ALPHABET.length]
  }
  return code
}

export function issuePairCode(role: "cashier" | "manager"): {
  code: string
  expires_at: number
} {
  const code = generatePairCode()
  const now = Date.now()
  const expires_at = now + PAIR_CODE_TTL_MS
  piDb
    .prepare(
      `INSERT INTO pair_codes (code, venue_id, role, issued_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(code, config.VENUE_ID, role, now, expires_at)
  return { code, expires_at }
}

export async function redeemPairCode(
  code: string,
): Promise<{ jwt: string; jti: string; terminal_id: string } | null> {
  const now = Date.now()
  // Single-use under transaction to prevent two tablets racing on the same code
  const claim = piDb.transaction((c: string) => {
    const row = piDb
      .prepare(
        `SELECT code, venue_id, role FROM pair_codes
         WHERE code = ? AND used_at IS NULL AND expires_at > ?`,
      )
      .get(c, now) as { code: string; venue_id: string; role: string } | undefined
    if (!row) return null
    piDb.prepare("UPDATE pair_codes SET used_at = ? WHERE code = ?").run(now, c)
    return row
  })

  const row = claim(code)
  if (!row) {
    logger.warn({ code: code.slice(0, 2) + "***" }, "pair code invalid or expired")
    return null
  }

  const terminal_id = newId()
  const jti = newId()
  const jwt = await new SignJWT({
    venue_id: row.venue_id,
    terminal_id,
    role: row.role,
    jti,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXP)
    .sign(secret)

  piDb
    .prepare(
      `INSERT INTO paired_tablets (terminal_id, venue_id, role, paired_at, jti, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(terminal_id, row.venue_id, row.role, Date.now(), jti, Date.now())

  logger.info(
    { terminal_id, venue_id: row.venue_id, role: row.role },
    "tablet paired",
  )
  return { jwt, jti, terminal_id }
}

export async function verifyPairJwt(
  token: string,
): Promise<{ venue_id: string; terminal_id: string; role: string; jti: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] })
    const { venue_id, terminal_id, role, jti } = payload as {
      venue_id?: string
      terminal_id?: string
      role?: string
      jti?: string
    }
    if (!venue_id || !terminal_id || !role || !jti) return null

    // Scope check — this Pi only serves its own venue
    if (venue_id !== config.VENUE_ID) {
      logger.warn({ token_venue: venue_id, pi_venue: config.VENUE_ID }, "venue mismatch")
      return null
    }

    const revoked = piDb.prepare("SELECT 1 FROM revoked_jti WHERE jti = ?").get(jti)
    if (revoked) {
      logger.warn({ jti }, "revoked jti attempted")
      return null
    }

    piDb
      .prepare("UPDATE paired_tablets SET last_seen_at = ? WHERE jti = ?")
      .run(Date.now(), jti)

    return { venue_id, terminal_id, role, jti }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "jwt verify failed")
    return null
  }
}

export function revokeJti(jti: string, reason: string) {
  piDb
    .prepare(
      `INSERT INTO revoked_jti (jti, revoked_at, reason)
       VALUES (?, ?, ?)
       ON CONFLICT(jti) DO NOTHING`,
    )
    .run(jti, Date.now(), reason)
  logger.info({ jti, reason }, "jti revoked")
}
