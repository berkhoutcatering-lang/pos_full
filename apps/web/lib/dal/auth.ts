import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isNetworkError, offlineCacheRead, offlineCacheWrite } from "@/lib/offline/cache"
import { OFFLINE_COOKIE, verifyOfflineIdentity } from "@/lib/offline/claims-cookie"

export type Role = "owner" | "manager" | "cashier" | "viewer"

export type Claims = {
  userId: string
  orgId: string
  venueId: string | null
  role: Role
}

const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  cashier: 2,
  manager: 3,
  owner: 4,
}

// Pi deployment: the truck can be without internet for a whole shift.
// After every successful ONLINE claims resolution we persist them to the
// local disk cache; when Supabase is unreachable we serve those cached
// claims for the identity proven by the signed offline cookie (set by
// middleware during the last online check). No-op outside the Pi (cache
// dir + secret unset).
async function getOfflineClaims(): Promise<Claims | null> {
  const cookieStore = await cookies()
  const identity = await verifyOfflineIdentity(cookieStore.get(OFFLINE_COOKIE)?.value)
  if (!identity) return null
  const cached = await offlineCacheRead<Claims>(`claims-${identity.sub}`)
  if (!cached || cached.userId !== identity.sub) return null
  return cached
}

export async function getClaims(): Promise<Claims | null> {
  const supabase = await createClient()
  let user: { id: string } | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    user = data.user
    if (!user && isNetworkError(error)) return getOfflineClaims()
  } catch (err) {
    if (isNetworkError(err)) return getOfflineClaims()
    throw err
  }
  if (!user) return null

  const cookieStore = await cookies()
  const rawVenueId = cookieStore.get("hb_venue")?.value ?? null

  // Shared-DB tenant model: organization_members with a POS-specific pos_role.
  // Only active members WITH a pos_role have POS access (BBQ-only members are
  // filtered out). Primary membership for now (multi-org UI lands later).
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, pos_role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .not("pos_role", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (membershipError && isNetworkError(membershipError)) return getOfflineClaims()
  if (!membership) return null

  // P0-5: verify the venue cookie points to a venue inside the user's org.
  // Multi-org cashiers cannot tamper the cookie to a sibling org's venue;
  // single-org cashiers cannot tamper to a different venue they don't
  // belong to. RLS only filters by org_id, so this is the venue gate.
  let venueId: string | null = null
  if (rawVenueId) {
    const { data: venueRow, error: venueError } = await supabase
      .from("venues")
      .select("id")
      .eq("id", rawVenueId)
      .eq("org_id", membership.organization_id)
      .eq("active", true)
      .maybeSingle()
    if (venueError && isNetworkError(venueError)) return getOfflineClaims()
    if (venueRow?.id) {
      venueId = rawVenueId
    } else {
      // Cookie does not point to a venue in the user's org. Clear it so
      // the user lands on /select-venue rather than silently operating
      // under no venue.
      try {
        cookieStore.delete("hb_venue")
      } catch {
        // RSC context — middleware will clear on next request.
      }
    }
  }

  const claims: Claims = {
    userId: user.id,
    orgId: membership.organization_id as string,
    venueId,
    role: membership.pos_role as Role,
  }
  // Write-through for the offline fallback (no-op outside the Pi).
  void offlineCacheWrite(`claims-${user.id}`, claims)
  return claims
}

export async function requireAuth(): Promise<Claims> {
  const claims = await getClaims()
  if (!claims) redirect("/login")
  return claims
}

export async function requireVenue(): Promise<Claims & { venueId: string }> {
  const claims = await requireAuth()
  if (!claims.venueId) redirect("/select-venue")
  return claims as Claims & { venueId: string }
}

export async function requireRole(min: Role): Promise<Claims> {
  const claims = await requireAuth()
  if (ROLE_RANK[claims.role] < ROLE_RANK[min]) redirect("/")
  return claims
}
