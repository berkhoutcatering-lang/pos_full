import "server-only"
import { createHash } from "node:crypto"
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2"
import { offlineCacheRead, offlineCacheWrite } from "@/lib/offline/cache"

// Offline login for the Pi deployment. Supabase Auth needs internet for a
// fresh sign-in; the truck's own access point has none. After every
// SUCCESSFUL online login we cache an argon2id hash of the password on
// the Pi (in /var/lib/pos-web, posweb-only). When Supabase is unreachable
// the login action verifies against this cache and issues the signed
// offline-identity cookie instead — same password, same screen, no
// internet. Disabled (no-ops) unless POS_OFFLINE_CACHE_DIR is set.
//
// Trade-off (documented in raspberry-pos-os/README.md): a password change
// or account revocation in Supabase only reaches the Pi at the next
// ONLINE login. Entries expire after 30 days, matching the offline
// cookie.

const ENABLED = Boolean(process.env.POS_OFFLINE_CACHE_DIR)
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

interface CachedCredential {
  userId: string
  passwordHash: string
}

function credKey(email: string): string {
  // Hash the canonicalized email so no address ends up in a filename.
  const canonical = email.trim().toLowerCase()
  return `cred-${createHash("sha256").update(canonical).digest("hex").slice(0, 32)}`
}

export async function storeLocalCredential(args: {
  email: string
  password: string
  userId: string
}): Promise<void> {
  if (!ENABLED) return
  try {
    const passwordHash = await argonHash(args.password, {
      algorithm: 2, // argon2id
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    })
    await offlineCacheWrite(credKey(args.email), {
      userId: args.userId,
      passwordHash,
    } satisfies CachedCredential)
  } catch {
    // Best-effort: a failed cache write must never break the online login.
  }
}

export async function verifyLocalCredential(args: {
  email: string
  password: string
}): Promise<{ userId: string } | null> {
  if (!ENABLED) return null
  const cached = await offlineCacheRead<CachedCredential>(credKey(args.email), MAX_AGE_MS)
  if (!cached) return null
  try {
    const ok = await argonVerify(cached.passwordHash, args.password)
    return ok ? { userId: cached.userId } : null
  } catch {
    return null
  }
}
