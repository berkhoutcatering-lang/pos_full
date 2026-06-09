import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { PRESETS } from "@/lib/dal/theme"
import { ThemeView } from "./theme-view"

export const dynamic = "force-dynamic"

export default async function ThemePage() {
  await requireRole("manager")
  const claims = await requireVenue()
  const supabase = await createClient()
  const { data } = await supabase
    .from("org_theme_settings")
    .select("preset, brand_name, brand_logo_url")
    .eq("org_id", claims.orgId)
    .maybeSingle()
  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">Thema</h2>
      <p className="mb-3 text-sm opacity-70">
        Kies een preset of override tokens per organisatie. White-label voor SaaS.
      </p>
      <ThemeView
        current={{
          preset: (data?.preset as string) ?? "hopbites",
          brand_name: (data?.brand_name as string) ?? "Hop & Bites",
          brand_logo_url: (data?.brand_logo_url as string | null) ?? null,
        }}
        presets={[...PRESETS]}
      />
    </section>
  )
}
