import "server-only"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"

// Last-good disk cache for the Pi deployment. When the truck has no
// internet, Supabase reads fail server-side — these helpers let the DAL
// fall back to the most recent successful read. Disabled (no-ops) unless
// POS_OFFLINE_CACHE_DIR is set (pos-provision.sh sets /var/lib/pos-web on
// the Pi), so Vercel/dev behavior is unchanged.

const CACHE_DIR = process.env.POS_OFFLINE_CACHE_DIR

function fileFor(name: string): string | null {
  if (!CACHE_DIR) return null
  // Names are built from our own ids; keep the path traversal-proof anyway.
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_")
  return join(CACHE_DIR, `${safe}.json`)
}

export async function offlineCacheWrite(name: string, data: unknown): Promise<void> {
  const file = fileFor(name)
  if (!file) return
  try {
    await mkdir(CACHE_DIR!, { recursive: true })
    // Atomic-ish: write then rename, so a crash never leaves half a file.
    const tmp = `${file}.tmp`
    await writeFile(tmp, JSON.stringify({ at: Date.now(), data }), "utf8")
    await rename(tmp, file)
  } catch {
    // Cache is best-effort — never let it break the online path.
  }
}

export async function offlineCacheRead<T>(
  name: string,
  maxAgeMs?: number,
): Promise<T | null> {
  const file = fileFor(name)
  if (!file) return null
  try {
    const raw = await readFile(file, "utf8")
    const parsed = JSON.parse(raw) as { at: number; data: T }
    if (maxAgeMs && Date.now() - parsed.at > maxAgeMs) return null
    return parsed.data
  } catch {
    return null
  }
}

// True when an error from supabase-js means "could not reach Supabase"
// (offline / DNS / timeout) rather than "request rejected". Auth uses
// AuthRetryableFetchError; PostgREST surfaces the undici TypeError message.
export function isNetworkError(err: unknown): boolean {
  if (!err) return false
  const e = err as { name?: string; message?: string; status?: number }
  if (e.name === "AuthRetryableFetchError") return true
  if (e.name === "TypeError" && /fetch/i.test(e.message ?? "")) return true
  if (typeof e.status === "number" && e.status === 0) return true
  return /fetch failed|Failed to fetch|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network/i.test(
    e.message ?? "",
  )
}
