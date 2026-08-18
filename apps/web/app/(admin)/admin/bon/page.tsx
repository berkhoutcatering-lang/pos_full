import { requireRole, requireVenue } from "@/lib/dal/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHead } from "@/components/admin/page-head"
import { BonView, type ReceiptSettingsForm } from "./bon-view"

export const dynamic = "force-dynamic"

const EMPTY: ReceiptSettingsForm = {
  legal_name: "",
  kvk: "",
  btw_id: "",
  address_line: "",
  postal_code: "",
  city: "",
  phone: "",
  website: "",
  footer_text: "",
  print_logo: true,
}

/**
 * Whether the Pi has a logo file is something only the Pi knows. Not fatal if
 * it is unreachable — the rest of the page is still editable, so we return
 * null and the view says it could not check rather than claiming there is none.
 */
async function logoPresent(): Promise<boolean | null> {
  try {
    const res = await fetch(
      `${process.env.PI_BRIDGE_URL ?? "https://hopbites.local:3001"}/receipt-settings`,
      {
        headers: { "x-admin-token": process.env.PI_BRIDGE_ADMIN_TOKEN ?? "" },
        signal: AbortSignal.timeout(2000),
        cache: "no-store",
      },
    )
    if (!res.ok) return null
    const body = (await res.json()) as { logo_present?: boolean }
    return body.logo_present ?? null
  } catch {
    return null
  }
}

export default async function BonPage() {
  await requireRole("manager")
  const claims = await requireVenue()
  const supabase = await createClient()

  const [{ data }, { data: venue }, present] = await Promise.all([
    supabase
      .from("pos_receipt_settings")
      .select(
        "legal_name, kvk, btw_id, address_line, postal_code, city, phone, website, footer_text, print_logo",
      )
      .eq("venue_id", claims.venueId)
      .maybeSingle(),
    supabase.from("venues").select("name").eq("id", claims.venueId).maybeSingle(),
    logoPresent(),
  ])

  const row = (data ?? {}) as Partial<Record<keyof ReceiptSettingsForm, unknown>>
  const current: ReceiptSettingsForm = {
    ...EMPTY,
    legal_name: (row.legal_name as string) ?? "",
    kvk: (row.kvk as string) ?? "",
    btw_id: (row.btw_id as string) ?? "",
    address_line: (row.address_line as string) ?? "",
    postal_code: (row.postal_code as string) ?? "",
    city: (row.city as string) ?? "",
    phone: (row.phone as string) ?? "",
    website: (row.website as string) ?? "",
    footer_text: (row.footer_text as string) ?? "",
    print_logo: (row.print_logo as boolean) ?? true,
  }

  return (
    <section>
      <PageHead
        eyebrow="Beheer"
        title="Kassabon"
        sub="Wat er op de klantbon staat: je bedrijfsgegevens, een afsluitende tekst en het logo."
      />
      <BonView
        current={current}
        venueName={(venue?.name as string) ?? "Deze locatie"}
        logoPresent={present}
        logoPath="/etc/pi-bridge/receipt-logo.png"
      />
    </section>
  )
}
