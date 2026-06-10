"use server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { isNetworkError } from "@/lib/offline/cache"
import { OFFLINE_COOKIE, signOfflineIdentity } from "@/lib/offline/claims-cookie"
import { storeLocalCredential, verifyLocalCredential } from "@/lib/offline/local-login"

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
})

export async function loginAction(formData: FormData) {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent("Ongeldige invoer")}`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    if (isNetworkError(error)) {
      // Pi without internet: Supabase Auth is unreachable. Verify against
      // the local credential cache (filled during the last online login)
      // and issue the offline-identity cookie that middleware + DAL
      // already accept.
      const local = await verifyLocalCredential(parsed.data)
      if (local) {
        const token = await signOfflineIdentity({ sub: local.userId, iat: Date.now() })
        if (token) {
          const cookieStore = await cookies()
          cookieStore.set(OFFLINE_COOKIE, token, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: 30 * 24 * 60 * 60,
          })
          redirect("/pos")
        }
      }
      redirect(
        `/login?error=${encodeURIComponent(
          "Geen internet — offline inloggen lukte niet. Controleer het wachtwoord; een account werkt offline pas nadat het één keer online op deze Pi is ingelogd.",
        )}`,
      )
    }
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  // Online login OK — refresh the offline credential cache so this account
  // can also sign in when the truck has no internet (no-op outside the Pi).
  if (data.user) {
    await storeLocalCredential({
      email: parsed.data.email,
      password: parsed.data.password,
      userId: data.user.id,
    })
  }
  redirect("/select-venue")
}
