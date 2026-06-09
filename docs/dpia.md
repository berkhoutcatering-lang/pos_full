# Data Protection Impact Assessment — Hop & Bites POS

DPIA per AVG Art. 35 + WP248 criteria. Tenant-specifiek; vul deze
template in per (org_id, venue_id) en bewaar onder
`/admin/compliance/dpia` (admin-only).

## 1. Verwerkingsverantwoordelijke

- **Naam tenant**: [bv. Hop & Bites BV]
- **KvK**: [12345678]
- **BTW**: [NL000000000B01]
- **Adres**: [vestigingsadres]
- **Contactpersoon AVG**: [naam + e-mail]

## 2. Aard van de verwerking

Verkooppunt + bestelflow voor een foodtruck. Verwerkt:

| Categorie | Bron | Doel | Bewaartermijn |
|---|---|---|---|
| Klant-e-mail (QR pre-order) | Customer-input op `/q/[token]` | Order-bevestiging + bon-e-mail | 7 jaar (bewaarplicht AWR 52) |
| Klant-naam (optioneel) | Customer-input | Pickup-identificatie op CFD/bon | 7 jaar |
| Bestelgegevens (items, modifiers, prijzen) | Kassa- of QR-input | Boekhouding + Z-rapport | 7 jaar |
| Betalingsgegevens (Mollie payment_id, myPOS transaction_id) | Payment providers | Reconciliatie | 7 jaar |
| Audit log (chained hash) | Pi-bridge + Server Actions | SBA Fase 4 + Belastingdienst-controle | 7 jaar |
| AI-chat queries (admin only) | Manager-input + claude-haiku-4-5 | Operational support | 90 dagen (ai_usage) |

## 3. WP248 criteria — high-risk indicators

Kruis aan welke van toepassing zijn:

- [x] Systematische monitoring (KDS/CFD realtime tracken orders)
- [x] Verwerking persoonsgegevens op grote schaal (customer e-mails)
- [ ] Bijzondere persoonsgegevens (geen medische, geen ras, geen religie)
- [ ] Geautomatiseerde besluitvorming met rechtsgevolg (geen)
- [ ] Kwetsbare betrokkenen (geen kinderen, geen werknemers tegen wil)
- [ ] Innovatieve technologie (Pi-bridge + AI; Haiku 4.5 is read-only)
- [ ] Verwerken in kader van wettelijke verplichting voor blokkade
      van een recht (geen)
- [x] Profilering of geautomatiseerde scoring (top-items analytics — beperkt)
- [ ] Identificatie/locatie op grote schaal (geen GPS)

**Verdict**: ≥2 criteria → DPIA verplicht ✅.

## 4. Mitigaties

- **Encrypted at rest**: Supabase pgcrypto extension + LUKS op de Pi
- **Encrypted in transit**: HTTPS via mkcert (LAN) en TLS (cloud)
- **Toegangscontrole**: RLS op alle multi-tenant tabellen; manager-PIN
  voor void/refund; Argon2id PIN-hash
- **Pseudonimisering**: customer_email gehashed in audit_log payloads
  (zie `apps/web/app/api/avg/export/route.ts:51`)
- **Bewaarplicht-handling**: rijen worden NIET verwijderd binnen 7
  jaar; AVG erasure verzoeken worden afgewezen met verwijzing naar
  AWR art. 52 lid 1; export-recht (Art. 15) wel gehonoreerd
- **Hash chain audit-trail**: alle business-events zijn cryptografisch
  gekoppeld (SBA Fase 4); manipulatie detecteerbaar via
  `/admin/audit` verifier
- **Cross-tenant isolatie**: RLS + composite FK + Pi-bridge org_id
  guard + venue-cookie verify (Round 1 P0-5)
- **AI mitigaties**: alleen read-only tools, geen mutate-tools; cost
  cap soft 100% / hard 150%; system prompt forbidt BTW-inferentie

## 5. Restrisico

| Risico | Kans | Impact | Mitigatie |
|---|---|---|---|
| Tablet diefstal | M | M | Pairing JWT revocable; manager kan revoken via /admin/devices |
| Pi-hardware diefstal | L | H | LUKS-encrypted SD card + outbox is replayable |
| Mollie compromis | VL | H | HMAC + replay window + server-truth fetch |
| myPOS compromis | VL | H | X-Session server-only; partner credentials per tenant |
| Manager-PIN compromis | M | M | Argon2id hash; rate-limit op verificatie (TODO P2) |
| Prompt-injectie | L | L | Tools read-only; system prompt anti-echo regel |

## 6. Verantwoordelijke

- **Functionaris Gegevensbescherming**: niet verplicht (geen kerntaak
  grootschalige verwerking volgens AVG Art. 37); aangewezen contact:
  [Sam Berkhout]
- **Verwerkersovereenkomst** (Supabase, Vercel, Anthropic, Mollie,
  myPOS, Moneybird, Resend): ondertekend bij onboarding

## 7. Goedkeuring

- **Opgesteld door**: [Sam Berkhout]
- **Datum**: [YYYY-MM-DD]
- **Volgende review**: [YYYY-MM-DD, max 12 maanden]
