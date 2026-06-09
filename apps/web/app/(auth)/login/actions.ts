"use server"
import { redirect } from "next/navigation"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

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
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }
  redirect("/select-venue")
}
