import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import {
  OFFLINE_COOKIE,
  signOfflineIdentity,
  verifyOfflineIdentity,
} from "@/lib/offline/claims-cookie"

type CookieToSet = { name: string; value: string; options?: CookieOptions }

// /pair is publiek: een verse tablet wordt eerst gekoppeld en logt daarna
// pas in — de pairing-code zelf is de beveiliging.
const PUBLIC_PATHS = ["/login", "/auth/callback", "/preview", "/pair"]

// Re-sign the offline-identity cookie at most once an hour.
const OFFLINE_COOKIE_REFRESH_MS = 60 * 60 * 1000

// Internal header that tells the DAL "Supabase is unreachable, serve the
// cached claims". Always stripped from incoming requests (spoof-proof:
// the DAL additionally verifies the signed offline cookie itself).
const OFFLINE_HEADER = "x-hb-offline"

function isRetryableAuthError(err: unknown): boolean {
  if (!err) return false
  const e = err as { name?: string; message?: string; status?: number }
  if (e.name === "AuthRetryableFetchError") return true
  if (typeof e.status === "number" && e.status === 0) return true
  return /fetch failed|Failed to fetch|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(
    e.message ?? "",
  )
}

// Cheap "is Supabase reachable" probe, cached briefly. Only consulted in
// the rare no-Supabase-session + offline-cookie state (offline login on
// the Pi); any HTTP response counts as reachable.
let lastProbe: { at: number; reachable: boolean } | null = null
async function supabaseReachable(): Promise<boolean> {
  if (lastProbe && Date.now() - lastProbe.at < 30_000) return lastProbe.reachable
  let reachable = true
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    })
  } catch {
    reachable = false
  }
  lastProbe = { at: Date.now(), reachable }
  return reachable
}

export async function updateSession(request: NextRequest) {
  // Sanitize: never trust an offline marker coming from the network.
  request.headers.delete(OFFLINE_HEADER)

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // Refresh JWT and read current user. On the Pi deployment Supabase can
  // be unreachable (truck without internet) — that is NOT "logged out":
  // fall back to the signed offline-identity cookie set during the last
  // successful online check (or by an offline login).
  let user: { id: string } | null = null
  let offline = false
  try {
    const { data, error } = await supabase.auth.getUser()
    user = data.user
    if (!user && isRetryableAuthError(error)) offline = true
  } catch (err) {
    if (isRetryableAuthError(err)) offline = true
    else throw err
  }

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"))

  if (user) {
    // Verified online — (re)issue the offline-identity cookie so a later
    // internet outage doesn't lock the kassa out.
    const existing = await verifyOfflineIdentity(request.cookies.get(OFFLINE_COOKIE)?.value)
    if (!existing || existing.sub !== user.id || Date.now() - existing.iat > OFFLINE_COOKIE_REFRESH_MS) {
      const token = await signOfflineIdentity({ sub: user.id, iat: Date.now() })
      if (token) {
        response.cookies.set(OFFLINE_COOKIE, token, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 30 * 24 * 60 * 60,
        })
      }
    }
  } else {
    const identity = await verifyOfflineIdentity(request.cookies.get(OFFLINE_COOKIE)?.value)
    if (identity && !offline) {
      // Valid offline cookie but no Supabase session: either a logout
      // (Supabase reachable → enforce it) or an offline login on the Pi
      // (no internet → honor the offline identity).
      offline = !(await supabaseReachable())
    }
    if (identity && offline) {
      // Known device of a previously verified user: let the request
      // through; the DAL serves cached claims/data (see lib/dal/auth.ts).
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set(OFFLINE_HEADER, "1")
      const offlineResponse = NextResponse.next({ request: { headers: requestHeaders } })
      const venueId = request.cookies.get("hb_venue")?.value
      if (venueId) offlineResponse.headers.set("x-hb-venue", venueId)
      return offlineResponse
    }
    if (!offline && request.cookies.get(OFFLINE_COOKIE)) {
      // Definitive "no session" while Supabase is reachable: drop the
      // stale offline identity so a logout sticks.
      response.cookies.delete(OFFLINE_COOKIE)
    }
  }

  if (!user && !isPublic && !path.startsWith("/q/") && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Surface venue cookie value as request header for downstream use
  const venueId = request.cookies.get("hb_venue")?.value
  if (venueId) {
    response.headers.set("x-hb-venue", venueId)
  }

  return response
}
