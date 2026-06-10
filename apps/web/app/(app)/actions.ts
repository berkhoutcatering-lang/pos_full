"use server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OFFLINE_COOKIE } from "@/lib/offline/claims-cookie"

export async function logoutAction() {
  const supabase = await createClient()
  try {
    await supabase.auth.signOut()
  } catch {
    // Offline: there is no Supabase session to revoke — clearing the
    // cookies below is what logs this screen out.
  }
  const cookieStore = await cookies()
  cookieStore.delete("hb_venue")
  cookieStore.delete(OFFLINE_COOKIE)
  redirect("/login")
}
