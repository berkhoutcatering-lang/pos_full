// HMAC-signed "wie was hier ingelogd" cookie for the Pi deployment.
//
// Supabase Auth needs internet to verify a session. On the truck's own
// access point there is none, so middleware sets this cookie whenever a
// user IS verified online; when Supabase is unreachable the cookie (plus
// the on-disk claims cache, see lib/dal/auth.ts) keeps the kassa/KDS/CFD
// usable. Uses Web Crypto so it runs in both the proxy and the node
// runtime. Disabled unless POS_AUTH_CACHE_SECRET is set (the Pi's
// pos-provision.sh generates it; Vercel/dev behavior is unchanged).

export const OFFLINE_COOKIE = "hb_oc"
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30d — matches tablet pairing TTL

export interface OfflineIdentity {
  sub: string // Supabase user id
  iat: number // ms epoch when last verified online
}

function secret(): string | null {
  return process.env.POS_AUTH_CACHE_SECRET ?? null
}

function b64url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmac(data: string, key: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data))
  return new Uint8Array(sig)
}

export async function signOfflineIdentity(identity: OfflineIdentity): Promise<string | null> {
  const key = secret()
  if (!key) return null
  const payload = b64url(new TextEncoder().encode(JSON.stringify(identity)))
  const sig = b64url(await hmac(payload, key))
  return `${payload}.${sig}`
}

export async function verifyOfflineIdentity(token: string | undefined): Promise<OfflineIdentity | null> {
  const key = secret()
  if (!key || !token) return null
  const dot = token.indexOf(".")
  if (dot < 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  try {
    const expected = b64url(await hmac(payload, key))
    if (expected.length !== sig.length) return null
    // Constant-time compare
    let diff = 0
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
    if (diff !== 0) return null
    const identity = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as OfflineIdentity
    if (typeof identity.sub !== "string" || typeof identity.iat !== "number") return null
    if (Date.now() - identity.iat > MAX_AGE_MS) return null
    return identity
  } catch {
    return null
  }
}
