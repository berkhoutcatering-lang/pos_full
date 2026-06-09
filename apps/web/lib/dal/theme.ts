import "server-only"
import { createClient } from "@/lib/supabase/server"

export const PRESETS = [
  "hopbites",
  "neutral",
  "warm-grey",
  "blueprint",
  "midnight",
  "spring",
  "autumn",
  "festival",
] as const
export type Preset = typeof PRESETS[number]

const DEFAULT_PRESET: Preset =
  (PRESETS as readonly string[]).includes(process.env.NEXT_PUBLIC_DEFAULT_THEME_PRESET ?? "")
    ? (process.env.NEXT_PUBLIC_DEFAULT_THEME_PRESET as Preset)
    : "hopbites"

export async function getActiveTheme(): Promise<{ preset: Preset }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { preset: DEFAULT_PRESET }

    const { data: membership } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!membership) return { preset: DEFAULT_PRESET }

    const { data: settings } = await supabase
      .from("org_theme_settings")
      .select("preset")
      .eq("org_id", membership.org_id)
      .maybeSingle()
    const preset = settings?.preset as string | undefined
    if (preset && (PRESETS as readonly string[]).includes(preset)) {
      return { preset: preset as Preset }
    }
  } catch {
    // fall through to default
  }
  return { preset: DEFAULT_PRESET }
}
