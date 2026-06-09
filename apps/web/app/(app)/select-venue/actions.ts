"use server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireAuth } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"

const VenueSchema = z.object({ venueId: z.string().uuid() })

export async function selectVenueAction(formData: FormData) {
  const claims = await requireAuth()
  const parsed = VenueSchema.safeParse({ venueId: formData.get("venueId") })
  if (!parsed.success) redirect("/select-venue?error=invalid")

  const supabase = await createClient()
  const { data: venue } = await supabase
    .from("venues")
    .select("id")
    .eq("id", parsed.data.venueId)
    .eq("org_id", claims.orgId)
    .eq("active", true)
    .maybeSingle()
  if (!venue) redirect("/select-venue?error=invalid")

  const cookieStore = await cookies()
  cookieStore.set("hb_venue", parsed.data.venueId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  redirect("/")
}
