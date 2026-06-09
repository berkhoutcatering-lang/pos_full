import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { PRESETS } from "@/lib/dal/theme"
import { PageHead } from "@/components/admin/page-head"
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
      <PageHead
        eyebrow="Beheer"
        title="Thema"
        sub="Pas het accent en logo aan voor klant-schermen. Wijzigingen zijn meteen zichtbaar in de preview."
      />
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
