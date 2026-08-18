"use client"
import { useState } from "react"
import { Check } from "lucide-react"
import { saveReceiptSettingsAction } from "./actions"
import { Button } from "@/components/ui/button"

export interface ReceiptSettingsForm {
  legal_name: string
  kvk: string
  btw_id: string
  address_line: string
  postal_code: string
  city: string
  phone: string
  website: string
  footer_text: string
  print_logo: boolean
}

const INPUT =
  "h-12 w-full rounded-md border border-line-strong bg-paper-bright px-3.5 text-[15px] font-medium text-charcoal-900 outline-none placeholder:text-charcoal-400"

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.04em] text-charcoal-500">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[13px] font-medium leading-[1.35] text-charcoal-500">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

export function BonView({
  current,
  venueName,
  logoPresent,
  logoPath,
}: {
  current: ReceiptSettingsForm
  venueName: string
  logoPresent: boolean | null
  logoPath: string
}) {
  const [form, setForm] = useState(current)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const set = <K extends keyof ReceiptSettingsForm>(
    key: K,
    value: ReceiptSettingsForm[K],
  ) => setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async () => {
    setBusy(true)
    setMsg(null)
    const res = await saveReceiptSettingsAction(form)
    setBusy(false)
    if (!res.ok) {
      setMsg(res.error === "validation" ? "Controleer de invoer." : "Opslaan mislukt.")
      return
    }
    setMsg(
      res.pi_synced
        ? "Opgeslagen — staat op de volgende bon."
        : "Opgeslagen in de cloud, maar de Pi was niet bereikbaar. Hij pakt het vanzelf op zodra hij er weer is.",
    )
  }

  // Wat je hier invult komt letterlijk zo op de bon te staan, dus laat het ook
  // zo zien in plaats van als formuliervelden.
  const preview = [
    form.legal_name || venueName,
    form.address_line,
    [form.postal_code, form.city].filter(Boolean).join(" "),
    form.phone,
    form.kvk ? `KvK ${form.kvk}` : "",
    form.btw_id ? `BTW ${form.btw_id}` : "",
  ].filter(Boolean)

  const footerLines = form.footer_text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-lg border border-line-strong bg-paper-bright p-6">
        <div className="mb-[18px] text-[18px] font-extrabold leading-none text-charcoal-900">
          Bedrijfsgegevens
        </div>

        <div className="flex flex-col gap-4">
          <Field
            label="Bedrijfsnaam"
            hint={`Leeg = de naam van deze locatie ("${venueName}").`}
          >
            <input
              value={form.legal_name}
              onChange={(e) => set("legal_name", e.target.value)}
              maxLength={80}
              placeholder={venueName}
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="KvK-nummer">
              <input
                value={form.kvk}
                onChange={(e) => set("kvk", e.target.value)}
                maxLength={20}
                placeholder="12345678"
                className={INPUT}
              />
            </Field>
            <Field label="BTW-nummer">
              <input
                value={form.btw_id}
                onChange={(e) => set("btw_id", e.target.value)}
                maxLength={20}
                placeholder="NL001234567B01"
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Adres">
            <input
              value={form.address_line}
              onChange={(e) => set("address_line", e.target.value)}
              maxLength={120}
              placeholder="Marktplein 1"
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-[140px_1fr] gap-4">
            <Field label="Postcode">
              <input
                value={form.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
                maxLength={12}
                placeholder="1234 AB"
                className={INPUT}
              />
            </Field>
            <Field label="Plaats">
              <input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                maxLength={60}
                placeholder="Amsterdam"
                className={INPUT}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Telefoon">
              <input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                maxLength={30}
                placeholder="06 12345678"
                className={INPUT}
              />
            </Field>
            <Field label="Website">
              <input
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                maxLength={120}
                placeholder="hopandbites.nl"
                className={INPUT}
              />
            </Field>
          </div>

          <Field
            label="Afsluitende tekst"
            hint="Maximaal 4 regels, onderaan de bon. Bijvoorbeeld bedankt, openingstijden of je socials."
          >
            <textarea
              value={form.footer_text}
              onChange={(e) => set("footer_text", e.target.value)}
              maxLength={200}
              rows={3}
              placeholder={"Bedankt en tot ziens!\n@hopandbites"}
              className={`${INPUT} h-auto py-2.5 leading-[1.4]`}
            />
          </Field>

          <label className="flex items-start gap-3 rounded-md border border-line-strong p-3.5">
            <input
              type="checkbox"
              checked={form.print_logo}
              onChange={(e) => set("print_logo", e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-none accent-hop-600"
            />
            <span>
              <span className="block text-[15px] font-bold leading-none text-charcoal-900">
                Logo bovenaan de bon printen
              </span>
              <span className="mt-1 block text-[13px] font-medium leading-[1.35] text-charcoal-500">
                {logoPresent === null
                  ? "Kon bij de Pi niet nagaan of er een logo staat."
                  : logoPresent
                    ? "Er staat een logo op de Pi."
                    : `Er staat nog geen logo op de Pi. Zet een zwart-wit PNG als logo.png in de map pos-setup op de SD-kaart; hij komt terecht op ${logoPath}.`}
              </span>
            </span>
          </label>

          <div className="flex items-center gap-4">
            <Button
              variant="primary"
              icon={<Check size={18} />}
              onClick={handleSave}
              disabled={busy}
            >
              {busy ? "Bezig…" : "Opslaan"}
            </Button>
            {msg ? (
              <span className="text-[14px] font-semibold text-charcoal-600">{msg}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bon-preview: monospace, want zo komt hij ook uit de printer. */}
      <div className="rounded-lg border border-line-strong bg-paper-bright p-6">
        <div className="mb-[18px] text-[18px] font-extrabold leading-none text-charcoal-900">
          Zo komt de kop eruit
        </div>
        <div className="mx-auto w-full max-w-[380px] rounded-md border border-dashed border-line-strong bg-paper p-5 font-mono text-[13px] leading-[1.5] text-charcoal-800">
          {form.print_logo ? (
            <div className="mb-2 text-center text-charcoal-400">
              {logoPresent === false ? "[ geen logo op de Pi ]" : "[ logo ]"}
            </div>
          ) : null}
          <div className="text-center">
            {preview.map((line, i) => (
              <div key={i} className={i === 0 ? "font-bold" : undefined}>
                {line}
              </div>
            ))}
          </div>
          <div className="my-2 border-t border-dashed border-line-strong" />
          <div>Bon A-014</div>
          <div>17-08-2026 14:32:10</div>
          <div className="my-2 border-t border-dashed border-line-strong" />
          <div className="flex justify-between">
            <span>2x Pulled pork broodje</span>
            <span>EUR 19.00</span>
          </div>
          <div className="flex justify-between">
            <span>1x Speciaalbier</span>
            <span>EUR 5.50</span>
          </div>
          <div className="my-2 border-t border-dashed border-line-strong" />
          <div className="flex justify-between">
            <span>Subtotaal excl. BTW</span>
            <span>EUR 21.98</span>
          </div>
          <div className="flex justify-between">
            <span>BTW 9% over EUR 17.43</span>
            <span>EUR 1.57</span>
          </div>
          <div className="flex justify-between">
            <span>BTW 21% over EUR 4.55</span>
            <span>EUR 0.95</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>TOTAAL</span>
            <span>EUR 24.50</span>
          </div>
          <div className="my-2 border-t border-dashed border-line-strong" />
          <div className="text-center">Betaald · PIN / contactloos</div>
          {footerLines.length || form.website ? (
            <div className="mt-3 text-center">
              {footerLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {form.website ? <div>{form.website}</div> : null}
            </div>
          ) : null}
        </div>

        <p className="mt-4 text-[13px] font-medium leading-[1.4] text-charcoal-500">
          De bedragen hierboven zijn een voorbeeld. De BTW wordt per tarief
          opgeteld, zoals het op een Nederlandse kassabon hoort.
        </p>
      </div>
    </div>
  )
}
